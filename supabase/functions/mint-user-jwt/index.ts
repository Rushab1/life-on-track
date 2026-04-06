import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.1";

function base64url(data: Uint8Array): string {
  let binary = "";
  data.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function signJWT(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const encoder = new TextEncoder();

  const headerB64 = base64url(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64url(encoder.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput));
  const signatureB64 = base64url(new Uint8Array(signature));

  return `${signingInput}.${signatureB64}`;
}

/** Verify the caller is using a service_role key (works with both legacy JWT and new sb_secret_ formats). */
function verifyServiceRole(authHeader: string): boolean {
  const token = authHeader.replace("Bearer ", "");
  const envKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  // Exact match (covers new sb_secret_ format)
  if (token === envKey) return true;

  // Legacy JWT format: decode and check role claim
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.role === "service_role") return true;
  } catch { /* not a valid JWT */ }

  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    if (!verifyServiceRole(authHeader)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id } = await req.json();
    if (!user_id || typeof user_id !== "string") {
      return new Response(JSON.stringify({ error: "user_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use the caller's key for admin operations (legacy JWT format works with JS client)
    const callerKey = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const adminClient = createClient(supabaseUrl, callerKey);
    const { data: user, error } = await adminClient.auth.admin.getUserById(user_id);

    if (error || !user) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sign a short-lived JWT for this user
    const jwtSecret = Deno.env.get("SUPABASE_JWT_SECRET")!;
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = 3600; // 1 hour

    const accessToken = await signJWT(
      {
        aud: "authenticated",
        exp: now + expiresIn,
        iat: now,
        iss: `${supabaseUrl}/auth/v1`,
        sub: user_id,
        role: "authenticated",
      },
      jwtSecret,
    );

    return new Response(JSON.stringify({
      access_token: accessToken,
      expires_in: expiresIn,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
