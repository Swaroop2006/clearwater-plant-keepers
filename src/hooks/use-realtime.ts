import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Refreshes the given query keys whenever rows in these tables change. */
export function useRealtimeRefresh(tables: Array<"delivery_tasks" | "products">, keys: string[][]) {
  const qc = useQueryClient();
  const sig = JSON.stringify([tables, keys]);
  useEffect(() => {
    const channel = supabase.channel(`rt-${Math.random().toString(36).slice(2)}`);
    for (const table of tables) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        for (const key of keys) qc.invalidateQueries({ queryKey: key });
      });
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, qc]);
}

export function useNow(intervalMs = 1000) {
  // lightweight ticking clock for timers
  const [, force] = useStateTick(intervalMs);
  return force;
}

import { useState } from "react";
function useStateTick(intervalMs: number): [number, number] {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return [now, now];
}
