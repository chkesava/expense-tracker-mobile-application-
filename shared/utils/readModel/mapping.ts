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
export type TableSpec = { table: string; collection: string; fields: FieldSpec[]; derivedMonth?: boolean };

const f = (column: string, source: string, type: FieldType): FieldSpec => ({ column, source, type });

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
];

export const SPEC_BY_COLLECTION = new Map(READ_MODEL_TABLES.map((s) => [s.collection, s]));

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
export function mapDocumentWithReason(spec: TableSpec, uid: string, source: SourceDoc): { row: ReadModelRow; reason?: string } {
  const base: ReadModelRow = {
    uid,
    doc_id: source.id,
    doc: toJsonDoc(source.data),
    source_path: `users/${uid}/${spec.collection}/${source.id}`,
    source_update_time: toTimestampOrThrow(source.updateTime),
    schema_version: 1,
    mapping_status: "mapped",
  };
  const typed: Record<string, unknown> = {};
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
      row: { ...base, ...nulls, ...(spec.derivedMonth ? { month: null } : {}), mapping_status: "unmapped" },
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
