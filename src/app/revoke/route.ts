import {
  corsOk,
  jsonResponse,
  sha256,
  adminClient,
} from "@/app/api/mcp/oauth/lib";

export async function POST(req: Request): Promise<Response> {
  const text = await req.text();
  const params = new URLSearchParams(text);
  const token = params.get("token");

  if (!token) {
    // Per RFC 7009, always return 200 even on invalid input
    return jsonResponse({});
  }

  const tokenHash = await sha256(token);

  // Try to revoke as refresh token
  await adminClient()
    .from("oauth_refresh_tokens")
    .update({ revoked: true })
    .eq("token_hash", tokenHash);

  // Always 200 per RFC 7009
  return jsonResponse({});
}

export async function OPTIONS(): Promise<Response> {
  return corsOk();
}

