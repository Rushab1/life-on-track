import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export interface AuthResult {
  client: SupabaseClient;
  userId: string;
}

/**
 * Exchanges an MCP bearer token for a user-scoped Supabase client.
 *
 * Calls the exchange-mcp-token edge function to get a short-lived JWT,
 * then creates a client authenticated as the user so RLS is enforced.
 */
export async function exchangeMcpToken(bearerToken: string): Promise<AuthResult> {
  const res = await fetch(`${supabaseUrl}/functions/v1/exchange-mcp-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: bearerToken }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as Record<string, string>);
    if ((body as Record<string, string>).error === "Token has been revoked") {
      throw new Error("Token has been revoked");
    }
    throw new Error("Invalid token");
  }

  const { access_token, user_id } = (await res.json()) as {
    access_token: string;
    user_id: string;
  };

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: { Authorization: `Bearer ${access_token}` },
    },
  });

  return { client, userId: user_id };
}
