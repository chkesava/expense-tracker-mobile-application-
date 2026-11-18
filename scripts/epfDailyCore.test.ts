import { describe, expect, it, vi } from "vitest";

import type { EpfContribution, EpfEstablishment, EpfInterestEntry } from "../shared/features/epf/types";
import { buildInterestEntry, creditableYears, interestEntryId, interestSchedule } from "../shared/features/epf/utils/interest";
import { epfSummaryFields } from "../shared/features/epf/utils/summarySync";
import { maskUids } from "./epf-daily";
import { jobReadBudget, type JobDb } from "./lib/dailyJobCore";
import { findEpfWorkOnReadModel, planEpfWrites, runEpfDaily, runEpfQueue, STAMP, type EpfRunQueue, type EpfUserData } from "./lib/epfDailyCore";

// 9 Nov 2026: the current EPF financial year is 2026-27.
const NOW = new Date("2026-11-09T03:00:00.000Z");

function contribution(month: string, amount: number): EpfContribution {
  return {
    id: `est-a_${month}`,
    establishmentId: "est-a",
    month,
    wage: 25000,
    employeeShare: amount / 2,
    employerShare: amount / 2,
    epsShare: 0,
    employerEpfShare: amount / 2,
    totalContribution: amount,
    epfCredit: amount,
    status: "credited",
    source: "simulated",
    epsEligible: true,
  } as EpfContribution;
}

const establishment = { id: "est-a", name: "Acme", employmentStatus: "current" } as unknown as EpfEstablishment;
// Two full financial years with declared rates.
const CONTRIBUTIONS = ["2024-04", "2024-05", "2024-06", "2025-04", "2025-05"].map((m) => contribution(m, 3600));

function data(over: Partial<EpfUserData> = {}): EpfUserData {
  return { establishments: [establishment], contributions: CONTRIBUTIONS, transfers: [], reconciliations: [], interestEntries: [], storedSummary: null, ...over };
}

/** The interest entries the app would have stored for these rows. */
function storedEntries(d: EpfUserData): EpfInterestEntry[] {
  const years = creditableYears(
    interestSchedule({ contributions: d.contributions, transfers: d.transfers, adjustments: d.reconciliations, establishmentId: "est-a", throughFinancialYear: "2026-27" })
  );
  return years.map((y) => ({ id: interestEntryId("est-a", y.financialYear), ...buildInterestEntry("est-a", y) }) as EpfInterestEntry);
}

describe("epf-daily (SPENDLY-740): FY interest and the EPF summary, on the server", () => {
  it("a ledger with no stored interest: writes each creditable year and the summary", () => {
    const plan = planEpfWrites("u1", data(), NOW);
    const expected = storedEntries(data());
    expect(expected.length).toBeGreaterThan(0);
    expect(plan.interestYears).toBe(expected.length);
    for (const e of expected) {
      const w = plan.writes.find((x) => x.path === `users/u1/epfInterestEntries/${e.id}`);
      expect(w).toMatchObject({ kind: "set", merge: true, stampCreatedAt: true });
      expect(w && w.kind === "set" ? w.data : {}).toMatchObject({ interest: e.interest, closingBalance: e.closingBalance, computedAt: STAMP });
    }
    // The summary counts the interest being written now, not the stale stored list.
    const summary = plan.writes.find((x) => x.path === "users/u1/financialSummaries/epf");
    const fields = epfSummaryFields({ establishments: [establishment], contributions: CONTRIBUTIONS, transfers: [], interestEntries: expected, adjustments: [] });
    expect(summary && summary.kind === "set" ? summary.data : {}).toMatchObject({ ...fields, calculatedAt: STAMP });
  });

  it("everything already stored and in sync: nothing to write (no churn)", () => {
    const entries = storedEntries(data());
    const summary = epfSummaryFields({ establishments: [establishment], contributions: CONTRIBUTIONS, transfers: [], interestEntries: entries, adjustments: [] });
    const plan = planEpfWrites("u1", data({ interestEntries: entries, storedSummary: summary }), NOW);
    expect(plan.writes).toEqual([]);
  });

  it("a year that is no longer creditable (months reversed) is deleted", () => {
    const entries = storedEntries(data());
    const lastYearOnly = CONTRIBUTIONS.filter((c) => c.month.startsWith("2025"));
    const plan = planEpfWrites("u1", data({ contributions: lastYearOnly, interestEntries: entries }), NOW);
    expect(plan.staleYears).toBeGreaterThan(0);
    expect(plan.writes.some((w) => w.kind === "delete" && w.path.endsWith("est-a_2024-25"))).toBe(true);
  });

  it("runs per user through applyJobWrites with real server timestamps; dry run writes nothing", async () => {
    const sets: Array<{ path: string; data: Record<string, unknown> }> = [];
    const db: JobDb = {
      doc: (path) => ({ path }),
      batch: () => ({
        create: () => undefined,
        set: (ref, d) => sets.push({ path: ref.path, data: d }),
        update: () => undefined,
        delete: () => undefined,
        commit: async () => undefined,
      }),
    };
    const ports = { listOwners: vi.fn(async () => ["u1", "u2_duress"]), load: vi.fn(async () => data()), db, stamp: () => "<ts>" };
    const s = await runEpfDaily({ ports, now: NOW, dryRun: false, budget: jobReadBudget(1000), push: null, log: () => undefined });
    expect(s.counts.summariesWritten).toBe(1);
    expect(s.duressSkipped).toBe(1);
    expect(sets.every((x) => !Object.values(x.data).includes(STAMP))).toBe(true);
    expect(sets.find((x) => x.path.endsWith("financialSummaries/epf"))?.data.calculatedAt).toBe("<ts>");

    sets.length = 0;
    await runEpfDaily({ ports, now: NOW, dryRun: true, budget: jobReadBudget(1000), push: null, log: () => undefined });
    expect(sets).toEqual([]);
  });

  it("the read model names only users with work; with it, no owner scan", async () => {
    const entries = storedEntries(data());
    const summary = epfSummaryFields({ establishments: [establishment], contributions: CONTRIBUTIONS, transfers: [], interestEntries: entries, adjustments: [] });
    const found = await findEpfWorkOnReadModel(
      { users: async () => [{ uid: "u1", data: data() }, { uid: "u2", data: data({ interestEntries: entries, storedSummary: summary }) }] },
      NOW
    );
    expect([...found.uids]).toEqual(["u1"]);
    const ports = { listOwners: vi.fn(async () => ["u1"]), load: vi.fn(async () => data({ interestEntries: entries, storedSummary: summary })), db: {} as JobDb, stamp: () => "<ts>" };
    const s = await runEpfDaily({ ports, now: NOW, dryRun: true, budget: jobReadBudget(1000), push: null, log: () => undefined, readModel: found });
    expect(ports.listOwners).not.toHaveBeenCalled();
    expect(s.counts.readModelDisagreed).toBe(1);
  });

  it("the catch-up's log lines never show a uid (public Actions logs)", () => {
    const line = JSON.stringify({ event: "epf-cron.failure", uid: "G9NxBehpGFSascp95Pbwr6Fk9nn2", path: "users/G9NxBehpGFSascp95Pbwr6Fk9nn2/epfContributions/x" });
    const masked = maskUids(line);
    expect(masked).not.toContain("G9NxBehpGFSascp95Pbwr6Fk9nn2");
    expect(masked).toMatch(/"uid":"#[0-9a-f]{8}"/);
  });
});

describe("SPENDLY-790: queue mode recomputes only the users an EPF save queued", () => {
  function recordingDb() {
    const sets: Array<{ path: string; data: Record<string, unknown> }> = [];
    const db: JobDb = {
      doc: (path) => ({ path }),
      batch: () => ({
        create: () => undefined,
        set: (ref, d) => sets.push({ path: ref.path, data: d }),
        update: () => undefined,
        delete: () => undefined,
        commit: async () => undefined,
      }),
    };
    return { db, sets };
  }
  function queueOf(rounds: Array<Array<{ uid: string; requestedAt: string }>>) {
    let i = 0;
    const done = vi.fn(async () => undefined);
    const pending = vi.fn(async () => rounds[i++] ?? []);
    const queue: EpfRunQueue = { pending, done };
    return { queue, done, pending };
  }
  // The stored summary as it was before the October backfill: one month short.
  const before = () => {
    const entries = storedEntries(data());
    const stale = epfSummaryFields({ establishments: [establishment], contributions: CONTRIBUTIONS.slice(0, -1), transfers: [], interestEntries: entries, adjustments: [] });
    return data({ interestEntries: entries, storedSummary: stale });
  };

  it("a queued user's stale summary is rewritten from Firestore; no owner scan; the request is cleared", async () => {
    const { db, sets } = recordingDb();
    const ports = { listOwners: vi.fn(async () => ["u1", "u2"]), load: vi.fn(async () => before()), db, stamp: () => "<ts>" };
    const { queue, done } = queueOf([[{ uid: "u1", requestedAt: "2026-11-18T12:50:00.1+00:00" }]]);
    const s = await runEpfQueue({ queue, ports, now: NOW, dryRun: false, budget: jobReadBudget(1000), push: null, log: () => undefined });

    expect(ports.listOwners).not.toHaveBeenCalled();
    expect(ports.load).toHaveBeenCalledTimes(1);
    expect(ports.load).toHaveBeenCalledWith("u1");
    const written = sets.find((x) => x.path === "users/u1/financialSummaries/epf")?.data;
    const expected = epfSummaryFields({ establishments: [establishment], contributions: CONTRIBUTIONS, transfers: [], interestEntries: storedEntries(data()), adjustments: [] });
    expect(written).toMatchObject({ currentBalance: expected.currentBalance, calculatedAt: "<ts>" });
    expect(s.counts.summariesWritten).toBe(1);
    expect(s.counts.queueUsers).toBe(1);
    expect(done).toHaveBeenCalledWith("u1", "2026-11-18T12:50:00.1+00:00");
  });

  it("an empty queue reads nothing and writes nothing", async () => {
    const { db, sets } = recordingDb();
    const ports = { listOwners: vi.fn(async () => ["u1"]), load: vi.fn(async () => before()), db, stamp: () => "<ts>" };
    const { queue, done } = queueOf([]);
    const s = await runEpfQueue({ queue, ports, now: NOW, dryRun: false, budget: jobReadBudget(1000), push: null, log: () => undefined });
    expect(ports.load).not.toHaveBeenCalled();
    expect(ports.listOwners).not.toHaveBeenCalled();
    expect(sets).toEqual([]);
    expect(done).not.toHaveBeenCalled();
    expect(s.counts.queueRounds ?? 0).toBe(0);
  });

  it("an already-in-sync user is cleared without a write (no churn)", async () => {
    const { db, sets } = recordingDb();
    const entries = storedEntries(data());
    const summary = epfSummaryFields({ establishments: [establishment], contributions: CONTRIBUTIONS, transfers: [], interestEntries: entries, adjustments: [] });
    const ports = { listOwners: vi.fn(async () => []), load: vi.fn(async () => data({ interestEntries: entries, storedSummary: summary })), db, stamp: () => "<ts>" };
    const { queue, done } = queueOf([[{ uid: "u1", requestedAt: "t1" }]]);
    await runEpfQueue({ queue, ports, now: NOW, dryRun: false, budget: jobReadBudget(1000), push: null, log: () => undefined });
    expect(sets).toEqual([]);
    expect(done).toHaveBeenCalledWith("u1", "t1");
  });

  it("a save during the run is served by the next round", async () => {
    const { db } = recordingDb();
    const ports = { listOwners: vi.fn(async () => []), load: vi.fn(async () => before()), db, stamp: () => "<ts>" };
    const { queue, done } = queueOf([[{ uid: "u1", requestedAt: "t1" }], [{ uid: "u1", requestedAt: "t2" }]]);
    const s = await runEpfQueue({ queue, ports, now: NOW, dryRun: false, budget: jobReadBudget(1000), push: null, log: () => undefined });
    expect(s.counts.queueRounds).toBe(2);
    expect(done).toHaveBeenNthCalledWith(1, "u1", "t1");
    expect(done).toHaveBeenNthCalledWith(2, "u1", "t2");
  });

  it("a dry run reads one round, writes nothing and keeps the requests", async () => {
    const { db, sets } = recordingDb();
    const ports = { listOwners: vi.fn(async () => []), load: vi.fn(async () => before()), db, stamp: () => "<ts>" };
    const { queue, done, pending } = queueOf([[{ uid: "u1", requestedAt: "t1" }], [{ uid: "u1", requestedAt: "t2" }]]);
    const s = await runEpfQueue({ queue, ports, now: NOW, dryRun: true, budget: jobReadBudget(1000), push: null, log: () => undefined });
    expect(sets).toEqual([]);
    expect(pending).toHaveBeenCalledTimes(1);
    expect(done).not.toHaveBeenCalled();
    expect(s.counts.summariesWritten).toBe(1);
  });

  it("a duress uid is never loaded, and its request is cleared", async () => {
    const { db, sets } = recordingDb();
    const ports = { listOwners: vi.fn(async () => []), load: vi.fn(async () => before()), db, stamp: () => "<ts>" };
    const { queue, done } = queueOf([[{ uid: "u1_duress", requestedAt: "t1" }]]);
    const s = await runEpfQueue({ queue, ports, now: NOW, dryRun: false, budget: jobReadBudget(1000), push: null, log: () => undefined });
    expect(ports.load).not.toHaveBeenCalled();
    expect(sets).toEqual([]);
    expect(s.counts.queueUsers).toBe(0);
    expect(done).toHaveBeenCalledWith("u1_duress", "t1");
  });

  it("out of read budget: the requests stay queued for the next run", async () => {
    const { db } = recordingDb();
    const budget = jobReadBudget(1);
    const ports = {
      listOwners: vi.fn(async () => []),
      load: vi.fn(async () => {
        budget.add(5); // as the CLI's Firestore ports charge
        return before();
      }),
      db,
      stamp: () => "<ts>",
    };
    const { queue, done } = queueOf([[{ uid: "u1", requestedAt: "t1" }, { uid: "u2", requestedAt: "t1" }]]);
    await runEpfQueue({ queue, ports, now: NOW, dryRun: false, budget, push: null, log: () => undefined });
    expect(ports.load).toHaveBeenCalledTimes(1);
    expect(done).not.toHaveBeenCalled();
  });
});
