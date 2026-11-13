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
 * Total budgeted across every vault, and how many there are. A true
 * cross-vault savings *balance* needs each vault's own deposits/withdrawals
 * (`calculateVaultStats`), which only has a per-vault listener
 * (`useVaultExpenses(vaultId)`) — fanning that out to every vault for a
 * dashboard summary would mean one new Firestore listener per vault, so the
 * dashboard's Vaults summary card shows the budgeted total instead, which is
 * already on the one `useVaults()` listener it already needs for the count.
 */
export function totalVaultBudgets(vaults: SharedVault[]): { totalBudget: number; vaultCount: number } {
  return {
    totalBudget: roundMoney(vaults.reduce((sum, vault) => sum + (vault.budget || 0), 0)),
    vaultCount: vaults.length,
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
