import type { SharedVault, VaultStats, MemberSpending } from "@/shared/types/vault";
import type { VaultExpense } from "@/shared/types/vaultExpense";
import { roundMoney } from "@/shared/utils/money";

/**
 * Calculates financial statistics for a shared vault
 */
export function calculateVaultStats(
  vault: SharedVault,
  expenses: VaultExpense[]
): VaultStats {
  const totalDeposits = roundMoney(
    expenses
      .filter((e) => e.type === "deposit")
      .reduce((sum, e) => sum + e.amount, 0)
  );

  const totalWithdrawals = roundMoney(
    expenses
      .filter((e) => e.type === "withdrawal")
      .reduce((sum, e) => sum + e.amount, 0)
  );

  const currentBalance = roundMoney(totalDeposits - totalWithdrawals);
  const budget = vault.budget || 0;
  const budgetUsagePercent =
    budget > 0 ? Math.round((totalWithdrawals / budget) * 100) : 0;
  const remainingBudget = roundMoney(Math.max(0, budget - totalWithdrawals));

  let status: "healthy" | "warning" | "exceeded" = "healthy";
  if (budgetUsagePercent >= 100) {
    status = "exceeded";
  } else if (budgetUsagePercent >= 80) {
    status = "warning";
  }

  return {
    totalDeposits,
    totalWithdrawals,
    currentBalance,
    budget,
    budgetUsagePercent,
    remainingBudget,
    transactionCount: expenses.length,
    status,
  };
}

/**
 * Groups deposits & withdrawals by member
 */
export function calculateMemberSpending(
  expenses: VaultExpense[]
): MemberSpending[] {
  const map: Record<string, { deposited: number; withdrawn: number; name?: string }> = {};

  expenses.forEach((e) => {
    const uid = e.createdBy || "unknown";
    if (!map[uid]) {
      map[uid] = { deposited: 0, withdrawn: 0, name: e.createdByName };
    }
    if (e.type === "deposit") {
      map[uid].deposited += e.amount;
    } else {
      map[uid].withdrawn += e.amount;
    }
    if (e.createdByName && !map[uid].name) {
      map[uid].name = e.createdByName;
    }
  });

  return Object.entries(map).map(([userId, data]) => ({
    userId,
    userName: data.name,
    totalDeposited: roundMoney(data.deposited),
    totalWithdrawn: roundMoney(data.withdrawn),
    netContribution: roundMoney(data.deposited - data.withdrawn),
  }));
}
