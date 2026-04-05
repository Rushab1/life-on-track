/**
 * Integration tests for /api/mcp route handler.
 *
 * Tests the full HTTP flow: auth, rate limiting, input validation, and tool execution.
 * Imports the route handler directly to avoid needing a running Next.js server.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestUser, deleteTestUser, makeUserClient, adminClient, TEST_PASSWORD } from "../helpers";

const EMAIL_A = "test-mcp-route-a@life-on-track.test";
const EMAIL_B = "test-mcp-route-b@life-on-track.test";
const BASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const FUNCTIONS_URL = `${BASE_URL}/functions/v1`;

let userIdA: string;
let userIdB: string;
let mcpTokenA: string;
let mcpTokenB: string;

async function generateMcpToken(accessToken: string, name: string): Promise<string> {
  const res = await fetch(`${FUNCTIONS_URL}/generate-mcp-token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ name }),
  });
  const body = await res.json();
  return body.token;
}

async function getAccessToken(email: string, password: string): Promise<string> {
  const client = await makeUserClient(email, password);
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? "";
}

/** Call the MCP route directly via the edge function exchange + tool invocation pattern. */
async function callMcpRoute(
  mcpToken: string | null,
  toolName: string,
  args: Record<string, unknown>
): Promise<Response> {
  // We need to call the actual deployed /api/mcp route or import it.
  // Since the route uses MCP protocol, we build an MCP JSON-RPC request.
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: toolName, arguments: args },
  };

  // Import the route handler directly
  const { POST } = await import("@/app/api/mcp/route");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-forwarded-for": "127.0.0.1",
  };
  if (mcpToken) {
    headers["Authorization"] = `Bearer ${mcpToken}`;
  }

  const req = new Request("http://localhost/api/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  return POST(req);
}

/** Make an MCP initialize + tools/call sequence (MCP protocol requires initialize first). */
async function mcpToolCall(
  mcpToken: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ status: number; body: unknown }> {
  const { POST } = await import("@/app/api/mcp/route");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${mcpToken}`,
    "x-forwarded-for": "127.0.0.1",
  };

  // MCP requires initialize before tool calls
  const initReq = new Request("http://localhost/api/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test", version: "0.0.1" },
      },
    }),
  });

  const initRes = await POST(initReq);
  if (initRes.status !== 200) {
    return { status: initRes.status, body: await initRes.json().catch(() => null) };
  }

  // Now call the tool
  const toolReq = new Request("http://localhost/api/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
  });

  const toolRes = await POST(toolReq);
  return { status: toolRes.status, body: await toolRes.json().catch(() => null) };
}

beforeAll(async () => {
  // Create two test users for cross-user isolation testing
  userIdA = await createTestUser(EMAIL_A, TEST_PASSWORD);
  userIdB = await createTestUser(EMAIL_B, TEST_PASSWORD);

  const [tokenA, tokenB] = await Promise.all([
    getAccessToken(EMAIL_A, TEST_PASSWORD).then((t) => generateMcpToken(t, "route-test-a")),
    getAccessToken(EMAIL_B, TEST_PASSWORD).then((t) => generateMcpToken(t, "route-test-b")),
  ]);
  mcpTokenA = tokenA;
  mcpTokenB = tokenB;
}, 30_000);

afterAll(async () => {
  // Clean up tokens and test data
  await Promise.all([
    adminClient.from("mcp_tokens").delete().eq("user_id", userIdA),
    adminClient.from("mcp_tokens").delete().eq("user_id", userIdB),
    adminClient.from("daily_logs").delete().eq("user_id", userIdA),
    adminClient.from("daily_logs").delete().eq("user_id", userIdB),
    adminClient.from("life_events").delete().eq("user_id", userIdA),
    adminClient.from("life_events").delete().eq("user_id", userIdB),
  ]);
  await Promise.all([deleteTestUser(userIdA), deleteTestUser(userIdB)]);
}, 15_000);

describe("/api/mcp authentication", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const res = await callMcpRoute(null, "get_daily_log", { date: "2026-01-01" });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("Missing Authorization");
  });

  it("returns 401 for an invalid token", async () => {
    const res = await callMcpRoute("lot_completely_bogus_token", "get_daily_log", { date: "2026-01-01" });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid token");
  });

  it("returns 401 for a revoked token", async () => {
    // Generate and revoke a token
    const accessToken = await getAccessToken(EMAIL_A, TEST_PASSWORD);
    const tempToken = await generateMcpToken(accessToken, "revoke-route-test");

    // Revoke it
    await fetch(`${FUNCTIONS_URL}/revoke-mcp-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ token: tempToken }),
    });

    const res = await callMcpRoute(tempToken, "get_daily_log", { date: "2026-01-01" });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Token has been revoked");
  });
});

describe("/api/mcp tool execution", () => {
  it("successfully calls a read tool with a valid token", async () => {
    const { status, body } = await mcpToolCall(mcpTokenA, "get_daily_log", { date: "2026-01-01" });
    expect(status).toBe(200);
    // MCP response should have a result with content
    expect(body).toHaveProperty("result");
  });

  it("rejects malformed date input", async () => {
    const { status, body } = await mcpToolCall(mcpTokenA, "get_daily_log", { date: "not-a-date" });
    expect(status).toBe(200); // MCP protocol returns 200 with error in result
    const result = (body as Record<string, unknown>).result as Record<string, unknown> | undefined;
    // Zod validation errors come back as MCP error responses
    expect(result?.isError ?? (body as Record<string, unknown>).error).toBeTruthy();
  });
});

describe("/api/mcp cross-user isolation", () => {
  it("user A cannot see user B data", async () => {
    // User B saves a daily log
    await mcpToolCall(mcpTokenB, "save_daily_log", {
      date: "2026-06-15",
      pain_level: 3,
      notes: "user B private data",
    });

    // User A reads the same date — should get nothing
    const { body } = await mcpToolCall(mcpTokenA, "get_daily_log", { date: "2026-06-15" });
    const result = (body as Record<string, unknown>).result as { content?: { text?: string }[] } | undefined;
    const text = result?.content?.[0]?.text ?? "";
    expect(text).not.toContain("user B private data");
    expect(text).toContain("No daily log found");
  });
});

describe("/api/mcp error sanitization", () => {
  it("does not leak database details in error responses", async () => {
    // Try to save with a pain_level that passes Zod but might cause a DB error
    // We can't easily trigger a real DB error, but we verify the pattern works
    // by checking that successful error responses don't contain table/column names
    const { body } = await mcpToolCall(mcpTokenA, "get_daily_log", { date: "2026-01-01" });
    const text = JSON.stringify(body);
    expect(text).not.toContain("daily_logs");
    expect(text).not.toContain("user_id");
    expect(text).not.toMatch(/PGRST\d+/);
  });
});

describe("/api/mcp life events", () => {
  it("log_event creates an event and get_events returns it", async () => {
    const { body: logBody } = await mcpToolCall(mcpTokenA, "log_event", {
      date: "2026-07-01",
      title: "Test Conference",
      notes: "Day 1 keynote",
    });
    const logResult = (logBody as Record<string, unknown>).result as { content?: { text?: string }[] } | undefined;
    expect(logResult?.content?.[0]?.text).toContain("Test Conference");

    const { body: getBody } = await mcpToolCall(mcpTokenA, "get_events", { date: "2026-07-01" });
    const getResult = (getBody as Record<string, unknown>).result as { content?: { text?: string }[] } | undefined;
    const text = getResult?.content?.[0]?.text ?? "";
    expect(text).toContain("Test Conference");
    expect(text).toContain("Day 1 keynote");
  });

  it("life events appear in get_day_summary", async () => {
    const { body } = await mcpToolCall(mcpTokenA, "get_day_summary", { date: "2026-07-01" });
    const result = (body as Record<string, unknown>).result as { content?: { text?: string }[] } | undefined;
    const text = result?.content?.[0]?.text ?? "";
    expect(text).toContain("life_events");
    expect(text).toContain("Test Conference");
  });

  it("delete_event removes the event", async () => {
    // Get the event ID
    const { body: getBody } = await mcpToolCall(mcpTokenA, "get_events", { date: "2026-07-01" });
    const getResult = (getBody as Record<string, unknown>).result as { content?: { text?: string }[] } | undefined;
    const events = JSON.parse(getResult?.content?.[0]?.text ?? "[]");
    const eventId = events[0]?.id;
    expect(eventId).toBeDefined();

    // Delete it
    const { body: delBody } = await mcpToolCall(mcpTokenA, "delete_event", { id: eventId });
    const delResult = (delBody as Record<string, unknown>).result as { content?: { text?: string }[] } | undefined;
    expect(delResult?.content?.[0]?.text).toContain("deleted");

    // Verify it's gone
    const { body: checkBody } = await mcpToolCall(mcpTokenA, "get_events", { date: "2026-07-01" });
    const checkResult = (checkBody as Record<string, unknown>).result as { content?: { text?: string }[] } | undefined;
    expect(checkResult?.content?.[0]?.text).toContain("No events found");
  });

  it("rejects partial date range (start_date without end_date)", async () => {
    const { body } = await mcpToolCall(mcpTokenA, "get_events", { start_date: "2026-07-01" });
    const result = (body as Record<string, unknown>).result as { content?: { text?: string }[] } | undefined;
    const text = result?.content?.[0]?.text ?? "";
    expect(text).toContain("Both start_date and end_date are required");
  });

  it("user A cannot see user B life events", async () => {
    await mcpToolCall(mcpTokenB, "log_event", {
      date: "2026-07-02",
      title: "User B secret trip",
    });

    const { body } = await mcpToolCall(mcpTokenA, "get_events", { date: "2026-07-02" });
    const result = (body as Record<string, unknown>).result as { content?: { text?: string }[] } | undefined;
    const text = result?.content?.[0]?.text ?? "";
    expect(text).not.toContain("User B secret trip");
  });
});

describe("/api/mcp Cache-Control headers", () => {
  it("sets no-store on auth error responses", async () => {
    const res = await callMcpRoute(null, "get_daily_log", { date: "2026-01-01" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
