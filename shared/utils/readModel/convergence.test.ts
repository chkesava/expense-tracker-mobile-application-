import { describe, expect, it } from "vitest";

import { convergence, summarizeConvergence, type ModelRow } from "./convergence";
import { mapDocument, SPEC_BY_COLLECTION } from "./mapping";

/** SPENDLY-520 — the drills' convergence checker. */
const spec = SPEC_BY_COLLECTION.get("expenses")!;
const doc = (id: string, amount: number) => ({ id, data: { amount, date: "2026-03-05", category: "Food" }, updateTime: 1 });
const row = (uid: string, d: ReturnType<typeof doc>, over: Partial<ModelRow> = {}): ModelRow =>
  ({ ...mapDocument(spec, uid, d), source_deleted: false, ...over }) as ModelRow;
const source = (entries: [string, ReturnType<typeof doc>[]][]) => new Map(entries.map(([uid, docs]) => [uid, new Map([["expenses", docs]])]));

describe("read-model convergence (SPENDLY-520)", () => {
  it("converges when every live row matches its source document", () => {
    const a = doc("a", 10);
    const report = convergence({ specs: [spec], source: source([["u1", [a]]]), model: new Map([["expenses", [row("u1", a), row("u1", doc("gone", 5), { source_deleted: true })]]]) });
    expect(report).toEqual({ converged: true, checkedRows: 1, issues: [] });
    expect(summarizeConvergence(report)).toBe("converged: 1 rows match, 0 issues");
  });

  it("finds missing, extra and differing rows, naming columns but never values", () => {
    const a = doc("a", 10);
    const b = doc("b", 20);
    const report = convergence({
      specs: [spec],
      source: source([["u1", [a, b]]]),
      model: new Map([["expenses", [row("u1", a, { amount: 11 }), row("u1", doc("ghost", 1))]]]),
    });
    expect(report.issues).toEqual([
      { kind: "differs", table: "expenses", docId: "a", columns: ["amount"] },
      { kind: "missing", table: "expenses", docId: "b" },
      { kind: "extra", table: "expenses", docId: "ghost" },
    ]);
    expect(summarizeConvergence(report)).toBe("NOT converged: 1 differs expenses, 1 missing expenses, 1 extra expenses");
  });

  it("flags any duress row and any row left for a purged user, even tombstoned", () => {
    const a = doc("a", 10);
    const report = convergence({
      specs: [spec],
      source: source([["u1", [a]], ["u1_duress", [a]]]),
      model: new Map([["expenses", [row("u1_duress", a), row("u1", a, { source_deleted: true })]]]),
      purgedUids: new Set(["u1"]),
    });
    expect(report.issues.map((i) => i.kind).sort()).toEqual(["duress", "purged"]);
  });

  it("does not confuse the same doc id under two users", () => {
    const a = doc("a", 10);
    const report = convergence({ specs: [spec], source: source([["u1", [a]], ["u2", [a]]]), model: new Map([["expenses", [row("u1", a)]]]) });
    expect(report.issues).toEqual([{ kind: "missing", table: "expenses", docId: "a" }]);
  });
});
