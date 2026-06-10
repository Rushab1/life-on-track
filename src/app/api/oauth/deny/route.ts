import { jsonResponse, jsonError, adminClient } from "@/app/api/mcp/oauth/lib";

/**
 * Called by the /authorize page when the user denies access. Validates the
 * client_id + redirect_uri pair against the registration (same check as the
 * allow path) so the page never redirects the browser to an arbitrary
 * attacker-supplied URL.
 */
export async function POST(req: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const { client_id, redirect_uri, state } = body as Record<string, string>;
  if (!client_id || !redirect_uri) {
    return jsonError("Missing required fields", 400);
  }

  const db = adminClient();
  const { data: client } = await db
    .from("oauth_clients")
    .select("client_id, redirect_uris")
    .eq("client_id", client_id)
    .single();

  if (!client) {
    return jsonError("Unknown client_id", 400);
  }
  if (!client.redirect_uris.includes(redirect_uri)) {
    return jsonError("redirect_uri not registered for this client", 400);
  }

  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set("error", "access_denied");
  if (state) redirectUrl.searchParams.set("state", state);

  return jsonResponse({ redirect_url: redirectUrl.toString() });
}
