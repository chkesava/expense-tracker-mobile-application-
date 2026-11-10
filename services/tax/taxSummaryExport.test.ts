import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SPENDLY-710 (R4.3a): an export's snapshot is written only after Firestore
 * confirms every input the on-device copy served, through commitMutations.
 */

vi.mock("@/services/export/fileDelivery", () => ({ deliverCsv: vi.fn(), deliverPdf: vi.fn() }));
vi.mock("@/lib/readModelLocal/appCopy", () => ({ getAppLocalCopy: () => null }));

type Q = { path: string; filters: unknown[] };
const reads: Q[] = [];
let fromCache = false;
vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, ...s: string[]) => ({ path: s.join("/"), filters: [] }),
  doc: (_db: unknown, ...s: string[]) => ({ path: s.join("/"), id: s[s.length - 1] }),
  query: (ref: Q, ...filters: unknown[]) => ({ ...ref, filters }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  getDocs: vi.fn(async (q: Q) => {
    reads.push(q);
    return { docs: [], metadata: { fromCache } };
  }),
  getDoc: vi.fn(async (ref: { path: string; id: string }) => {
    reads.push({ path: ref.path, filters: [] });
    return { id: ref.id, exists: () => false, data: () => undefined, metadata: { fromCache } };
  }),
  getDocFromCache: vi.fn(async () => {
    throw new Error("not cached");
  }),
  serverTimestamp: () => ({ __serverTimestamp: true }),
  deleteField: () => ({ __delete: true }),
}));
vi.mock("@/lib/firebase", () => ({ getFirestoreDb: () => ({ __db: true }) }));

const shadowCalls: { collection: string; windowed: boolean }[] = [];
let shadowClean = true;
vi.mock("@/lib/readModelLocal/readSource", async (orig) => ({
  ...(await orig<typeof import("@/lib/readModelLocal/readSource")>()),
  createCollectionSource: ({ collection }: { collection: string }) => ({
    shadow: async (_docs: unknown[], opts: { windowed?: boolean }) => {
      shadowCalls.push({ collection, windowed: Boolean(opts.windowed) });
      return { missing: shadowClean ? 0 : 1, extra: 0, differing: 0, compared: 0 };
    },
  }),
}));

const commitMutations = vi.fn(async (..._args: unknown[]) => "acked" as const);
vi.mock("@/lib/commitMutations", () => ({
  commitMutations: (...args: unknown[]) => (commitMutations as (...a: unknown[]) => unknown)(...args),
}));

const { snapshotExport, TAX_ESTIMATE_COLLECTIONS } = await import("./taxSummaryExport");
const { compareRegimes } = await import("@/shared/features/tax/utils/compareRegimes");
import type { TaxEstimateInput } from "@/shared/features/tax/utils/taxInput";

const input: TaxEstimateInput = {
  fy: "2025-26",
  residentialStatus: "resident",
  ageBand: "below_60",
  salary: { gross: 1_275_000, exemptAllowances: 0, hraExemption: 0, professionalTax: 0 },
  rent: 0,
  homeLoanInterest: 0,
  otherSources: { savingsInterest: 0, depositInterest: 0, dividends: 0, other: 0 },
  capitalGains: { stcg111a: 0, stcgSlab: 0, ltcg112: 0, ltcg112a: 0 },
  deductions: {},
  savingsInterestClaim: 0,
  taxesPaid: { tds: 0, advanceTax: 0, selfAssessment: 0, other: 0 },
  traces: {},
  gaps: { unsupported: [], missing: [], pending: [] },
  notes: [],
};
const allFirestore = Object.fromEntries(TAX_ESTIMATE_COLLECTIONS.map((c) => [c, "firestore" as const]));
const allCopy = Object.fromEntries(TAX_ESTIMATE_COLLECTIONS.map((c) => [c, "supabase" as const]));
type Op = { op: string; ref: { path: string }; data: Record<string, unknown> };

beforeEach(() => {
  reads.length = 0;
  shadowCalls.length = 0;
  commitMutations.mockClear();
  fromCache = false;
  shadowClean = true;
});

describe("snapshotExport", () => {
  it("reads nothing extra when every input came from Firestore, and writes the snapshot", async () => {
    const r = await snapshotExport("u1", { fy: "2025-26", input, comparison: compareRegimes(input), modes: allFirestore, generatedAtMs: 1_794_000_000_000 });
    expect(r.kind).toBe("saved");
    expect(reads).toEqual([]);
    const op = (commitMutations.mock.calls[0][1] as Op[])[0];
    expect(op.ref.path).toBe("users/u1/taxSnapshots/2025-26__1794000000000");
    expect(op.data).toMatchObject({ reason: "export", law: "ITA1961", ruleVersion: "ITA1961-FY2025-26-r1", outputs: { "new.liability": 0, "old.liability": 187_200 } });
  });

  it("checks each copy-served input on the server, bounded to the year where it can be", async () => {
    await snapshotExport("u1", { fy: "2025-26", input, comparison: compareRegimes(input), modes: allCopy, generatedAtMs: 1 });
    const filtersOf = (path: string) => reads.find((q) => q.path === path)?.filters;
    expect(filtersOf("users/u1/taxEntries")).toEqual([{ field: "fy", op: "==", value: "2025-26" }]);
    expect(filtersOf("users/u1/incomes")).toEqual([
      { field: "date", op: ">=", value: "2025-04-01" },
      { field: "date", op: "<=", value: "2026-03-31" },
    ]);
    expect(reads.some((q) => q.path === "users/u1/taxProfiles/2025-26")).toBe(true);
    expect(shadowCalls.find((c) => c.collection === "incomes")?.windowed).toBe(true);
    expect(shadowCalls.find((c) => c.collection === "holdings")?.windowed).toBe(false);
    expect(commitMutations).toHaveBeenCalledTimes(1);
  });

  it("writes nothing when the server can't confirm (cache data or a difference)", async () => {
    fromCache = true;
    expect((await snapshotExport("u1", { fy: "2025-26", input, comparison: compareRegimes(input), modes: allCopy, generatedAtMs: 1 })).kind).toBe("unconfirmed");
    fromCache = false;
    shadowClean = false;
    expect((await snapshotExport("u1", { fy: "2025-26", input, comparison: compareRegimes(input), modes: allCopy, generatedAtMs: 2 })).kind).toBe("unconfirmed");
    expect(commitMutations).not.toHaveBeenCalled();
  });

  it("writes nothing for a year without rules", async () => {
    const other = { ...input, fy: "2026-27" };
    expect((await snapshotExport("u1", { fy: "2026-27", input: other, comparison: compareRegimes(other), modes: allFirestore, generatedAtMs: 1 })).kind).toBe("no_rules");
    expect(commitMutations).not.toHaveBeenCalled();
  });
});
