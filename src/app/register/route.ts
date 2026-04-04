import {
  corsOk,
  jsonResponse,
  jsonError,
  sha256,
  randomToken,
  adminClient,
} from "@/app/api/mcp/oauth/lib";

export async function POST(req: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const redirectUris = body.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    return jsonError("redirect_uris is required and must be a non-empty array", 400);
  }

  for (const uri of redirectUris) {
    if (typeof uri !== "string") {
      return jsonError("Each redirect_uri must be a string", 400);
    }
  }

  const clientName = typeof body.client_name === "string" ? body.client_name : null;
  const clientSecret = randomToken(32);
  const clientSecretHash = await sha256(clientSecret);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 3600 * 1000); // 30 days

  const { data, error } = await adminClient()
    .from("oauth_clients")
    .insert({
      client_secret_hash: clientSecretHash,
      client_secret_expires_at: expiresAt.toISOString(),
      redirect_uris: redirectUris,
      client_name: clientName,
      grant_types: body.grant_types ?? ["authorization_code", "refresh_token"],
      token_endpoint_auth_method: body.token_endpoint_auth_method ?? "client_secret_post",
    })
    .select("client_id, client_id_issued_at")
    .single();

  if (error) {
    console.error("[OAuth register]", error);
    return jsonError("Registration failed", 500);
  }

  return jsonResponse(
    {
      client_id: data.client_id,
      client_secret: clientSecret,
      client_id_issued_at: data.client_id_issued_at,
      client_secret_expires_at: expiresAt.toISOString(),
      redirect_uris: redirectUris,
      client_name: clientName,
      grant_types: ["authorization_code", "refresh_token"],
      token_endpoint_auth_method: "client_secret_post",
    },
    201,
  );
}

export async function OPTIONS(): Promise<Response> {
  return corsOk();
}

