import type { Firestore } from "@/lib/firestore";

import type { connectReadModel } from "@/lib/readModelClient";
import type { GoalEvent } from "@/shared/types/goal";
import { READ_MODEL_SLO_MS } from "@/shared/utils/readModelFreshness";
import type { ReadModelMode } from "@/shared/utils/readModelMode";
import { overlayLocalRows } from "@/shared/utils/readModelOverlay";

import { compareAuditIds } from "./analyticsReadPath";
import { GOAL_EVENTS_CAP, GOAL_EVENTS_PAGE, type GoalEventsCursor, type GoalEventsPage } from "./goalSources";
import { readModelPath, resolveReadModelBackend, type ReadModelReadConditions, type ReadModelReadUser } from "./screenReadPath";

/**
 * SPENDLY-611 — Save Goals history and analytics through the read path, under
 * the `goals` switch (`system_settings/global.readModel.goals`):
 *
 * | mode       | analytics / export range                         | older history pages        |
 * |------------|--------------------------------------------------|----------------------------|
 * | `firestore`| the bounded Firestore range read (no connection) | Firestore cursor pages     |
 * | `shadow`   | Firestore serves; read model compared by id      | Firestore cursor pages     |
 * | `supabase` | read model + overlay of newer Firestore events   | read model pages           |
 *
 * A failure or timeout in `supabase` falls back to Firestore for the session
 * (logged once). Totals are computed by shared/utils/goalAnalytics over the
 * rows returned (R3.6). The goal's saved amount is never read from here (R4).
 */
type Base = {
  db: Firestore;
  user: ReadModelReadUser;
  conditions: ReadModelReadConditions;
  connect?: typeof connectReadModel;
};

/** 2100-01-01: an open upper bound that still serialises to a plain ISO date for Postgres. */
const HISTORY_END_MS = 4_102_444_800_000;

export type GoalEventsRead = {
  events: GoalEvent[];
  servedBy: "firestore" | "supabase";
  mode: ReadModelMode;
  truncated: boolean;
  /** Events this device holds that the read model hasn't synced yet. */
  pendingIds: Set<string>;
};

/** Ids on one side only, ignoring events younger than the sync SLO (expected lag, not a difference). */
export function compareGoalEventIds(firestore: GoalEvent[], readModel: GoalEvent[], nowMs: number): string[] {
  return compareAuditIds(
    firestore.map((e) => ({ id: e.id, createdAt: e.createdAtMs })),
    readModel,
    nowMs
  );
}

export async function readGoalEventsInRange(
  input: Base & {
    fromMs: number;
    toMs: number;
    /** The bounded Firestore source: the default, the fallback and the shadow baseline. */
    firestore: () => Promise<{ events: GoalEvent[]; truncated: boolean }>;
    /** Firestore events created at or after `sinceMs` (bounded), overlaid on read-model rows. */
    recent: (sinceMs: number) => Promise<GoalEvent[]>;
    now?: () => number;
  }
): Promise<GoalEventsRead> {
  const { mode, backend } = await resolveReadModelBackend("goals", input);
  if (mode === "firestore" || !backend) {
    const fs = await input.firestore();
    return { ...fs, servedBy: "firestore", mode: "firestore", pendingIds: new Set() };
  }
  const now = input.now ?? Date.now;

  const { value, servedBy } = await readModelPath().read<{ events: GoalEvent[]; truncated: boolean }>("goals", mode, {
    firestore: input.firestore,
    supabase: async () => {
      const events: GoalEvent[] = [];
      let cursor: GoalEventsCursor = null;
      for (;;) {
        const page: GoalEventsPage = await backend.goalEventsPage({ fromMs: input.fromMs, toMs: input.toMs, cursor, pageSize: GOAL_EVENTS_PAGE });
        events.push(...page.items);
        if (page.exhausted || !page.next) return { events, truncated: false };
        if (events.length >= GOAL_EVENTS_CAP) return { events: events.slice(0, GOAL_EVENTS_CAP), truncated: true };
        cursor = page.next;
      }
    },
    compare: (fs, sb) => (fs.truncated || sb.truncated ? [] : compareGoalEventIds(fs.events, sb.events, now())),
  });

  if (servedBy !== "supabase") return { ...value, servedBy, mode, pendingIds: new Set() };

  // Overlay: events newer than the read model's last sync (minus the SLO, so
  // nothing in flight is missed) come from Firestore. Ids match once synced,
  // so nothing is counted twice.
  let synced: number | null = null;
  try {
    synced = await backend.lastSyncedAt(["goalEvents"]);
  } catch {
    synced = null;
  }
  const since = Math.max(input.fromMs, (synced ?? input.fromMs) - READ_MODEL_SLO_MS);
  const local = (await input.recent(since)).filter((e) => e.createdAtMs >= input.fromMs && e.createdAtMs < input.toMs);
  const merged = overlayLocalRows(value.events, local);
  return { events: merged.rows, truncated: value.truncated, servedBy, mode, pendingIds: merged.pendingIds };
}

/**
 * `supabase` only: one older page of a goal's history below `cursor` (newest
 * first). Null when the hook should use its Firestore cursor pages (any other
 * mode, or a failure; after one, the screen stays on Firestore this session).
 */
export async function readGoalHistoryPage(
  input: Base & { goalId: string; cursor: GoalEventsCursor; pageSize: number }
): Promise<GoalEventsPage | null> {
  const { mode, backend } = await resolveReadModelBackend("goals", input);
  if (mode !== "supabase" || !backend) return null;
  const { value } = await readModelPath().read<GoalEventsPage | null>("goals", "supabase", {
    firestore: async () => null,
    supabase: () =>
      backend.goalEventsPage({ fromMs: 0, toMs: HISTORY_END_MS, goalId: input.goalId, cursor: input.cursor, pageSize: input.pageSize }),
  });
  return value;
}
