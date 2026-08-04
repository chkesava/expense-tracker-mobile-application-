export type VaultExpense = {
  id?: string;
  vaultId: string;
  amount: number;
  type: "deposit" | "withdrawal";
  note?: string;
  date: string; // YYYY-MM-DD
  createdAt?: unknown;
  createdBy: string;
};
