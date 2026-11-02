import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type RealtimeTable = "delivery_tasks" | "products" | "bills" | "payments" | "customers";

/** Refreshes the given query keys whenever rows in these tables change. */
export function useRealtimeRefresh(tables: RealtimeTable[], keys: string[][]) {
  const qc = useQueryClient();
  const sig = JSON.stringify([tables, keys]);
  useEffect(() => {
    const [tbls, ks] = JSON.parse(sig) as [string[], string[][]];
    const channel = supabase.channel(`rt-${Math.random().toString(36).slice(2)}`);
    for (const table of tbls) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        for (const key of ks) qc.invalidateQueries({ queryKey: key });
      });
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [sig, qc]);
}

/** Current time in ms, updated on an interval (for live timers). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
