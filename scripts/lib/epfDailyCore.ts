/**
 * SPENDLY-740 (epic SPENDLY-735: the app only delivers) — the server side of
 * the EPF tab's old background passes: financial-year interest
 * (`epfInterestEntries`) and the stored EPF summary (`financialSummaries/epf`).
 * The app recomputed and wrote both on every EPF ledger change
 * (`useEpfInterestCatchUp`, `EpfBalanceTab`, `useEpfSummarySync`); now it only
 * reads. Pure; Firestore and the read model come in as ports.
 *
 * The app's own rules, unchanged (shared functions):
 * - `interestSchedule` → `creditableYears` per establishment, through the
 *   current EPF financial year (IST, KAN-72). Each year is
 *   `{establishmentId}_{financialYear}` (`interestEntryId`, `buildInterestEntry`);
 *   a stored year that is no longer creditable is deleted
 *   (`staleInterestEntryIds`).
 * - The summary is derived whole from the rows (`decideEpfSummarySync`,
 *   SPENDLY-653), never incremented, and written only when it differs.
 *
 * Only what changed is written, in one atomic batch per user through
 * `applyJobWrites`. Work is found on the read model when configured (no
 * Firestore reads for users with nothing to change), then confirmed on
 * Firestore (READ_MODEL_RULES R4.3a).
 */

import type {
  EpfContribution,
  EpfEstablishment,
  EpfInterestEntry,
  EpfReconciliation,
  EpfTransfer,
} from "../../shared/features/epf/types";
import { EPF_INTEREST_ENTRIES_COLLECTION } from "../../shared/features/epf/types";
import { epfCurrentMonth } from "../../shared/features/epf/utils/epfClock";
import {
  buildInterestEntry,
  creditableYears,
  interestEntryId,
  interestSchedule,
  staleInterestEntryIds,
} from "../../shared/features/epf/utils/interest";
import { decideEpfSummarySync } from "../../shared/features/epf/utils/summarySync";
import type { EpfSummary } from "../../shared/types/financialSummary";
import { isDuressUid } from "../../shared/utils/duress";
import { financialYearOfMonth } from "../../shared/utils/financialYear";
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

export type EpfUserData = {
  establishments: EpfEstablishment[];
  contributions: EpfContribution[];
  transfers: EpfTransfer[];
  reconciliations: EpfReconciliation[];
  interestEntries: EpfInterestEntry[];
  /** `financialSummaries/epf` as stored, or null. */
  storedSummary: Partial<EpfSummary> | null;
};

export type EpfDailyPorts = {
  /** Every user with an EPF establishment (fallback without the read model). */
  listOwners(): Promise<string[]>;
  /** The user's EPF rows from Firestore, mapped as the app's hooks map them. */
  load(uid: string): Promise<EpfUserData>;
  db: JobDb;
  stamp: () => unknown;
};

/** The read model's copy of every user's EPF rows; only says who has work. */
export type ReadModelEpfSource = {
  users(): Promise<Array<{ uid: string; data: EpfUserData }>>;
};

/** Placeholder for a server timestamp in a planned write (replaced before applying). */
export const STAMP = "__SERVER_TIMESTAMP__";

const INTEREST_FIELDS = ["rate", "basis", "openingBalance", "interest", "closingBalance", "financialYear", "establishmentId"] as const;

const interestPath = (uid: string, id: string) => `users/${uid}/${EPF_INTEREST_ENTRIES_COLLECTION}/${id}`;

/** What the app's interest catch-up and summary sync would write for this user now. */
export function planEpfWrites(uid: string, data: EpfUserData, now: Date): { writes: JobWrite[]; interestYears: number; staleYears: number; summary: boolean } {
  const throughFinancialYear = financialYearOfMonth(epfCurrentMonth(now));
  const ids = [
    ...new Set([
      ...data.establishments.map((e) => e.id),
      ...data.contributions.map((c) => c.establishmentId),
      ...data.interestEntries.map((e) => e.establishmentId),
      ...data.transfers.flatMap((t) => [t.sourceEstablishmentId, t.destinationEstablishmentId]),
    ]),
  ].filter((id): id is string => Boolean(id));

  const storedById = new Map(data.interestEntries.map((e) => [e.id, e]));
  const writes: JobWrite[] = [];
  const next = new Map(data.interestEntries.map((e) => [e.id, e]));
  let interestYears = 0;
  let staleYears = 0;

  for (const establishmentId of ids) {
    const years = creditableYears(
      interestSchedule({
        contributions: data.contributions,
        transfers: data.transfers,
        adjustments: data.reconciliations,
        establishmentId,
        throughFinancialYear,
      })
    );
    for (const year of years) {
      const id = interestEntryId(establishmentId, year.financialYear);
      const entry = buildInterestEntry(establishmentId, year);
      const stored = storedById.get(id) as Record<string, unknown> | undefined;
      const same = stored && INTEREST_FIELDS.every((f) => JSON.stringify(stored[f] ?? null) === JSON.stringify((entry as Record<string, unknown>)[f] ?? null));
      if (!same) {
        writes.push({ kind: "set", path: interestPath(uid, id), data: { ...entry, computedAt: STAMP } as Record<string, unknown>, merge: true, stampCreatedAt: !stored });
        interestYears += 1;
      }
      next.set(id, { ...(stored ?? {}), ...entry, id } as EpfInterestEntry);
    }
    for (const staleId of staleInterestEntryIds(
      data.interestEntries,
      establishmentId,
      years.map((y) => y.financialYear)
    )) {
      writes.push({ kind: "delete", path: interestPath(uid, staleId) });
      next.delete(staleId);
      staleYears += 1;
    }
  }

  // The summary from the rows as they will be after the interest writes.
  const decision = decideEpfSummarySync({
    ready: true,
    confirmed: true,
    stored: data.storedSummary,
    sources: {
      establishments: data.establishments,
      contributions: data.contributions,
      transfers: data.transfers,
      interestEntries: [...next.values()],
      adjustments: data.reconciliations,
    },
  });
  if (decision.write) {
    writes.push({ kind: "set", path: `users/${uid}/financialSummaries/epf`, data: { ...decision.fields, calculatedAt: STAMP }, merge: true });
  }
  return { writes, interestYears, staleYears, summary: decision.write };
}

/** Users whose copied EPF rows show interest or summary work. Never logs a uid. */
export async function findEpfWorkOnReadModel(
  source: ReadModelEpfSource,
  now: Date
): Promise<{ uids: Set<string>; usersSeen: number; failures: number }> {
  const out = { uids: new Set<string>(), usersSeen: 0, failures: 0 };
  for (const { uid, data } of await source.users()) {
    if (!uid || isDuressUid(uid)) continue;
    if (!data.establishments.length && !data.contributions.length && !data.interestEntries.length) continue;
    out.usersSeen += 1;
    try {
      if (planEpfWrites(uid, data, now).writes.length) out.uids.add(uid);
    } catch {
      out.failures += 1;
    }
  }
  return out;
}

export async function runEpfDaily(opts: {
  ports: EpfDailyPorts;
  now: Date;
  dryRun: boolean;
  budget: ReadBudget;
  push: JobPush | null;
  log: (line: string) => void;
  /** Users with work on the read model; null checks every owner (fallback). */
  readModel?: { uids: Set<string>; usersSeen: number; failures: number } | null;
}): Promise<DailyJobSummary> {
  const { ports, now, budget } = opts;
  const summary = newJobSummary("epf-daily", opts.dryRun);
  if (opts.readModel) {
    bump(summary, "readModelUsers", opts.readModel.usersSeen);
    bump(summary, "readModelUsersWithWork", opts.readModel.uids.size);
    if (opts.readModel.failures) bump(summary, "readModelFailures", opts.readModel.failures);
  }
  const owners = opts.readModel ? [...opts.readModel.uids] : await ports.listOwners();
  for (const uid of owners) {
    if (budget.exhausted()) break;
    summary.usersSeen += 1;
    if (isDuressUid(uid)) {
      summary.duressSkipped += 1;
      continue;
    }
    const plan = planEpfWrites(uid, await ports.load(uid), now);
    if (!plan.writes.length) {
      if (opts.readModel) bump(summary, "readModelDisagreed");
      continue;
    }
    // `computedAt` / `calculatedAt` are the server's time, like the app's serverTimestamp().
    const writes = plan.writes.map((w) =>
      w.kind === "set"
        ? { ...w, data: Object.fromEntries(Object.entries(w.data).map(([k, v]) => [k, v === STAMP ? ports.stamp() : v])) }
        : w
    );
    const result = await applyJobWrites({ db: ports.db, uid, writes, dryRun: opts.dryRun, stamp: ports.stamp, push: opts.push, log: opts.log });
    recordApply(summary, result, "epf user");
    if (result.status === "written" || result.status === "dry-run") {
      bump(summary, "interestYearsWritten", plan.interestYears);
      bump(summary, "interestYearsDeleted", plan.staleYears);
      if (plan.summary) bump(summary, "summariesWritten");
    }
    if (result.status === "conflict") bump(summary, "conflicts");
  }
  return summary;
}
