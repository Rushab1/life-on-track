import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { verifyAccessToken, mintSupabaseJwt } from "./oauth/lib";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export interface AuthResult {
  client: SupabaseClient;
  userId: string;
}

/** Cached JWT keyed by MCP token hash. Never stores the plaintext token. */
const jwtCache = new Map<string, { accessToken: string; userId: string; expiresAt: number }>();

/** Cached Supabase JWTs for OAuth users, keyed by user ID. */
const supabaseJwtCache = new Map<string, { jwt: string; expiresAt: number }>();

async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function buildClient(accessToken: string): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/**
 * Verify an OAuth access token and return a user-scoped Supabase client.
 * Mints a Supabase JWT for the user so RLS is enforced.
 */
async function verifyOAuthToken(bearerToken: string): Promise<AuthResult> {
  const { userId } = await verifyAccessToken(bearerToken);

  // Check Supabase JWT cache for this user
  const cached = supabaseJwtCache.get(userId);
  if (cached && Date.now() < cached.expiresAt) {
    return { client: buildClient(cached.jwt), userId };
  }

  // Mint a fresh Supabase JWT
  const jwt = await mintSupabaseJwt(userId);
  supabaseJwtCache.set(userId, {
    jwt,
    expiresAt: Date.now() + 55 * 60 * 1000, // cache for 55 min (JWT valid for 60)
  });

  return { client: buildClient(jwt), userId };
}

/**
 * Authenticate a bearer token — tries OAuth JWT first, falls back to MCP token exchange.
 */
export async function authenticateRequest(bearerToken: string): Promise<AuthResult> {
  try {
    return await verifyOAuthToken(bearerToken);
  } catch {
    // Not an OAuth token — try MCP token exchange
    return exchangeMcpToken(bearerToken);
  }
}

/**
 * Exchanges an MCP bearer token for a user-scoped Supabase client.
 *
 * Caches the short-lived JWT per token hash and reuses it until 5 minutes
 * before expiry, avoiding a redundant edge function call on every request.
 */
export async function exchangeMcpToken(bearerToken: string): Promise<AuthResult> {
  const tokenHash = await hashToken(bearerToken);

  // Return cached JWT if still valid
  const cached = jwtCache.get(tokenHash);
  if (cached && Date.now() < cached.expiresAt) {
    return { client: buildClient(cached.accessToken), userId: cached.userId };
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/exchange-mcp-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: bearerToken }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as Record<string, string>);
    if ((body as Record<string, string>).error === "Token has been revoked") {
      // Evict any stale cache entry for revoked tokens
      jwtCache.delete(tokenHash);
      throw new Error("Token has been revoked");
    }
    throw new Error("Invalid token");
  }

  const { access_token, expires_in, user_id } = (await res.json()) as {
    access_token: string;
    expires_in: number;
    user_id: string;
  };

  // Cache until 5 minutes before expiry
  jwtCache.set(tokenHash, {
    accessToken: access_token,
    userId: user_id,
    expiresAt: Date.now() + (expires_in - 300) * 1000,
  });

  return { client: buildClient(access_token), userId: user_id };
}
