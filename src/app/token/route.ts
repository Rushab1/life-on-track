import {
  corsOk,
  jsonResponse,
  jsonError,
  sha256,
  randomToken,
  verifyPkce,
  signAccessToken,
  adminClient,
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL,
} from "@/app/api/mcp/oauth/lib";

async function parseFormBody(req: Request): Promise<URLSearchParams> {
  const text = await req.text();
  return new URLSearchParams(text);
}

async function validateClient(
  clientId: string,
  clientSecret?: string,
): Promise<{ valid: boolean; error?: string }> {
  const { data: client } = await adminClient()
    .from("oauth_clients")
    .select("client_id, client_secret_hash, client_secret_expires_at, token_endpoint_auth_method")
    .eq("client_id", clientId)
    .single();

  if (!client) return { valid: false, error: "Unknown client_id" };

  // Check secret expiry
  if (client.client_secret_expires_at && new Date(client.client_secret_expires_at) < new Date()) {
    return { valid: false, error: "Client secret expired" };
  }

  // Validate secret if the client uses client_secret_post
  if (client.token_endpoint_auth_method === "client_secret_post") {
    if (!clientSecret) return { valid: false, error: "client_secret required" };
    const hash = await sha256(clientSecret);
    if (hash !== client.client_secret_hash) return { valid: false, error: "Invalid client_secret" };
  }

  return { valid: true };
}

async function handleAuthorizationCode(params: URLSearchParams): Promise<Response> {
  const code = params.get("code");
  const codeVerifier = params.get("code_verifier");
  const clientId = params.get("client_id");
  const clientSecret = params.get("client_secret") ?? undefined;
  const redirectUri = params.get("redirect_uri");

  if (!code || !codeVerifier || !clientId || !redirectUri) {
    return jsonError("Missing required parameters", 400);
  }

  const clientCheck = await validateClient(clientId, clientSecret);
  if (!clientCheck.valid) return jsonError(clientCheck.error!, 401);

  // Look up code (stored as hash)
  const codeHash = await sha256(code);
  const db = adminClient();
  const { data: codeRow } = await db
    .from("oauth_codes")
    .select("*")
    .eq("code", codeHash)
    .single();

  if (!codeRow) return jsonError("Invalid authorization code", 400);
  if (codeRow.used) return jsonError("Authorization code already used", 400);
  if (new Date(codeRow.expires_at) < new Date()) return jsonError("Authorization code expired", 400);
  if (codeRow.client_id !== clientId) return jsonError("client_id mismatch", 400);
  if (codeRow.redirect_uri !== redirectUri) return jsonError("redirect_uri mismatch", 400);

  // Verify PKCE
  const pkceValid = await verifyPkce(codeVerifier, codeRow.code_challenge);
  if (!pkceValid) return jsonError("Invalid code_verifier", 400);

  // Mark code as used
  await db.from("oauth_codes").update({ used: true }).eq("code", codeHash);

  // Generate tokens
  const accessToken = await signAccessToken(codeRow.user_id, clientId, codeRow.scope ?? "");
  const refreshToken = randomToken(48);
  const refreshTokenHash = await sha256(refreshToken);

  await db.from("oauth_refresh_tokens").insert({
    token_hash: refreshTokenHash,
    client_id: clientId,
    user_id: codeRow.user_id,
    scope: codeRow.scope,
    expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL * 1000).toISOString(),
  });

  return jsonResponse({
    access_token: accessToken,
    token_type: "bearer",
    expires_in: ACCESS_TOKEN_TTL,
    refresh_token: refreshToken,
  });
}

async function handleRefreshToken(params: URLSearchParams): Promise<Response> {
  const refreshToken = params.get("refresh_token");
  const clientId = params.get("client_id");
  const clientSecret = params.get("client_secret") ?? undefined;

  if (!refreshToken || !clientId) {
    return jsonError("Missing required parameters", 400);
  }

  const clientCheck = await validateClient(clientId, clientSecret);
  if (!clientCheck.valid) return jsonError(clientCheck.error!, 401);

  const tokenHash = await sha256(refreshToken);
  const db = adminClient();
  const { data: tokenRow } = await db
    .from("oauth_refresh_tokens")
    .select("*")
    .eq("token_hash", tokenHash)
    .single();

  if (!tokenRow) return jsonError("Invalid refresh_token", 400);
  if (tokenRow.revoked) return jsonError("Refresh token revoked", 400);
  if (new Date(tokenRow.expires_at) < new Date()) return jsonError("Refresh token expired", 400);
  if (tokenRow.client_id !== clientId) return jsonError("client_id mismatch", 400);

  // Rotate refresh token: revoke old, issue new
  await db.from("oauth_refresh_tokens").update({ revoked: true }).eq("token_hash", tokenHash);

  const newRefreshToken = randomToken(48);
  const newRefreshTokenHash = await sha256(newRefreshToken);

  await db.from("oauth_refresh_tokens").insert({
    token_hash: newRefreshTokenHash,
    client_id: clientId,
    user_id: tokenRow.user_id,
    scope: tokenRow.scope,
    expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL * 1000).toISOString(),
  });

  const accessToken = await signAccessToken(tokenRow.user_id, clientId, tokenRow.scope ?? "");

  return jsonResponse({
    access_token: accessToken,
    token_type: "bearer",
    expires_in: ACCESS_TOKEN_TTL,
    refresh_token: newRefreshToken,
  });
}

export async function POST(req: Request): Promise<Response> {
  const params = await parseFormBody(req);
  const grantType = params.get("grant_type");

  switch (grantType) {
    case "authorization_code":
      return handleAuthorizationCode(params);
    case "refresh_token":
      return handleRefreshToken(params);
    default:
      return jsonError(`Unsupported grant_type: ${grantType}`, 400);
  }
}

export async function OPTIONS(): Promise<Response> {
  return corsOk();
}

