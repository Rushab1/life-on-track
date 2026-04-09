"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export function useGoogleConnection(userId: string) {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("google_tokens")
      .select("user_id")
      .eq("user_id", userId)
      .single();

    setConnected(!!data);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function disconnect() {
    await supabase.from("google_tokens").delete().eq("user_id", userId);
    setConnected(false);
  }

  return { connected, loading, disconnect, reload: load };
}
