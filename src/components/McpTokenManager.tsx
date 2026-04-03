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
        <h3 className="text-lg font-semibold text-gray-900 mb-1">MCP Tokens</h3>
        <p className="text-sm text-gray-500">
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
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm
                     focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={generateToken}
          disabled={generating || !newTokenName.trim()}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg
                     hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors"
        >
          {generating ? "Generating..." : "Generate"}
        </button>
      </div>

      {/* Show newly generated token */}
      {generatedToken && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
          <p className="text-sm font-medium text-amber-800">
            Save this token now — it won&apos;t be shown again!
          </p>
          <code className="block p-2 bg-white border border-amber-300 rounded text-xs break-all font-mono">
            {generatedToken}
          </code>
          <div className="flex gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(generatedToken);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="px-3 py-1.5 text-sm bg-amber-100 hover:bg-amber-200 rounded
                         transition-colors"
            >
              {copied ? "Copied!" : "Copy Token"}
            </button>
            <button
              onClick={copyConfig}
              className="px-3 py-1.5 text-sm bg-amber-100 hover:bg-amber-200 rounded
                         transition-colors"
            >
              Copy Claude Config
            </button>
            <button
              onClick={() => setGeneratedToken(null)}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800
                         transition-colors ml-auto"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Token list */}
      {loading ? (
        <p className="text-sm text-gray-400">Loading tokens...</p>
      ) : tokens.length === 0 ? (
        <p className="text-sm text-gray-400">No active tokens.</p>
      ) : (
        <div className="space-y-2">
          {tokens.map((token) => (
            <div
              key={token.id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">{token.name}</p>
                <p className="text-xs text-gray-500">
                  Created {new Date(token.created_at).toLocaleDateString()}
                  {token.last_used_at && (
                    <> · Last used {new Date(token.last_used_at).toLocaleDateString()}</>
                  )}
                </p>
              </div>
              <button
                onClick={() => revokeToken(token.id)}
                className="px-3 py-1 text-sm text-red-600 hover:text-red-700 hover:bg-red-50
                           rounded transition-colors"
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
