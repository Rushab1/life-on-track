import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateRequest } from "./auth";
import { registerAllTools } from "./tools";
import { checkIpLimit, checkAuthFailureLimit, checkUserLimit } from "./rate-limit";

const NO_STORE = { "Cache-Control": "no-store" };

function extractBearer(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json", ...NO_STORE },
  });
}

async function handleMcpRequest(req: Request): Promise<Response> {
  const ip = getClientIp(req);

  // Pre-auth IP rate limit
  if (!checkIpLimit(ip)) {
    return jsonError("Too many requests", 429);
  }

  const token = extractBearer(req);
  if (!token) {
    return jsonError("Missing Authorization: Bearer <token>", 401);
  }

  let auth;
  try {
    auth = await authenticateRequest(token);
  } catch (err) {
    if (!checkAuthFailureLimit(ip)) {
      return jsonError("Too many failed authentication attempts", 429);
    }
    const message = err instanceof Error ? err.message : "Authentication failed";
    return jsonError(message, 401);
  }

  // Post-auth user rate limit
  if (!checkUserLimit(auth.userId)) {
    return jsonError("Too many requests", 429);
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
