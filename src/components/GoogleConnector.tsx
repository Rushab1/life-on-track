"use client";

import { useState } from "react";
import { useGoogleConnection } from "@/hooks/useGoogleConnection";

export default function GoogleConnector({ userId }: { userId: string }) {
  const { connected, loading, disconnect } = useGoogleConnection(userId);
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleDisconnect() {
    setDisconnecting(true);
    await disconnect();
    setDisconnecting(false);
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Connectors</h3>
        <p className="text-sm text-gray-500">
          Connect external services to sync your data.
        </p>
      </div>

      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5 text-gray-700" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.5 22h-15A2.5 2.5 0 0 1 2 19.5v-15A2.5 2.5 0 0 1 4.5 2h15A2.5 2.5 0 0 1 22 4.5v15a2.5 2.5 0 0 1-2.5 2.5zM9.5 7.5v4L6 14l3.5 2.5v4L17 14 9.5 7.5z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-gray-900">Google Calendar</p>
            {loading ? (
              <p className="text-xs text-gray-400">Checking...</p>
            ) : connected ? (
              <p className="text-xs text-green-600">Connected</p>
            ) : (
              <p className="text-xs text-gray-400">Not connected</p>
            )}
          </div>
        </div>

        {!loading && (
          connected ? (
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="px-3 py-1 text-sm text-red-600 hover:text-red-700 hover:bg-red-50
                         rounded transition-colors disabled:opacity-50"
            >
              {disconnecting ? "..." : "Disconnect"}
            </button>
          ) : (
            <button
              onClick={() => { window.location.href = "/api/google/auth"; }}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg
                         hover:bg-blue-700 transition-colors"
            >
              Connect
            </button>
          )
        )}
      </div>
    </div>
  );
}
