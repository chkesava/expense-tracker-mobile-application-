/**
 * SPENDLY-791 (epic SPENDLY-735 rule: the app only delivers) — every Space's
 * totals, stored at `users/{uid}/financialSummaries/spaces`.
 *
 * The app used to add a Space up from `useExpenses()`, which holds only the
 * months already loaded (SPENDLY-748), so an expense from an unloaded month
 * (e.g. August) was missing and the Space showed ₹0. Here the totals come from
 * every expense carrying the Space's `spaceId`, read from Firestore, whatever
 * month it falls in.
 *
 * - The numbers are the app's own rule, unchanged: `summarizeSpace` and
 *   `buildSpaceCategoryBreakdown` (via `buildStoredSpaceTotals`).
 * - Derived whole, never incremented, written only when it differs.
 * - A Space never owns money: this is a read-out of existing expenses.
 *
 * Runs: the Worker's daily 03:00 UTC tick (every Space owner), and queue mode
 * after an app save (supabase-readmodel migration 20261119000000), for the
 * queued users only, from Firestore. Pure; Firestore comes in as ports.
 */

import type { Expense } from "../../shared/types/expense";
import {
  SPACES_SUMMARY_DOC_ID,
  SPACES_SUMMARY_VERSION,
  type Space,
  type SpacesSummaryDoc,
} from "../../shared/types/space";
import { isDuressUid } from "../../shared/utils/duress";
import { buildStoredSpaceTotals } from "../../shared/utils/spaceMath";
import {
  applyJobWrites,
  bump,
  newJobSummary,
  recordApply,
  type DailyJobSummary,
  type JobDb,
  type JobPush,
  type JobWrite,
} from "./dailyJobCore";
import type { ReadBudget } from "./pushRunCore";

export type SpaceUserData = {
  spaces: Space[];
  /** Every expense whose `spaceId` is one of `spaces` (any month, deleted included). */
  expenses: Expense[];
  /** `financialSummaries/spaces` as stored, or null. */
  stored: (Partial<SpacesSummaryDoc> & { createdAt?: unknown }) | null;
};

export type SpaceDailyPorts = {
  /** Every user with a Space. */
  listOwners(): Promise<string[]>;
  /** The user's Spaces and their expenses, from Firestore. */
  load(uid: string): Promise<SpaceUserData>;
  db: JobDb;
  stamp: () => unknown;
};

export const spacesSummaryPath = (uid: string) => `users/${uid}/financialSummaries/${SPACES_SUMMARY_DOC_ID}`;

/** Key order doesn't matter: Firestore maps don't keep it. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** The summary write for this user, or none when the stored one already agrees. */
export function planSpaceWrites(uid: string, data: SpaceUserData): { writes: JobWrite[]; spaces: number } {
  const spaces = buildStoredSpaceTotals(data.spaces, data.expenses);
  const count = Object.keys(spaces).length;
  const stored = data.stored;
  if (!stored && count === 0) return { writes: [], spaces: 0 };
  if (stored && stored.summaryVersion === SPACES_SUMMARY_VERSION && stable(stored.spaces ?? {}) === stable(spaces)) {
    return { writes: [], spaces: count };
  }
  // A whole replace, so a deleted Space's entry goes with it; keep createdAt.
  const doc: Record<string, unknown> = { spaces, summaryVersion: SPACES_SUMMARY_VERSION, calculatedAt: STAMP };
  if (stored?.createdAt !== undefined) doc.createdAt = stored.createdAt;
  return {
    writes: [{ kind: "set", path: spacesSummaryPath(uid), data: doc, merge: false, stampCreatedAt: !stored }],
    spaces: count,
  };
}

/** Placeholder for a server timestamp in a planned write (replaced before applying). */
export const STAMP = "__SERVER_TIMESTAMP__";

export async function runSpaceDaily(opts: {
  ports: SpaceDailyPorts;
  dryRun: boolean;
  budget: ReadBudget;
  push: JobPush | null;
  log: (line: string) => void;
  /** Queue mode: only these users. */
  onlyUids?: string[];
  /** Accumulate into this summary (queue mode runs several rounds). */
  summary?: DailyJobSummary;
}): Promise<DailyJobSummary> {
  const { ports, budget } = opts;
  const summary = opts.summary ?? newJobSummary("space-daily", opts.dryRun);
  const owners = opts.onlyUids ?? (await ports.listOwners());
  for (const uid of owners) {
    if (budget.exhausted()) break;
    summary.usersSeen += 1;
    if (isDuressUid(uid)) {
      summary.duressSkipped += 1;
      continue;
    }
    const plan = planSpaceWrites(uid, await ports.load(uid));
    if (!plan.writes.length) {
      bump(summary, "unchanged");
      continue;
    }
    const writes = plan.writes.map((w) =>
      w.kind === "set"
        ? { ...w, data: Object.fromEntries(Object.entries(w.data).map(([k, v]) => [k, v === STAMP ? ports.stamp() : v])) }
        : w
    );
    const result = await applyJobWrites({ db: ports.db, uid, writes, dryRun: opts.dryRun, stamp: ports.stamp, push: opts.push, log: opts.log });
    recordApply(summary, result, "space user");
    if (result.status === "written" || result.status === "dry-run") {
      bump(summary, "summariesWritten");
      bump(summary, "spacesSummarised", plan.spaces);
    }
    if (result.status === "conflict") bump(summary, "conflicts");
  }
  return summary;
}

/** The server-only run queue (SPENDLY-737), job 'space-daily'. Never logged. */
export type SpaceRunQueue = {
  pending(): Promise<Array<{ uid: string; requestedAt: string }>>;
  /** Clears the user's request unless a newer save re-queued it meanwhile. */
  done(uid: string, requestedAt: string): Promise<void>;
};

export const SPACE_QUEUE_MAX_ROUNDS = 3;

/**
 * Queue mode: the users the read model queued after an app save to a Space or
 * to an expense of a Space owner. Straight from Firestore (the copy can lag
 * the save that queued them). A save during the run re-queues its user with a
 * newer `requestedAt`, so the next round or dispatch takes it.
 */
export async function runSpaceQueue(opts: {
  queue: SpaceRunQueue;
  ports: SpaceDailyPorts;
  dryRun: boolean;
  budget: ReadBudget;
  push: JobPush | null;
  log: (line: string) => void;
  maxRounds?: number;
}): Promise<DailyJobSummary> {
  const summary = newJobSummary("space-daily", opts.dryRun);
  const rounds = opts.dryRun ? 1 : opts.maxRounds ?? SPACE_QUEUE_MAX_ROUNDS;
  for (let round = 0; round < rounds; round += 1) {
    if (opts.budget.exhausted()) break;
    const pending = await opts.queue.pending();
    if (!pending.length) break;
    bump(summary, "queueRounds");
    const live = pending.filter((p) => p.uid && !isDuressUid(p.uid));
    bump(summary, "queueUsers", live.length);
    await runSpaceDaily({ ...opts, onlyUids: live.map((p) => p.uid), summary });
    if (opts.dryRun) break;
    // Out of budget mid-round: keep every request; the next run serves them (idempotent).
    if (opts.budget.exhausted()) break;
    for (const p of pending) await opts.queue.done(p.uid, p.requestedAt);
  }
  return summary;
}
