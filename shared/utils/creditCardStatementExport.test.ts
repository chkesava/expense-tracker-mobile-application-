import { describe, expect, it } from "vitest";

import type { Account, AccountPayment, Expense } from "../types/expense";
import {
  assertCycleExportComplete,
  buildCreditCardCycleExport,
  creditCardCycleExportFileName,
  creditCardCycleExportToCsv,
} from "./creditCardStatementExport";
import { CSV_LINE_ENDING } from "./csv";

/**
 * SPENDLY-113 — this module shipped under SPENDLY-106 with no test at all, and
 * SPENDLY-113 moves it onto the shared CSV writer. These cases characterise the
 * behaviour that must survive that move.
 */

const CARD: Pick<Account, "id" | "name" | "currency"> = {
  id: "card-1",
  name: "HDFC Regalia",
  currency: "INR",
};

let nextId = 0;

function expense(over: Partial<Expense> = {}): Expense {
  nextId += 1;
  return {
    id: `exp-${nextId}`,
    amount: 500,
    category: "Food",
    note: "Lunch",
    date: "2026-09-10",
    month: "2026-09",
    accountId: "card-1",
    createdAt: 1,
    ...over,
  };
}

function payment(over: Partial<AccountPayment> = {}): AccountPayment {
  nextId += 1;
  return {
    id: `pay-${nextId}`,
    fromAccountId: "bank-1",
    toAccountId: "card-1",
    amount: 2000,
    date: "2026-09-20",
    createdAt: 1,
    ...over,
  } as AccountPayment;
}

function build(over: Partial<Parameters<typeof buildCreditCardCycleExport>[0]> = {}) {
  return buildCreditCardCycleExport({
    account: CARD,
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    statementDate: "2026-09-30",
    expenses: [],
    payments: [],
    ...over,
  });
}

describe("credit card cycle export (SPENDLY-106, characterised by SPENDLY-113)", () => {
  describe("the row set", () => {
    it("keeps every row in the cycle", () => {
      const exported = build({
        expenses: [expense(), expense()],
        payments: [payment()],
      });
      expect(exported.rows).toHaveLength(3);
      expect(exported.totals.rowCount).toBe(3);
    });

    it("drops a soft-deleted expense", () => {
      const exported = build({
        expenses: [expense(), expense({ deletedAt: "2026-09-12T00:00:00Z" })],
      });
      expect(exported.rows).toHaveLength(1);
    });

    it("drops a voided payment", () => {
      const exported = build({
        payments: [payment(), payment({ voidedAt: "2026-09-21T00:00:00Z" })],
      });
      expect(exported.rows).toHaveLength(1);
    });

    it("excludes rows outside the window and rows on another card", () => {
      const exported = build({
        expenses: [
          expense({ date: "2026-08-31" }),
          expense({ date: "2026-10-01" }),
          expense({ accountId: "card-2" }),
          expense({ date: "2026-09-01" }),
          expense({ date: "2026-09-30" }),
        ],
      });
      expect(exported.rows).toHaveLength(2);
    });

    it("orders by date then id so the file is deterministic", () => {
      const exported = build({
        expenses: [
          expense({ id: "b", date: "2026-09-10" }),
          expense({ id: "a", date: "2026-09-10" }),
          expense({ id: "c", date: "2026-09-02" }),
        ],
      });
      expect(exported.rows.map((row) => row.id)).toEqual(["c", "a", "b"]);
    });

    it("labels a cashback payment apart from a user payment", () => {
      const exported = build({
        payments: [
          payment({ id: "p1" }),
          payment({ id: "p2", sourceType: "cashback" }),
        ],
      });
      expect(exported.rows.find((row) => row.id === "p2")?.type).toBe("cashback");
      expect(exported.totals.cashback).toBe(2000);
      expect(exported.totals.userPayments).toBe(2000);
    });
  });

  describe("the truncation guard", () => {
    it("throws when the row count disagrees with what the caller expected", () => {
      const exported = build({ expenses: [expense()] });
      expect(() => assertCycleExportComplete(exported, 2)).toThrow(
        /truncated: expected 2 rows, got 1/
      );
    });

    it("passes when the counts agree", () => {
      const exported = build({ expenses: [expense()] });
      expect(() => assertCycleExportComplete(exported, 1)).not.toThrow();
    });

    it("throws when the row list disagrees with totals.rowCount", () => {
      const exported = build({ expenses: [expense()] });
      const tampered = {
        ...exported,
        totals: { ...exported.totals, rowCount: 5 },
      };
      expect(() => assertCycleExportComplete(tampered, 5)).toThrow(
        /disagrees with totals.rowCount/
      );
    });
  });

  describe("the CSV", () => {
    it("renders the blank meta separator as an empty line", () => {
      const csv = creditCardCycleExportToCsv(build({ expenses: [expense()] }));
      const lines = csv.split(CSV_LINE_ENDING);
      expect(lines).toContain("");
      // The blank row sits between the meta block and the column header.
      expect(lines[lines.indexOf("") + 1]).toBe("Date,Type,Amount,Note,ID");
    });

    it("carries the cycle's own context in the meta block", () => {
      const csv = creditCardCycleExportToCsv(
        build({ billId: "bill-9", expenses: [expense()] })
      );
      expect(csv).toContain("Account,HDFC Regalia");
      expect(csv).toContain("Period start,2026-09-01");
      expect(csv).toContain("Bill ID,bill-9");
      expect(csv).toContain("Currency,INR");
      expect(csv).toContain("Row count,1");
    });

    it("writes raw numbers, never a formatted currency string", () => {
      const csv = creditCardCycleExportToCsv(
        build({ expenses: [expense({ amount: 1250.5 })] })
      );
      expect(csv).toContain("1250.5");
      expect(csv).not.toContain("₹");
    });

    it("quotes a note containing a comma", () => {
      const csv = creditCardCycleExportToCsv(
        build({ expenses: [expense({ note: "Dinner, drinks" })] })
      );
      expect(csv).toContain('"Dinner, drinks"');
    });

    it("emits one body row per exported row", () => {
      const exported = build({ expenses: [expense(), expense()] });
      const csv = creditCardCycleExportToCsv(exported);
      const headerIndex = csv
        .split(CSV_LINE_ENDING)
        .indexOf("Date,Type,Amount,Note,ID");
      const body = csv.split(CSV_LINE_ENDING).slice(headerIndex + 1);
      expect(body).toHaveLength(exported.rows.length);
    });

    it("joins with CRLF", () => {
      const csv = creditCardCycleExportToCsv(build({ expenses: [expense()] }));
      expect(csv).toContain("\r\n");
    });
  });

  describe("the file name", () => {
    it("says which card and which window without being opened", () => {
      expect(creditCardCycleExportFileName(build())).toBe(
        "HDFC_Regalia_2026-09-01_2026-09-30.csv"
      );
    });

    it("falls back only when the slug is empty, not merely unhelpful", () => {
      // A name of pure punctuation slugs to "_", which is truthy, so the
      // "card" fallback does not fire. Characterised rather than changed —
      // the file name is not this ticket's to redesign.
      expect(
        creditCardCycleExportFileName(build({ account: { ...CARD, name: "***" } }))
      ).toBe("__2026-09-01_2026-09-30.csv");
      expect(
        creditCardCycleExportFileName(build({ account: { ...CARD, name: "" } }))
      ).toBe("card_2026-09-01_2026-09-30.csv");
    });
  });
});
