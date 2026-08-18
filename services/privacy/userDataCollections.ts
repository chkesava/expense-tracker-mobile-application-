/**
 * Known Firestore paths that hold a user's personal data.
 * Client SDKs cannot list subcollections — keep this in sync when adding collections.
 */

/** Direct subcollections of `users/{uid}`. */
export const USER_SUBCOLLECTIONS = [
  "accountEntries",
  "accountPayments",
  "accounts",
  "accountTransfers",
  "accountTypes",
  "alerts",
  "borrowingRepayments",
  "borrowings",
  "categories",
  "categorizationRules",
  "categoryBudgets",
  "creditCardBillReminderLogs",
  "creditCardBills",
  "expenses",
  "financialGoals",
  "focus",
  "goals",
  "holdings",
  "incomes",
  "investments",
  "meta",
  "notifications",
  "portfolioOrders",
  "portfolioSettings",
  "portfolioSnapshots",
  "portfolioTransactions",
  "profile",
  "receivableRepayments",
  "receivables",
  "sipPlans",
  "sipTransactions",
  "spaces",
  "stats",
  "subscriptions",
  "trips",
  "virtualPositions",
  "watchlist",
  "weight_history",
] as const;

/** Subcollections that themselves contain nested subcollections. */
export const USER_NESTED_COLLECTIONS: Array<{
  collection: string;
  nested: string;
}> = [{ collection: "daily_logs", nested: "meals" }];

export const SENSITIVE_USER_FIELD_KEYS = ["privacyPin", "fakePin"] as const;
