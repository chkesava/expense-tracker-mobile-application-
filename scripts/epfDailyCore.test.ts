import { describe, expect, it, vi } from "vitest";

import type { EpfContribution, EpfEstablishment, EpfInterestEntry } from "../shared/features/epf/types";
import { buildInterestEntry, creditableYears, interestEntryId, interestSchedule } from "../shared/features/epf/utils/interest";
import { epfSummaryFields } from "../shared/features/epf/utils/summarySync";
import { maskUids } from "./epf-daily";
import { jobReadBudget, type JobDb } from "./lib/dailyJobCore";
import { findEpfWorkOnReadModel, planEpfWrites, runEpfDaily, STAMP, type EpfUserData } from "./lib/epfDailyCore";

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
