"use client";

import { useState } from "react";
import { useGoogleConnection } from "@/hooks/useGoogleConnection";

export default function GoogleConnector({ userId }: { userId: string }) {
  const { connected, loading, disconnect } = useGoogleConnection(userId);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ synced: number; failed: number } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  async function handleDisconnect() {
    setDisconnecting(true);
    await disconnect();
    setDisconnecting(false);
    setSyncResult(null);
    setSyncError(null);
  }

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    setSyncError(null);
    try {
      const res = await fetch("/api/google/sync", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSyncError(body.error ?? "Sync failed");
      } else {
        const data = await res.json();
        setSyncResult({ synced: data.synced, failed: data.failed });
      }
    } catch {
      setSyncError("Network error");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-stone-100 mb-1">Connectors</h3>
        <p className="text-sm text-stone-500">
          Connect external services to sync your data.
        </p>
      </div>

      <div className="p-3 bg-white/[0.04] rounded-xl border border-white/[0.06] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-stone-300" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.5 22h-15A2.5 2.5 0 0 1 2 19.5v-15A2.5 2.5 0 0 1 4.5 2h15A2.5 2.5 0 0 1 22 4.5v15a2.5 2.5 0 0 1-2.5 2.5zM9.5 7.5v4L6 14l3.5 2.5v4L17 14 9.5 7.5z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-stone-100">Google Calendar</p>
              {loading ? (
                <p className="text-xs text-stone-500">Checking...</p>
              ) : connected ? (
                <p className="text-xs text-emerald-400">Connected</p>
              ) : (
                <p className="text-xs text-stone-500">Not connected</p>
              )}
            </div>
          </div>

          {!loading && (
            connected ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="btn btn-ghost"
                >
                  {syncing ? "Syncing..." : "Sync 2 weeks"}
                </button>
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="btn btn-danger-ghost"
                >
                  {disconnecting ? "..." : "Disconnect"}
                </button>
              </div>
            ) : (
              <button
                onClick={() => { window.location.href = "/api/google/auth"; }}
                className="btn btn-primary text-sm px-3 py-1.5"
              >
                Connect
              </button>
            )
          )}
        </div>

        {syncResult && (
          <p className="text-xs text-emerald-400">
            Synced {syncResult.synced} events{syncResult.failed > 0 ? ` (${syncResult.failed} failed)` : ""}
          </p>
        )}
        {syncError && (
          <p className="text-xs text-rose-400">{syncError}</p>
        )}
      </div>
    </div>
  );
}
