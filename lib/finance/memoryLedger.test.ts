import { beforeEach, describe, expect, it } from "vitest";
import {
  createMemoryLedger,
  resetMemoryLedgerIds,
} from "./memoryLedger";

describe("memoryLedger (Phase 5 fake data layer)", () => {
  beforeEach(() => {
    resetMemoryLedgerIds();
  });

  it("creates, updates, and deletes expenses for a uid scope", () => {
    const ledger = createMemoryLedger("user-1");
    const created = ledger.addExpense({
      amount: 120,
      category: "Food",
      note: "Lunch",
      date: "2026-08-11",
      accountId: "acc-1",
    });

    expect(created.month).toBe("2026-08");
    expect(ledger.listExpenses()).toHaveLength(1);

    const updated = ledger.updateExpense(created.id!, {
      amount: 150,
      date: "2026-09-01",
    });
    expect(updated?.amount).toBe(150);
    expect(updated?.month).toBe("2026-09");

    expect(ledger.deleteExpense(created.id!)).toBe(true);
    expect(ledger.listExpenses()).toHaveLength(0);
  });

  it("isolates ledgers per uid (duress / real path simulation)", () => {
    const real = createMemoryLedger("abc");
    const duress = createMemoryLedger("abc_duress");

    real.addExpense({
      amount: 50,
      category: "Food",
      note: "Real",
      date: "2026-08-01",
    });
    duress.addExpense({
      amount: 1,
      category: "Food",
      note: "Decoy",
      date: "2026-08-01",
    });

    expect(real.listExpenses()).toHaveLength(1);
    expect(duress.listExpenses()).toHaveLength(1);
    expect(real.listExpenses()[0]?.note).toBe("Real");
    expect(duress.listExpenses()[0]?.note).toBe("Decoy");
  });

  it("blocks deleting accounts with linked expenses or incomes", () => {
    const ledger = createMemoryLedger("user-1");
    const account = ledger.addAccount({
      name: "Bank",
      typeId: "bank",
      openingBalance: 0,
    });

    expect(ledger.deleteAccount(account.id!)).toEqual({ ok: true });

    const again = ledger.addAccount({
      name: "Bank",
      typeId: "bank",
      openingBalance: 0,
    });
    ledger.addExpense({
      amount: 10,
      category: "Food",
      note: "x",
      date: "2026-08-01",
      accountId: again.id,
    });

    expect(ledger.deleteAccount(again.id!)).toEqual({
      ok: false,
      linkedCount: 1,
    });
    expect(ledger.listAccounts()).toHaveLength(1);
  });

  it("aggregates pending sync counts across collections", () => {
    const ledger = createMemoryLedger("user-1");
    ledger.setPendingCount("expenses", 2);
    ledger.setPendingCount("incomes", 1);
    expect(ledger.getPendingSyncCount()).toBe(3);
    ledger.setPendingCount("expenses", 0);
    expect(ledger.getPendingSyncCount()).toBe(1);
  });
});
