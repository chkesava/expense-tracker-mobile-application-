import { useEffect, useState } from "react";

import { isLocalTestMode } from "@/lib/env";
import { logWarning } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { resolveJournalBackend } from "@/lib/readModel/journalReadPath";
import { useAuth } from "@/providers/AuthProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import { readModelFreshness, type Freshness } from "@/shared/utils/readModelFreshness";
import { configuredReadModelMode, type ReadModelScreen } from "@/shared/utils/readModelMode";

/**
 * SPENDLY-511 — the freshness of a read-model screen, from the user's own
 * `sync_status` rows (SPENDLY-505 lets them read only those). In a local test
 * build the loopback answers instead (SPENDLY-512), with the lag set by
 * `readModel.loopbackLagMinutes` in the emulator's system settings.
 *
 * Returns null whenever the screen reads Firestore (the default, duress,
 * offline, no read model), so nothing is shown and nothing is fetched.
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
  const setting = settings.readModel;

  useEffect(() => {
    const db = getFirestoreDb();
    if (!active || !db || !user) {
      setLastSyncedAtMs(undefined);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { mode, backend } = await resolveJournalBackend({
          db,
          user,
          conditions: { setting, online: isOnline, duress: isDuress, localTestMode: isLocalTestMode() },
        });
        if (mode !== "supabase" || !backend) return;
        const at = await backend.lastSyncedAt(key.split(","));
        if (!cancelled) setLastSyncedAtMs(at);
      } catch (error) {
        logWarning("readModel.freshness", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, user, key, setting, isOnline, isDuress]);

  if (!active || lastSyncedAtMs === undefined) return null;
  return readModelFreshness({ lastSyncedAtMs, newestLocalWriteMs, nowMs: Date.now(), formatTime: timeLabel });
}
