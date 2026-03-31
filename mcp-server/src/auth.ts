import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let supabaseClient: SupabaseClient | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function exchangeToken(supabaseUrl: string, mcpToken: string): Promise<{
  access_token: string;
  expires_in: number;
  user_id: string;
}> {
  const response = await fetch(`${supabaseUrl}/functions/v1/exchange-mcp-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: mcpToken }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`Token exchange failed: ${(body as Record<string, string>).error ?? response.statusText}`);
  }

  return response.json() as Promise<{ access_token: string; expires_in: number; user_id: string }>;
}

export async function authenticate(): Promise<void> {
  const supabaseUrl = getRequiredEnv("LOT_SUPABASE_URL");
  const supabaseAnonKey = getRequiredEnv("LOT_SUPABASE_ANON_KEY");
  const mcpToken = getRequiredEnv("LOT_MCP_TOKEN");

  const result = await exchangeToken(supabaseUrl, mcpToken);

  supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${result.access_token}`,
      },
    },
  });

  // Schedule refresh 5 minutes before expiry
  const refreshMs = (result.expires_in - 300) * 1000;
  if (refreshTimer) clearTimeout(refreshTimer);

  const scheduleRefresh = () => {
    refreshTimer = setTimeout(async () => {
      try {
        const refreshResult = await exchangeToken(supabaseUrl, mcpToken);
        supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
          global: {
            headers: {
              Authorization: `Bearer ${refreshResult.access_token}`,
            },
          },
        });
        scheduleRefresh();
      } catch (err) {
        console.error("Failed to refresh MCP token:", err);
        // Retry in 60 seconds
        refreshTimer = setTimeout(scheduleRefresh, 60_000);
      }
    }, refreshMs);
  };

  scheduleRefresh();
}

export function getClient(): SupabaseClient {
  if (!supabaseClient) {
    throw new Error("Not authenticated. Call authenticate() first.");
  }
  return supabaseClient;
}
