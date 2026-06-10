"use client";

import { useState } from "react";
import { useOuraConnection } from "@/hooks/useOura";

export default function OuraConnector({ userId }: { userId: string }) {
  const { connected, loading, disconnect } = useOuraConnection(userId);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ synced: number } | null>(null);
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
      const res = await fetch("/api/oura/sync", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSyncError(body.error ?? "Sync failed");
      } else {
        setSyncResult(await res.json());
      }
    } catch {
      setSyncError("Network error");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="p-3 bg-white/[0.04] rounded-xl border border-white/[0.06] space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5 text-stone-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="4.5" />
          </svg>
          <div>
            <p className="text-sm font-medium text-stone-100">Oura Ring</p>
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
                {syncing ? "Syncing..." : "Sync now"}
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
              onClick={() => { window.location.href = "/api/oura/auth"; }}
              className="btn btn-primary text-sm px-3 py-1.5"
            >
              Connect
            </button>
          )
        )}
      </div>

      {syncResult && (
        <p className="text-xs text-emerald-400">
          Synced {syncResult.synced} day{syncResult.synced === 1 ? "" : "s"} of data
        </p>
      )}
      {syncError && <p className="text-xs text-rose-400">{syncError}</p>}
    </div>
  );
}
