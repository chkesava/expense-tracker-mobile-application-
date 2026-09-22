import { describe, expect, it } from "vitest";

import type { AccountActivity } from "@/shared/types/expense";
import { enrichAccountActivities } from "./accountActivityFilters";
import type { StatementPeriod } from "./accountStatement";
import type { StatementLine } from "./statementParse";
import {
  proposedAdjustment,
  reconcileAccountStatement,
  withUniqueLineIds,
} from "./accountReconciliation";

const PERIOD: StatementPeriod = {
  preset: "custom",
  fromDate: "2026-09-01",
  toDate: "2026-09-30",
  label: "2026-09-01 to 2026-09-30",
};

function records(activities: AccountActivity[]) {
  return enrichAccountActivities(activities, [], [], []);
}

function expense(
  id: string,
  date: string,
  amount: number,
  note = `Expense ${id}`
): AccountActivity {
  return {
    id,
    date,
    amount,
    type: "debit",
    linkedExpenseId: id,
    category: "Food & Groceries",
    note,
  };
}

function income(
  id: string,
  date: string,
  amount: number,
  note = `Income ${id}`
): AccountActivity {
  return {
    id,
    date,
    amount,
    type: "credit",
    linkedIncomeId: id,
    source: "Salary",
    note,
  };
}

function line(
  id: string,
  date: string,
  amount: number,
  kind: "debit" | "credit" = "debit",
  merchant = "Merchant"
): StatementLine {
  return { id, date, merchant, amount, kind, raw: `${date} ${merchant} ${amount}` };
}

function reconcile(
  activities: AccountActivity[],
  lines: StatementLine[],
  options: {
    ledgerClosingBalance?: number;
    statementClosingBalance?: number;
    period?: StatementPeriod;
  } = {}
) {
  const { period = PERIOD, ...balances } = options;
  return reconcileAccountStatement(records(activities), lines, period, balances);
}

describe("account reconciliation", () => {
  describe("exact match", () => {
    it("matches every line and leaves nothing unaccounted for", () => {
      const result = reconcile(
        [expense("e1", "2026-09-05", 500), income("i1", "2026-09-10", 3000)],
        [line("s1", "2026-09-05", 500), line("s2", "2026-09-10", 3000, "credit")]
      );

      expect(result.matched).toHaveLength(2);
      expect(result.missingInApp).toEqual([]);
      expect(result.extraInApp).toEqual([]);
    });

    it("balances when the two closing balances agree exactly", () => {
      const result = reconcile([expense("e1", "2026-09-05", 500)], [], {
        ledgerClosingBalance: 4500,
        statementClosingBalance: 4500,
      });

      expect(result.variance).toBe(0);
      expect(result.status).toBe("balanced");
      expect(proposedAdjustment(result)).toBeUndefined();
    });

    it("never matches a debit against a credit of the same amount", () => {
      const result = reconcile(
        [income("i1", "2026-09-05", 500)],
        [line("s1", "2026-09-05", 500, "debit")]
      );

      expect(result.matched).toEqual([]);
      expect(result.missingInApp).toHaveLength(1);
      expect(result.extraInApp).toHaveLength(1);
    });
  });

  describe("variance", () => {
    it("reports a positive variance when the bank holds more than Spendly knows", () => {
      const result = reconcile([], [], {
        ledgerClosingBalance: 4500,
        statementClosingBalance: 5000,
      });

      expect(result.variance).toBe(500);
      expect(result.status).toBe("variance");
      expect(proposedAdjustment(result)).toEqual({
        direction: "credit",
        amount: 500,
      });
    });

    it("reports a negative variance when Spendly thinks there is more", () => {
      const result = reconcile([], [], {
        ledgerClosingBalance: 5000,
        statementClosingBalance: 4500,
      });

      expect(result.variance).toBe(-500);
      expect(result.status).toBe("variance");
      expect(proposedAdjustment(result)).toEqual({
        direction: "debit",
        amount: 500,
      });
    });

    it("treats even a one-paisa gap as a variance, not a rounding pleasantry", () => {
      const result = reconcile([], [], {
        ledgerClosingBalance: 4500,
        statementClosingBalance: 4500.01,
      });

      expect(result.status).toBe("variance");
      expect(result.variance).toBeCloseTo(0.01, 5);
    });

    it("reports no variance at all when Spendly has no balance to compare", () => {
      // A credit card, or a period whose rows predate the balance baseline.
      const result = reconcile([], [], { statementClosingBalance: 4500 });

      expect(result.variance).toBeUndefined();
      expect(result.status).toBe("variance");
      expect(proposedAdjustment(result)).toBeUndefined();
    });

    it("reports no variance before the user has entered a statement balance", () => {
      const result = reconcile([], [], { ledgerClosingBalance: 4500 });

      expect(result.variance).toBeUndefined();
      expect(proposedAdjustment(result)).toBeUndefined();
    });
  });

  describe("empty statement", () => {
    it("lists every ledger row as extra rather than claiming a match", () => {
      const result = reconcile(
        [expense("e1", "2026-09-05", 500), expense("e2", "2026-09-06", 200)],
        []
      );

      expect(result.matched).toEqual([]);
      expect(result.missingInApp).toEqual([]);
      expect(result.extraInApp.map((row) => row.activityId)).toEqual(["e1", "e2"]);
    });

    it("still balances an empty statement against an empty period", () => {
      const result = reconcile([], [], {
        ledgerClosingBalance: 4500,
        statementClosingBalance: 4500,
      });

      expect(result.status).toBe("balanced");
      expect(result.matched).toEqual([]);
      expect(result.extraInApp).toEqual([]);
    });
  });

  describe("duplicate lines and ids", () => {
    it("matches two identical statement lines to two different ledger rows", () => {
      // The same coffee, twice on the same day — both real, both charged.
      const result = reconcile(
        [expense("e1", "2026-09-05", 150), expense("e2", "2026-09-05", 150)],
        [line("s1", "2026-09-05", 150), line("s2", "2026-09-05", 150)]
      );

      expect(result.matched).toHaveLength(2);
      expect(new Set(result.matched.map((pair) => pair.activityId)).size).toBe(2);
      expect(result.extraInApp).toEqual([]);
    });

    it("does not let one ledger row satisfy two statement lines", () => {
      const result = reconcile(
        [expense("e1", "2026-09-05", 150)],
        [line("s1", "2026-09-05", 150), line("s2", "2026-09-05", 150)]
      );

      expect(result.matched).toHaveLength(1);
      expect(result.missingInApp).toHaveLength(1);
    });

    it("disambiguates a repeated line id instead of dropping the transaction", () => {
      const deduped = withUniqueLineIds([
        line("stmt-1-2026-09-05-150-debit", "2026-09-05", 150),
        line("stmt-1-2026-09-05-150-debit", "2026-09-05", 150),
      ]);

      expect(deduped).toHaveLength(2);
      expect(new Set(deduped.map((entry) => entry.id)).size).toBe(2);
    });

    it("gives every line in the result a unique key", () => {
      const result = reconcile(
        [],
        [
          line("dup", "2026-09-05", 150),
          line("dup", "2026-09-05", 150),
          line("dup", "2026-09-06", 150),
        ]
      );

      const ids = result.missingInApp.map((entry) => entry.id);
      expect(ids).toHaveLength(3);
      expect(new Set(ids).size).toBe(3);
    });
  });

  describe("period boundaries", () => {
    it("matches lines dated exactly on the first and last day", () => {
      const result = reconcile(
        [expense("e1", "2026-09-01", 100), expense("e2", "2026-09-30", 200)],
        [line("s1", "2026-09-01", 100), line("s2", "2026-09-30", 200)]
      );

      expect(result.matched).toHaveLength(2);
      expect(result.outOfPeriod).toEqual([]);
    });

    it("sets aside a statement line dated outside the period", () => {
      const result = reconcile(
        [expense("e1", "2026-09-05", 100)],
        [line("s1", "2026-08-31", 100), line("s2", "2026-09-05", 100)]
      );

      expect(result.outOfPeriod.map((entry) => entry.id)).toEqual(["s1"]);
      expect(result.matched).toHaveLength(1);
      // The out-of-period line is not counted as missing — it was never in
      // scope, and reporting it as a gap would send the user hunting for a
      // transaction that is simply on another statement.
      expect(result.missingInApp).toEqual([]);
    });

    it("ignores a ledger row outside the period", () => {
      const result = reconcile([expense("e0", "2026-08-25", 999)], []);

      expect(result.extraInApp).toEqual([]);
    });
  });

  describe("date drift", () => {
    it("matches a line the bank posted a day later and says the date differs", () => {
      const result = reconcile(
        [expense("e1", "2026-09-05", 500)],
        [line("s1", "2026-09-06", 500)]
      );

      expect(result.matched).toHaveLength(1);
      expect(result.matched[0].dateDiffers).toBe(true);
      expect(result.missingInApp).toEqual([]);
    });

    it("does not match across a gap of more than a day", () => {
      const result = reconcile(
        [expense("e1", "2026-09-05", 500)],
        [line("s1", "2026-09-08", 500)]
      );

      expect(result.matched).toEqual([]);
      expect(result.missingInApp).toHaveLength(1);
    });

    it("gives an exact match priority over a neighbouring day's line", () => {
      // s-near could take e1 on drift, but s-exact matches it outright. If
      // drift ran first, s-exact would be reported as missing for no reason.
      const result = reconcile(
        [expense("e1", "2026-09-05", 400)],
        [line("s-near", "2026-09-04", 400), line("s-exact", "2026-09-05", 400)]
      );

      expect(result.matched).toHaveLength(1);
      expect(result.matched[0].line.id).toBe("s-exact");
      expect(result.missingInApp.map((entry) => entry.id)).toEqual(["s-near"]);
    });
  });

  describe("ledger safety", () => {
    it("does not mutate the records it was given", () => {
      const rows = records([
        expense("e1", "2026-09-05", 500),
        expense("e2", "2026-09-06", 200),
      ]);
      const before = rows.map((row) => row.activity.id);

      reconcileAccountStatement(rows, [line("s1", "2026-09-05", 500)], PERIOD);

      expect(rows.map((row) => row.activity.id)).toEqual(before);
      expect(rows).toHaveLength(2);
    });

    it("does not mutate the statement lines it was given", () => {
      const lines = [line("s1", "2026-09-05", 500)];

      reconcileAccountStatement(records([]), lines, PERIOD);

      expect(lines[0].id).toBe("s1");
    });
  });

  describe("transfers and other movement", () => {
    it("reconciles a transfer leg like any other posting", () => {
      const result = reconcile(
        [
          {
            id: "t1",
            date: "2026-09-12",
            amount: 1000,
            type: "debit",
            linkedTransferId: "tr1",
            isTransfer: true,
            counterpartyName: "ICICI Savings",
          },
        ],
        [line("s1", "2026-09-12", 1000, "debit", "NEFT ICICI")]
      );

      expect(result.matched).toHaveLength(1);
      expect(result.matched[0].activityId).toBe("t1");
    });

    it("describes an unmatched ledger row by what it actually is", () => {
      const result = reconcile(
        [
          {
            id: "p1",
            date: "2026-09-18",
            amount: 4000,
            type: "debit",
            isBillPayment: true,
            linkedPaymentId: "p1",
          },
        ],
        []
      );

      expect(result.extraInApp[0].subtype).toBe("Bill payment");
      expect(result.extraInApp[0].kind).toBe("debit");
    });
  });
});
