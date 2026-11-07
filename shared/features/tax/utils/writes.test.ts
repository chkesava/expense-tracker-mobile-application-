import { describe, expect, it } from "vitest";

import type { TaxEntry } from "../types";
import { buildTaxEntry, buildTaxSnapshot } from "./builders";
import {
  inTaxYear,
  sortByCreated,
  taxDocumentFromDoc,
  taxEntryFromDoc,
  taxProfileFromDoc,
  taxReviewFromDoc,
  taxSnapshotFromDoc,
} from "./docs";
import { RENT_RECEIVED } from "./testRecords";
import {
  taxDocumentDeleteOps,
  taxEntryWriteOps,
  taxReviewDeleteOps,
  taxSnapshotWriteOps,
} from "./writes";

const S = { serverTimestamp: () => "ts", deleteField: () => "del" };

function entry(draft = RENT_RECEIVED, previous?: TaxEntry, nowMs = 1): TaxEntry {
  const r = buildTaxEntry({ id: "e1", draft, previous, nowMs });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}

describe("taxEntryWriteOps", () => {
  it("creates with both timestamps, the id only in the path", () => {
    const [op] = taxEntryWriteOps("u1", entry(), null, S);
    expect(op).toMatchObject({ op: "set", ref: { path: "users/u1/taxEntries/e1" } });
    if (op.op === "delete") throw new Error("unexpected");
    expect(op.data).toMatchObject({ fy: "2025-26", kind: "income", createdAt: "ts", updatedAt: "ts" });
    expect(op.data).not.toHaveProperty("id");
  });

  it("corrects with an update that never rewrites createdAt and removes dropped fields", () => {
    const first = entry({ ...RENT_RECEIVED, note: "draft" });
    const second = entry({ ...RENT_RECEIVED, fields: { ...RENT_RECEIVED.fields, amount: 1 } }, first, 2);
    const [op] = taxEntryWriteOps("u1", second, first, S);
    expect(op.op).toBe("update");
    if (op.op === "delete") throw new Error("unexpected");
    const data = op.data as Record<string, unknown>;
    expect(data).not.toHaveProperty("createdAt");
    expect(data.updatedAt).toBe("ts");
    expect(data.note).toBe("del");
    expect(data.revision).toBe(2);
    expect(data.createdAtMs).toBe(first.createdAtMs);
  });

  it("refuses to write one document over another", () => {
    const first = entry();
    expect(() => taxEntryWriteOps("u1", { ...first, id: "e2" }, first, S)).toThrow(/id changed/);
  });
});

describe("other ops", () => {
  it("snapshots are created only", () => {
    const snapshot = buildTaxSnapshot({
      fy: "2025-26",
      law: "ITA1961",
      reason: "marked_reviewed",
      ruleVersion: "FY2025-26.v1",
      inputHash: "h",
      outputs: {},
      unresolvedCount: 2,
      createdAtMs: 1_790_000_000_000.9,
    });
    if (!snapshot.ok) throw new Error(JSON.stringify(snapshot.issues));
    expect(snapshot.value.id).toBe("2025-26__1790000000000");
    expect(taxSnapshotWriteOps("u1", snapshot.value, S)).toEqual([
      expect.objectContaining({ op: "set", ref: { path: "users/u1/taxSnapshots/2025-26__1790000000000" } }),
    ]);
  });

  it("refuses an invalid snapshot", () => {
    const bad = buildTaxSnapshot({
      fy: "2025-26",
      law: "ITA1961",
      reason: "export",
      ruleVersion: "",
      inputHash: "h",
      outputs: { "bad key": 1 },
      unresolvedCount: -1,
      createdAtMs: 1,
    });
    expect(bad.ok).toBe(false);
  });

  it("review and document deletes are plain deletes", () => {
    expect(taxReviewDeleteOps("u1", "2025-26__income__i1")).toEqual([
      { op: "delete", ref: { path: "users/u1/taxReviews/2025-26__income__i1" } },
    ]);
    expect(taxDocumentDeleteOps("u1", "d1")).toEqual([{ op: "delete", ref: { path: "users/u1/taxDocuments/d1" } }]);
  });
});

describe("doc mappers", () => {
  const ts = { seconds: 1, nanoseconds: 0 };

  it("reads an entry back and drops the Firestore timestamps", () => {
    const e = entry();
    const { id: _id, ...data } = e;
    const back = taxEntryFromDoc("e1", { ...data, createdAt: ts, updatedAt: ts });
    expect(back).toEqual(e);
  });

  it("drops documents of another year or of an unknown shape", () => {
    const { id: _id, ...data } = entry();
    expect(taxEntryFromDoc("e1", data, "2024-25")).toBeNull();
    expect(taxEntryFromDoc("e1", { ...data, kind: "refund" })).toBeNull();
    expect(taxEntryFromDoc("e1", { ...data, fields: null })).toBeNull();
    expect(taxEntryFromDoc("a/b", data)).toBeNull();
    expect(taxReviewFromDoc("r", { fy: "2025-26", sourceKind: "nope", decision: "confirm" })).toBeNull();
    expect(taxProfileFromDoc("2024-25", { fy: "2025-26" })).toBeNull();
    expect(taxDocumentFromDoc("d1", { fy: "2025-26", category: "form16" })).toBeNull();
    expect(taxSnapshotFromDoc("s", { fy: "2025-26" })).toBeNull();
  });

  it("keeps a profile keyed by its year", () => {
    expect(taxProfileFromDoc("2025-26", { fy: "2025-26", residentialStatus: "resident" })).toMatchObject({
      id: "2025-26",
    });
  });

  it("sorts oldest first and filters copy rows to one year", () => {
    const items = [
      { id: "b", createdAtMs: 2 },
      { id: "a", createdAtMs: 2 },
      { id: "c", createdAtMs: 1 },
    ];
    expect(sortByCreated(items).map((i) => i.id)).toEqual(["c", "a", "b"]);
    expect(inTaxYear("2025-26")({ data: { fy: "2025-26" } })).toBe(true);
    expect(inTaxYear("2025-26")({ data: { fy: "2024-25" } })).toBe(false);
  });
});
