import { corsOk, jsonResponse, getAppUrl, CORS_HEADERS } from "@/app/api/mcp/oauth/lib";

export async function GET(req: Request): Promise<Response> {
  const appUrl = getAppUrl(req);
  return jsonResponse({
    resource: `${appUrl}/api/mcp`,
    authorization_servers: [appUrl],
    scopes_supported: [],
    resource_name: "Life on Track MCP Server",
  });
}

export async function OPTIONS(): Promise<Response> {
  return corsOk();
}

