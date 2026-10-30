import { doc, onSnapshot } from "@/lib/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler, type LoadFailure } from "@/lib/firestoreErrors";
import { logDirectRead } from "@/lib/firestoreReadDebug";
import type { DashboardPeriodSummary } from "@/shared/types/financialSummary";

/**
 * SPENDLY-581 review (PR #239) — the drill-downs' month summaries
 * (`users/{uid}/financialSummaries/dashboard_{YYYY-MM}`), one shared live
 * listener per month for the whole session.
 *
 * Before, each drill-down screen opened its own window query (6, 13, 24 or 36
 * docs) through `useDashboardCashFlow`, and every month change opened another
 * window, re-reading months it already had. Now:
 * - each month's doc is read once and then kept live (a backdated edit still
 *   updates the figure), shared by every screen that shows it;
 * - when no screen needs a month any more it stays live for `graceMs`, so
 *   going back and forth between months and screens costs nothing;
 * - the drill-downs no longer go through `useDashboardCashFlow`, whose
 *   `cashFlow = supabase` mode keeps only the last two months as summaries.
 *
 * These are Firestore's authoritative values (READ_MODEL_RULES R4); they are
 * never recomputed here.
 */
export type SummaryEntry = {
  status: "loading" | "ready" | "error";
  /** Null when the month has no summary doc (no spending recorded). */
  summary: DashboardPeriodSummary | null;
  error: LoadFailure | null;
};

export type SubscribeMonth = (
  uid: string,
  month: string,
  onData: (summary: DashboardPeriodSummary | null) => void,
  onError: (failure: LoadFailure) => void
) => () => void;

type Slot = { entry: SummaryEntry; refs: number; unsubscribe: () => void; timer: ReturnType<typeof setTimeout> | null };

export const SUMMARY_GRACE_MS = 5 * 60 * 1000;

export function createSummaryMonthStore(subscribe: SubscribeMonth, options: { graceMs?: number } = {}) {
  const graceMs = options.graceMs ?? SUMMARY_GRACE_MS;
  const slots = new Map<string, Slot>();
  const listeners = new Set<() => void>();
  let version = 0;
  let uidInUse: string | null = null;

  const notify = () => {
    version += 1;
    for (const listener of listeners) listener();
  };
  const keyOf = (uid: string, month: string) => `${uid}|${month}`;

  function drop(key: string) {
    const slot = slots.get(key);
    if (!slot) return;
    if (slot.timer) clearTimeout(slot.timer);
    slot.unsubscribe();
    slots.delete(key);
  }

  /** Stops every listener (sign-out or another user). */
  function reset() {
    for (const key of [...slots.keys()]) drop(key);
    uidInUse = null;
    notify();
  }

  /** Points the slot at a new live listener for the month. */
  function start(uid: string, month: string, slot: Slot) {
    slot.unsubscribe = subscribe(
      uid,
      month,
      (summary) => {
        slot.entry = { status: "ready", summary, error: null };
        notify();
      },
      (error) => {
        slot.entry = { status: "error", summary: slot.entry.summary, error };
        notify();
      }
    );
  }

  /** Starts (or keeps) a live listener for each month; returns the release. */
  function acquire(uid: string, months: readonly string[]): () => void {
    if (uidInUse && uidInUse !== uid) reset();
    uidInUse = uid;
    const unique = [...new Set(months)];
    const keys = unique.map((m) => keyOf(uid, m));
    unique.forEach((month, i) => {
      const key = keys[i];
      let slot = slots.get(key);
      if (slot && slot.entry.status === "error") {
        // Firestore ends a listener after reporting an error (permission
        // denied on a token refresh, a quick sign-out/in). Start a new one,
        // keeping the last figure while it loads (PR #239 review).
        slot.unsubscribe();
        slot.entry = { status: "loading", summary: slot.entry.summary, error: null };
        start(uid, month, slot);
        notify();
      }
      if (!slot) {
        const created: Slot = {
          entry: { status: "loading", summary: null, error: null },
          refs: 0,
          unsubscribe: () => {},
          timer: null,
        };
        slots.set(key, created);
        start(uid, month, created);
        slot = created;
      }
      if (slot.timer) {
        clearTimeout(slot.timer);
        slot.timer = null;
      }
      slot.refs += 1;
    });
    let released = false;
    return () => {
      if (released) return;
      released = true;
      for (const key of keys) {
        const slot = slots.get(key);
        if (!slot) continue;
        slot.refs -= 1;
        if (slot.refs <= 0 && !slot.timer) slot.timer = setTimeout(() => drop(key), graceMs);
      }
    };
  }

  return {
    acquire,
    reset,
    get: (uid: string, month: string): SummaryEntry | undefined => slots.get(keyOf(uid, month))?.entry,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    version: () => version,
    /** Tests. */
    liveMonths: () => [...slots.keys()],
  };
}

export type SummaryMonthStore = ReturnType<typeof createSummaryMonthStore>;

/** The app's store: one Firestore doc listener per month. */
export const summaryMonthStore = createSummaryMonthStore((uid, month, onData, onError) => {
  const db = getFirestoreDb();
  if (!db) {
    onData(null);
    return () => {};
  }
  const path = `users/${uid}/financialSummaries/dashboard_${month}`;
  return onSnapshot(
    doc(db, "users", uid, "financialSummaries", `dashboard_${month}`),
    (snap) => {
      logDirectRead(path, 1, snap.metadata.fromCache ? "cache" : "server", { feature: "spendingDrilldown", queryShape: "month summary" });
      onData(snap.exists() ? (snap.data() as DashboardPeriodSummary) : null);
    },
    snapshotErrorHandler("snapshot.monthSummary", onError, "Couldn't load spending.")
  );
});
