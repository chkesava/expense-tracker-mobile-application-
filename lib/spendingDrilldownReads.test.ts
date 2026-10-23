import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * PR #239 review — how the drill-downs read. Structural, because the tests run
 * in node with no React renderer.
 */
const root = path.resolve(__dirname, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

const DRILLDOWN_SCREENS = [
  "app/(app)/spending/index.tsx",
  "app/(app)/spending/[category]/index.tsx",
  "app/(app)/spending/[category]/[sub].tsx",
  "app/(app)/budgets/index.tsx",
  "app/(app)/budgets/[category].tsx",
  "app/(app)/top-categories.tsx",
  "app/(app)/trends.tsx",
];

describe("drill-down reads (PR #239 review)", () => {
  it("summaries come from the per-month store, never useDashboardCashFlow (whose cashFlow=supabase mode keeps only two months)", () => {
    const hook = read("hooks/useSpendingDrilldown.ts");
    expect(hook).not.toMatch(/import[^;]*useDashboardCashFlow/);
    expect(hook).toMatch(/summaryMonthStore\.acquire/);
    for (const screen of DRILLDOWN_SCREENS) expect(read(screen)).not.toMatch(/useDashboardCashFlow\(/);
  });

  it("every drill-down list of Journal rows shows the read-model freshness badge (R3.4)", () => {
    for (const file of ["components/spending/SpendingTransactionList.tsx", "app/(app)/transactions/index.tsx", "app/(app)/recurring/[id].tsx"]) {
      const source = read(file);
      expect(source).toMatch(/useJournalFreshness\(\)/);
      expect(source).toMatch(/<ReadModelFreshnessBadge freshness=\{freshness\} \/>/);
    }
  });

  it("merchant corrections are read once per subcategory screen and shared by both tabs", () => {
    const source = read("app/(app)/spending/[category]/[sub].tsx");
    expect(source.match(/useMerchantOverrides\(/g)).toHaveLength(2); // the definition and one call
    expect(source).toMatch(/const merchantOverrides = useMerchantOverrides\(/);
  });
});
