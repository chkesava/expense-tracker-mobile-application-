import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildGoldenSql } from "./lib/readmodelGolden";

describe("read-model golden SQL (SPENDLY-510)", () => {
  it("the committed golden.sql is exactly what the TypeScript reference generates", () => {
    const committed = readFileSync(path.resolve(__dirname, "../supabase-readmodel/tests/golden.sql"), "utf8").replace(/\r\n/g, "\n");
    // Regenerate with `npx tsx scripts/readmodel-golden.ts` after changing the
    // fixture, the mapper or a reference function; CI then re-proves the views.
    expect(committed).toBe(buildGoldenSql());
  });

  it("covers every case the ticket names", () => {
    const sql = buildGoldenSql();
    // Soft delete excluded (e3 999), restore included (e4 300), cross-month edit (e5 in October).
    expect(sql).toContain("('2026-10', 'Health & Medical', 300.00)");
    expect(sql).toContain("('2026-10', 'Food & Groceries::Other Food', 250.00)");
    expect(sql).not.toMatch(/999\.00/);
    // Cashback, transfers both ways, voided payment excluded from the bank flow.
    expect(sql).toContain("('card', 1, 100.00, 0.00, 100.00, 0.00)");
    expect(sql).toContain("('wallet', 1250.00)");
    expect(sql).toContain("('bank', 43650.00)");
  });
});
