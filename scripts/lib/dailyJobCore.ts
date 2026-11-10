/**
 * SPENDLY-725 — the shared core of the daily server jobs that replace the
 * legacy site's crons (SPENDLY-682): SIP execution (726) and credit card bills
 * (727). Pure; Firestore and the read model come in as ports, so every rule is
 * provable in Vitest. Admin SDK wiring lives in each job's CLI script.
 *
 * A job decides, per user, a list of `JobWrite`s from the app's own pure
 * planners, and hands them to `applyJobWrites`, which enforces the server-writer
 * rules in one place:
 *
 * - Only `users/{uid}/…` paths of that user; duress trees are never written.
 * - Every write stamps `updatedAt`, and `createdAt` on create (R1.2).
 * - One atomic batch per call. `create` refuses if the document exists, and an
 *   `update` can carry the `lastUpdateTime` it read (compare-and-set, as the
 *   app's bill pass, SPENDLY-497). Either refusal is a `conflict`, not an error:
 *   someone (the app, or an earlier run) already did it, so a rerun is safe.
 * - After a commit, the written paths go to the read-model push (SPENDLY-680).
 * - Dry run: logs what it would write and writes nothing.
 *
 * Erased accounts: `createServerPush` never copies them, and an erased
 * account's Firestore tree is gone, so the jobs find nothing to write for it.
 */

import { isDuressUid } from "../../shared/utils/duress";
import { readBudget, type ReadBudget } from "./pushRunCore";

export type JobData = Record<string, unknown>;

export type JobWrite =
  /** New document; refused (conflict) if it already exists. Stamps createdAt + updatedAt. */
  | { kind: "create"; path: string; data: JobData }
  /** Set (optionally merged). Stamps updatedAt; createdAt only when `stampCreatedAt`. */
  | { kind: "set"; path: string; data: JobData; merge?: boolean; stampCreatedAt?: boolean }
  /** Update an existing document; with `lastUpdateTime`, refused (conflict) if it changed since read. */
  | { kind: "update"; path: string; data: JobData; lastUpdateTime?: unknown }
  /** SPENDLY-740: remove a derived document (e.g. a stale EPF interest year). The push tombstones it. */
  | { kind: "delete"; path: string };

/** The slice of an Admin SDK write batch the core uses. */
export type JobBatch = {
  create(ref: { path: string }, data: JobData): unknown;
  set(ref: { path: string }, data: JobData, options?: { merge?: boolean }): unknown;
  update(ref: { path: string }, data: JobData, precondition?: { lastUpdateTime: unknown }): unknown;
  /** Optional so older fakes compile; the Admin SDK batch has it. */
  delete?(ref: { path: string }): unknown;
  commit(): Promise<unknown>;
};

export type JobDb = {
  doc(path: string): { path: string };
  batch(): JobBatch;
};

export type JobPush = { note(uid: string, paths: Iterable<string>): void };

export type ApplyResult =
  | { status: "written"; paths: string[] }
  | { status: "dry-run"; paths: string[] }
  | { status: "conflict"; paths: string[]; reason: string }
  | { status: "failed"; paths: string[]; reason: string }
  | { status: "skipped"; paths: string[]; reason: "duress" | "empty" };

/** Firestore's batch limit is 500; the core leaves headroom. Callers chunk. */
export const JOB_BATCH_LIMIT = 450;

// gRPC codes the Admin SDK reports for a refused precondition.
const ALREADY_EXISTS = 6;
const NOT_FOUND = 5;
const FAILED_PRECONDITION = 9;

function errorCode(error: unknown): number | undefined {
  const code = (error as { code?: unknown })?.code;
  if (typeof code === "number") return code;
  // Some SDK paths report the name instead of the number.
  if (code === "already-exists" || code === "ALREADY_EXISTS") return ALREADY_EXISTS;
  if (code === "failed-precondition" || code === "FAILED_PRECONDITION") return FAILED_PRECONDITION;
  if (code === "not-found" || code === "NOT_FOUND") return NOT_FOUND;
  return undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The document paths of `uid`'s own tree, e.g. `users/u1/sipPlans/p1`. */
export function isOwnDocPath(uid: string, path: string): boolean {
  const parts = path.split("/");
  return parts.length >= 4 && parts.length % 2 === 0 && parts[0] === "users" && parts[1] === uid && parts.every(Boolean);
}

export async function applyJobWrites(opts: {
  db: JobDb;
  uid: string;
  writes: JobWrite[];
  dryRun: boolean;
  /** `FieldValue.serverTimestamp()` in production. */
  stamp: () => unknown;
  push: JobPush | null;
  log: (line: string) => void;
}): Promise<ApplyResult> {
  const { uid, writes } = opts;
  const paths = writes.map((w) => w.path);
  if (isDuressUid(uid)) return { status: "skipped", paths: [], reason: "duress" };
  if (!writes.length) return { status: "skipped", paths: [], reason: "empty" };
  const foreign = paths.find((p) => !isOwnDocPath(uid, p));
  if (foreign) throw new Error(`refusing to write outside users/${uid}: ${foreign}`);
  if (writes.length > JOB_BATCH_LIMIT) throw new Error(`${writes.length} writes exceed the batch limit (${JOB_BATCH_LIMIT}); chunk them`);

  if (opts.dryRun) {
    for (const w of writes) {
      opts.log(`[DRY RUN] would ${w.kind} ${w.path}${w.kind === "delete" ? "" : ` (${Object.keys(w.data).sort().join(", ")})`}`);
    }
    return { status: "dry-run", paths };
  }

  const batch = opts.db.batch();
  for (const w of writes) {
    const ref = opts.db.doc(w.path);
    if (w.kind === "create") {
      batch.create(ref, { ...w.data, createdAt: opts.stamp(), updatedAt: opts.stamp() });
    } else if (w.kind === "set") {
      const data = { ...w.data, updatedAt: opts.stamp(), ...(w.stampCreatedAt ? { createdAt: opts.stamp() } : {}) };
      if (w.merge) batch.set(ref, data, { merge: true });
      else batch.set(ref, data);
    } else if (w.kind === "delete") {
      if (!batch.delete) throw new Error("this batch cannot delete");
      batch.delete(ref);
    } else {
      const data = { ...w.data, updatedAt: opts.stamp() };
      if (w.lastUpdateTime !== undefined) batch.update(ref, data, { lastUpdateTime: w.lastUpdateTime });
      else batch.update(ref, data);
    }
  }

  try {
    await batch.commit();
  } catch (error) {
    const code = errorCode(error);
    if (code === ALREADY_EXISTS || code === FAILED_PRECONDITION || code === NOT_FOUND) {
      return { status: "conflict", paths, reason: errorMessage(error) };
    }
    return { status: "failed", paths, reason: errorMessage(error) };
  }
  opts.push?.note(uid, paths);
  return { status: "written", paths };
}

/** Per-run read cap for a daily job (runs once a day, so the run cap is the day cap). */
export function jobReadBudget(perRun: number): ReadBudget {
  return readBudget({ perRun, perDay: perRun, usedToday: 0 });
}

export type DailyJobSummary = {
  job: string;
  dryRun: boolean;
  usersSeen: number;
  duressSkipped: number;
  /** Job-specific counters, e.g. executed / skipped / failed SIPs, bills created. */
  counts: Record<string, number>;
  writes: { written: number; dryRun: number; conflicts: number; failed: number };
  failures: string[];
  reads: number;
  stoppedForBudget: boolean;
  readModelPushed: number;
  readModelPushFailed: number;
  readModelPushSkipped: string | null;
};

export function newJobSummary(job: string, dryRun: boolean): DailyJobSummary {
  return {
    job,
    dryRun,
    usersSeen: 0,
    duressSkipped: 0,
    counts: {},
    writes: { written: 0, dryRun: 0, conflicts: 0, failed: 0 },
    failures: [],
    reads: 0,
    stoppedForBudget: false,
    readModelPushed: 0,
    readModelPushFailed: 0,
    readModelPushSkipped: null,
  };
}

export function bump(summary: DailyJobSummary, counter: string, by = 1): void {
  summary.counts[counter] = (summary.counts[counter] ?? 0) + by;
}

/** Folds one `applyJobWrites` result into the summary. Failures keep their reason, never a uid. */
export function recordApply(summary: DailyJobSummary, result: ApplyResult, label: string): void {
  if (result.status === "written") summary.writes.written += result.paths.length;
  else if (result.status === "dry-run") summary.writes.dryRun += result.paths.length;
  else if (result.status === "conflict") summary.writes.conflicts += 1;
  else if (result.status === "failed") {
    summary.writes.failed += 1;
    summary.failures.push(`${label}: ${result.reason}`);
  } else if (result.reason === "duress") summary.duressSkipped += 1;
}

/** Final figures: reads spent, budget stop and the read-model push result. */
export function finishJobSummary(
  summary: DailyJobSummary,
  budget: ReadBudget,
  push: { pushed: number; failed: number; skipped: string | null } | null
): DailyJobSummary {
  summary.reads = budget.spent();
  summary.stoppedForBudget = budget.exhausted();
  if (push) {
    summary.readModelPushed = push.pushed;
    summary.readModelPushFailed = push.failed;
    summary.readModelPushSkipped = push.skipped;
  }
  return summary;
}

/** GitHub Actions annotations for a summary; the CLI prints these and exits 1 on failures. */
export function summaryAnnotations(summary: DailyJobSummary): string[] {
  const lines: string[] = [];
  if (summary.stoppedForBudget) lines.push(`::warning::${summary.job} stopped early: read budget spent. The next run carries on.`);
  if (summary.readModelPushFailed > 0) lines.push(`::warning::${summary.job}: ${summary.readModelPushFailed} docs not pushed to the read model; the nightly sync copies them.`);
  if (summary.writes.failed > 0) lines.push(`::error::${summary.job}: ${summary.writes.failed} write batch(es) failed.`);
  const badZones = summary.counts.invalidTimeZone ?? 0;
  if (badZones > 0) lines.push(`::warning::${summary.job}: skipped ${badZones} item(s) on accounts with an invalid timezone; see failures.`);
  return lines;
}
