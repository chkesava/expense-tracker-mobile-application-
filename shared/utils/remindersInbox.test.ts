import { describe, expect, it } from "vitest";

import type { CalendarEvent } from "../types/calendar";
import type { CategoryBudgetAlertItem } from "./dashboardWidgets";
import {
  INBOX_SEEN_LIMIT,
  budgetInboxItems,
  dueInboxItems,
  dueLabel,
  inboxRange,
  markInboxSeen,
  parseSeenIds,
  unreadCount,
} from "./remindersInbox";

const today = "2026-10-22";

const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({
  id: `subscription:s1:${over.date ?? today}`,
  source: "subscription",
  refId: "s1",
  date: today,
  title: "Netflix",
  amount: 649,
  currency: "INR",
  direction: "out",
  state: "scheduled",
  priority: 2,
  actionable: true,
  href: "/ledger?tab=subscriptions",
  ...over,
});

describe("dueLabel", () => {
  it("reads naturally either side of today", () => {
    expect(dueLabel("2026-10-19", today)).toBe("Overdue by 3 days");
    expect(dueLabel("2026-10-21", today)).toBe("Overdue by 1 day");
    expect(dueLabel(today, today)).toBe("Due today");
    expect(dueLabel("2026-10-23", today)).toBe("Due tomorrow");
    expect(dueLabel("2026-10-25", today)).toBe("Due in 3 days");
  });
});

describe("dueInboxItems", () => {
  it("keeps open items that are overdue or due within three days, overdue first", () => {
    const items = dueInboxItems(
      [
        ev({ id: "a", date: "2026-10-24", title: "Soon" }),
        ev({ id: "b", date: "2026-10-26", title: "Too far" }),
        ev({ id: "c", date: "2026-10-10", state: "overdue", title: "Old overdue", subtitle: "HDFC card" }),
        ev({ id: "d", date: today, state: "completed", title: "Done" }),
        ev({ id: "e", date: "2026-10-20", state: "overdue", title: "Recent overdue" }),
        ev({ id: "f", date: "2026-09-01", state: "overdue", title: "Beyond lookback" }),
        ev({ id: "g", date: today, state: "cancelled", title: "Cancelled" }),
        ev({ id: "a", date: "2026-10-24", title: "Duplicate" }),
      ],
      today
    );
    expect(items.map((i) => i.title)).toEqual(["Old overdue", "Recent overdue", "Soon"]);
    expect(items[0]).toMatchObject({ tone: "overdue", subtitle: "Overdue by 12 days", kind: "due" });
    expect(items[2]).toMatchObject({ tone: "soon", subtitle: "Due in 2 days", href: "/ledger?tab=subscriptions", amount: 649 });
  });

  it("is empty with nothing due", () => {
    expect(dueInboxItems([], today)).toEqual([]);
  });

  it("uses a window from the lookback to three days ahead", () => {
    expect(inboxRange(today)).toEqual({ from: "2026-09-22", to: "2026-10-25" });
  });
});

describe("budgetInboxItems", () => {
  const b = (over: Partial<CategoryBudgetAlertItem>): CategoryBudgetAlertItem => ({
    id: "b1",
    category: "Food & Groceries",
    amount: 5000,
    spent: 1000,
    pct: 20,
    isOver: false,
    isWarning: false,
    ...over,
  });

  it("lists over and warning budgets only, over first, with honest amounts", () => {
    const items = budgetInboxItems(
      [
        b({ id: "ok" }),
        b({ id: "warn", category: "Shopping", spent: 4200, pct: 84, isWarning: true }),
        b({ id: "over", category: "Transport", subcategory: "Cab / Taxi", spent: 5600, pct: 100, isOver: true }),
      ],
      "2026-10",
      "INR"
    );
    expect(items.map((i) => i.id)).toEqual(["budget:over:2026-10:over", "budget:warn:2026-10:warning"]);
    expect(items[0]).toMatchObject({ title: "Transport · Cab / Taxi", subtitle: "Over budget · amount over", amount: 600, tone: "over" });
    expect(items[1]).toMatchObject({ subtitle: "84% used · amount left", amount: 800, tone: "warning" });
  });
});

describe("read state", () => {
  const items = dueInboxItems([ev({ id: "x" }), ev({ id: "y", date: "2026-10-23" })], today);

  it("counts what this device hasn't seen", () => {
    expect(unreadCount(items, new Set())).toBe(2);
    expect(unreadCount(items, new Set(["x"]))).toBe(1);
  });

  it("marks current items seen, newest first, capped", () => {
    expect(markInboxSeen(["old"], items)).toEqual(["x", "y", "old"]);
    const many = Array.from({ length: INBOX_SEEN_LIMIT + 10 }, (_, i) => `id${i}`);
    expect(markInboxSeen(many, items)).toHaveLength(INBOX_SEEN_LIMIT);
    expect(markInboxSeen(many, items).slice(0, 2)).toEqual(["x", "y"]);
  });

  it("parses stored ids defensively", () => {
    expect(parseSeenIds('["a","b",3]')).toEqual(["a", "b"]);
    expect(parseSeenIds("not json")).toEqual([]);
    expect(parseSeenIds('{"a":1}')).toEqual([]);
    expect(parseSeenIds(null)).toEqual([]);
  });
});
