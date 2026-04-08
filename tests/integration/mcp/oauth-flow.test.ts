/**
 * End-to-end OAuth flow test — behaves like Claude Desktop.
 *
 * Hits the deployed server via HTTP. Only needs the public Supabase
 * credentials (anon key) — no server secrets.
 *
 * Set TEST_APP_URL to test against a different deployment.
 * Set TEST_USER_EMAIL / TEST_USER_PASSWORD to use an existing account
 * (otherwise creates one via signUp — requires email confirmation disabled).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const APP_URL = process.env.TEST_APP_URL ?? "https://life-on-track.vercel.app";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const TEST_EMAIL = process.env.TEST_USER_EMAIL ?? "test-oauth@life-on-track.test";
const TEST_PASS = process.env.TEST_USER_PASSWORD ?? "TestOAuth123!";

// --- PKCE helpers ---

function base64url(buf: ArrayBuffer): string {
  let binary = "";
  new Uint8Array(buf).forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function generatePkce() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)).buffer);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(digest) };
}

// --- State ---

let userAccessToken: string;
let clientId: string;
let clientSecret: string;

beforeAll(async () => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in env");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASS,
  });

  if (error || !data.session) {
    throw new Error(
      `Cannot sign in test user (${TEST_EMAIL}). ` +
        `Set TEST_USER_EMAIL/TEST_USER_PASSWORD or create the account. ` +
        `(${error?.message ?? "no session returned"})`
    );
  }
  userAccessToken = data.session.access_token;
}, 15_000);

// --- Tests ---

describe("OAuth discovery", () => {
  it("serves authorization server metadata", async () => {
    const res = await fetch(`${APP_URL}/.well-known/oauth-authorization-server`);
    expect(res.status).toBe(200);

    const meta = await res.json();
    expect(meta.issuer).toBe(APP_URL);
    expect(meta.authorization_endpoint).toBe(`${APP_URL}/authorize`);
    expect(meta.token_endpoint).toBe(`${APP_URL}/token`);
    expect(meta.registration_endpoint).toBe(`${APP_URL}/register`);
    expect(meta.code_challenge_methods_supported).toContain("S256");
  });

  it("serves protected resource metadata for /api/mcp", async () => {
    const res = await fetch(`${APP_URL}/.well-known/oauth-protected-resource/api/mcp`);
    expect(res.status).toBe(200);

    const meta = await res.json();
    expect(meta.resource).toBe(`${APP_URL}/api/mcp`);
    expect(meta.authorization_servers).toContain(APP_URL);
  });
});

describe("OAuth client registration", () => {
  it("registers a client with numeric timestamps (RFC 7591)", async () => {
    const res = await fetch(`${APP_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        redirect_uris: ["http://localhost:19999/oauth/callback"],
        client_name: "Vitest OAuth Client",
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();

    expect(body.client_id).toBeDefined();
    expect(body.client_secret).toBeDefined();
    expect(typeof body.client_id_issued_at).toBe("number");
    expect(typeof body.client_secret_expires_at).toBe("number");
    expect(body.grant_types).toContain("authorization_code");
    expect(body.grant_types).toContain("refresh_token");
    expect(body.token_endpoint_auth_method).toBe("client_secret_post");

    clientId = body.client_id;
    clientSecret = body.client_secret;
  });

  it("rejects missing redirect_uris", async () => {
    const res = await fetch(`${APP_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe("OAuth authorization + token exchange", () => {
  let authCode: string;
  let codeVerifier: string;
  let oauthAccessToken: string;
  let oauthRefreshToken: string;

  it("issues an authorization code", async () => {
    const pkce = await generatePkce();
    codeVerifier = pkce.verifier;

    const res = await fetch(`${APP_URL}/api/oauth/authorize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        redirect_uri: "http://localhost:19999/oauth/callback",
        code_challenge: pkce.challenge,
        state: "test-state",
        scope: "openid",
        access_token: userAccessToken,
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.redirect_url).toBeDefined();

    const url = new URL(body.redirect_url);
    expect(url.searchParams.get("state")).toBe("test-state");
    authCode = url.searchParams.get("code")!;
    expect(authCode).toBeDefined();
  });

  it("rejects unregistered redirect_uri", async () => {
    const pkce = await generatePkce();
    const res = await fetch(`${APP_URL}/api/oauth/authorize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        redirect_uri: "http://evil.example.com/steal",
        code_challenge: pkce.challenge,
        state: "x",
        scope: "",
        access_token: userAccessToken,
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("redirect_uri");
  });

  it("exchanges code + PKCE verifier for tokens", async () => {
    const res = await fetch(`${APP_URL}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: authCode,
        code_verifier: codeVerifier,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: "http://localhost:19999/oauth/callback",
      }).toString(),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.access_token).toBeDefined();
    expect(body.refresh_token).toBeDefined();
    expect(body.token_type).toBe("bearer");
    expect(body.expires_in).toBe(3600);

    oauthAccessToken = body.access_token;
    oauthRefreshToken = body.refresh_token;
  });

  it("rejects reuse of auth code", async () => {
    const res = await fetch(`${APP_URL}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: authCode,
        code_verifier: codeVerifier,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: "http://localhost:19999/oauth/callback",
      }).toString(),
    });
    expect(res.status).toBe(400);
  });

  it("rejects wrong PKCE verifier", async () => {
    const pkce = await generatePkce();
    // Get a fresh code
    const authRes = await fetch(`${APP_URL}/api/oauth/authorize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        redirect_uri: "http://localhost:19999/oauth/callback",
        code_challenge: pkce.challenge,
        state: "pkce-test",
        scope: "",
        access_token: userAccessToken,
      }),
    });
    const { redirect_url } = await authRes.json();
    const code = new URL(redirect_url).searchParams.get("code")!;

    const res = await fetch(`${APP_URL}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: "totally_wrong_verifier",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: "http://localhost:19999/oauth/callback",
      }).toString(),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("code_verifier");
  });

  it("authenticates MCP requests with the OAuth token", async () => {
    // This is where the mintSupabaseJwt failure shows up:
    // OAuth JWT verification passes, but minting a Supabase JWT for RLS fails
    // if SUPABASE_SERVICE_ROLE_KEY is not set on the server.
    const res = await fetch(`${APP_URL}/api/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${oauthAccessToken}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "oauth-test", version: "0.0.1" },
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result?.serverInfo?.name).toBe("life-on-track");
  });

  it("can call an MCP tool with the OAuth token", async () => {
    const res = await fetch(`${APP_URL}/api/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${oauthAccessToken}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "get_day", arguments: { date: "2026-01-01" } },
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toBeDefined();
  });

  it("refreshes tokens and the new token works", async () => {
    const res = await fetch(`${APP_URL}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: oauthRefreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.access_token).toBeDefined();
    expect(body.refresh_token).not.toBe(oauthRefreshToken);

    // New token works for MCP
    const mcpRes = await fetch(`${APP_URL}/api/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${body.access_token}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "oauth-test", version: "0.0.1" },
        },
      }),
    });
    expect(mcpRes.status).toBe(200);

    // Old refresh token is revoked
    const staleRes = await fetch(`${APP_URL}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: oauthRefreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });
    expect(staleRes.status).toBe(400);
  });

  it("rejects a tampered OAuth token", async () => {
    const tampered = oauthAccessToken.slice(0, -5) + "XXXXX";
    const res = await fetch(`${APP_URL}/api/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${tampered}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "oauth-test", version: "0.0.1" },
        },
      }),
    });
    expect(res.status).toBe(401);
  });
});
