import { monthKeyOf } from "../dates";

/**
 * SPENDLY-506 — Firestore document → read-model row (supabase-readmodel
 * migration 20261017000000). Pure: no Firebase or React Native imports.
 *
 * Every row carries the sync contract columns and `doc`, the whole source
 * document as JSON, so no field is ever lost. The typed columns exist only for
 * fields the planned reads filter or sum on (ADR §9):
 * - money: finite numbers (or numeric strings), |x| < 1e16, stored as
 *   numeric(18,2) by Postgres;
 * - dates: real calendar `YYYY-MM-DD` (an ISO datetime keeps its date part);
 * - timestamps: Firestore Timestamp, `{seconds,nanoseconds}`, ISO string,
 *   epoch ms or Date → ISO;
 * - `month`: the row's `month`, else the `date` prefix (`monthKeyOf`).
 *
 * A present value that can't be converted makes the row `unmapped`: every
 * typed column is null and `doc` keeps the data. Nothing is dropped.
 */

// `decimal` (SPENDLY-590): quantities, prices, NAVs and rates, numeric(24,8).
export type FieldType = "text" | "money" | "decimal" | "date" | "timestamp" | "boolean" | "integer";
export type FieldSpec = { column: string; source: string; type: FieldType };
/**
 * `parent` (SPENDLY-591): a collection nested under each document of another,
 * e.g. users/{uid}/watchlists/{listId}/items/{itemId}. Its `collection` is the
 * logical key `"watchlists/items"`; its read-model doc_id is `"{listId}/{itemId}"`
 * (Firestore ids never contain "/"), and the parent id gets its own column.
 */
export type ParentSpec = { collection: string; child: string; column: string };
/**
 * `root` (SPENDLY-591): the `users/{uid}` document itself, one row per user
 * under a fixed doc_id. Only `docKeys` are copied (into the typed columns and
 * `doc` alike): an allowlist, so a new field (a PIN, a lock flag, identity)
 * stays out until someone adds it on purpose. `flattenNested` overlays a legacy
 * nested map first, top-level fields winning, as the app's own merge does.
 */
export type RootSpec = { docId: string; docKeys: readonly string[]; flattenNested?: string };
export type TableSpec = {
  table: string;
  collection: string;
  fields: FieldSpec[];
  derivedMonth?: boolean;
  parent?: ParentSpec;
  root?: RootSpec;
  /**
   * Documents of this collection that are never copied (SPENDLY-592: the
   * retired `financialSummaries/netWorth` and `/investments`, which nothing
   * reads and which disagree with what the app shows). Skipped by the sync,
   * the push, the client outbox and verify.
   */
  excludeDocIds?: readonly string[];
};

const f = (column: string, source: string, type: FieldType): FieldSpec => ({ column, source, type });

/**
 * SPENDLY-681 — how the changed-only sync finds a collection's new and
 * changed documents. Every collection is queried on the Firestore Timestamps
 * `createdAt` and `updatedAt` (R1.2). Collections whose writers stamp a
 * millisecond number or an event time instead (or as well) add those fields
 * here, so a change the app's own dual write missed is still found the next
 * night, not only by the Sunday full pass.
 *
 * A field a collection doesn't carry costs one read per run (a query's
 * minimum), so these lists may over-cover. Each field needs a
 * collection-group single-field index (firestore.indexes.json).
 */
export type ChangeField = { field: string; type: "timestamp" | "millis" };

export const DEFAULT_CHANGE_FIELDS: readonly ChangeField[] = [
  { field: "createdAt", type: "timestamp" },
  { field: "updatedAt", type: "timestamp" },
];

const ms = (field: string): ChangeField => ({ field, type: "millis" });
const ts = (field: string): ChangeField => ({ field, type: "timestamp" });

export const EXTRA_CHANGE_FIELDS: Readonly<Record<string, readonly ChangeField[]>> = {
  financialGoals: [ms("createdAtMs"), ms("updatedAtMs")],
  goalEvents: [ms("createdAtMs")],
  groupFunds: [ms("createdAtMs")],
  groupFundEvents: [ms("createdAtMs")],
  goalFundingPlans: [ms("createdAtMs"), ms("updatedAtMs")],
  decisions: [ms("createdAtMs"), ms("updatedAtMs")],
  calendarReminders: [ms("createdAtMs"), ms("updatedAtMs")],
  feeReviews: [ms("createdAtMs"), ms("updatedAtMs")],
  feeSignalDismissals: [ms("atMs")],
  merchantOverrides: [ms("createdAtMs"), ms("updatedAtMs")],
  runwaySettings: [ms("updatedAtMs")],
  runwayOverrides: [ms("updatedAtMs")],
  whatIfScenarios: [ms("createdAtMs"), ms("updatedAtMs")],
  netWorthHistory: [ms("createdAtMs"), ms("updatedAtMs")],
  epfWageHistory: [ms("createdAtMs")],
  epfContributionEvents: [ts("at")],
  epfTransferEvents: [ts("at")],
  recurringDismissals: [ts("dismissedAt")],
};

/** The fields the changed-only sync queries for this collection. */
export function changeFieldsOf(spec: Pick<TableSpec, "collection">): readonly ChangeField[] {
  return [...DEFAULT_CHANGE_FIELDS, ...(EXTRA_CHANGE_FIELDS[spec.collection] ?? [])];
}

export const READ_MODEL_TABLES: TableSpec[] = [
  {
    table: "expenses",
    collection: "expenses",
    derivedMonth: true,
    fields: [
      f("amount", "amount", "money"),
      f("date", "date", "date"),
      f("category", "category", "text"),
      f("subcategory", "subcategory", "text"),
      f("account_id", "accountId", "text"),
      f("credit_card_bill_id", "creditCardBillId", "text"),
      f("subscription_id", "subscriptionId", "text"),
      f("soft_deleted_at", "deletedAt", "timestamp"),
    ],
  },
  {
    table: "incomes",
    collection: "incomes",
    derivedMonth: true,
    fields: [
      f("amount", "amount", "money"),
      f("date", "date", "date"),
      f("source", "source", "text"),
      f("account_id", "accountId", "text"),
      f("soft_deleted_at", "deletedAt", "timestamp"),
    ],
  },
  {
    table: "ledger_events",
    collection: "ledgerEvents",
    fields: [
      f("kind", "kind", "text"),
      f("action", "action", "text"),
      f("target_doc_id", "docId", "text"),
      f("created_at", "createdAt", "timestamp"),
    ],
  },
  {
    table: "accounts",
    collection: "accounts",
    fields: [
      f("name", "name", "text"),
      f("type_id", "typeId", "text"),
      f("currency", "currency", "text"),
      f("opening_balance", "openingBalance", "money"),
      f("balance_as_of_date", "balanceAsOfDate", "date"),
      f("balance_initialized", "balanceInitialized", "boolean"),
      f("credit_limit", "creditLimit", "money"),
      f("bill_generation_day", "billGenerationDay", "integer"),
      f("current_balance", "currentBalance", "money"),
      f("current_outstanding", "currentOutstanding", "money"),
      f("statement_due", "statementDue", "money"),
      f("unbilled_spend", "unbilledSpend", "money"),
      f("balance_reconciliation_status", "balanceReconciliationStatus", "text"),
    ],
  },
  { table: "account_types", collection: "accountTypes", fields: [f("name", "name", "text")] },
  {
    table: "account_transfers",
    collection: "accountTransfers",
    derivedMonth: true,
    fields: [
      f("from_account_id", "fromAccountId", "text"),
      f("to_account_id", "toAccountId", "text"),
      f("amount", "amount", "money"),
      f("date", "date", "date"),
      f("subscription_id", "subscriptionId", "text"),
    ],
  },
  {
    table: "account_entries",
    collection: "accountEntries",
    fields: [
      f("account_id", "accountId", "text"),
      f("amount", "amount", "money"),
      f("direction", "direction", "text"),
      f("date", "date", "date"),
      f("transfer_id", "transferId", "text"),
      f("source", "source", "text"),
    ],
  },
  {
    table: "account_payments",
    collection: "accountPayments",
    fields: [
      f("from_account_id", "fromAccountId", "text"),
      f("to_account_id", "toAccountId", "text"),
      f("amount", "amount", "money"),
      f("date", "date", "date"),
      f("credit_card_bill_id", "creditCardBillId", "text"),
      f("bill_applied_amount", "billAppliedAmount", "money"),
      f("cashback_kind", "cashbackKind", "text"),
      f("source_type", "sourceType", "text"),
      f("voided_at", "voidedAt", "timestamp"),
    ],
  },
  {
    table: "credit_card_bills",
    collection: "creditCardBills",
    fields: [
      f("account_id", "accountId", "text"),
      f("billing_period_start", "billingPeriodStart", "date"),
      f("billing_period_end", "billingPeriodEnd", "date"),
      f("statement_date", "statementDate", "date"),
      f("due_date", "dueDate", "date"),
      f("statement_amount", "statementAmount", "money"),
      f("minimum_due_amount", "minimumDueAmount", "money"),
      f("amount_paid", "amountPaid", "money"),
      f("remaining_amount", "remainingAmount", "money"),
      f("currency", "currency", "text"),
      f("status", "status", "text"),
    ],
  },
  {
    table: "categories",
    collection: "categories",
    fields: [
      f("name", "name", "text"),
      f("kind", "kind", "text"),
      f("parent_id", "parentId", "text"),
      f("semantic_key", "semanticKey", "text"),
      f("is_default", "isDefault", "boolean"),
      f("is_archived", "isArchived", "boolean"),
      f("is_hidden", "isHidden", "boolean"),
      f("sort_order", "sortOrder", "integer"),
    ],
  },
  // SPENDLY-609 (Save Goals, migration 20261029000000). `current_amount` is for
  // parity only — a goal's saved amount is current-state money and is always
  // read from Firestore (READ_MODEL_RULES R4).
  {
    table: "financial_goals",
    collection: "financialGoals",
    fields: [
      f("name", "name", "text"),
      f("status", "status", "text"),
      f("target_amount", "targetAmount", "money"),
      f("current_amount", "currentAmount", "money"),
      f("deadline", "deadline", "date"),
      f("created_at", "createdAtMs", "timestamp"),
      f("pinned", "pinned", "boolean"),
    ],
  },
  {
    table: "goal_events",
    collection: "goalEvents",
    fields: [
      f("goal_id", "goalId", "text"),
      f("type", "type", "text"),
      f("amount_delta", "amountDelta", "money"),
      f("reason", "reason", "text"),
      f("correction_of", "correctionOf", "text"),
      f("created_at", "createdAtMs", "timestamp"),
    ],
  },
  // SPENDLY-589 Wave 2 (migration 20261031000000). The stored totals are
  // copies of Firestore's values (R4.1), never recomputed for display.
  {
    table: "borrowings",
    collection: "borrowings",
    fields: [
      f("lender_type", "lenderType", "text"),
      f("lender_name", "lenderName", "text"),
      f("principal_amount", "principalAmount", "money"),
      f("borrowed_date", "borrowedDate", "date"),
      f("due_date", "dueDate", "date"),
      f("credited_account_id", "creditedAccountId", "text"),
      f("outstanding_principal", "outstandingPrincipal", "money"),
      f("total_outstanding", "totalOutstanding", "money"),
      f("total_paid", "totalPaid", "money"),
      f("status", "status", "text"),
      f("settled_date", "settledDate", "date"),
    ],
  },
  {
    table: "borrowing_repayments",
    collection: "borrowingRepayments",
    derivedMonth: true,
    fields: [
      f("borrowing_id", "borrowingId", "text"),
      f("amount", "amount", "money"),
      f("principal_component", "principalComponent", "money"),
      f("interest_component", "interestComponent", "money"),
      f("payment_account_id", "paymentAccountId", "text"),
      f("date", "date", "date"),
    ],
  },
  // SPENDLY-668: `sourceMode` "already_deducted" has no `sourceAccountId`;
  // a missing `sourceMode` (legacy) means "account".
  {
    table: "receivables",
    collection: "receivables",
    fields: [
      f("person_type", "personType", "text"),
      f("person_name", "personName", "text"),
      f("original_amount", "originalAmount", "money"),
      f("lent_date", "lentDate", "date"),
      f("due_date", "dueDate", "date"),
      f("source_account_id", "sourceAccountId", "text"),
      f("source_mode", "sourceMode", "text"),
      f("space_id", "spaceId", "text"),
      f("total_received", "totalReceived", "money"),
      f("outstanding_amount", "outstandingAmount", "money"),
      f("status", "status", "text"),
      f("settled_date", "settledDate", "date"),
    ],
  },
  {
    table: "receivable_repayments",
    collection: "receivableRepayments",
    derivedMonth: true,
    fields: [
      f("receivable_id", "receivableId", "text"),
      f("amount", "amount", "money"),
      f("principal_component", "principalComponent", "money"),
      f("interest_component", "interestComponent", "money"),
      f("received_account_id", "receivedAccountId", "text"),
      f("date", "date", "date"),
    ],
  },
  {
    table: "subscriptions",
    collection: "subscriptions",
    fields: [
      f("name", "name", "text"),
      f("amount", "amount", "money"),
      f("category", "category", "text"),
      f("type", "type", "text"),
      f("frequency", "frequency", "text"),
      f("day_of_month", "dayOfMonth", "integer"),
      f("is_active", "isActive", "boolean"),
      f("is_completed", "isCompleted", "boolean"),
      f("account_id", "accountId", "text"),
      f("to_account_id", "toAccountId", "text"),
      f("last_processed", "lastProcessed", "text"),
    ],
  },
  // SPENDLY-590 Wave 3 (migration 20261101000000). Stored values are copies
  // (R4.1); quantities, prices, NAVs and rates are `decimal` (numeric(24,8)).
  {
    table: "investments",
    collection: "investments",
    fields: [
      f("name", "name", "text"),
      f("kind", "kind", "text"),
      f("principal", "principal", "money"),
      f("start_date", "startDate", "date"),
      f("annual_interest_rate", "annualInterestRate", "decimal"),
      f("maturity_date", "maturityDate", "date"),
      f("linked_account_id", "linkedAccountId", "text"),
      f("units", "units", "decimal"),
      f("purchase_nav", "purchaseNav", "decimal"),
      f("current_nav", "currentNav", "decimal"),
      f("status", "status", "text"),
      f("closed_date", "closedDate", "date"),
    ],
  },
  {
    table: "holdings",
    collection: "holdings",
    fields: [
      f("profile_id", "profileId", "text"),
      f("symbol", "symbol", "text"),
      f("yahoo_symbol", "yahooSymbol", "text"),
      f("name", "name", "text"),
      f("exchange", "exchange", "text"),
      f("instrument_type", "instrumentType", "text"),
      f("quantity", "quantity", "decimal"),
      f("average_buy_price", "averageBuyPrice", "decimal"),
      f("date_purchased", "datePurchased", "date"),
    ],
  },
  {
    table: "portfolio_transactions",
    collection: "portfolioTransactions",
    fields: [
      f("holding_id", "holdingId", "text"),
      f("profile_id", "profileId", "text"),
      f("symbol", "symbol", "text"),
      f("type", "type", "text"),
      f("quantity", "quantity", "decimal"),
      f("price", "price", "decimal"),
      f("fees", "fees", "money"),
      f("date", "date", "date"),
      f("order_status", "orderStatus", "text"),
    ],
  },
  {
    table: "investment_cash_transactions",
    collection: "investmentCashTransactions",
    fields: [
      f("type", "type", "text"),
      f("amount", "amount", "money"),
      f("direction", "direction", "text"),
      f("date", "date", "date"),
      f("holding_id", "holdingId", "text"),
      f("symbol", "symbol", "text"),
      f("quantity", "quantity", "decimal"),
      f("price", "price", "decimal"),
      f("account_id", "accountId", "text"),
      f("account_entry_id", "accountEntryId", "text"),
      f("reverses_id", "reversesId", "text"),
      f("source", "source", "text"),
    ],
  },
  {
    table: "portfolio_settings",
    collection: "portfolioSettings",
    fields: [
      f("initial_investment_amount", "initialInvestmentAmount", "money"),
      f("cash_balance", "cashBalance", "money"),
      f("has_existing_holdings", "hasExistingHoldings", "boolean"),
      f("onboarding_complete", "onboardingComplete", "boolean"),
    ],
  },
  {
    table: "epf_profile",
    collection: "epfProfile",
    fields: [
      f("active_establishment_id", "activeEstablishmentId", "text"),
    ],
  },
  {
    table: "epf_establishments",
    collection: "epfEstablishments",
    fields: [
      f("profile_id", "profileId", "text"),
      f("employer_name", "employerName", "text"),
      f("date_joined", "dateJoined", "date"),
      f("date_left", "dateLeft", "date"),
      f("employment_status", "employmentStatus", "text"),
      f("archived", "archived", "boolean"),
      f("eps_member", "epsMember", "boolean"),
    ],
  },
  {
    table: "epf_contributions",
    collection: "epfContributions",
    fields: [
      f("establishment_id", "establishmentId", "text"),
      f("month", "month", "text"),
      f("wage", "wage", "money"),
      f("employee_share", "employeeShare", "money"),
      f("employer_share", "employerShare", "money"),
      f("eps_share", "epsShare", "money"),
      f("employer_epf_share", "employerEpfShare", "money"),
      f("total_contribution", "totalContribution", "money"),
      f("epf_credit", "epfCredit", "money"),
      f("status", "status", "text"),
      f("source", "source", "text"),
      f("eps_eligible", "epsEligible", "boolean"),
      f("credit_date", "creditDate", "date"),
      f("credited_amount", "creditedAmount", "money"),
    ],
  },
  {
    table: "epf_contribution_events",
    collection: "epfContributionEvents",
    fields: [
      f("contribution_id", "contributionId", "text"),
      f("establishment_id", "establishmentId", "text"),
      f("month", "month", "text"),
      f("from_status", "from", "text"),
      f("to_status", "to", "text"),
      f("amount", "amount", "money"),
      f("actor", "actor", "text"),
      f("at", "at", "timestamp"),
    ],
  },
  {
    table: "epf_transfers",
    collection: "epfTransfers",
    fields: [
      f("source_establishment_id", "sourceEstablishmentId", "text"),
      f("destination_establishment_id", "destinationEstablishmentId", "text"),
      f("amount", "amount", "money"),
      f("date", "date", "date"),
      f("status", "status", "text"),
      f("reversal_of", "reversalOf", "text"),
      f("reversed_by", "reversedBy", "text"),
    ],
  },
  {
    table: "epf_transfer_events",
    collection: "epfTransferEvents",
    fields: [
      f("transfer_id", "transferId", "text"),
      f("from_status", "from", "text"),
      f("to_status", "to", "text"),
      f("amount", "amount", "money"),
      f("actor", "actor", "text"),
      f("at", "at", "timestamp"),
    ],
  },
  {
    table: "epf_interest_entries",
    collection: "epfInterestEntries",
    fields: [
      f("establishment_id", "establishmentId", "text"),
      f("financial_year", "financialYear", "text"),
      f("rate", "rate", "decimal"),
      f("basis", "basis", "text"),
      f("opening_balance", "openingBalance", "money"),
      f("interest", "interest", "money"),
      f("closing_balance", "closingBalance", "money"),
    ],
  },
  {
    table: "epf_reconciliations",
    collection: "epfReconciliations",
    fields: [
      f("establishment_id", "establishmentId", "text"),
      f("date", "date", "date"),
      f("actual_balance", "actualBalance", "money"),
      f("calculated_balance", "calculatedBalance", "money"),
      f("adjustment_amount", "adjustmentAmount", "money"),
    ],
  },
  {
    table: "epf_wage_history",
    collection: "epfWageHistory",
    fields: [
      f("establishment_id", "establishmentId", "text"),
      f("effective_from_month", "effectiveFromMonth", "text"),
      f("wage", "wage", "money"),
      f("eps_eligible", "epsEligible", "boolean"),
      f("created_at", "createdAtMs", "timestamp"),
    ],
  },
  // SPENDLY-591 part A (migration 20261102000000): the remaining flat collections.
  // Stored values are copies (R4.1); arrays and maps stay in `doc`.
  {
    table: "category_budgets",
    collection: "categoryBudgets",
    fields: [
      f("category", "category", "text"),
      f("subcategory", "subcategory", "text"),
      f("amount", "amount", "money"),
      f("month", "month", "text"),
      f("created_at", "createdAt", "timestamp"),
    ],
  },
  {
    table: "decisions",
    collection: "decisions",
    fields: [
      f("title", "title", "text"),
      f("category", "category", "text"),
      f("status", "status", "text"),
      f("archived_from_status", "archivedFromStatus", "text"),
      f("template_id", "templateId", "text"),
      f("template_version", "templateVersion", "integer"),
      f("review_date", "reviewDate", "date"),
      f("confidence", "confidence", "integer"),
      f("selected_alternative_id", "selectedAlternativeId", "text"),
      f("revision", "revision", "integer"),
      f("created_at", "createdAtMs", "timestamp"),
      f("updated_at", "updatedAtMs", "timestamp"),
      f("decided_at", "decidedAtMs", "timestamp"),
      f("closed_at", "closedAtMs", "timestamp"),
    ],
  },
  {
    table: "calendar_reminders",
    collection: "calendarReminders",
    fields: [
      f("title", "title", "text"),
      f("category", "category", "text"),
      f("recurrence", "recurrence", "text"),
      f("start_date", "startDate", "date"),
      f("until_date", "untilDate", "date"),
      f("reminder_time", "time", "text"),
      f("estimated_amount", "estimatedAmount", "money"),
      f("interval_days", "intervalDays", "integer"),
      f("remind_days_before", "remindDaysBefore", "integer"),
      f("created_at", "createdAtMs", "timestamp"),
      f("updated_at", "updatedAtMs", "timestamp"),
    ],
  },
  {
    table: "fee_reviews",
    collection: "feeReviews",
    fields: [
      f("source_kind", "sourceKind", "text"),
      f("source_id", "sourceId", "text"),
      f("decision", "decision", "text"),
      f("role", "role", "text"),
      f("fee_type", "feeType", "text"),
      f("subtype", "subtype", "text"),
      f("linked_kind", "linkedKind", "text"),
      f("linked_id", "linkedId", "text"),
      f("source_amount", "sourceAmount", "money"),
      f("inferred_confidence", "inferredConfidence", "decimal"),
      f("engine_version", "engineVersion", "integer"),
      f("revision", "revision", "integer"),
      f("created_at", "createdAtMs", "timestamp"),
      f("updated_at", "updatedAtMs", "timestamp"),
    ],
  },
  {
    table: "fee_signal_dismissals",
    collection: "feeSignalDismissals",
    fields: [
      f("kind", "kind", "text"),
      f("resolution", "resolution", "text"),
      f("at", "atMs", "timestamp"),
    ],
  },
  {
    table: "merchant_overrides",
    collection: "merchantOverrides",
    fields: [
      f("kind", "kind", "text"),
      f("ref_key", "refKey", "text"),
      f("merchant_id", "merchantId", "text"),
      f("custom_name", "customName", "text"),
      f("rejected", "rejected", "boolean"),
      f("category", "category", "text"),
      f("subcategory", "subcategory", "text"),
      f("created_at", "createdAtMs", "timestamp"),
      f("updated_at", "updatedAtMs", "timestamp"),
    ],
  },
  {
    table: "recurring_dismissals",
    collection: "recurringDismissals",
    fields: [
      f("merchant_key", "merchantKey", "text"),
      f("reason", "reason", "text"),
      f("dismissed_at", "dismissedAt", "timestamp"),
    ],
  },
  {
    table: "spaces",
    collection: "spaces",
    fields: [
      f("name", "name", "text"),
      f("description", "description", "text"),
      f("color", "color", "text"),
      f("icon", "icon", "text"),
      f("budget", "budget", "money"),
      f("start_date", "startDate", "date"),
      f("end_date", "endDate", "date"),
      f("status", "status", "text"),
      f("created_at", "createdAt", "timestamp"),
      f("updated_at", "updatedAt", "timestamp"),
    ],
  },
  {
    table: "categorization_rules",
    collection: "categorizationRules",
    fields: [
      f("keyword", "keyword", "text"),
      f("category", "category", "text"),
      f("subcategory", "subcategory", "text"),
      f("created_at", "createdAt", "timestamp"),
    ],
  },
  {
    table: "trips",
    collection: "trips",
    fields: [
      f("destination", "destination", "text"),
      f("trip_name", "tripName", "text"),
      f("start_date", "startDate", "text"),
      f("end_date", "endDate", "text"),
      f("total_budget", "totalBudget", "money"),
      f("spent_amount", "spentAmount", "money"),
      f("status", "status", "text"),
      f("created_at", "createdAt", "timestamp"),
    ],
  },
  {
    table: "runway_settings",
    collection: "runwaySettings",
    fields: [
      f("mode", "mode", "text"),
      f("threshold_kind", "thresholdKind", "text"),
      f("threshold_amount", "thresholdAmount", "money"),
      f("threshold_months", "thresholdMonths", "decimal"),
      f("window_months", "windowMonths", "integer"),
      f("method", "method", "text"),
      f("include_unusual", "includeUnusual", "boolean"),
      f("projection_months", "projectionMonths", "integer"),
      f("updated_at", "updatedAtMs", "timestamp"),
    ],
  },
  {
    table: "runway_overrides",
    collection: "runwayOverrides",
    fields: [
      f("kind", "kind", "text"),
      f("ref_id", "refId", "text"),
      f("included", "included", "boolean"),
      f("updated_at", "updatedAtMs", "timestamp"),
    ],
  },
  {
    table: "what_if_scenarios",
    collection: "whatIfScenarios",
    fields: [
      f("name", "name", "text"),
      f("version", "version", "integer"),
      f("engine_version", "engineVersion", "integer"),
      f("duration_months", "durationMonths", "integer"),
      f("archived", "archived", "boolean"),
      f("created_at", "createdAtMs", "timestamp"),
      f("updated_at", "updatedAtMs", "timestamp"),
    ],
  },
  {
    table: "goal_funding_plans",
    collection: "goalFundingPlans",
    fields: [
      f("name", "name", "text"),
      f("mode", "mode", "text"),
      f("planned_monthly", "plannedMonthly", "money"),
      f("allow_over_allocation", "allowOverAllocation", "boolean"),
      f("engine_version", "engineVersion", "integer"),
      f("archived", "archived", "boolean"),
      f("created_at", "createdAtMs", "timestamp"),
      f("updated_at", "updatedAtMs", "timestamp"),
    ],
  },
  {
    table: "sip_plans",
    collection: "sipPlans",
    fields: [
      f("asset_type", "assetType", "text"),
      f("symbol", "symbol", "text"),
      f("quote_key", "quoteKey", "text"),
      f("asset_name", "assetName", "text"),
      f("currency", "currency", "text"),
      f("frequency", "frequency", "text"),
      f("status", "status", "text"),
      f("investment_amount", "investmentAmount", "money"),
      f("total_invested", "totalInvested", "money"),
      f("total_units", "totalUnits", "decimal"),
      f("execution_day", "executionDay", "integer"),
      f("execution_count", "executionCount", "integer"),
      f("start_date", "startDate", "text"),
      f("end_date", "endDate", "text"),
      f("next_execution_date", "nextExecutionDate", "text"),
      f("last_execution_date", "lastExecutionDate", "text"),
      f("skip_next_execution", "skipNextExecution", "boolean"),
      f("created_at", "createdAt", "timestamp"),
      f("updated_at", "updatedAt", "timestamp"),
    ],
  },
  {
    table: "sip_transactions",
    collection: "sipTransactions",
    fields: [
      f("sip_id", "sipId", "text"),
      f("date", "date", "date"),
      f("asset_type", "assetType", "text"),
      f("symbol", "symbol", "text"),
      f("quote_key", "quoteKey", "text"),
      f("asset_name", "assetName", "text"),
      f("market_price", "marketPrice", "decimal"),
      f("investment_amount", "investmentAmount", "money"),
      f("units_purchased", "unitsPurchased", "decimal"),
      f("total_units_after_purchase", "totalUnitsAfterPurchase", "decimal"),
      f("average_buy_price_after", "averageBuyPriceAfter", "decimal"),
      f("status", "status", "text"),
      f("created_at", "createdAt", "timestamp"),
    ],
  },
  {
    table: "virtual_positions",
    collection: "virtualPositions",
    fields: [
      f("asset_type", "assetType", "text"),
      f("symbol", "symbol", "text"),
      f("quote_key", "quoteKey", "text"),
      f("asset_name", "assetName", "text"),
      f("total_units", "totalUnits", "decimal"),
      f("average_buy_price", "averageBuyPrice", "decimal"),
      f("total_invested", "totalInvested", "money"),
      f("updated_at", "updatedAt", "timestamp"),
    ],
  },
  {
    table: "net_worth_history",
    collection: "netWorthHistory",
    fields: [
      f("month", "month", "text"),
      f("history_schema_version", "schemaVersion", "integer"),
      f("created_at", "createdAtMs", "timestamp"),
      f("updated_at", "updatedAtMs", "timestamp"),
    ],
  },
  {
    table: "watchlists",
    collection: "watchlists",
    fields: [
      f("name", "name", "text"),
      f("is_default", "isDefault", "boolean"),
      f("imported_legacy_at", "importedLegacyAt", "timestamp"),
      f("created_at", "createdAt", "timestamp"),
      f("updated_at", "updatedAt", "timestamp"),
    ],
  },
  // SPENDLY-592 (migration 20261103000000): Firestore's stored summaries,
  // copied exactly (R4.1): `dashboard_{YYYY-MM}` (month totals) and `epf`.
  // Never recomputed in SQL. The category map stays in `doc`.
  {
    table: "financial_summaries",
    collection: "financialSummaries",
    excludeDocIds: ["netWorth", "investments"],
    fields: [
      f("period", "period", "text"),
      f("total_expenses", "totalExpenses", "money"),
      f("total_income", "totalIncome", "money"),
      f("transaction_count", "transactionCount", "integer"),
      f("current_balance", "currentBalance", "money"),
      f("employee_contribution_total", "employeeContributionTotal", "money"),
      f("employer_contribution_total", "employerContributionTotal", "money"),
      f("interest_total", "interestTotal", "money"),
      f("adjustments_total", "adjustmentsTotal", "money"),
      f("last_credit_period", "lastCreditPeriod", "text"),
      f("summary_version", "summaryVersion", "integer"),
      f("calculated_at", "calculatedAt", "timestamp"),
    ],
  },
  // SPENDLY-591 part C (migration 20261102020000): the users/{uid} settings
  // document. Server push only (never rm_client_apply). NOT copied: the PIN and
  // lock fields (privacyPin, fakePin, lockPastMonths, lockOnInactivity,
  // inactivityTimeout, lockOnAppSwitch, ghostMode), `role`, and identity data
  // (username, avatar, email, displayName, photoURL, phone, upiId).
  {
    table: "user_settings",
    collection: "userSettings",
    root: {
      docId: "settings",
      flattenNested: "settings",
      docKeys: [
        "currency", "timezone", "language", "dateFormat", "numberFormat", "firstDayOfWeek",
        "theme", "themeMode", "expensePalette", "accentColor", "navigationStyle",
        "defaultCategory", "defaultView", "compactListMode", "hapticFeedback", "enableInvestments",
        "monthlyBudget", "monthly_budget", "exportYear",
        "dashboardWidgets", "dashboardOrder", "onboarding", "creditCardBillReminders", "calendarNotifications",
      ],
    },
    fields: [
      f("currency", "currency", "text"),
      f("timezone", "timezone", "text"),
      f("language", "language", "text"),
      f("theme", "theme", "text"),
      f("theme_mode", "themeMode", "text"),
      f("expense_palette", "expensePalette", "text"),
      f("accent_color", "accentColor", "text"),
      f("navigation_style", "navigationStyle", "text"),
      f("default_view", "defaultView", "text"),
      f("monthly_budget", "monthlyBudget", "money"),
      f("enable_investments", "enableInvestments", "boolean"),
      f("compact_list_mode", "compactListMode", "boolean"),
    ],
  },
  // SPENDLY-591 part B (migration 20261102010000): the first nested collection.
  {
    table: "watchlist_items",
    collection: "watchlists/items",
    parent: { collection: "watchlists", child: "items", column: "list_id" },
    fields: [
      f("symbol", "symbol", "text"),
      f("yahoo_symbol", "yahooSymbol", "text"),
      f("name", "name", "text"),
      f("exchange", "exchange", "text"),
      f("instrument_type", "instrumentType", "text"),
      // A fractional rank; `order` is reserved in SQL.
      f("sort_order", "order", "decimal"),
      f("created_at", "createdAt", "timestamp"),
      f("updated_at", "updatedAt", "timestamp"),
    ],
  },
  // SPENDLY-685 Group Funds (migration 20261106000000). The fund's stored
  // totals stay in `doc` as an exact copy (R4.1); SQL never sums the events.
  {
    table: "group_funds",
    collection: "groupFunds",
    fields: [
      f("name", "name", "text"),
      f("status", "status", "text"),
      f("version", "version", "integer"),
      f("created_at", "createdAtMs", "timestamp"),
    ],
  },
  {
    table: "group_fund_events",
    collection: "groupFundEvents",
    fields: [
      f("fund_id", "fundId", "text"),
      f("kind", "kind", "text"),
      f("amount", "amount", "money"),
      f("purpose_id", "purposeId", "text"),
      f("member_id", "memberId", "text"),
      f("date", "date", "date"),
      f("period", "period", "text"),
      f("reversal_of", "reversalOf", "text"),
      f("created_at", "createdAtMs", "timestamp"),
    ],
  },
];

export const SPEC_BY_COLLECTION = new Map(READ_MODEL_TABLES.map((s) => [s.collection, s]));

/** True when this document is one its collection never copies (SPENDLY-592). */
export function isExcludedDoc(spec: TableSpec, docId: string): boolean {
  return spec.excludeDocIds?.includes(docId) ?? false;
}

/** The parent document id of a nested row's doc_id ("{parentId}/{id}"), else null. */
export function parentIdOf(spec: TableSpec, docId: string): string | null {
  if (!spec.parent) return null;
  const parts = docId.split("/");
  return parts.length === 2 && parts[0] && parts[1] ? parts[0] : null;
}

/** A row's Firestore path: `users/{uid}/{collection}/{docId}`, the nested form, or `users/{uid}` (root). */
export function firestorePathOf(spec: TableSpec, uid: string, docId: string): string {
  if (spec.root) return `users/${uid}`;
  if (!spec.parent) return `users/${uid}/${spec.collection}/${docId}`;
  const [parentId, id] = docId.split("/");
  return `users/${uid}/${spec.parent.collection}/${parentId}/${spec.parent.child}/${id}`;
}

/** Thrown inside a converter; turns the row `unmapped`. */
class Unconvertible extends Error {}
/** Carries the source field that failed, for the failure record (SPENDLY-507). */
class FieldUnconvertible extends Error {
  constructor(readonly field: string, readonly type: FieldType) {
    super(`${field}: not a valid ${type}`);
  }
}
const bad = (): never => {
  throw new Unconvertible();
};

const isBlank = (v: unknown) => v === null || v === undefined || v === "";

/** Milliseconds since epoch for any timestamp shape, or null. */
export function timestampMillis(value: unknown): number | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown> & { toMillis?: () => number };
    if (typeof v.toMillis === "function") return v.toMillis();
    const seconds = typeof v.seconds === "number" ? v.seconds : v._seconds;
    const nanos = typeof v.nanoseconds === "number" ? v.nanoseconds : v._nanoseconds;
    if (typeof seconds === "number") return seconds * 1000 + Math.floor((typeof nanos === "number" ? nanos : 0) / 1e6);
  }
  return null;
}

function toTimestamp(value: unknown): string {
  const ms = timestampMillis(value);
  // Years 1000–9999 only: anything else is a corrupt value, not a date.
  if (ms === null || ms < -30610224000000 || ms > 253402300799999) return bad();
  return new Date(ms).toISOString();
}

function toDate(value: unknown): string {
  if (typeof value !== "string") return bad();
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || (value.length > 10 && value[10] !== "T")) return bad();
  const d = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== day) return bad();
  return day;
}

function toMoney(value: unknown): number {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || Math.abs(n) >= 1e16) return bad();
  return n;
}

function toInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || Math.abs(value) > 2147483647) return bad();
  return value;
}

function convert(type: FieldType, value: unknown): string | number | boolean {
  switch (type) {
    case "text":
      return typeof value === "string" ? value : bad();
    case "money":
    case "decimal":
      return toMoney(value);
    case "date":
      return toDate(value);
    case "timestamp":
      return toTimestamp(value);
    case "boolean":
      return typeof value === "boolean" ? value : bad();
    case "integer":
      return toInteger(value);
  }
}

/** The source document as plain JSON: timestamps → ISO, refs → path, no NaN. */
export function toJsonDoc(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  if (Array.isArray(value)) return value.map(toJsonDoc);
  if (typeof value === "object") {
    const v = value as Record<string, unknown> & { toMillis?: () => number; path?: unknown; toBase64?: () => string };
    if (typeof v.toMillis === "function") return new Date(v.toMillis()).toISOString();
    if (typeof v.toBase64 === "function") return v.toBase64();
    if (typeof v.path === "string" && typeof (v as { firestore?: unknown }).firestore === "object") return v.path;
    if (typeof v.latitude === "number" && typeof v.longitude === "number" && Object.keys(v).length <= 2) {
      return { latitude: v.latitude, longitude: v.longitude };
    }
    return Object.fromEntries(Object.entries(v).map(([k, inner]) => [k, toJsonDoc(inner)]));
  }
  return null;
}

export type SourceDoc = { id: string; data: Record<string, unknown>; updateTime: unknown };
export type ReadModelRow = Record<string, unknown> & {
  uid: string;
  doc_id: string;
  source_path: string;
  source_update_time: string;
  mapping_status: "mapped" | "unmapped";
};

export function mapDocument(spec: TableSpec, uid: string, source: SourceDoc): ReadModelRow {
  return mapDocumentWithReason(spec, uid, source).row;
}

/** As mapDocument, plus why a row is unmapped (the failing field; never its value). */
/** A root document's copyable fields: the legacy nested map overlaid, then the allowlist. */
export function rootDocData(root: RootSpec, data: Record<string, unknown>): Record<string, unknown> {
  const nested = root.flattenNested ? data[root.flattenNested] : undefined;
  const merged =
    nested && typeof nested === "object" && !Array.isArray(nested) ? { ...(nested as Record<string, unknown>), ...data } : data;
  const out: Record<string, unknown> = {};
  for (const key of root.docKeys) if (merged[key] !== undefined) out[key] = merged[key];
  return out;
}

export function mapDocumentWithReason(spec: TableSpec, uid: string, input: SourceDoc): { row: ReadModelRow; reason?: string } {
  // A root document keeps only its allowlisted fields, everywhere (R2, SPENDLY-591).
  const source: SourceDoc = spec.root ? { ...input, id: spec.root.docId, data: rootDocData(spec.root, input.data) } : input;
  const base: ReadModelRow = {
    uid,
    doc_id: source.id,
    doc: toJsonDoc(source.data),
    source_path: firestorePathOf(spec, uid, source.id),
    source_update_time: toTimestampOrThrow(source.updateTime),
    schema_version: 1,
    mapping_status: "mapped",
  };
  const typed: Record<string, unknown> = spec.parent ? { [spec.parent.column]: parentIdOf(spec, source.id) } : {};
  try {
    for (const field of spec.fields) {
      const value = source.data[field.source];
      try {
        typed[field.column] = isBlank(value) ? null : convert(field.type, value);
      } catch (error) {
        if (error instanceof Unconvertible) throw new FieldUnconvertible(field.source, field.type);
        throw error;
      }
    }
    if (spec.derivedMonth) {
      typed.month = monthKeyOf({
        month: typeof source.data.month === "string" ? source.data.month : undefined,
        date: typeof typed.date === "string" ? typed.date : undefined,
      }) ?? null;
    }
  } catch (error) {
    if (!(error instanceof FieldUnconvertible)) throw error;
    const nulls = Object.fromEntries(spec.fields.map((field) => [field.column, null]));
    return {
      // The parent id comes from the path, so it survives a bad field.
      row: { ...base, ...nulls, ...(spec.parent ? { [spec.parent.column]: parentIdOf(spec, source.id) } : {}), ...(spec.derivedMonth ? { month: null } : {}), mapping_status: "unmapped" },
      reason: error.message,
    };
  }
  return { row: { ...base, ...typed } };
}

/** The version guard must be real: a document without an updateTime is a bug. */
function toTimestampOrThrow(value: unknown): string {
  const ms = timestampMillis(value);
  if (ms === null) throw new Error("Source document has no updateTime");
  return new Date(ms).toISOString();
}
