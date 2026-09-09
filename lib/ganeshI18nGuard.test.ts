import path from "path";

import { describe, expect, it } from "vitest";

import { scanAll, scanFile, sourceFiles } from "./ganeshI18nScan";

/**
 * The hardcoded-string ratchet for Ganesh Seva.
 *
 * Ganesh copy is moving into `shared/i18n/ganesh` one screen area per pass.
 * That takes a while, and the danger in a long migration is not the files
 * already done — it is the screen someone adds in the middle with its strings
 * inline, so the backlog grows as fast as it shrinks and the work never lands.
 *
 * So the baseline below is a floor that may only come down:
 *
 * - a file with **more** findings than its baseline fails — new hardcoded copy;
 * - a file with **fewer** fails too, asking you to lower the number, which is
 *   what stops the list rotting into a permanent exemption list;
 * - a file absent from the baseline must have none at all.
 *
 * When a pass finishes a file, delete its entry. The last pass empties the map
 * and this becomes a plain "no hardcoded copy anywhere" assertion.
 *
 * False positives are expected and cheap: annotate the line with
 * `// i18n-exempt: <why>` — right for testIDs, log labels, Firestore path
 * segments and `commitWrite` labels, none of which anyone reads.
 */

const ROOT = path.resolve(__dirname, "..");

const SCANNED_DIRS = ["app/(ganesh)", "app/(ganesh-auth)", "components/ganesh"];

/** Findings still to migrate, per file. MAY ONLY SHRINK. */
const BASELINE: Record<string, number> = {
  "app/(ganesh)/(tabs)/committee.tsx": 11,
  "app/(ganesh)/(tabs)/funds.tsx": 6,
  "app/(ganesh)/(tabs)/index.tsx": 11,
  "app/(ganesh)/(tabs)/pandal.tsx": 27,
  "app/(ganesh)/(tabs)/people.tsx": 7,
  "app/(ganesh)/(tabs)/seva.tsx": 15,
  "app/(ganesh)/add-asset.tsx": 21,
  "app/(ganesh)/add-collection.tsx": 25,
  "app/(ganesh)/add-contribution.tsx": 42,
  "app/(ganesh)/add-expense.tsx": 44,
  "app/(ganesh)/add-household.tsx": 9,
  "app/(ganesh)/add-member-payment.tsx": 9,
  "app/(ganesh)/add-opening-fund.tsx": 14,
  "app/(ganesh)/add-permanent-fund.tsx": 8,
  "app/(ganesh)/add-reimbursement.tsx": 10,
  "app/(ganesh)/add-seva.tsx": 12,
  "app/(ganesh)/add-sponsor.tsx": 34,
  "app/(ganesh)/admin/audit.tsx": 10,
  "app/(ganesh)/admin/categories.tsx": 7,
  "app/(ganesh)/admin/festivals.tsx": 5,
  "app/(ganesh)/admin/index.tsx": 56,
  "app/(ganesh)/admin/reports.tsx": 47,
  "app/(ganesh)/admin/roles/[id].tsx": 9,
  "app/(ganesh)/admin/roles/index.tsx": 6,
  "app/(ganesh)/admin/roles/new.tsx": 9,
  "app/(ganesh)/admin/settings.tsx": 6,
  "app/(ganesh)/admin/setup.tsx": 5,
  "app/(ganesh)/asset/[id].tsx": 43,
  "app/(ganesh)/assets.tsx": 12,
  "app/(ganesh)/close-festival.tsx": 14,
  "app/(ganesh)/contribution/[id].tsx": 24,
  "app/(ganesh)/create-festival.tsx": 10,
  "app/(ganesh)/expense/[id].tsx": 9,
  "app/(ganesh)/export-report.tsx": 13,
  "app/(ganesh)/household/[id].tsx": 20,
  "app/(ganesh)/join-requests.tsx": 5,
  "app/(ganesh)/member/[id].tsx": 22,
  "app/(ganesh)/members.tsx": 10,
  "app/(ganesh)/pandal-custody.tsx": 7,
  "app/(ganesh)/permanent-fund.tsx": 34,
  "app/(ganesh)/reimbursements.tsx": 25,
  "app/(ganesh)/report.tsx": 34,
  "app/(ganesh)/session/[id].tsx": 26,
  "app/(ganesh)/sessions.tsx": 9,
  "app/(ganesh)/setup.tsx": 21,
  "app/(ganesh)/seva/[id].tsx": 15,
  "app/(ganesh)/sponsor/[id].tsx": 61,
  "app/(ganesh)/sponsors.tsx": 21,
  "app/(ganesh-auth)/login.tsx": 12,
  "components/ganesh/AdminQueryState.tsx": 1,
  "components/ganesh/FestivalWindowFields.tsx": 2,
  "components/ganesh/FormDetails.tsx": 1,
  "components/ganesh/GaneshImageUploader.tsx": 2,
  "components/ganesh/GaneshQuickActions.tsx": 9,
  "components/ganesh/GaneshSessionBar.tsx": 2,
  "components/ganesh/GodFundHero.tsx": 1,
  "components/ganesh/PermanentFundCard.tsx": 6,
  "components/ganesh/PermissionChecklist.tsx": 3,
  "components/ganesh/admin/AdminHero.tsx": 1,
  "components/ganesh/admin/AdminSummary.tsx": 5,
  "components/ganesh/funds/CollectionsList.tsx": 22,
  "components/ganesh/funds/ContributionsList.tsx": 24,
  "components/ganesh/funds/ExpensesList.tsx": 20,
  "components/ganesh/funds/FestivalFinancialDashboard.tsx": 11,
  "components/ganesh/funds/FestivalReportStrip.tsx": 1,
  "components/ganesh/funds/FundShortcuts.tsx": 3,
  "components/ganesh/funds/PandalNidhiHero.tsx": 1,
  "components/ganesh/home/PandalOverview.tsx": 4,
  "components/ganesh/home/TodaySevaPanel.tsx": 3,
  "components/ganesh/pandal/PandalTabHero.tsx": 1,
  "components/ganesh/people/CommitteeOverview.tsx": 2,
  "components/ganesh/people/PeopleHero.tsx": 1,
  "components/ganesh/seva/SevaHero.tsx": 1,
  "components/ganesh/ui/ListStateView.tsx": 1,
};

describe("Ganesh hardcoded-string ratchet", () => {
  const actual = scanAll(ROOT, SCANNED_DIRS);

  it("has no hardcoded user-facing copy outside the baseline", () => {
    const unexpected = [...actual.entries()]
      .filter(([file, count]) => count > (BASELINE[file] ?? 0))
      .flatMap(([file, count]) => [
        `${file}: found ${count}, baseline ${BASELINE[file] ?? 0}`,
        // A few examples inline, so the failure names the actual strings rather
        // than only a count.
        ...scanFile(ROOT, file)
          .slice(0, 3)
          .map((f) => `    ${f.file}:${f.line}  ${f.text}`),
      ]);
    expect(
      unexpected,
      "New hardcoded copy. Move it into shared/i18n/ganesh and use t(), or mark the line // i18n-exempt: <why>."
    ).toEqual([]);
  });

  it("has no stale baseline entries", () => {
    // A file that got cleaned up but kept its entry would let a regression back
    // in unnoticed, so shrinking is mandatory rather than optional.
    const stale = Object.entries(BASELINE)
      .filter(([file, count]) => (actual.get(file) ?? 0) < count)
      .map(
        ([file, count]) =>
          file + ": baseline " + count + ", now " + (actual.get(file) ?? 0) + " — lower it"
      );
    expect(stale).toEqual([]);
  });

  it("only lists files that exist", () => {
    const known = new Set(SCANNED_DIRS.flatMap((dir) => sourceFiles(ROOT, dir)));
    const missing = Object.keys(BASELINE).filter((file) => !known.has(file));
    expect(missing, "baseline names files that no longer exist").toEqual([]);
  });

  it("counts down as the migration proceeds", () => {
    // One number to watch. Lower it as passes land; the goal is 0.
    const total = [...actual.values()].reduce((sum, n) => sum + n, 0);
    expect(total).toBeLessThanOrEqual(1040);
  });

  it("treats the already-migrated navigation as done", () => {
    // The nav pass is complete, so these two must stay clean — they are the
    // proof the pipeline works end to end.
    for (const file of [
      "app/(ganesh)/(tabs)/_layout.tsx",
      "components/ganesh/GaneshTabBar.tsx",
    ]) {
      expect(scanFile(ROOT, file), file).toEqual([]);
    }
  });
});
