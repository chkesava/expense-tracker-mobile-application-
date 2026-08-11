import { describe, expect, it } from "vitest";
import { resolveWorkspaceRoute } from "@/shared/config/workspaceRoutes";
import { isNavItemActive } from "@/shared/config/navigation";
import { getPaymentSlugFromLocation } from "@/shared/utils/paymentRequestPath";
import { generateTransactionsCsv } from "@/shared/utils/csvExport";
import {
  createMemoryLedger,
  resetMemoryLedgerIds,
} from "@/lib/finance/memoryLedger";

describe("Phase 7 critical journeys (logic-level)", () => {
  it("expense ↔ nutrition workspace routes stay on real app groups", () => {
    expect(resolveWorkspaceRoute("expense")).toBe("/(app)");
    expect(resolveWorkspaceRoute("nutrition")).toBe("/(nutrition)");
    expect(isNavItemActive("/(app)/dashboard", "home")).toBe(true);
    expect(isNavItemActive("/(app)/ledger", "ledger")).toBe(true);
  });

  it("create expense → export CSV contains the new row", () => {
    resetMemoryLedgerIds();
    const ledger = createMemoryLedger("user-1");
    ledger.addExpense({
      amount: 42,
      category: "Food",
      note: "Journey lunch",
      date: "2026-08-11",
    });

    const csv = generateTransactionsCsv(ledger.listExpenses(), [], {
      currency: "INR",
    });
    expect(csv).toContain("Expense");
    expect(csv).toContain("42");
    expect(csv).toContain("Journey lunch");
  });

  it("collect payment deep-link slug resolves for share URLs", () => {
    expect(getPaymentSlugFromLocation("/payment/abc123")).toBe("abc123");
    expect(getPaymentSlugFromLocation("/pay/legacy-9")).toBe("legacy-9");
  });
});
