import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { GROUP_FUND_MONTH_LIMIT } from "@/lib/readModel/groupFundSources";
import { GROUP_FUND_HISTORY_PAGE_SIZE } from "@/shared/utils/groupFundDocs";

/**
 * SPENDLY-688 (AC13) — the Group Funds read budget, checked in the source so a
 * later change can't quietly add per-member or per-pool queries:
 *
 * - the Money hub list: one `groupFunds` listener, no event reads;
 * - a fund's screen: the 25 newest events live, older pages on demand;
 * - the month view: one bounded query for the whole month;
 * - the duplicate check: one bounded query per member and month, on demand.
 *
 * Every read is attributed (`logQuerySnapshot` / `logDirectRead`, feature
 * "groupFunds") so the read meter shows what each screen costs.
 */
const ROOT = join(__dirname, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const count = (text: string, needle: string) => text.split(needle).length - 1;

describe("Group Funds read budget (AC13)", () => {
  it("the Money hub list reads funds only, never events", () => {
    const list = read("components/groupFunds/GroupFundsList.tsx");
    expect(list).toContain("useGroupFunds()");
    for (const eventReader of ["useGroupFundHistory", "useGroupFundMonth", "groupFundEvents", "getDocs", "onSnapshot"]) {
      expect(list).not.toContain(eventReader);
    }
    const funds = read("hooks/useGroupFunds.ts");
    expect(count(funds, "onSnapshot(")).toBe(1);
    expect(funds).not.toContain("groupFundEvents");
  });

  it("history is a bounded window of 25 plus cursor pages", () => {
    expect(GROUP_FUND_HISTORY_PAGE_SIZE).toBe(25);
    const history = read("hooks/useGroupFundHistory.ts");
    expect(count(history, "onSnapshot(")).toBe(1);
    expect(count(history, "limit(GROUP_FUND_HISTORY_PAGE_SIZE)")).toBe(2);
    expect(history).toContain("startAfter(cursor)");
  });

  it("the month view is one bounded query for every member at once", () => {
    expect(GROUP_FUND_MONTH_LIMIT).toBeLessThanOrEqual(500);
    const month = read("hooks/useGroupFundMonth.ts");
    expect(count(month, "onSnapshot(")).toBe(1);
    expect(month).toContain('where("fundId", "==", fundId)');
    expect(month).toContain('where("period", "==", period)');
    expect(month).toContain("limit(GROUP_FUND_MONTH_LIMIT)");
    expect(month).not.toMatch(/memberId/);
    // The section renders members from that one result, never a read per row.
    const section = read("components/groupFunds/GroupFundMonthSection.tsx");
    expect(count(section, "useGroupFundMonth(")).toBe(1);
    expect(section).not.toMatch(/getDocs|onSnapshot|checkMemberMonth/);
  });

  it("store reads are bounded and attributed", () => {
    const store = read("services/groupFunds/groupFundStore.ts");
    expect(count(store, "getDocs(")).toBe(count(store, "logDirectRead("));
    for (const q of store.matchAll(/query\(([\s\S]*?)\)\s*\)/g)) expect(q[1]).toMatch(/limit\(/);
  });
});
