import { useEffect, useState } from "react";

import { logWarning } from "@/lib/errors";
import { connectReadModel } from "@/lib/readModelClient";
import { useAuth } from "@/providers/AuthProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import { readModelFreshness, type Freshness } from "@/shared/utils/readModelFreshness";
import { configuredReadModelMode, type ReadModelScreen } from "@/shared/utils/readModelMode";

/**
 * SPENDLY-511 — the freshness of a read-model screen, from the user's own
 * `sync_status` rows (SPENDLY-505 lets them read only those).
 *
 * Returns null whenever the screen reads Firestore (the default, duress,
 * offline, no read model), so nothing is shown and nothing is fetched. One
 * small Supabase read per mount otherwise; no Firestore reads.
 */
const timeLabel = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function useReadModelFreshness(
  screen: ReadModelScreen,
  collections: string[],
  newestLocalWriteMs: number | null
): Freshness | null {
  const { user, isDuress } = useAuth();
  const { isOnline } = useNetwork();
  const { settings } = useSystemSettings();
  const configured = configuredReadModelMode(settings.readModel, screen);
  const active = configured === "supabase" && isOnline && !isDuress && !!user;
  const [lastSyncedAtMs, setLastSyncedAtMs] = useState<number | null | undefined>(undefined);
  const key = collections.join(",");

  useEffect(() => {
    if (!active) {
      setLastSyncedAtMs(undefined);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { client } = await connectReadModel(user);
        if (!client) return;
        const { data, error } = await client.from("sync_status").select("collection, last_synced_at").in("collection", key.split(","));
        if (error) throw new Error(error.message);
        // The screen is as fresh as its stalest collection.
        const times = (data ?? []).map((r: { last_synced_at: string | null }) => (r.last_synced_at ? Date.parse(r.last_synced_at) : null));
        const stalest = times.length === 0 || times.some((t) => t === null) ? null : Math.min(...(times as number[]));
        if (!cancelled) setLastSyncedAtMs(stalest);
      } catch (error) {
        logWarning("readModel.freshness", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, user, key]);

  if (!active || lastSyncedAtMs === undefined) return null;
  return readModelFreshness({ lastSyncedAtMs, newestLocalWriteMs, nowMs: Date.now(), formatTime: timeLabel });
}
