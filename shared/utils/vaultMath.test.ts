import { describe, expect, it } from "vitest";
import { calculateMemberSpending, calculateVaultStats } from "./vaultMath";
import type { SharedVault } from "@/shared/types/vault";
import type { VaultExpense } from "@/shared/types/vaultExpense";

describe("vaultMath utilities", () => {
  const mockVault: SharedVault = {
    id: "vault_1",
    name: "Apartment Vault",
    budget: 20000,
    currency: "INR",
    memberIds: ["user_alice", "user_bob"],
    ownerId: "user_alice",
    themeColor: "#6366F1",
  };

  const mockExpenses: VaultExpense[] = [
    {
      id: "exp_1",
      vaultId: "vault_1",
      amount: 15000,
      type: "deposit",
      date: "2026-08-01",
      createdBy: "user_alice",
      createdByName: "Alice",
    },
    {
      id: "exp_2",
      vaultId: "vault_1",
      amount: 10000,
      type: "deposit",
      date: "2026-08-02",
      createdBy: "user_bob",
      createdByName: "Bob",
    },
    {
      id: "exp_3",
      vaultId: "vault_1",
      amount: 12000,
      type: "withdrawal",
      category: "Rent",
      date: "2026-08-05",
      createdBy: "user_alice",
      createdByName: "Alice",
    },
    {
      id: "exp_4",
      vaultId: "vault_1",
      amount: 5000,
      type: "withdrawal",
      category: "Groceries",
      date: "2026-08-06",
      createdBy: "user_bob",
      createdByName: "Bob",
    },
  ];

  it("calculates vault financial statistics accurately", () => {
    const stats = calculateVaultStats(mockVault, mockExpenses);

    expect(stats.totalDeposits).toBe(25000);
    expect(stats.totalWithdrawals).toBe(17000);
    expect(stats.currentBalance).toBe(8000);
    expect(stats.budget).toBe(20000);
    expect(stats.budgetUsagePercent).toBe(85); // 17000 / 20000 * 100
    expect(stats.status).toBe("warning"); // >= 80%
    expect(stats.remainingBudget).toBe(3000);
  });

  it("calculates per-member spending and contributions", () => {
    const members = calculateMemberSpending(mockExpenses);
    expect(members.length).toBe(2);

    const alice = members.find((m) => m.userId === "user_alice");
    expect(alice?.totalDeposited).toBe(15000);
    expect(alice?.totalWithdrawn).toBe(12000);
    expect(alice?.netContribution).toBe(3000);

    const bob = members.find((m) => m.userId === "user_bob");
    expect(bob?.totalDeposited).toBe(10000);
    expect(bob?.totalWithdrawn).toBe(5000);
    expect(bob?.netContribution).toBe(5000);
  });
});
