import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export interface AuthResult {
  client: SupabaseClient;
  userId: string;
}

/**
 * Exchanges an MCP bearer token for a Supabase admin client scoped to a user.
 *
 * Uses the service role key (bypasses RLS). Tools must filter by userId explicitly.
 * This avoids the deprecated JWT secret approach entirely.
 */
export async function exchangeMcpToken(bearerToken: string): Promise<AuthResult> {
  // Hash the provided token
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(bearerToken)
  );
  const tokenHash = Array.from(new Uint8Array(hashBuffer), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");

  // Look up token using service role (bypasses RLS)
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: tokenRow, error } = await client
    .from("mcp_tokens")
    .select("id, user_id, revoked")
    .eq("token_hash", tokenHash)
    .single();

  if (error || !tokenRow) {
    throw new Error("Invalid token");
  }

  if (tokenRow.revoked) {
    throw new Error("Token has been revoked");
  }

  // Update last_used_at (fire-and-forget)
  client
    .from("mcp_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", tokenRow.id)
    .then();

  return { client, userId: tokenRow.user_id };
}
