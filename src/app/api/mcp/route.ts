import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { exchangeMcpToken } from "./auth";
import { registerAllTools } from "./tools";

function extractBearer(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleMcpRequest(req: Request): Promise<Response> {
  const token = extractBearer(req);
  if (!token) {
    return jsonError("Missing Authorization: Bearer <token>", 401);
  }

  let auth;
  try {
    auth = await exchangeMcpToken(token);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Authentication failed";
    return jsonError(message, 401);
  }

  const server = new McpServer({
    name: "life-on-track",
    version: "0.1.0",
  });

  registerAllTools(server, auth.client, auth.userId);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true,
  });

  await server.connect(transport);

  const response = await transport.handleRequest(req);

  // Close transport so the serverless function can terminate
  await transport.close();
  await server.close();

  return response;
}

export async function POST(req: Request): Promise<Response> {
  return handleMcpRequest(req);
}

export async function GET(req: Request): Promise<Response> {
  return handleMcpRequest(req);
}

export async function DELETE(): Promise<Response> {
  // Stateless mode — no sessions to terminate
  return new Response(null, { status: 405 });
}
