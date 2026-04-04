import {
  jsonResponse,
  jsonError,
  randomToken,
  sha256,
  adminClient,
  AUTH_CODE_TTL,
} from "@/app/api/mcp/oauth/lib";

/**
 * Called by the /authorize page after the user authenticates and consents.
 * Generates an authorization code and returns the redirect URL.
 */
export async function POST(req: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const { client_id, redirect_uri, code_challenge, state, scope, access_token } = body as Record<string, string>;

  if (!client_id || !redirect_uri || !code_challenge || !access_token) {
    return jsonError("Missing required fields", 400);
  }

  // Verify the user's Supabase session
  const { createClient } = await import("@supabase/supabase-js");
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${access_token}` } },
    },
  );

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return jsonError("Not authenticated", 401);
  }

  // Validate client exists
  const db = adminClient();
  const { data: client } = await db
    .from("oauth_clients")
    .select("client_id, redirect_uris")
    .eq("client_id", client_id)
    .single();

  if (!client) {
    return jsonError("Unknown client_id", 400);
  }

  // Validate redirect_uri matches registration
  if (!client.redirect_uris.includes(redirect_uri)) {
    return jsonError("redirect_uri not registered for this client", 400);
  }

  // Generate authorization code
  const code = randomToken(32);
  const expiresAt = new Date(Date.now() + AUTH_CODE_TTL * 1000).toISOString();

  const { error: insertError } = await db.from("oauth_codes").insert({
    code: await sha256(code), // Store hash, return plain
    client_id,
    user_id: userData.user.id,
    redirect_uri,
    code_challenge,
    scope: scope ?? "",
    expires_at: expiresAt,
  });

  if (insertError) {
    console.error("[OAuth authorize]", insertError);
    return jsonError("Failed to generate authorization code", 500);
  }

  // Build redirect URL
  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set("code", code);
  if (state) redirectUrl.searchParams.set("state", state);

  return jsonResponse({ redirect_url: redirectUrl.toString() });
}
