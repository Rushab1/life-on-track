"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

interface McpToken {
  id: string;
  name: string;
  last_used_at: string | null;
  revoked: boolean;
  created_at: string;
}

export default function McpTokenManager({ userId }: { userId: string }) {
  const [tokens, setTokens] = useState<McpToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTokenName, setNewTokenName] = useState("");
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadTokens = useCallback(async () => {
    const { data } = await supabase
      .from("mcp_tokens")
      .select("id, name, last_used_at, revoked, created_at")
      .eq("user_id", userId)
      .eq("revoked", false)
      .order("created_at", { ascending: false });

    if (data) setTokens(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  async function generateToken() {
    if (!newTokenName.trim()) return;
    setGenerating(true);
    setGeneratedToken(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-mcp-token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ name: newTokenName.trim() }),
        }
      );

      const result = await res.json();
      if (result.token) {
        setGeneratedToken(result.token);
        setNewTokenName("");
        await loadTokens();
      }
    } finally {
      setGenerating(false);
    }
  }

  async function revokeToken(tokenId: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/revoke-mcp-token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        },
        body: JSON.stringify({ token_id: tokenId }),
      }
    );

    await loadTokens();
  }

  function copyConfig() {
    if (!generatedToken) return;
    const config = JSON.stringify(
      {
        mcpServers: {
          "life-on-track": {
            url: `${window.location.origin}/api/mcp`,
            headers: {
              Authorization: `Bearer ${generatedToken}`,
            },
          },
        },
      },
      null,
      2
    );
    navigator.clipboard.writeText(config);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-stone-100 mb-1">MCP Tokens</h3>
        <p className="text-sm text-stone-500">
          Connect Life on Track to Claude Desktop or Claude Code.
        </p>
      </div>

      {/* Generate new token */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Token name (e.g. My Laptop)"
          value={newTokenName}
          onChange={(e) => setNewTokenName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && generateToken()}
          className="input flex-1 text-sm"
        />
        <button
          onClick={generateToken}
          disabled={generating || !newTokenName.trim()}
          className="btn btn-primary"
        >
          {generating ? "Generating..." : "Generate"}
        </button>
      </div>

      {/* Show newly generated token */}
      {generatedToken && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-3">
          <p className="text-sm font-medium text-amber-300">
            Save this token now — it won&apos;t be shown again!
          </p>
          <code className="block p-2 bg-[#14151c] border border-amber-500/20 rounded text-xs break-all font-mono">
            {generatedToken}
          </code>
          <div className="flex gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(generatedToken);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="btn px-3 py-1.5 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
            >
              {copied ? "Copied!" : "Copy Token"}
            </button>
            <button
              onClick={copyConfig}
              className="btn px-3 py-1.5 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
            >
              Copy Claude Config
            </button>
            <button
              onClick={() => setGeneratedToken(null)}
              className="btn btn-ghost px-3 py-1.5 ml-auto"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Token list */}
      {loading ? (
        <p className="text-sm text-stone-500">Loading tokens...</p>
      ) : tokens.length === 0 ? (
        <p className="text-sm text-stone-500">No active tokens.</p>
      ) : (
        <div className="space-y-2">
          {tokens.map((token) => (
            <div
              key={token.id}
              className="flex items-center justify-between p-3 bg-white/[0.04] rounded-xl border border-white/[0.08]"
            >
              <div>
                <p className="text-sm font-medium text-stone-100">{token.name}</p>
                <p className="text-xs text-stone-500">
                  Created {new Date(token.created_at).toLocaleDateString()}
                  {token.last_used_at && (
                    <> · Last used {new Date(token.last_used_at).toLocaleDateString()}</>
                  )}
                </p>
              </div>
              <button
                onClick={() => revokeToken(token.id)}
                className="btn btn-danger-ghost px-3 py-1"
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
