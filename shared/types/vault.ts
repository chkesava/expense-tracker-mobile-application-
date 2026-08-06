export interface SharedVault {
  id?: string;
  name: string;
  description?: string;
  budget: number;
  currency: string;
  memberIds: string[];
  ownerId: string;
  themeColor: string;
  createdAt?: any;
}

export interface VaultStats {
  totalDeposits: number;
  totalWithdrawals: number;
  currentBalance: number;
  budget: number;
  budgetUsagePercent: number;
  remainingBudget: number;
  transactionCount: number;
  status: "healthy" | "warning" | "exceeded";
}

export interface MemberSpending {
  userId: string;
  userName?: string;
  totalDeposited: number;
  totalWithdrawn: number;
  netContribution: number;
}
