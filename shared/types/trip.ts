export interface TripCategoryBudget {
  category: string;
  limit: number;
}

export interface Trip {
  id?: string;
  userId: string;
  destination: string;
  tripName?: string;
  startDate: string; // ISO string
  endDate: string;   // ISO string
  totalBudget: number;
  spentAmount: number;
  status: "active" | "completed";
  createdAt: unknown;
  categoryBudgets?: TripCategoryBudget[];
}
