export interface VaultExpense {
  id?: string;
  vaultId: string;
  amount: number;
  type: "deposit" | "withdrawal";
  category?: string;
  note?: string;
  date: string; // YYYY-MM-DD
  createdBy: string;
  createdByName?: string;
  createdAt?: any;
}
