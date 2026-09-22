import { describe, expect, it } from "vitest";

import {
  classifyRecurringCadence,
  detectRecurringPatterns,
  filterPatternsForReview,
  formatRecurringCadence,
  matchesExistingSubscription,
  merchantFromExpense,
  patternToSubscription,
  recurringMerchantKey,
  recurringPatternKey,
  type RecurringExpenseInput,
} from "@/services/sms/smsRecurringDetector";
import { parseLocalDate, toLocalDateKey } from "@/shared/utils/dates";

function netflix(date: string): RecurringExpenseInput {
  return {
    amount: 649,
    date,
    note: "Netflix · UPI · HDFC",
    category: "Entertainment",
    subcategory: "OTT",
  };
}

function everyNDays(
  note: string,
  amount: number,
  start: string,
  count: number,
  step: number,
  category = "Food"
): RecurringExpenseInput[] {
  const items: RecurringExpenseInput[] = [];
  const date = parseLocalDate(start);
  for (let i = 0; i < count; i++) {
    items.push({
      amount,
      date: toLocalDateKey(date),
      note,
      category,
    });
    date.setDate(date.getDate() + step);
  }
  return items;
}

describe("merchantFromExpense", () => {
  it("uses the catalog name from an SMS note", () => {
    expect(
      merchantFromExpense({
        amount: 649,
        date: "2026-08-12",
        note: "Netflix · UPI · HDFC",
        category: "Entertainment",
      })
    ).toBe("Netflix");
  });

  it("prefers merchantHint", () => {
    expect(
      merchantFromExpense({
        amount: 649,
        date: "2026-08-12",
        note: "UPI debit",
        category: "Entertainment",
        merchantHint: "NETFLIXIN",
      })
    ).toBe("Netflix");
  });

  it("skips processor-generated notes and linked expenses", () => {
    expect(
      merchantFromExpense({
        amount: 649,
        date: "2026-08-12",
        note: "[Subscription] Netflix 4K",
        category: "Entertainment",
      })
    ).toBeNull();
    expect(
      merchantFromExpense({
        amount: 649,
        date: "2026-08-12",
        note: "Netflix",
        category: "Entertainment",
        subscriptionId: "sub-1",
      })
    ).toBeNull();
  });
});

describe("classifyRecurringCadence", () => {
  it("classifies monthly Netflix-style gaps", () => {
    const cadence = classifyRecurringCadence([
      "2026-05-12",
      "2026-06-12",
      "2026-07-12",
    ]);
    expect(cadence).toEqual({ frequency: "monthly", dayOfMonth: 12 });
  });

  it("classifies a consistent every-2-days series", () => {
    const dates = everyNDays("Chicken", 200, "2026-08-01", 8, 2).map(
      (item) => item.date
    );
    expect(classifyRecurringCadence(dates)).toEqual({
      frequency: "every_n_days",
      intervalDays: 2,
      dayOfMonth: 8,
    });
  });
});

describe("detectRecurringPatterns", () => {
  it("detects Netflix at ₹649 across four months as monthly", () => {
    const patterns = detectRecurringPatterns([
      netflix("2026-05-12"),
      netflix("2026-06-12"),
      netflix("2026-07-12"),
      netflix("2026-08-12"),
    ]);
    expect(patterns).toHaveLength(1);
    expect(patterns[0]?.merchant).toBe("Netflix");
    expect(patterns[0]?.amount).toBe(649);
    expect(patterns[0]?.occurrences).toBe(4);
    expect(patterns[0]?.dayOfMonth).toBe(12);
    expect(patterns[0]?.frequency).toBe("monthly");
    expect(patterns[0]?.category).toBe("Entertainment");
    expect(formatRecurringCadence(patterns[0]!)).toBe("month");
  });

  it("detects chicken every two days even when the series spans three months", () => {
    const patterns = detectRecurringPatterns(
      everyNDays("Chicken", 200, "2026-05-01", 40, 2)
    );
    expect(patterns).toHaveLength(1);
    expect(patterns[0]?.merchant).toBe("Chicken");
    expect(patterns[0]?.frequency).toBe("every_n_days");
    expect(patterns[0]?.intervalDays).toBe(2);
    expect(formatRecurringCadence(patterns[0]!)).toBe("every 2 days");
  });

  it("ignores the same amount three times in one week", () => {
    const patterns = detectRecurringPatterns([
      {
        amount: 450,
        date: "2026-08-10",
        note: "Swiggy",
        category: "Food",
      },
      {
        amount: 450,
        date: "2026-08-11",
        note: "Swiggy",
        category: "Food",
      },
      {
        amount: 450,
        date: "2026-08-12",
        note: "Swiggy",
        category: "Food",
      },
    ]);
    expect(patterns).toHaveLength(0);
  });

  it("needs at least three occurrences", () => {
    expect(
      detectRecurringPatterns([
        netflix("2026-06-12"),
        netflix("2026-07-12"),
      ])
    ).toHaveLength(0);
  });

  it("dedupes the same merchant+amount+date", () => {
    const patterns = detectRecurringPatterns([
      netflix("2026-05-12"),
      netflix("2026-05-12"),
      netflix("2026-06-12"),
      netflix("2026-07-12"),
    ]);
    expect(patterns[0]?.occurrences).toBe(3);
  });
});

describe("subscription matching", () => {
  it("matches an existing Netflix subscription", () => {
    const pattern = detectRecurringPatterns([
      netflix("2026-05-12"),
      netflix("2026-06-12"),
      netflix("2026-07-12"),
    ])[0]!;
    expect(
      matchesExistingSubscription(
        { name: "Netflix 4K", amount: 649 },
        pattern
      )
    ).toBe(true);
    expect(
      matchesExistingSubscription({ name: "Netflix", amount: 649 }, pattern)
    ).toBe(true);
    expect(recurringPatternKey("Netflix", 649)).toBe(
      recurringPatternKey("NETFLIXIN", 649)
    );
  });

  it("builds an SMS-sourced subscription payload", () => {
    const pattern = detectRecurringPatterns([
      netflix("2026-05-12"),
      netflix("2026-06-12"),
      netflix("2026-07-12"),
    ])[0]!;
    const sub = patternToSubscription(pattern);
    expect(sub.name).toBe("Netflix");
    expect(sub.amount).toBe(649);
    expect(sub.source).toBe("sms");
    expect(sub.type).toBe("subscription");
    expect(sub.frequency).toBe("monthly");
    expect(sub.lastProcessed).toBe("2026-07");
    expect(sub.lastProcessedDate).toBe("2026-07-12");
    expect(sub.isActive).toBe(true);
  });
});

describe("filterPatternsForReview", () => {
  it("drops dismissed merchants and names that already have a subscription", () => {
    const chicken = detectRecurringPatterns(
      everyNDays("Chicken", 200, "2026-08-01", 8, 2)
    )[0]!;
    const netflixPattern = detectRecurringPatterns([
      netflix("2026-05-12"),
      netflix("2026-06-12"),
      netflix("2026-07-12"),
    ])[0]!;

    expect(
      filterPatternsForReview(
        [chicken, netflixPattern],
        [{ name: "Netflix 4K" }],
        [recurringMerchantKey("Chicken")]
      )
    ).toEqual([]);
  });
});

describe("truncated ledger degrades detection (SPENDLY-98)", () => {
  // The staged first-paint page is 300 expenses ordered by `createdAt desc`.
  // Detection needs SMS_RECURRING_MIN_OCCURRENCES (3) sightings of one
  // merchant+amount, so whatever falls off the page is invisible to it.
  const STAGED_LIMIT = 300;
  const MONTHS = [
    "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08",
  ];

  function noise(date: string, index: number): RecurringExpenseInput {
    return {
      amount: 100 + (index % 7),
      date,
      note: `Shop ${index % 40}`,
      category: "Food",
    };
  }

  /** Netflix on the 5th of six consecutive months, buried in everyday spend. */
  function buildLedger(noisePerMonth: number): RecurringExpenseInput[] {
    const rows: RecurringExpenseInput[] = [];
    MONTHS.forEach((month, monthIndex) => {
      rows.push(netflix(`${month}-05`));
      for (let i = 1; i <= noisePerMonth; i += 1) {
        const dayKey = String((i % 28) + 1).padStart(2, "0");
        rows.push(noise(`${month}-${dayKey}`, monthIndex * noisePerMonth + i));
      }
    });
    return rows;
  }

  /** `createdAt` tracks `date` here, so the page keeps the newest rows. */
  function stage(rows: RecurringExpenseInput[]): RecurringExpenseInput[] {
    return [...rows]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, STAGED_LIMIT);
  }

  const netflixPattern = (rows: RecurringExpenseInput[]) =>
    detectRecurringPatterns(rows).find((p) =>
      p.merchant.toLowerCase().includes("netflix")
    );

  it("detects all six charges from full history", () => {
    const pattern = netflixPattern(buildLedger(60));
    expect(pattern?.frequency).toBe("monthly");
    expect(pattern?.amount).toBe(649);
    expect(pattern?.occurrences).toBe(6);
  });

  it("understates occurrences for a moderate ledger", () => {
    // ~60 expenses/month: the page reaches back about five months, so the
    // pattern survives but its history is short by a charge.
    const full = netflixPattern(buildLedger(60));
    const staged = netflixPattern(stage(buildLedger(60)));
    expect(staged).toBeDefined();
    expect(staged!.occurrences).toBeLessThan(full!.occurrences);
    expect(staged!.dates).not.toEqual(full!.dates);
  });

  it("loses the subscription outright for a heavy ledger", () => {
    // ~150 expenses/month: 300 rows is barely two months, which is below the
    // minimum occurrence count — nothing is ever queued for review.
    const heavy = buildLedger(150);
    expect(heavy.length).toBeGreaterThan(STAGED_LIMIT * 2);
    expect(netflixPattern(heavy)?.occurrences).toBe(6);
    expect(netflixPattern(stage(heavy))).toBeUndefined();
  });
});
