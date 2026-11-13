import { describe, expect, it } from "vitest";
import type { Expense, Income } from "@/shared/types/expense";
import { buildJournalRecords } from "../journalActivities";
import {
  activeDaysCount,
  averageDailySpend,
  buildDailySpendingBuckets,
  dailySpendingAccessibilityRows,
  highestSpendingDay,
  intensityLevel,
  monthGridWeeks,
} from "./spendingHeatmap";

function expense(date: string, amount: number, overrides: Partial<Expense> = {}): Expense {
  return {
    amount,
    category: "Food",
    note: "",
    date,
    month: date.slice(0, 7),
    createdAt: date,
    ...overrides,
  };
}

function income(date: string, amount: number, overrides: Partial<Income> = {}): Income {
  return {
    amount,
    source: "Salary",
    note: "",
    date,
    month: date.slice(0, 7),
    createdAt: date,
    ...overrides,
  };
}

describe("buildDailySpendingBuckets", () => {
  it("produces a full day set even for an empty month", () => {
    const buckets = buildDailySpendingBuckets(buildJournalRecords([], [], []), "2026-02");
    expect(buckets).toHaveLength(28); // 2026 is not a leap year
    expect(buckets.every((b) => b.total === 0 && b.transactionCount === 0)).toBe(true);
  });

  it("handles a leap-year February (29 days)", () => {
    const buckets = buildDailySpendingBuckets(buildJournalRecords([], [], []), "2024-02");
    expect(buckets).toHaveLength(29);
  });

  it("handles 30- and 31-day months", () => {
    expect(buildDailySpendingBuckets(buildJournalRecords([], [], []), "2026-04")).toHaveLength(30);
    expect(buildDailySpendingBuckets(buildJournalRecords([], [], []), "2026-01")).toHaveLength(31);
  });

  it("sums multiple transactions on the same day", () => {
    const records = buildJournalRecords(
      [expense("2026-03-05", 100), expense("2026-03-05", 50)],
      [],
      []
    );
    const buckets = buildDailySpendingBuckets(records, "2026-03");
    const day5 = buckets.find((b) => b.date === "2026-03-05");
    expect(day5?.total).toBe(150);
    expect(day5?.transactionCount).toBe(2);
  });

  it("excludes income from spend", () => {
    const records = buildJournalRecords([], [income("2026-03-05", 5000)], []);
    const buckets = buildDailySpendingBuckets(records, "2026-03");
    const day5 = buckets.find((b) => b.date === "2026-03-05");
    expect(day5?.total).toBe(0);
  });

  it("excludes refunds/cashback from spend", () => {
    const records = buildJournalRecords(
      [expense("2026-03-05", 100, { category: "Refund / Cashback" })],
      [],
      []
    );
    const buckets = buildDailySpendingBuckets(records, "2026-03");
    const day5 = buckets.find((b) => b.date === "2026-03-05");
    expect(day5?.total).toBe(0);
  });

  it("never counts a transfer, bill payment or card repayment (structurally absent from Journal rows)", () => {
    // Transfers/payments are AccountTransfer/AccountPayment rows, never
    // Expense/Income, so buildJournalRecords simply never emits one for them.
    const records = buildJournalRecords(
      [expense("2026-03-05", 100, { category: "Bills & Communication" })],
      [],
      []
    );
    const buckets = buildDailySpendingBuckets(records, "2026-03");
    const day5 = buckets.find((b) => b.date === "2026-03-05");
    // A real category bill (electricity, phone) IS eligible spend.
    expect(day5?.total).toBe(100);
  });

  it("ignores rows outside the requested month", () => {
    const records = buildJournalRecords([expense("2026-04-01", 999)], [], []);
    const buckets = buildDailySpendingBuckets(records, "2026-03");
    expect(buckets.reduce((sum, b) => sum + b.total, 0)).toBe(0);
  });
});

describe("monthGridWeeks", () => {
  // One month per calendar year guaranteed to start on each of the 7
  // weekdays (verified against `Date`, not hand-computed).
  const candidateMonths = [
    "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06",
    "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12",
  ];
  const monthByWeekday = new Map<number, string>();
  for (const monthKey of candidateMonths) {
    const [year, month] = monthKey.split("-").map(Number);
    const weekday = new Date(year, month - 1, 1).getDay();
    if (!monthByWeekday.has(weekday)) monthByWeekday.set(weekday, monthKey);
  }
  it("covers every weekday across 2026's 12 months", () => {
    expect(monthByWeekday.size).toBe(7);
  });

  it.each([...monthByWeekday.entries()])(
    "pads correctly when the month starting on weekday %i (%s) is rendered",
    (expectedWeekday, monthKey) => {
      const weeks = monthGridWeeks(monthKey, "sunday");
      expect(weeks[0]![expectedWeekday]).toBe(`${monthKey}-01`);
      for (let i = 0; i < expectedWeekday; i++) {
        expect(weeks[0]![i]).toBeNull();
      }
      weeks.forEach((week) => expect(week).toHaveLength(7));
    }
  );

  it("pads a 28-day, 29-day, 30-day and 31-day month to full weeks", () => {
    for (const monthKey of ["2026-02", "2024-02", "2026-04", "2026-01"]) {
      const weeks = monthGridWeeks(monthKey);
      const flat = weeks.flat();
      expect(flat.length % 7).toBe(0);
      const realDays = flat.filter((cell): cell is string => cell !== null);
      expect(realDays[0]).toBe(`${monthKey}-01`);
    }
  });

  it("produces a fully-padded grid for a month with no transactions", () => {
    const weeks = monthGridWeeks("2026-11");
    expect(weeks.length).toBeGreaterThan(0);
  });
});

describe("intensityLevel", () => {
  it("is 0 for no spend or a zero/negative scale", () => {
    expect(intensityLevel(0, 1000)).toBe(0);
    expect(intensityLevel(500, 0)).toBe(0);
  });

  it("splits into 5 levels relative to the month's own max", () => {
    expect(intensityLevel(1, 1000)).toBe(0); // negligible (<1% of the month's max)
    expect(intensityLevel(250, 1000)).toBe(1);
    expect(intensityLevel(500, 1000)).toBe(2);
    expect(intensityLevel(750, 1000)).toBe(3);
    expect(intensityLevel(1000, 1000)).toBe(4);
  });
});

describe("highestSpendingDay", () => {
  it("returns null for an all-zero bucket set", () => {
    const buckets = buildDailySpendingBuckets(buildJournalRecords([], [], []), "2026-03");
    expect(highestSpendingDay(buckets)).toBeNull();
  });

  it("keeps the earliest date on a tie", () => {
    const records = buildJournalRecords(
      [expense("2026-03-02", 100), expense("2026-03-10", 100)],
      [],
      []
    );
    const buckets = buildDailySpendingBuckets(records, "2026-03");
    expect(highestSpendingDay(buckets)?.date).toBe("2026-03-02");
  });

  it("finds the true maximum", () => {
    const records = buildJournalRecords(
      [expense("2026-03-02", 100), expense("2026-03-10", 500)],
      [],
      []
    );
    const buckets = buildDailySpendingBuckets(records, "2026-03");
    expect(highestSpendingDay(buckets)?.date).toBe("2026-03-10");
    expect(highestSpendingDay(buckets)?.total).toBe(500);
  });
});

describe("averageDailySpend / activeDaysCount", () => {
  it("differs between activeDays and allDaysInMonth denominators", () => {
    const records = buildJournalRecords([expense("2026-04-01", 300)], [], []);
    const buckets = buildDailySpendingBuckets(records, "2026-04"); // 30-day month
    expect(averageDailySpend(buckets, "activeDays")).toBe(300);
    expect(averageDailySpend(buckets, "allDaysInMonth")).toBe(10);
    expect(activeDaysCount(buckets)).toEqual({ active: 1, total: 30 });
  });

  it("returns 0 rather than dividing by zero for an empty month", () => {
    const buckets = buildDailySpendingBuckets(buildJournalRecords([], [], []), "2026-04");
    expect(averageDailySpend(buckets, "activeDays")).toBe(0);
    expect(averageDailySpend(buckets, "allDaysInMonth")).toBe(0);
  });
});

describe("dailySpendingAccessibilityRows", () => {
  it("describes each day in text, including zero-spend days", () => {
    const records = buildJournalRecords([expense("2026-04-01", 300)], [], []);
    const buckets = buildDailySpendingBuckets(records, "2026-04");
    const rows = dailySpendingAccessibilityRows(buckets, (amount) => `₹${amount}`);
    expect(rows[0]).toEqual({ label: "2026-04-01", detail: "₹300 across 1 transaction" });
    expect(rows[1]).toEqual({ label: "2026-04-02", detail: "No spending" });
  });
});
