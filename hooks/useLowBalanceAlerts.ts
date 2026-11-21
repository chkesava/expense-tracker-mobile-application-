/**
 * SPENDLY-798 (epic SPENDLY-793): the stored low-balance result for the
 * signed-in user. `serverResults/autoDebitShortfall` is written by the server
 * (autodebit-daily). It is read through `useServerResults`, which honours the
 * per-collection read switch (Firestore by default; the on-device copy in
 * `supabase` mode).
 *
 * Nothing is computed here (epic 735 rule): `lowBalanceView` only picks the
 * stored items that apply on the user's day. Call it once per screen and
 * pass the view down; each call mounts its own listener.
 */

import { useMemo } from "react";

import { useServerResults } from "@/hooks/useServerResults";
import { useSettings } from "@/providers/SettingsProvider";
import { todayDateKey } from "@/shared/utils/dates";
import { EMPTY_LOW_BALANCE_VIEW, lowBalanceView, type LowBalanceView } from "@/shared/utils/lowBalanceDisplay";
import { AUTO_DEBIT_SHORTFALL_DOC, autoDebitShortfallFromDocs, type StoredAutoDebitShortfall } from "@/shared/utils/serverResults";

export function useLowBalanceAlerts(options?: { enabled?: boolean }): {
  view: LowBalanceView;
  /** The stored result as written (SPENDLY-799 plans the coming days from it); null when none or loading. */
  stored: StoredAutoDebitShortfall | null;
  today: string;
  loading: boolean;
} {
  const { settings } = useSettings();
  const { docs, loading } = useServerResults({ ...options, docId: AUTO_DEBIT_SHORTFALL_DOC });
  const today = todayDateKey(settings.timezone);
  const stored = useMemo(() => (docs ? autoDebitShortfallFromDocs(docs) : null), [docs]);
  const view = useMemo(() => (docs ? lowBalanceView(stored, today) : EMPTY_LOW_BALANCE_VIEW), [docs, stored, today]);
  return { view, stored, today, loading };
}
