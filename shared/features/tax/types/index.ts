/**
 * SPENDLY-289 — Tax & ITR Readiness data contract (epic SPENDLY-288).
 *
 * One canonical model for every tax screen. Design: docs/SPENDLY-289-tax-model.md.
 *
 * Two kinds of data, never mixed:
 *   - **Derived** items come from data Spendly already has (incomes, EPF, FD
 *     interest, portfolio sales). They are computed at runtime and never stored.
 *   - **Stored** documents hold only what the user says or supplies:
 *       `taxProfiles/{fy}`          per-year profile
 *       `taxEntries/{id}`           facts Spendly cannot know (Form 16, TDS, AIS…)
 *       `taxReviews/{fy}__{kind}__{id}` the user's decision about one derived item
 *       `taxDocuments/{id}`         document metadata (binary in `spendly-files`)
 *       `taxSnapshots/{fy}__{ms}`   frozen calculation, append-only
 *
 * A user's decision always wins over a derived value, and stays visible as an
 * override (`TaxLine.override`). Nothing writes the ledger: a manual tax income
 * is a tax fact, never a Spendly income, and never moves a balance.
 *
 * Every id list below is persisted: append only, never rename.
 */

export const TAX_SCHEMA_VERSION = 1;

/** "2025-26": April 2025 to March 2026. Same key as `shared/utils/financialYear.ts`. */
export type FinancialYearKey = string;

/** Which income-tax law governs a year. ITA2025 = Income-tax Act, 2025 (from 1 April 2026). */
export const TAX_LAWS = ["ITA1961", "ITA2025"] as const;
export type TaxLaw = (typeof TAX_LAWS)[number];

export interface TaxYear {
  fy: FinancialYearKey;
  law: TaxLaw;
  /** Assessment year under the 1961 Act; `null` under the 2025 Act ("tax year" only). */
  ay: FinancialYearKey | null;
  /** YYYY-MM-DD, inclusive. */
  startDate: string;
  endDate: string;
}

export const TAX_LIMITS = {
  /** Largest amount accepted anywhere (₹99.99 crore). Mirrored by firestore.rules. */
  maxAmount: 999_999_999.99,
  labelMax: 80,
  nameMax: 120,
  noteMax: 500,
  maxDocumentIds: 20,
  historyLimit: 20,
  maxEmployers: 10,
} as const;

// ---------------------------------------------------------------------------
// Provenance and states
// ---------------------------------------------------------------------------

/** Where a figure came from. Facts are `user_entered`/`document`/`spendly_derived`; `calculated` is never a fact. */
export const TAX_ORIGINS = ["spendly_derived", "user_entered", "document", "calculated"] as const;
export type TaxOrigin = (typeof TAX_ORIGINS)[number];

/** Source records a derived item or a review can point at. */
export const TAX_SOURCE_KINDS = [
  "income",
  "expense",
  "epf_contribution",
  "epf_interest",
  "investment",
  "portfolio_transaction",
  "sip_transaction",
  "tax_entry",
  /** A readiness checklist item (SPENDLY-296); `id` is the item id. */
  "checklist",
  /**
   * A TDS reconciliation row (SPENDLY-291); `id` is its match key. Only
   * `confirm` ("accept this difference"), with the difference accepted as
   * `sourceAmount`, so a different difference re-opens it.
   */
  "reconciliation",
] as const;
export type TaxSourceKind = (typeof TAX_SOURCE_KINDS)[number];

export interface TaxSourceRef {
  kind: TaxSourceKind;
  id: string;
}

export interface TaxProvenance {
  origin: TaxOrigin;
  /** Every figure belongs to exactly one year. */
  fy: FinancialYearKey;
  sourceRef?: TaxSourceRef;
  /** YYYY-MM-DD the source covers, when narrower than the year. */
  periodFrom?: string;
  periodTo?: string;
  /** Version of the derivation that produced a `spendly_derived` value. */
  engineVersion?: number;
  /** Tax rule version behind a `calculated` value (SPENDLY-295). */
  ruleVersion?: string;
  documentIds?: string[];
}

/** Readiness of one item. `missing` = no value at all; never filled with a guess. */
export const TAX_ITEM_STATES = [
  "missing",
  "pending",
  "matched",
  "needs_review",
  "user_confirmed",
] as const;
export type TaxItemState = (typeof TAX_ITEM_STATES)[number];

/** Checklist items can also be put off by the user (SPENDLY-296). */
export const TAX_CHECKLIST_STATES = [...TAX_ITEM_STATES, "deferred"] as const;
export type TaxChecklistState = (typeof TAX_CHECKLIST_STATES)[number];

// ---------------------------------------------------------------------------
// Income
// ---------------------------------------------------------------------------

/** Heads of income. Business/profession is modelled but not calculated in v1. */
export const TAX_INCOME_HEADS = [
  "salary",
  "house_property",
  "business_profession",
  "capital_gains",
  "other_sources",
] as const;
export type TaxIncomeHead = (typeof TAX_INCOME_HEADS)[number];

/** Income categories; each belongs to one head (`TAX_INCOME_CATEGORY_HEAD`) or to none. */
export const TAX_INCOME_CATEGORIES = [
  "salary",
  "pension",
  "rental",
  "interest_savings",
  "interest_deposit",
  "interest_other",
  "dividend",
  "professional",
  "business",
  "capital_gain",
  "gift",
  "other",
  /** Counted nowhere: refunds, reimbursements, transfers. */
  "not_income",
] as const;
export type TaxIncomeCategory = (typeof TAX_INCOME_CATEGORIES)[number];

// ---------------------------------------------------------------------------
// Stored: entries
// ---------------------------------------------------------------------------

export const TAX_ENTRY_KINDS = [
  "income",
  "form16",
  "tds",
  "ais_value",
  "deduction",
  "capital_gain",
  "tax_payment",
] as const;
export type TaxEntryKind = (typeof TAX_ENTRY_KINDS)[number];

export const TAX_STATEMENTS = ["AIS", "TIS", "26AS"] as const;
export type TaxStatement = (typeof TAX_STATEMENTS)[number];

/** What an AIS/TIS/26AS line reports. */
export const TAX_AIS_CATEGORIES = [
  "salary",
  "interest",
  "dividend",
  "rent",
  "securities_sale",
  "mutual_fund_sale",
  "tds",
  "tcs",
  "tax_paid",
  "other",
] as const;
export type TaxAisCategory = (typeof TAX_AIS_CATEGORIES)[number];

export const TAX_TDS_FORMS = ["16A", "16B", "16C", "other"] as const;
export type TaxTdsForm = (typeof TAX_TDS_FORMS)[number];

export const TAX_QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;
export type TaxQuarter = (typeof TAX_QUARTERS)[number];

export const TAX_PROOF_STATUSES = ["attached", "missing", "not_needed"] as const;
export type TaxProofStatus = (typeof TAX_PROOF_STATUSES)[number];

export const TAX_ASSET_CLASSES = [
  "listed_equity",
  "equity_mutual_fund",
  "debt_mutual_fund",
  "other_securities",
  "gold",
  "property",
  "virtual_digital_asset",
  "other",
] as const;
export type TaxAssetClass = (typeof TAX_ASSET_CLASSES)[number];

export const TAX_CAPITAL_GAIN_MODES = [
  /** One sale, with its own cost and dates. */
  "row",
  /** A broker/RTA statement total for one asset class; replaces derived rows of that class. */
  "statement_total",
] as const;
export type TaxCapitalGainMode = (typeof TAX_CAPITAL_GAIN_MODES)[number];

export const TAX_PAYMENT_TYPES = ["advance_tax", "self_assessment", "other"] as const;
export type TaxPaymentType = (typeof TAX_PAYMENT_TYPES)[number];

/** Payload per kind. Money is rupees with at most 2 decimals; `null` means "not known yet". */
export interface TaxIncomeFields {
  category: TaxIncomeCategory;
  amount: number;
  /** YYYY-MM-DD, inside the year. Optional for an annual total. */
  date?: string;
  payer?: string;
}

export interface TaxForm16Fields {
  employerName: string;
  /** Deductor TAN (AAAA99999A). Organisation id, masked in lists. */
  tan?: string;
  periodFrom?: string;
  periodTo?: string;
  grossSalary: number;
  exemptAllowances?: number | null;
  standardDeduction?: number | null;
  professionalTax?: number | null;
  taxableSalary?: number | null;
  tdsDeducted: number;
}

export interface TaxTdsFields {
  deductorName: string;
  tan?: string;
  /** TDS section as printed on the certificate, e.g. "194A". */
  section: string;
  form: TaxTdsForm;
  quarter?: TaxQuarter;
  /** Income paid or credited that the TDS was cut from. */
  amountPaid: number | null;
  tdsAmount: number;
}

export interface TaxAisValueFields {
  statement: TaxStatement;
  infoCategory: TaxAisCategory;
  sourceName?: string;
  tan?: string;
  section?: string;
  reportedAmount: number;
  tdsAmount?: number | null;
}

export interface TaxDeductionFields {
  /** Catalog id, versioned per tax year (SPENDLY-292), e.g. "life_insurance". */
  category: string;
  amount: number;
  proofStatus: TaxProofStatus;
  /** An existing Spendly record this claim is based on (linked, never copied). */
  sourceRef?: TaxSourceRef;
}

export interface TaxCapitalGainFields {
  mode: TaxCapitalGainMode;
  assetClass: TaxAssetClass;
  assetName: string;
  isin?: string;
  quantity?: number | null;
  acquiredDate?: string | null;
  /** Required for `row`; the last sale date for `statement_total`. */
  soldDate: string;
  costOfAcquisition: number | null;
  saleValue: number;
  transferExpenses?: number | null;
}

export interface TaxPaymentFields {
  paymentType: TaxPaymentType;
  date: string;
  amount: number;
  /** 7-digit BSR code of the receiving bank branch. */
  bsrCode?: string;
  /** 5-digit challan serial number. */
  challanSerial?: string;
  cin?: string;
}

export interface TaxEntryFieldsByKind {
  income: TaxIncomeFields;
  form16: TaxForm16Fields;
  tds: TaxTdsFields;
  ais_value: TaxAisValueFields;
  deduction: TaxDeductionFields;
  capital_gain: TaxCapitalGainFields;
  tax_payment: TaxPaymentFields;
}

/**
 * Every field each kind may store, in one list per kind. firestore.rules allow
 * exactly these (`hasOnly`), checked by the contract test (SPENDLY-709).
 */
export const TAX_ENTRY_FIELD_KEYS = {
  income: ["category", "amount", "date", "payer"],
  form16: [
    "employerName",
    "tan",
    "periodFrom",
    "periodTo",
    "grossSalary",
    "exemptAllowances",
    "standardDeduction",
    "professionalTax",
    "taxableSalary",
    "tdsDeducted",
  ],
  tds: ["deductorName", "tan", "section", "form", "quarter", "amountPaid", "tdsAmount"],
  ais_value: ["statement", "infoCategory", "sourceName", "tan", "section", "reportedAmount", "tdsAmount"],
  deduction: ["category", "amount", "proofStatus", "sourceRef"],
  capital_gain: [
    "mode",
    "assetClass",
    "assetName",
    "isin",
    "quantity",
    "acquiredDate",
    "soldDate",
    "costOfAcquisition",
    "saleValue",
    "transferExpenses",
  ],
  tax_payment: ["paymentType", "date", "amount", "bsrCode", "challanSerial", "cin"],
} as const satisfies { [K in TaxEntryKind]: readonly (keyof TaxEntryFieldsByKind[K])[] };

/** Compile-time check that no field of a kind is missing from its list above. */
type MissingFieldKeys = {
  [K in TaxEntryKind]: Exclude<keyof TaxEntryFieldsByKind[K], (typeof TAX_ENTRY_FIELD_KEYS)[K][number]>;
}[TaxEntryKind];
export const TAX_ENTRY_FIELD_KEYS_COMPLETE: [MissingFieldKeys] extends [never] ? true : never = true;

/** One earlier state of an entry: the previous values of the fields that changed. */
export interface TaxHistoryEntry {
  revision: number;
  atMs: number;
  fields: Record<string, string | number | boolean | null>;
}

interface TaxEntryEnvelope<K extends TaxEntryKind> {
  id: string;
  fy: FinancialYearKey;
  kind: K;
  fields: TaxEntryFieldsByKind[K];
  label?: string;
  note?: string;
  documentIds?: string[];
  /** Normalised identity used to warn about duplicates (`taxEntryDedupeKey`). */
  dedupeKey: string;
  /** The user said this is not a duplicate of an entry with the same key. */
  duplicateConfirmed?: boolean;
  revision: number;
  history?: TaxHistoryEntry[];
  /** Soft delete, ISO string — same meaning as `Expense.deletedAt`. */
  deletedAt?: string;
  schemaVersion: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export type TaxEntry = { [K in TaxEntryKind]: TaxEntryEnvelope<K> }[TaxEntryKind];
export type TaxEntryOf<K extends TaxEntryKind> = TaxEntryEnvelope<K>;

// ---------------------------------------------------------------------------
// Stored: reviews (the user's decision about a derived item)
// ---------------------------------------------------------------------------

export const TAX_REVIEW_DECISIONS = [
  /** The derived value is right. */
  "confirm",
  /** Not taxable here / not mine: left out of totals. */
  "exclude",
  /** Counted under `category` instead. */
  "recategorize",
  /** Superseded by entry `replacedBy` (e.g. an interest certificate total). */
  "replace",
  /** Checklist only: put off for now. */
  "defer",
  /** Checklist only: handled outside Spendly. */
  "resolve",
] as const;
export type TaxReviewDecision = (typeof TAX_REVIEW_DECISIONS)[number];

export interface TaxReviewHistoryEntry {
  revision: number;
  atMs: number;
  decision: TaxReviewDecision;
  category?: string;
  replacedBy?: string;
}

export interface TaxReview {
  /** `taxReviewDocId(fy, source)`: one review per item per year. */
  id: string;
  fy: FinancialYearKey;
  sourceKind: TaxSourceKind;
  sourceId: string;
  decision: TaxReviewDecision;
  category?: string;
  replacedBy?: string;
  /** Source value when the user decided; a later change re-opens the item. `null` for checklist items. */
  sourceAmount: number | null;
  engineVersion?: number;
  note?: string;
  revision: number;
  history?: TaxReviewHistoryEntry[];
  schemaVersion: number;
  createdAtMs: number;
  updatedAtMs: number;
}

// ---------------------------------------------------------------------------
// Stored: profile, documents, snapshots
// ---------------------------------------------------------------------------

export const TAX_RESIDENTIAL_STATUSES = ["resident", "rnor", "non_resident", "unknown"] as const;
export type TaxResidentialStatus = (typeof TAX_RESIDENTIAL_STATUSES)[number];

/** An age band, never a date of birth. */
export const TAX_AGE_BANDS = ["below_60", "60_to_79", "80_plus", "unknown"] as const;
export type TaxAgeBand = (typeof TAX_AGE_BANDS)[number];

/** What the user says they intend; informational only, never advice. */
export const TAX_REGIME_NOTES = ["old", "new", "undecided"] as const;
export type TaxRegimeNote = (typeof TAX_REGIME_NOTES)[number];

export interface TaxProfile {
  /** Same as `fy`. */
  id: FinancialYearKey;
  fy: FinancialYearKey;
  residentialStatus: TaxResidentialStatus;
  ageBand: TaxAgeBand;
  employerCount?: number;
  regimeNote?: TaxRegimeNote;
  note?: string;
  schemaVersion: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export const TAX_DOCUMENT_CATEGORIES = [
  "form16",
  "form16a",
  "ais",
  "tis",
  "form26as",
  "investment_proof",
  "interest_certificate",
  "capital_gains_statement",
  "tax_payment_receipt",
  "other",
] as const;
export type TaxDocumentCategory = (typeof TAX_DOCUMENT_CATEGORIES)[number];

export const TAX_DOCUMENT_STATUSES = ["pending", "ready"] as const;
export type TaxDocumentStatus = (typeof TAX_DOCUMENT_STATUSES)[number];

export interface TaxDocument {
  id: string;
  fy: FinancialYearKey;
  category: TaxDocumentCategory;
  name: string;
  note?: string;
  /** `users/{uid}/tax/{id}/{fileName}` in `spendly-files` (SPENDLY-298). */
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: TaxDocumentStatus;
  entryIds?: string[];
  uploadedAtMs?: number;
  schemaVersion: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export const TAX_SNAPSHOT_REASONS = ["marked_reviewed", "export"] as const;
export type TaxSnapshotReason = (typeof TAX_SNAPSHOT_REASONS)[number];

/**
 * A calculation frozen at a point in time. Never updated: a later rule version
 * produces a new snapshot and leaves this one as it was. The output shape is
 * owned by the engine (SPENDLY-295).
 */
export interface TaxSnapshot {
  /** `taxSnapshotDocId(fy, createdAtMs)`. */
  id: string;
  fy: FinancialYearKey;
  law: TaxLaw;
  reason: TaxSnapshotReason;
  ruleVersion: string;
  /** Hash of the inputs the outputs were computed from. */
  inputHash: string;
  outputs: Record<string, number | null>;
  unresolvedCount: number;
  schemaVersion: number;
  createdAtMs: number;
}

// ---------------------------------------------------------------------------
// Runtime only: resolved lines
// ---------------------------------------------------------------------------

/** A candidate Spendly derives from its own data. Never stored. */
export interface TaxDerivedItem {
  fy: FinancialYearKey;
  source: TaxSourceRef;
  category: string;
  /** `null` when Spendly can't work the amount out (e.g. missing cost basis). */
  value: number | null;
  /** Counted by default, before any review. */
  defaultIncluded: boolean;
  provenance: TaxProvenance;
  label: string;
  /** Why the user should look at it before it counts (SPENDLY-290). */
  attention?: TaxAttention;
}

/**
 * Why a derived item needs the user's eye:
 *   - `confirm_to_count`: plausible but not certain income; left out until confirmed.
 *   - `legacy_label`: an older Spendly label that may hide interest or dividends.
 *   - `calculated`: Spendly worked the amount out (FD interest); check it against a certificate.
 */
export type TaxAttention = "confirm_to_count" | "legacy_label" | "calculated";

export type TaxLineReason =
  | "source_changed"
  | "value_missing"
  | "user_excluded"
  | "user_replaced"
  | "user_recategorized";

/** What every tax screen and total reads: a derived item or an entry, after the user's decisions. */
export interface TaxLine {
  key: string;
  fy: FinancialYearKey;
  category: string;
  value: number | null;
  included: boolean;
  state: TaxItemState;
  provenance: TaxProvenance;
  label: string;
  attention?: TaxAttention;
  /** Set when the user's decision changed what Spendly derived. */
  override?: {
    reviewId: string;
    revision: number;
    decision: TaxReviewDecision;
    derivedCategory: string;
    derivedValue: number | null;
    replacedBy?: string;
  };
  reasons: TaxLineReason[];
}
