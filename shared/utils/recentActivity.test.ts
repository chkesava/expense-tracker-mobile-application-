import { describe, expect, it } from "vitest";

import type { Expense, Income } from "../types/expense";
import { mergeRecentActivity } from "./recentActivity";

const expense = (id: string, date: string, createdAt: unknown, extra: Partial<Expense> = {}): Expense =>
  ({ id, amount: 100, category: "Food & Groceries", date, month: date.slice(0, 7), createdAt, ...extra }) as Expense;
const income = (id: string, date: string, createdAt: unknown, extra: Partial<Income> = {}): Income =>
  ({ id, amount: 5000, source: "Salary", note: "", date, month: date.slice(0, 7), createdAt, ...extra }) as Income;

describe("mergeRecentActivity", () => {
  it("interleaves expenses and incomes newest first", () => {
    const items = mergeRecentActivity(
      [expense("e1", "2026-10-15", 1), expense("e2", "2026-10-13", 1)],
      [income("i1", "2026-10-14", 1), income("i2", "2026-09-01", 1)],
      5
    );
    expect(items.map((i) => i.key)).toEqual(["expense:e1", "income:i1", "expense:e2", "income:i2"]);
  });

  it("breaks same-day ties by created time across Timestamp, Date and ISO values", () => {
    const items = mergeRecentActivity(
      [expense("e1", "2026-10-15", { seconds: 100, nanoseconds: 0 })],
      [income("i1", "2026-10-15", new Date(300_000)), income("i2", "2026-10-15", "1970-01-01T00:00:00.200Z")],
      5
    );
    // 300,000 ms (Date) > 100,000 ms (Timestamp seconds) > 200 ms (ISO).
    expect(items.map((i) => i.key)).toEqual(["income:i1", "expense:e1", "income:i2"]);
  });

  it("never shows soft-deleted rows", () => {
    const items = mergeRecentActivity(
      [expense("e1", "2026-10-15", 1, { deletedAt: "2026-10-15T10:00:00Z" }), expense("e2", "2026-10-14", 1)],
      [income("i1", "2026-10-16", 1, { deletedAt: "2026-10-16T10:00:00Z" })],
      5
    );
    expect(items.map((i) => i.key)).toEqual(["expense:e2"]);
  });

  it("caps at the limit and keeps each row's kind", () => {
    const items = mergeRecentActivity(
      Array.from({ length: 5 }, (_, n) => expense(`e${n}`, `2026-10-0${n + 1}`, 1)),
      [income("i1", "2026-10-09", 1)],
      3
    );
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ kind: "income", key: "income:i1" });
    expect(items[1].kind).toBe("expense");
  });

  it("handles empty input", () => {
    expect(mergeRecentActivity([], [], 5)).toEqual([]);
  });
});
