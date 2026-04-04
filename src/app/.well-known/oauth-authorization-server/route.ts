import { corsOk, jsonResponse, getAppUrl, CORS_HEADERS } from "@/app/api/mcp/oauth/lib";

export async function GET(req: Request): Promise<Response> {
  const appUrl = getAppUrl(req);
  return jsonResponse({
    issuer: appUrl,
    authorization_endpoint: `${appUrl}/authorize`,
    token_endpoint: `${appUrl}/token`,
    registration_endpoint: `${appUrl}/register`,
    revocation_endpoint: `${appUrl}/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["client_secret_post"],
    scopes_supported: [],
  });
}

export async function OPTIONS(): Promise<Response> {
  return corsOk();
}

