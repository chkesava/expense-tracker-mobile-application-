import { describe, expect, it } from "vitest";

import {
  desktopAnalyticsSplit,
  desktopDashboardGap,
  monthOverMonthChange,
  planDesktopDashboard,
  totalChange,
  totalChangeTone,
} from "./dashboardDesktop";
import type { NetWorthPoint } from "./netWorthHistory";

const point = (date: string, assets: number, liabilities: number): NetWorthPoint => ({
  date,
  assets,
  liabilities,
  netWorth: assets - liabilities,
});

describe("planDesktopDashboard", () => {
  it("lifts the named cards out and keeps the rest in the user's order", () => {
    const plan = planDesktopDashboard([
      "cashFlow",
      "focus",
      "subscriptions",
      "financialGoals",
      "budgetAlerts",
      "gamification",
    ]);
    expect(plan.cashFlow).toBe(true);
    expect(plan.budget).toBe(true);
    expect(plan.rest).toEqual([
      "budgetCategories",
      "focus",
      "subscriptions",
      "financialGoals",
      "gamification",
    ]);
  });

  it("leaves out a slot the user turned off", () => {
    const plan = planDesktopDashboard(["cashFlow", "focus"]);
    expect(plan.budget).toBe(false);
    expect(plan.rest).toEqual(["focus"]);
  });

  it("never drops a card it doesn't place", () => {
    const ids = ["cashFlow", "subscriptions", "budgetAlerts", "a", "b", "c"];
    const plan = planDesktopDashboard(ids);
    const placed = ["cashFlow", "budgetAlerts"].length;
    // + 1: Budget's Category Budgets move to the grid as their own card.
    expect(plan.rest.length + placed).toBe(ids.length + 1);
    for (const id of ["a", "b", "c", "subscriptions"]) expect(plan.rest).toContain(id);
  });

  it("also lifts the four cards the desktop composition pins into its own fixed row", () => {
    // SPENDLY dashboard redesign fix: these are always appended to
    // `moreCardIds` in dashboard.tsx, but `rows[4]` already renders them
    // directly — without this, the "more" grid rendered each a second time.
    const plan = planDesktopDashboard([
      "cashFlow",
      "categoryInsights",
      "investmentsSummary",
      "vaultsSummary",
      "shortcuts",
    ]);
    expect(plan.rest).toEqual([]);
  });

  it("lifts accounts into its own fixed row too", () => {
    // SPENDLY dashboard redesign fix: accounts' own 5-tile wrap grid is far
    // taller than a typical "more" card, so leaving it in the round-robin
    // masonry made whichever column it landed in much taller than the
    // other two, leaving a large blank gap beside it.
    const plan = planDesktopDashboard(["cashFlow", "accounts", "focus"]);
    expect(plan.rest).toEqual(["focus"]);
  });
});

describe("desktopDashboardGap", () => {
  it("is tighter on a laptop than on a large monitor", () => {
    expect(desktopDashboardGap(1280)).toBe(16);
    expect(desktopDashboardGap(1599)).toBe(16);
    expect(desktopDashboardGap(1600)).toBe(20);
    expect(desktopDashboardGap(1920)).toBe(20);
  });
});

describe("desktopAnalyticsSplit", () => {
  it("halves the analytics row from 1440", () => {
    expect(desktopAnalyticsSplit(1440)).toEqual({ weights: [1, 1], cashFlowWide: true });
    expect(desktopAnalyticsSplit(1920)).toEqual({ weights: [1, 1], cashFlowWide: true });
  });

  it("favours Spending Overview on a 1280 laptop and stacks the cash flow", () => {
    expect(desktopAnalyticsSplit(1280)).toEqual({ weights: [56, 44], cashFlowWide: false });
    expect(desktopAnalyticsSplit(1439)).toEqual({ weights: [56, 44], cashFlowWide: false });
  });
});

describe("totalChange", () => {
  it("measures each total between the trend's two snapshots", () => {
    const from = point("2026-10-08", 200_000, 100_000);
    const to = point("2026-11-08", 210_000, 95_000);
    expect(totalChange(from, to, "assets")).toEqual({ change: 10_000, changePct: 5 });
    expect(totalChange(from, to, "liabilities")).toEqual({ change: -5_000, changePct: -5 });
  });

  it("has no change without two distinct days", () => {
    const today = point("2026-11-08", 1, 1);
    expect(totalChange(null, today, "assets")).toEqual({ change: null, changePct: null });
    expect(totalChange(today, today, "assets")).toEqual({ change: null, changePct: null });
  });

  it("has no percentage from a zero baseline", () => {
    const from = point("2026-10-08", 1000, 0);
    const to = point("2026-11-08", 1000, 2500);
    expect(totalChange(from, to, "liabilities")).toEqual({ change: 2500, changePct: null });
  });

  it("rounds to paise", () => {
    const from = point("2026-10-08", 0.1, 0);
    const to = point("2026-11-08", 0.3, 0);
    expect(totalChange(from, to, "assets").change).toBe(0.2);
  });
});

describe("totalChangeTone", () => {
  it("treats rising assets and falling liabilities as good", () => {
    expect(totalChangeTone("assets", 10)).toBe("good");
    expect(totalChangeTone("assets", -10)).toBe("bad");
    expect(totalChangeTone("liabilities", -10)).toBe("good");
    expect(totalChangeTone("liabilities", 10)).toBe("bad");
  });

  it("is flat without a change", () => {
    expect(totalChangeTone("assets", null)).toBe("flat");
    expect(totalChangeTone("liabilities", 0)).toBe("flat");
  });
});

describe("monthOverMonthChange", () => {
  it("diffs the active and previous month's own totals", () => {
    expect(monthOverMonthChange(5500, 5000)).toEqual({ change: 500, changePct: 10 });
    expect(monthOverMonthChange(4000, 5000)).toEqual({ change: -1000, changePct: -20 });
  });

  it("has no percentage from a zero previous total", () => {
    expect(monthOverMonthChange(500, 0)).toEqual({ change: 500, changePct: null });
  });

  it("rounds to paise", () => {
    expect(monthOverMonthChange(0.3, 0.1).change).toBe(0.2);
  });
});
