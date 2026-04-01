/**
 * MCP token edge function integration tests.
 * Tests generate → exchange → revoke flow and security boundaries.
 *
 * Requires SUPABASE_EDGE_FUNCTIONS_URL env var if testing against a local instance,
 * otherwise uses the production URL from NEXT_PUBLIC_SUPABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestUser, deleteTestUser, makeUserClient, adminClient, TEST_PASSWORD } from "../helpers";

const EMAIL = "test-mcp@life-on-track.test";
const BASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const FUNCTIONS_URL = `${BASE_URL}/functions/v1`;

let userId: string;
let accessToken: string;

beforeAll(async () => {
  userId = await createTestUser(EMAIL, TEST_PASSWORD);
  const client = await makeUserClient(EMAIL, TEST_PASSWORD);
  const { data } = await client.auth.getSession();
  accessToken = data.session?.access_token ?? "";
});

afterAll(async () => {
  await adminClient.from("mcp_tokens").delete().eq("user_id", userId);
  await deleteTestUser(userId);
});

describe("generate-mcp-token", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await fetch(`${FUNCTIONS_URL}/generate-mcp-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test" }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("generates a token for authenticated user", async () => {
    const res = await fetch(`${FUNCTIONS_URL}/generate-mcp-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ name: "ci-test-token" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toMatch(/^lot_/);

    // Token hash should be stored in DB, not plain token
    const { data } = await adminClient
      .from("mcp_tokens")
      .select("token_hash, name, revoked")
      .eq("user_id", userId)
      .eq("name", "ci-test-token")
      .single();
    expect(data?.token_hash).toBeDefined();
    expect(data?.token_hash).not.toBe(body.token); // hash stored, not plaintext
    expect(data?.revoked).toBe(false);
  });
});

describe("exchange-mcp-token", () => {
  let plainToken: string;

  beforeAll(async () => {
    const res = await fetch(`${FUNCTIONS_URL}/generate-mcp-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ name: "exchange-test-token" }),
    });
    const body = await res.json();
    plainToken = body.token;
  });

  it("exchanges a valid token for a JWT", async () => {
    const res = await fetch(`${FUNCTIONS_URL}/exchange-mcp-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: plainToken }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.access_token).toBeDefined();
  });

  it("rejects an invalid token", async () => {
    const res = await fetch(`${FUNCTIONS_URL}/exchange-mcp-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "lot_invalid_token_xyz" }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects a revoked token", async () => {
    // Revoke via edge function
    await fetch(`${FUNCTIONS_URL}/revoke-mcp-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ token: plainToken }),
    });

    const res = await fetch(`${FUNCTIONS_URL}/exchange-mcp-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: plainToken }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("revoke-mcp-token", () => {
  it("rejects unauthenticated revoke", async () => {
    const res = await fetch(`${FUNCTIONS_URL}/revoke-mcp-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "lot_whatever" }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
