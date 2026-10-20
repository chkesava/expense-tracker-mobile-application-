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

/**
 * Accent colours a user can pick for a vault. They are stored on the vault
 * (`themeColor`), so they are data, not theme styling: never retheme them.
 * The first is the default for a vault saved without one.
 */
export const VAULT_COLORS = [
  "#6366F1", // Indigo
  "#3B82F6", // Blue
  "#10B981", // Emerald
  "#F59E0B", // Amber
  "#EC4899", // Pink
  "#8B5CF6", // Purple
  "#06B6D4", // Cyan
  "#F97316", // Orange
] as const;

export const DEFAULT_VAULT_COLOR = VAULT_COLORS[0];

/** Marks drawn on a palette colour (the selected swatch's check): every one is mid-tone. */
export const VAULT_COLOR_INK = "#FFFFFF";
