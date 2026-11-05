import { describe, expect, it } from "vitest";

import { effectiveCollectionMode, READ_MODEL_COLLECTIONS, type CollectionModeInput } from "./collectionMode";
import { mapDocument, SPEC_BY_COLLECTION } from "./mapping";
import { isClean, shadowCompare } from "./shadowCompare";

const base = (over: Partial<CollectionModeInput> = {}): CollectionModeInput => ({
  setting: { creditCardBills: "supabase" },
  collection: "creditCardBills",
  envConfigured: true,
  localTestMode: false,
  duress: false,
  signedIn: true,
  localCopyOn: true,
  copyState: "ready",
  fellBack: false,
  ...over,
});

describe("per-collection read switch (SPENDLY-673)", () => {
  it("serves from the copy only when everything allows it", () => {
    expect(effectiveCollectionMode(base())).toEqual({ mode: "supabase", configured: "supabase" });
    expect(effectiveCollectionMode(base({ setting: { creditCardBills: "shadow" } })).mode).toBe("shadow");
  });

  it("is firestore by default, for unknown values, and for collections that aren't switchable", () => {
    for (const setting of [undefined, null, {}, { creditCardBills: "SUPABASE" }, { creditCardBills: true }, "x"]) {
      expect(effectiveCollectionMode(base({ setting })).mode).toBe("firestore");
    }
    // The users/{uid} copy holds allowlisted fields only: never a source.
    expect(READ_MODEL_COLLECTIONS).not.toContain("userSettings");
    expect(effectiveCollectionMode(base({ collection: "userSettings", setting: { userSettings: "supabase" } })).mode).toBe("firestore");
    expect(effectiveCollectionMode(base({ collection: "notSynced", setting: { notSynced: "supabase" } })).mode).toBe("firestore");
  });

  it.each([
    ["duress", { duress: true }],
    ["local test mode", { localTestMode: true }],
    ["signed out", { signedIn: false }],
    ["read model not configured", { envConfigured: false }],
    ["readModel.localCopy is off", { localCopyOn: false }],
    ["fell back this session", { fellBack: true }],
  ] as const)("is firestore when %s, whatever is configured", (reason, over) => {
    for (const mode of ["shadow", "supabase"]) {
      expect(effectiveCollectionMode(base({ setting: { creditCardBills: mode }, ...over }))).toEqual({ mode: "firestore", configured: mode, reason });
    }
  });

  it("supabase waits for a ready copy (a screen never goes blank while it fills); shadow doesn't need it", () => {
    for (const copyState of ["off", "hydrating", "error"] as const) {
      expect(effectiveCollectionMode(base({ copyState })).mode).toBe("firestore");
      expect(effectiveCollectionMode(base({ copyState, setting: { creditCardBills: "shadow" } })).mode).toBe("shadow");
    }
  });
});

describe("shadow comparison (SPENDLY-673)", () => {
  const spec = SPEC_BY_COLLECTION.get("creditCardBills")!;
  const bill = (id: string, statementAmount: number, amountPaid = 0) => ({
    id,
    data: { accountId: "card", statementDate: "2026-10-05", dueDate: "2026-10-25", statementAmount, amountPaid, status: "PENDING" },
  });
  const row = (d: ReturnType<typeof bill>) => mapDocument(spec, "u1", { id: d.id, data: d.data, updateTime: 1 });

  it("is clean when the copy holds exactly what Firestore served", () => {
    const docs = [bill("b1", 1000), bill("b2", 500, 500)];
    const result = shadowCompare(spec, "u1", docs, docs.map(row));
    expect(result).toEqual({ firestore: 2, copy: 2, missing: 0, extra: 0, differing: 0, columns: {} });
    expect(isClean(result)).toBe(true);
  });

  it("counts missing, extra and differing rows, naming columns only (never values or ids)", () => {
    const docs = [bill("b1", 1000), bill("b2", 500, 500), bill("b3", 10)];
    const stale = { ...row(bill("b2", 500, 0)) };
    const result = shadowCompare(spec, "u1", docs, [row(docs[0]), stale, row(bill("gone", 1))]);
    expect(result).toEqual({ firestore: 3, copy: 3, missing: 1, extra: 1, differing: 1, columns: { amount_paid: 1 } });
    expect(JSON.stringify(result)).not.toMatch(/b2|gone|500/);
  });
});
