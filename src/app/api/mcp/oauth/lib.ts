import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// --- Constants ---

export const ACCESS_TOKEN_TTL = 3600; // 1 hour
export const REFRESH_TOKEN_TTL = 30 * 24 * 3600; // 30 days
export const AUTH_CODE_TTL = 600; // 10 minutes

// --- Hashing ---

export async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomToken(bytes = 48): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

// --- JWT signing / verification (HS256) ---

function base64url(data: Uint8Array): string {
  let binary = "";
  data.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function base64urlEncode(str: string): string {
  return base64url(new TextEncoder().encode(str));
}

function base64urlDecode(str: string): string {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  return atob(padded);
}

async function hmacSign(input: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return base64url(new Uint8Array(sig));
}

async function hmacVerify(input: string, signature: string, secret: string): Promise<boolean> {
  const expected = await hmacSign(input, secret);
  return expected === signature;
}

export async function signJwt(
  payload: Record<string, unknown>,
  secret: string,
): Promise<string> {
  const header = base64urlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64urlEncode(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;
  const sig = await hmacSign(signingInput, secret);
  return `${signingInput}.${sig}`;
}

export async function verifyJwt(
  token: string,
  secret: string,
): Promise<Record<string, unknown>> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed JWT");

  const [header, body, sig] = parts;
  if (!(await hmacVerify(`${header}.${body}`, sig, secret))) {
    throw new Error("Invalid JWT signature");
  }

  const payload = JSON.parse(base64urlDecode(body)) as Record<string, unknown>;
  if (typeof payload.exp === "number" && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("JWT expired");
  }

  return payload;
}

// --- OAuth access token helpers ---

const oauthJwtSecret = () => {
  const s = process.env.OAUTH_JWT_SECRET;
  if (!s) throw new Error("Missing OAUTH_JWT_SECRET env var");
  return s;
};

export async function signAccessToken(userId: string, clientId: string, scope: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return signJwt(
    {
      sub: userId,
      client_id: clientId,
      scope,
      iat: now,
      exp: now + ACCESS_TOKEN_TTL,
      iss: "life-on-track",
      token_type: "oauth",
    },
    oauthJwtSecret(),
  );
}

export async function verifyAccessToken(token: string): Promise<{
  userId: string;
  clientId: string;
  scope: string;
}> {
  const payload = await verifyJwt(token, oauthJwtSecret());
  if (payload.token_type !== "oauth" || payload.iss !== "life-on-track") {
    throw new Error("Not an OAuth access token");
  }
  return {
    userId: payload.sub as string,
    clientId: payload.client_id as string,
    scope: (payload.scope as string) ?? "",
  };
}

// --- Supabase JWT minting (for RLS, via edge function) ---

export async function mintSupabaseJwt(userId: string): Promise<string> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const res = await fetch(`${supabaseUrl}/functions/v1/mint-user-jwt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ user_id: userId }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Failed to mint Supabase JWT: ${(body as Record<string, string>).error ?? res.statusText}`);
  }

  const { access_token } = (await res.json()) as { access_token: string };
  return access_token;
}

// --- PKCE ---

export async function verifyPkce(codeVerifier: string, codeChallenge: string): Promise<boolean> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  const computed = base64url(new Uint8Array(digest));
  return computed === codeChallenge;
}

// --- Supabase admin client ---

let _adminClient: SupabaseClient | null = null;

export function adminClient(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }
  return _adminClient;
}

// --- CORS + response helpers ---

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
};

export function corsOk(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export function jsonError(error: string, status: number): Response {
  return jsonResponse({ error }, status);
}

// --- App URL helper ---

export function getAppUrl(req?: Request): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (req) {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    if (host) return `${proto}://${host}`;
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return "http://localhost:3000";
}
