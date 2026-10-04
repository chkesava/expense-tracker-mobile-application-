/**
 * SPENDLY-314 — fee detection and classification engine.
 *
 * Deterministic rules over data Spendly already has: the transaction's note
 * (bank SMS / statement narrations land there), its category, its account and
 * its amount. No bank integration, no network, no Firebase or React imports.
 *
 * Output is `FeeInference`s (never persisted) folded with the user's
 * `FeeReview`s through `resolveFeeRecord` (shared/utils/feeModel.ts), so a
 * correction always wins on every recalculation.
 *
 * Guard rails, all tested:
 *   - A bare "fee" or "charge" is never enough: school fees, a doctor's
 *     consultation fee and an ATM *withdrawal* are not bank charges. Every
 *     keyword rule needs a qualified phrase ("ATM WDL CHG", "annual fee").
 *   - Anything short of strong evidence stays a candidate (`uncertain`).
 *   - Interest and GST are classified in their own roles, never as a fee.
 *   - A credit only becomes a reversal when it carries a fee phrase; pairing
 *     it with the fee it undoes is one-to-one.
 *   - Per-row work is cached by content signature, so re-running after one
 *     new SMS re-reads one row, not the whole history.
 */

import { CATEGORY_TAXONOMY, V3_PARENT_TO_V4 } from "../data/categoryTaxonomy";
import type {
  Account,
  AccountEntry,
  Expense,
  Income,
} from "../types/expense";
import type {
  FeeComponents,
  FeeEvidence,
  FeeInference,
  FeeRecord,
  FeeReview,
  FeeRole,
  FeeSourceRef,
  FeeSourceSnapshot,
  FeeTypeId,
} from "../types/fee";
import {
  FEE_CANDIDATE_MIN_CONFIDENCE,
  defaultFeeComponents,
  feeReviewDocId,
  needsFeeReview,
  reconcileFeeLinks,
  resolveFeeRecord,
} from "./feeModel";
import { roundMoney } from "./money";
import { daysBetweenDateKeys } from "./dates";

/** Bump whenever a rule, weight or threshold below changes. */
export const FEE_ENGINE_VERSION = 1;

/** Standard Indian GST on financial services. Only used when a narration says so. */
const GST_RATE = 0.18;
/** Above this a keyword alone is not trusted; above the hard cap nothing is a fee. */
const LARGE_FEE_AMOUNT = 25_000;
const MAX_FEE_AMOUNT = 100_000;
/** How far back a reversal may look for the fee it undoes. */
const REVERSAL_WINDOW_DAYS = 90;
/** GST is posted on, or within a few days of, the fee it is levied on. */
const GST_WINDOW_DAYS = 3;

// ---------------------------------------------------------------------------
// Text normalisation and masking
// ---------------------------------------------------------------------------

/** Lower-case, punctuation to spaces, runs collapsed. "Non-Maint.Chgs" → "non maint chgs". */
export function normalizeFeeText(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9%@]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Mask account/card/reference numbers: any run of 5+ digits keeps its last 4. */
export function maskSensitiveDigits(value: string): string {
  return value.replace(/\d{5,}/g, (digits) => `••${digits.slice(-4)}`);
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

type AccountContext = "credit" | "bank" | "unknown";

interface KeywordRule {
  id: string;
  feeType: FeeTypeId;
  subtype?: string;
  pattern: RegExp;
  weight: number;
  /**
   * Where this charge is normally levied. Omitted: anywhere. `known`: any
   * account whose type is known confirms it — "annual fee" is a card charge on
   * both a credit card and a debit card, but on an unknown account it could be
   * anything.
   */
  context?: Exclude<AccountContext, "unknown"> | "known";
}

/** A charge word as Indian banks abbreviate it. */
const CHG_WORDS = "chg|chgs|chrg|chrgs|charge|charges|fee|fees";
const CHG = `(?:${CHG_WORDS})`;
const rx = (source: string) => new RegExp(source);

/**
 * Ordered most specific first; the first match wins the type, every match is
 * kept as evidence. Weights sit against FEE_INFERRED_MIN_CONFIDENCE (0.8):
 * 0.85 unmistakable alone, 0.8 specific, 0.65–0.7 needs a matching account or
 * category before it counts.
 */
const KEYWORD_RULES: readonly KeywordRule[] = [
  // Minimum balance
  { id: "kw.min_balance.non_maint", feeType: "min_balance", subtype: "average_balance_shortfall", pattern: /\bnon ?maint(?:enance|ained|)?\b/, weight: 0.85, context: "bank" },
  { id: "kw.min_balance.amb", feeType: "min_balance", subtype: "average_balance_shortfall", pattern: rx(`\\b(?:amb|mab|aqb|avg bal|average (?:monthly |quarterly )?balance)\\b.*\\b(?:${CHG_WORDS}|penalty|shortfall)\\b`), weight: 0.85, context: "bank" },
  { id: "kw.min_balance.min_bal", feeType: "min_balance", subtype: "minimum_balance_shortfall", pattern: rx(`\\bmin(?:imum)? ?bal(?:ance)?\\b.*\\b(?:${CHG_WORDS}|penalty|shortfall)\\b`), weight: 0.85, context: "bank" },

  // Credit-card-only charges (checked before generic ATM/cash rules)
  { id: "kw.cash_advance", feeType: "cash_advance", subtype: "credit_card_cash", pattern: /\bcash (?:advance|adv)\b/, weight: 0.85, context: "credit" },
  { id: "kw.late_payment", feeType: "late_payment", pattern: rx(`\\blate (?:payment )?${CHG}\\b|\\blpf\\b|\\blate payment penalty\\b`), weight: 0.85 },
  { id: "kw.emi.processing", feeType: "emi_conversion", subtype: "processing_fee", pattern: rx(`\\bemi (?:processing|conversion|conv)(?: ${CHG})?\\b`), weight: 0.85, context: "credit" },
  { id: "kw.emi.pre_closure", feeType: "emi_conversion", subtype: "pre_closure", pattern: rx(`\\bemi (?:pre ?closure|foreclosure)\\b`), weight: 0.85, context: "credit" },
  { id: "kw.cc.joining", feeType: "credit_card", subtype: "joining_fee", pattern: /\bjoining fee\b/, weight: 0.8, context: "credit" },
  { id: "kw.cc.add_on", feeType: "credit_card", subtype: "add_on_card", pattern: rx(`\\badd ?on card ${CHG}\\b`), weight: 0.85, context: "credit" },
  { id: "kw.cc.fuel_surcharge", feeType: "credit_card", subtype: "fuel_surcharge", pattern: /\bfuel surcharge\b/, weight: 0.85, context: "credit" },
  { id: "kw.cc.over_limit", feeType: "credit_card", subtype: "over_limit", pattern: rx(`\\bover ?limit ${CHG}\\b`), weight: 0.85, context: "credit" },
  { id: "kw.cc.reward_redemption", feeType: "credit_card", subtype: "reward_redemption", pattern: rx(`\\b(?:reward|redemption) (?:redemption )?${CHG}\\b`), weight: 0.8, context: "credit" },
  { id: "kw.cc.surcharge", feeType: "credit_card", subtype: "rent_or_wallet_surcharge", pattern: rx(`\\b(?:rent|wallet) (?:payment |load |transaction )?(?:${CHG_WORDS}|surcharge|processing fee)\\b`), weight: 0.8, context: "credit" },

  // Debit card
  { id: "kw.dc.annual", feeType: "debit_card", subtype: "annual_fee", pattern: /\b(?:debit card|dc|atm card)\b.*\b(?:annual|amc|renewal)\b/, weight: 0.85, context: "bank" },
  { id: "kw.dc.replacement", feeType: "debit_card", subtype: "replacement", pattern: /\b(?:debit card|dc|atm card)\b.*\b(?:replacement|reissue|re issue)\b/, weight: 0.85, context: "bank" },
  { id: "kw.dc.issuance", feeType: "debit_card", subtype: "issuance", pattern: rx(`\\b(?:debit card|atm card) (?:issuance|issue) ${CHG}\\b`), weight: 0.85, context: "bank" },

  // Annual/renewal fee without saying which card: context decides
  { id: "kw.card.annual", feeType: "credit_card", subtype: "annual_fee", pattern: /\b(?:annual|renewal|membership) fee\b/, weight: 0.65, context: "known" },
  { id: "kw.card.replacement", feeType: "credit_card", subtype: "replacement", pattern: rx(`\\bcard replacement(?: ${CHG})?\\b`), weight: 0.65, context: "known" },

  // ATM
  { id: "kw.atm.declined", feeType: "atm_cash", subtype: "declined_transaction", pattern: /\batm\b.*\bdecline/, weight: 0.85 },
  { id: "kw.atm.balance_enquiry", feeType: "atm_cash", subtype: "balance_enquiry", pattern: /\b(?:bal|balance) (?:enq|enquiry|inquiry)\b/, weight: 0.8 },
  { id: "kw.atm.other_bank", feeType: "atm_cash", subtype: "other_bank_atm", pattern: rx(`\\b(?:non home|other bank|nfs|interbank|inter bank) atm\\b.*\\b${CHG}\\b|\\batm\\b.*\\b(?:non home|other bank)\\b`), weight: 0.85 },
  { id: "kw.atm.charge", feeType: "atm_cash", subtype: "excess_withdrawal", pattern: rx(`\\batm\\b(?: \\w+){0,3} ${CHG}\\b`), weight: 0.85 },
  { id: "kw.atm.excess", feeType: "atm_cash", subtype: "excess_withdrawal", pattern: /\bexcess (?:atm|withdrawal|wdl|txn)\b/, weight: 0.85 },
  { id: "kw.cash.handling", feeType: "atm_cash", subtype: "cash_at_branch", pattern: rx(`\\bcash (?:handling|deposit|withdrawal|wdl) ${CHG}\\b`), weight: 0.8 },

  // Forex
  { id: "kw.forex.dcc", feeType: "forex", subtype: "dynamic_conversion", pattern: /\bdcc\b|\bdynamic currency\b/, weight: 0.8 },
  { id: "kw.forex.cross_border", feeType: "forex", subtype: "cross_border", pattern: rx(`\\bcross ?border\\b.*\\b${CHG}\\b`), weight: 0.85 },
  { id: "kw.forex.markup", feeType: "forex", subtype: "markup", pattern: rx(`\\b(?:forex|fx|currency|cross currency|foreign currency|intl|international)\\b(?: \\w+){0,2} (?:mark ?up|${CHG_WORDS})\\b|\\bmark ?up ${CHG}\\b|\\bforex markup\\b`), weight: 0.85 },

  // Payments
  { id: "kw.pay.convenience", feeType: "payment_upi", subtype: "convenience_fee", pattern: rx(`\\bconv(?:enience)? ${CHG}\\b`), weight: 0.8 },
  { id: "kw.pay.gateway", feeType: "payment_upi", subtype: "payment_gateway", pattern: rx(`\\b(?:pg|payment gateway) ${CHG}\\b`), weight: 0.8 },
  { id: "kw.pay.wallet_load", feeType: "payment_upi", subtype: "wallet_load", pattern: rx(`\\bwallet (?:load|top ?up|topup) ${CHG}\\b`), weight: 0.8 },
  { id: "kw.pay.upi", feeType: "payment_upi", subtype: "upi", pattern: rx(`\\bupi\\b(?: \\w+){0,2} ${CHG}\\b`), weight: 0.7 },

  // Cheque
  { id: "kw.chq.bounce", feeType: "cheque", subtype: "bounce", pattern: /\b(?:chq|cheque|check|clg)\b.*\b(?:bounce|return|rtn|dishono(?:u)?r)\b|\binward (?:return|rtn)\b/, weight: 0.85 },
  { id: "kw.chq.stop", feeType: "cheque", subtype: "stop_payment", pattern: /\bstop payment\b/, weight: 0.85 },
  { id: "kw.chq.book", feeType: "cheque", subtype: "cheque_book", pattern: rx(`\\b(?:chq|cheque) ?book\\b(?: \\w+){0,2} (?:${CHG_WORDS}|issue)\\b`), weight: 0.85 },

  // Transfers / remittance
  { id: "kw.xfer.domestic", feeType: "transfer_remittance", subtype: "domestic_transfer", pattern: rx(`\\b(?:neft|rtgs|imps)\\b(?: \\w+){0,2} (?:${CHG_WORDS}|comm|commission)\\b`), weight: 0.85 },
  { id: "kw.xfer.intl", feeType: "transfer_remittance", subtype: "international_remittance", pattern: rx(`\\b(?:remittance|swift|wire transfer|outward remit)\\b(?: \\w+){0,2} (?:${CHG_WORDS}|comm|commission)\\b`), weight: 0.85 },
  { id: "kw.xfer.dd", feeType: "transfer_remittance", subtype: "demand_draft", pattern: rx(`\\b(?:dd|demand draft)\\b(?: \\w+){0,1} (?:${CHG_WORDS}|comm|commission)\\b`), weight: 0.8 },

  // Investments
  { id: "kw.inv.brokerage", feeType: "investment", subtype: "brokerage", pattern: /\bbrokerage\b/, weight: 0.8 },
  { id: "kw.inv.dp", feeType: "investment", subtype: "depository", pattern: rx(`\\b(?:dp|depository|cdsl|nsdl)\\b(?: \\w+){0,1} ${CHG}\\b`), weight: 0.85 },
  { id: "kw.inv.demat_amc", feeType: "investment", subtype: "demat_maintenance", pattern: /\bdemat\b.*\b(?:amc|maintenance|annual)\b/, weight: 0.85 },
  { id: "kw.inv.exit_load", feeType: "investment", subtype: "exit_load", pattern: /\bexit load\b/, weight: 0.85 },
  { id: "kw.inv.advisory", feeType: "investment", subtype: "platform_fee", pattern: /\badvisory fee\b/, weight: 0.65 },

  // Loans
  { id: "kw.loan.bounce", feeType: "loan", subtype: "bounce", pattern: /\b(?:emi|nach|ecs|mandate|ach)\b(?: \w+){0,2} (?:bounce|return|rtn|dishono(?:u)?r)\b/, weight: 0.85 },
  { id: "kw.loan.processing", feeType: "loan", subtype: "processing_fee", pattern: rx(`\\b(?:loan )?processing ${CHG}\\b`), weight: 0.7 },
  { id: "kw.loan.prepayment", feeType: "loan", subtype: "prepayment", pattern: rx(`\\bpre ?payment (?:${CHG_WORDS}|penalty)\\b`), weight: 0.85 },
  { id: "kw.loan.foreclosure", feeType: "loan", subtype: "foreclosure", pattern: rx(`\\bforeclosure (?:${CHG_WORDS})\\b`), weight: 0.85 },
  { id: "kw.loan.penal", feeType: "loan", subtype: "penal_charge", pattern: /\bpenal (?:chg|chgs|charge|charges)\b/, weight: 0.85 },
  { id: "kw.loan.documentation", feeType: "loan", subtype: "documentation", pattern: rx(`\\bdocumentation ${CHG}\\b`), weight: 0.8 },

  // Bank service
  { id: "kw.bank.sms", feeType: "bank_service", subtype: "sms_alerts", pattern: rx(`\\bsms(?: alert| alerts| banking)? ${CHG}\\b`), weight: 0.85, context: "bank" },
  { id: "kw.bank.maintenance", feeType: "bank_service", subtype: "account_maintenance", pattern: rx(`\\b(?:account|a c|acct)\\b(?: \\w+){0,1} (?:maint|maintenance|keeping)\\b|\\bfolio ${CHG}\\b`), weight: 0.8, context: "bank" },
  { id: "kw.bank.statement", feeType: "bank_service", subtype: "statement_request", pattern: rx(`\\b(?:stmt|statement|certificate|duplicate passbook|passbook)\\b(?: \\w+){0,1} ${CHG}\\b`), weight: 0.8 },
  { id: "kw.bank.locker", feeType: "bank_service", subtype: "locker", pattern: rx(`\\blocker (?:rent|${CHG_WORDS})\\b`), weight: 0.85, context: "bank" },
  { id: "kw.bank.closure", feeType: "bank_service", subtype: "account_closure", pattern: rx(`\\b(?:a c|ac|account) clos(?:ure|ing) ${CHG}\\b`), weight: 0.85, context: "bank" },
  { id: "kw.bank.service", feeType: "bank_service", subtype: "other_service", pattern: /\b(?:service|srv|svc) (?:chg|chgs|charge|charges)\b/, weight: 0.65 },
  { id: "kw.bank.generic", feeType: "other", pattern: /\bbank (?:chg|chgs|charge|charges)\b|\bchgs? debited\b/, weight: 0.65 },
];

const GST_PATTERN = /\b(?:igst|cgst|sgst|utgst|gst|service tax)\b/;
/** GST as the subject ("IGST on ATM chg", "GST @18%"): the row *is* the tax. */
const GST_SUBJECT_PATTERN = /^(?:igst|cgst|sgst|utgst|gst|service tax)\b|\b(?:igst|cgst|sgst|utgst|gst|service tax) (?:on|for|@|\d)/;
/** GST folded into the fee amount. */
const GST_INCLUSIVE_PATTERN = /\bincl(?:uding|usive of|\.)? ?(?:of )?(?:igst|gst)\b|\bgst incl(?:uded|usive)?\b/;

const INTEREST_PATTERNS: readonly { id: string; pattern: RegExp }[] = [
  { id: "kw.interest.finance_charge", pattern: /\b(?:finance|fin) (?:chg|chgs|charge|charges)\b/ },
  { id: "kw.interest.charged", pattern: /\b(?:interest|int) (?:chg|charged|debit|debited|on (?:outstanding|revolving|emi|loan|card))\b/ },
  { id: "kw.interest.penal", pattern: /\bpenal interest\b/ },
];

const REVERSAL_PATTERN = /\b(?:rev|reversal|reversed|reverse|waiv(?:er|ed)|waive|refund(?:ed)?|credit(?:ed)? back)\b/;
const REFUND_PATTERN = /\brefund(?:ed)?\b/;
/** A credit that names a charge without a specific rule: "chg reversal", "charges reversed". */
const GENERIC_CHARGE_PATTERN = rx(`\\b${CHG}\\b`);

// Category signals --------------------------------------------------------

const SUBCATEGORY_KEY_BY_NAME = new Map<string, string>();
const PARENT_KEY_BY_NAME = new Map<string, string>();
for (const node of CATEGORY_TAXONOMY) {
  PARENT_KEY_BY_NAME.set(normalizeFeeText(node.name), node.key);
  for (const sub of node.subcategories) {
    SUBCATEGORY_KEY_BY_NAME.set(normalizeFeeText(sub.name), sub.key);
  }
}
// v3 labels still found on older rows.
SUBCATEGORY_KEY_BY_NAME.set(normalizeFeeText("Bank Charges / Tax"), "bank_charges");
const PARENT_KEY_BY_V4_NAME = new Map(CATEGORY_TAXONOMY.map((node) => [node.name, node.key] as const));
for (const [v3Name, pair] of Object.entries(V3_PARENT_TO_V4)) {
  const key = PARENT_KEY_BY_V4_NAME.get(pair.category);
  const normalized = normalizeFeeText(v3Name);
  if (key && !PARENT_KEY_BY_NAME.has(normalized)) PARENT_KEY_BY_NAME.set(normalized, key);
}

const CATEGORY_FEE_TYPE: Readonly<Record<string, { feeType: FeeTypeId; weight: number }>> = {
  atm_fees: { feeType: "atm_cash", weight: 0.8 },
  credit_card_fees: { feeType: "credit_card", weight: 0.8 },
  loan_fees: { feeType: "loan", weight: 0.8 },
  investment_fees: { feeType: "investment", weight: 0.8 },
  bank_charges: { feeType: "bank_service", weight: 0.8 },
  financial_service_fees: { feeType: "other", weight: 0.8 },
};

/**
 * Parents where a fee phrase is expected, plus the catch-all bucket SMS
 * imports default to ("Other" → Miscellaneous), which says nothing either way.
 * Anywhere else a fee phrase argues for a purchase.
 */
const FEE_PARENT_KEYS = new Set(["finance_loans_insurance", "investments_savings", "miscellaneous"]);
/** Subcategories that are principal by definition: paying a bill is not a fee. */
const PRINCIPAL_SUBCATEGORY_KEYS = new Set([
  "credit_card_payment",
  "personal_loan_emi",
  "home_loan_emi",
  "vehicle_loan_emi",
  "education_loan_emi",
  "other_emi",
  "life_insurance",
  "health_insurance",
  "vehicle_insurance",
  "other_insurance",
  "income_tax",
  "school_fees",
  "college_fees",
]);
/** Parents that are never a financial-product fee, whatever the note says. */
const EXCLUDED_PARENT_KEYS = new Set(["education"]);

// ---------------------------------------------------------------------------
// Source adapters
// ---------------------------------------------------------------------------

export function accountContextOf(account?: Account): AccountContext {
  if (!account) return "unknown";
  if (account.accountTypeId === "credit_card") return "credit";
  if (account.accountTypeId === "bank") return "bank";
  if (account.accountTypeId) return "unknown";
  if (typeof account.creditLimit === "number" || typeof account.billGenerationDay === "number") return "credit";
  return "unknown";
}

function snapshot(
  ref: FeeSourceRef,
  row: { date: string; amount: number; note?: string; accountId?: string },
  direction: "debit" | "credit",
  account: Account | undefined,
  category?: string,
  subcategory?: string
): FeeSourceSnapshot {
  const merchant = row.note?.trim() ? maskSensitiveDigits(row.note.trim()).slice(0, 120) : undefined;
  return {
    ref,
    date: row.date,
    amount: roundMoney(row.amount),
    direction,
    currency: account?.currency ?? "INR",
    ...(row.accountId ? { accountId: row.accountId } : {}),
    ...(merchant ? { merchant } : {}),
    ...(account?.institutionName ? { institution: account.institutionName } : {}),
    ...(category ? { category } : {}),
    ...(subcategory ? { subcategory } : {}),
  };
}

export function feeSourceFromExpense(expense: Expense, account?: Account): FeeSourceSnapshot | null {
  if (!expense.id || expense.deletedAt) return null;
  return snapshot({ kind: "expense", id: expense.id }, expense, "debit", account, expense.category, expense.subcategory);
}

export function feeSourceFromIncome(income: Income, account?: Account): FeeSourceSnapshot | null {
  if (!income.id || income.deletedAt) return null;
  return snapshot({ kind: "income", id: income.id }, income, "credit", account, income.source);
}

export function feeSourceFromEntry(entry: AccountEntry, account?: Account): FeeSourceSnapshot | null {
  // Split postings and investment-cash transfers are movements, never charges.
  if (entry.source || entry.transferId || entry.correlationId) return null;
  return snapshot({ kind: "entry", id: entry.id }, entry, entry.direction, account);
}

// ---------------------------------------------------------------------------
// Per-row classification (cacheable: depends only on the row and its account)
// ---------------------------------------------------------------------------

interface RowDetection {
  role: FeeRole;
  feeType?: FeeTypeId;
  subtype?: string;
  components: FeeComponents;
  confidence: number;
  evidence: FeeEvidence[];
  /** Needs a partner (fee for GST / reversal) before it may count. */
  pairing?: "gst" | "reversal";
  uncertainReason?: FeeInference["uncertainReason"];
}

function clamp(value: number): number {
  return Math.max(0, Math.min(0.99, Math.round(value * 100) / 100));
}

function ev(signal: FeeEvidence["signal"], ruleId: string, detail: string, weight: number): FeeEvidence {
  return { signal, ruleId, detail: maskSensitiveDigits(detail), weight };
}

function quote(text: string, pattern: RegExp): string {
  const match = text.match(pattern);
  return match ? match[0].trim().slice(0, 60) : "";
}

function matchKeywordRules(text: string): KeywordRule[] {
  return KEYWORD_RULES.filter((rule) => rule.pattern.test(text));
}

/** Context-sensitive type fix-ups on the winning rule. */
function refineForContext(rule: KeywordRule, ctx: AccountContext): { feeType: FeeTypeId; subtype?: string } {
  if (rule.id === "kw.card.annual" && ctx === "bank") return { feeType: "debit_card", subtype: "annual_fee" };
  if (rule.id === "kw.card.replacement" && ctx === "bank") return { feeType: "debit_card", subtype: "replacement" };
  // Cash from a credit card is a cash advance, whatever the narration calls it.
  if (rule.feeType === "atm_cash" && ctx === "credit") return { feeType: "cash_advance", subtype: "credit_card_cash" };
  if (rule.feeType === "late_payment") {
    return { feeType: "late_payment", subtype: ctx === "credit" ? "credit_card" : undefined };
  }
  return { feeType: rule.feeType, subtype: rule.subtype };
}

function contextAdjustment(rule: KeywordRule, ctx: AccountContext): { weight: number; detail?: string } {
  if (!rule.context || ctx === "unknown") return { weight: 0 };
  if (rule.context === ctx || rule.context === "known") {
    return { weight: 0.15, detail: ctx === "credit" ? "Posted on a credit card" : "Posted on a bank account" };
  }
  return { weight: -0.2, detail: ctx === "credit" ? "Usually a bank-account charge, but posted on a credit card" : "Usually a card charge, but posted on a bank account" };
}

function categorySignals(source: FeeSourceSnapshot): {
  subKey?: string;
  parentKey?: string;
} {
  return {
    subKey: source.subcategory ? SUBCATEGORY_KEY_BY_NAME.get(normalizeFeeText(source.subcategory)) : undefined,
    parentKey: source.category ? PARENT_KEY_BY_NAME.get(normalizeFeeText(source.category)) : undefined,
  };
}

function detectDebit(source: FeeSourceSnapshot, ctx: AccountContext, text: string): RowDetection | null {
  if (source.amount <= 0 || source.amount > MAX_FEE_AMOUNT) return null;
  const { subKey, parentKey } = categorySignals(source);
  if (parentKey && EXCLUDED_PARENT_KEYS.has(parentKey)) return null;

  const evidence: FeeEvidence[] = [];
  const rules = matchKeywordRules(text);
  const categoryHit = subKey ? CATEGORY_FEE_TYPE[subKey] : undefined;
  const hasGst = GST_PATTERN.test(text);

  // Interest is its own role, only when no fee phrase claims the row.
  if (rules.length === 0) {
    const interestRule = INTEREST_PATTERNS.find((r) => r.pattern.test(text));
    const interestCategory = subKey === "interest";
    if (interestRule || interestCategory) {
      let confidence = 0;
      if (interestRule) {
        confidence = 0.75;
        evidence.push(ev("keyword", interestRule.id, `Description mentions "${quote(text, interestRule.pattern)}"`, 0.75));
      }
      if (interestCategory) {
        confidence = interestRule ? confidence + 0.1 : 0.8;
        evidence.push(ev("category", "cat.interest", `Filed under ${source.subcategory}`, 0.8));
      }
      if (ctx === "credit") {
        confidence += 0.1;
        evidence.push(ev("account_context", "ctx.credit_interest", "Posted on a credit card", 0.1));
      }
      return {
        role: "interest",
        components: defaultFeeComponents("interest", source.amount),
        confidence: clamp(confidence),
        evidence,
      };
    }
  }

  // GST as its own row.
  if (hasGst && (GST_SUBJECT_PATTERN.test(text) || subKey === "gst_other_tax") && !GST_INCLUSIVE_PATTERN.test(text)) {
    const rule = rules[0];
    if (!rule && subKey !== "gst_other_tax") return null;
    evidence.push(ev("tax_pattern", "tax.gst_row", `Description mentions "${quote(text, GST_PATTERN)}"`, 0.5));
    if (rule) evidence.push(ev("keyword", rule.id, `Levied on "${quote(text, rule.pattern)}"`, 0.1));
    const refined = rule ? refineForContext(rule, ctx) : undefined;
    return {
      role: "tax_on_fee",
      feeType: refined?.feeType,
      components: defaultFeeComponents("tax_on_fee", source.amount),
      // Not countable until paired with the fee it is levied on.
      confidence: rule ? 0.6 : 0.45,
      evidence,
      pairing: "gst",
    };
  }

  if (rules.length === 0 && !categoryHit) return null;

  const top = rules[0];
  let confidence = 0;
  let feeType: FeeTypeId;
  let subtype: string | undefined;

  if (top) {
    const refined = refineForContext(top, ctx);
    feeType = refined.feeType;
    subtype = refined.subtype;
    confidence = top.weight;
    for (const rule of rules) {
      evidence.push(ev("keyword", rule.id, `Description mentions "${quote(text, rule.pattern)}"`, rule === top ? rule.weight : 0));
    }
    const adj = contextAdjustment(top, ctx);
    if (adj.detail) {
      confidence += adj.weight;
      evidence.push(ev("account_context", `ctx.${top.context}`, adj.detail, adj.weight));
    }
    if (categoryHit) {
      confidence += 0.1;
      evidence.push(ev("category", `cat.${subKey}`, `Filed under ${source.subcategory}`, 0.1));
    }
  } else {
    feeType = categoryHit!.feeType;
    confidence = categoryHit!.weight;
    evidence.push(ev("category", `cat.${subKey}`, `Filed under ${source.subcategory}`, categoryHit!.weight));
  }

  // Arguments against.
  if (subKey && PRINCIPAL_SUBCATEGORY_KEYS.has(subKey)) {
    confidence -= 0.35;
    evidence.push(ev("category", "neg.principal_category", `Filed under ${source.subcategory}, which is usually a payment, not a charge`, -0.35));
  } else if (!categoryHit && parentKey && !FEE_PARENT_KEYS.has(parentKey)) {
    confidence -= 0.25;
    evidence.push(ev("category", "neg.purchase_category", `Filed under ${source.category}, which suggests a purchase`, -0.25));
  }
  if (source.amount > LARGE_FEE_AMOUNT) {
    confidence -= 0.25;
    evidence.push(ev("amount_pattern", "neg.large_amount", "Unusually large for a charge", -0.25));
  }

  let components = defaultFeeComponents("fee", source.amount);
  let uncertainReason: RowDetection["uncertainReason"];
  if (hasGst && GST_INCLUSIVE_PATTERN.test(text)) {
    // The narration says GST is inside the amount but not how much. Assume the
    // standard 18% and ask the user to confirm the split rather than guess
    // silently.
    const fee = roundMoney(source.amount / (1 + GST_RATE));
    components = { principal: 0, fee, tax: roundMoney(source.amount - fee), interest: 0 };
    evidence.push(ev("tax_pattern", "tax.gst_inclusive", "Includes GST; split assumes the standard 18% — please confirm", 0));
    uncertainReason = "ambiguous";
  }

  return { role: "fee", feeType, subtype, components, confidence: clamp(confidence), evidence, uncertainReason };
}

function detectCredit(source: FeeSourceSnapshot, ctx: AccountContext, text: string): RowDetection | null {
  if (source.amount <= 0 || source.amount > MAX_FEE_AMOUNT) return null;
  if (!REVERSAL_PATTERN.test(text)) return null;
  const rules = matchKeywordRules(text);
  const generic = GENERIC_CHARGE_PATTERN.test(text);
  // A refund with no charge phrase is a merchant refund — not ours.
  if (rules.length === 0 && !generic) return null;

  const role: FeeRole = REFUND_PATTERN.test(text) ? "refund" : "reversal";
  const top = rules[0];
  const refined = top ? refineForContext(top, ctx) : undefined;
  const evidence: FeeEvidence[] = [
    ev("keyword", `kw.${role}`, `Description mentions "${quote(text, REVERSAL_PATTERN)}"`, 0.3),
  ];
  if (top) evidence.push(ev("keyword", top.id, `Names "${quote(text, top.pattern)}"`, 0.3));
  else evidence.push(ev("keyword", "kw.generic_charge", `Names "${quote(text, GENERIC_CHARGE_PATTERN)}"`, 0.2));

  return {
    role,
    feeType: refined?.feeType ?? "other",
    subtype: refined?.subtype,
    components: defaultFeeComponents(role, source.amount),
    // Counts only once paired with the fee it gives back (see pairing pass).
    confidence: top ? 0.6 : 0.5,
    evidence,
    pairing: "reversal",
  };
}

/**
 * Keywords read the narration only. Category names are scored separately
 * (`categorySignals`), so a row filed under "ATM Fees" is not also counted as
 * saying "ATM fees", and an income source of "Refund" does not make a charge
 * reversal look like a refund.
 */
export function classifyFeeSource(source: FeeSourceSnapshot, account?: Account): RowDetection | null {
  const ctx = accountContextOf(account);
  const text = normalizeFeeText(source.merchant ?? "");
  return source.direction === "debit" ? detectDebit(source, ctx, text) : detectCredit(source, ctx, text);
}

// ---------------------------------------------------------------------------
// Incremental cache
// ---------------------------------------------------------------------------

export interface FeeDetectionCache {
  rows: Map<string, { signature: string; detection: RowDetection | null }>;
}

export function createFeeDetectionCache(): FeeDetectionCache {
  return { rows: new Map() };
}

function signatureOf(source: FeeSourceSnapshot, account?: Account): string {
  return [
    FEE_ENGINE_VERSION,
    source.amount,
    source.date,
    source.direction,
    source.merchant ?? "",
    source.category ?? "",
    source.subcategory ?? "",
    source.accountId ?? "",
    account?.accountTypeId ?? "",
    account?.creditLimit ?? "",
    account?.billGenerationDay ?? "",
  ].join("|");
}

// ---------------------------------------------------------------------------
// Pairing
// ---------------------------------------------------------------------------

interface Candidate {
  key: string;
  source: FeeSourceSnapshot;
  detection: RowDetection;
}

/** Effective fee pool for pairing: the review wins, else the detection. */
interface PoolFee {
  key: string;
  source: FeeSourceSnapshot;
  feeType?: FeeTypeId;
  components: FeeComponents;
  /** Position in date order; keeps tie-breaks deterministic. */
  index: number;
}

/**
 * Pool indexed by amount in paise, so pairing looks up the handful of fees
 * with a matching amount instead of scanning every fee for every credit.
 */
interface FeePool {
  byAmount: Map<number, PoolFee[]>;
  byFeePart: Map<number, PoolFee[]>;
}

const paise = (value: number) => Math.round(value * 100);

function pushTo(map: Map<number, PoolFee[]>, key: number, fee: PoolFee): void {
  const list = map.get(key);
  if (list) list.push(fee);
  else map.set(key, [fee]);
}

function buildFeePool(fees: PoolFee[]): FeePool {
  const pool: FeePool = { byAmount: new Map(), byFeePart: new Map() };
  for (const fee of fees) {
    pushTo(pool.byAmount, paise(fee.source.amount), fee);
    pushTo(pool.byFeePart, paise(fee.components.fee), fee);
  }
  return pool;
}

function lookup(map: Map<number, PoolFee[]>, center: number, spread: number, into: Map<string, PoolFee>): void {
  for (let k = center - spread; k <= center + spread; k++) {
    for (const fee of map.get(k) ?? []) into.set(fee.key, fee);
  }
}

function inOrder(found: Map<string, PoolFee>): PoolFee[] {
  return [...found.values()].sort((a, b) => a.index - b.index);
}

function sameAccountScore(a: FeeSourceSnapshot, b: FeeSourceSnapshot): number | null {
  if (a.accountId && b.accountId) return a.accountId === b.accountId ? 0 : null;
  return -0.1;
}

function near(a: number, b: number, tolerance = 0.01): boolean {
  return Math.abs(roundMoney(a) - roundMoney(b)) <= tolerance;
}

function pairGst(gst: Candidate, pool: FeePool): { fee: PoolFee; weight: number } | null {
  // fee × 18% within 2 paise of the GST ⇒ fee within ~11 paise of GST / 18%.
  const found = new Map<string, PoolFee>();
  lookup(pool.byFeePart, paise(gst.source.amount / GST_RATE), 12, found);
  let best: { fee: PoolFee; weight: number; days: number } | null = null;
  for (const fee of inOrder(found)) {
    const account = sameAccountScore(gst.source, fee.source);
    if (account === null) continue;
    const days = Math.abs(daysBetweenDateKeys(fee.source.date, gst.source.date));
    if (days > GST_WINDOW_DAYS) continue;
    if (!near(fee.components.fee * GST_RATE, gst.source.amount, 0.02)) continue;
    const weight = 0.3 + account + (gst.detection.feeType && gst.detection.feeType === fee.feeType ? 0.05 : 0);
    if (!best || weight > best.weight || (weight === best.weight && days < best.days)) {
      best = { fee, weight, days };
    }
  }
  return best;
}

function pairReversal(credit: Candidate, pool: FeePool, claimed: Set<string>): {
  fee: PoolFee;
  weight: number;
  components: FeeComponents;
} | null {
  const found = new Map<string, PoolFee>();
  const cents = paise(credit.source.amount);
  lookup(pool.byAmount, cents, 1, found);
  lookup(pool.byFeePart, cents, 1, found);
  let best: { fee: PoolFee; weight: number; days: number; components: FeeComponents } | null = null;
  for (const fee of inOrder(found)) {
    if (claimed.has(fee.key)) continue;
    const account = sameAccountScore(credit.source, fee.source);
    if (account === null) continue;
    const days = daysBetweenDateKeys(fee.source.date, credit.source.date);
    if (days < 0 || days > REVERSAL_WINDOW_DAYS) continue;

    let components: FeeComponents | null = null;
    let weight = 0;
    if (near(credit.source.amount, fee.source.amount)) {
      // Whole charge given back, GST and all.
      components = { ...fee.components, principal: 0 };
      if (!near(components.fee + components.tax + components.interest, credit.source.amount)) {
        components = defaultFeeComponents("reversal", credit.source.amount);
      }
      weight = 0.3;
    } else if (near(credit.source.amount, fee.components.fee)) {
      components = defaultFeeComponents("reversal", credit.source.amount);
      weight = 0.25;
    }
    if (!components) continue;
    weight += account;
    const known = credit.detection.feeType && credit.detection.feeType !== "other";
    if (known && credit.detection.feeType === fee.feeType) weight += 0.05;
    else if (known && fee.feeType && credit.detection.feeType !== fee.feeType) continue;

    if (!best || weight > best.weight || (weight === best.weight && days < best.days)) {
      best = { fee, weight, days, components };
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export interface FeeDetectionInput {
  expenses: readonly Expense[];
  incomes: readonly Income[];
  entries?: readonly AccountEntry[];
  accounts: readonly Account[];
  reviews?: readonly FeeReview[];
  cache?: FeeDetectionCache;
}

export interface FeeDetectionResult {
  /** Resolved, link-reconciled records — what screens and totals read. */
  records: FeeRecord[];
  /** Raw engine output by record key, for provenance when a review is written. */
  inferences: Map<string, FeeInference>;
  stats: { scanned: number; reclassified: number; detected: number; candidates: number };
}

/**
 * Detect, pair and resolve. Pure: same inputs, same output. With a `cache`,
 * rows whose content has not changed are not re-classified.
 */
export function detectFees(input: FeeDetectionInput): FeeDetectionResult {
  const accountById = new Map(input.accounts.map((a) => [a.id, a] as const));
  const reviewByKey = new Map((input.reviews ?? []).map((r) => [feeReviewDocId({ kind: r.sourceKind, id: r.sourceId }), r] as const));
  const cache = input.cache ?? createFeeDetectionCache();
  const seen = new Set<string>();

  const candidates: Candidate[] = [];
  const reviewedSources = new Map<string, FeeSourceSnapshot>();
  let scanned = 0;
  let reclassified = 0;

  const visit = (source: FeeSourceSnapshot | null, account?: Account) => {
    if (!source) return;
    scanned += 1;
    const key = feeReviewDocId(source.ref);
    seen.add(key);
    const signature = signatureOf(source, account);
    let cached = cache.rows.get(key);
    if (!cached || cached.signature !== signature) {
      cached = { signature, detection: classifyFeeSource(source, account) };
      cache.rows.set(key, cached);
      reclassified += 1;
    }
    if (reviewByKey.has(key)) reviewedSources.set(key, source);
    if (cached.detection && cached.detection.confidence >= FEE_CANDIDATE_MIN_CONFIDENCE - 0.1) {
      candidates.push({ key, source, detection: cached.detection });
    }
  };

  for (const e of input.expenses) visit(feeSourceFromExpense(e, e.accountId ? accountById.get(e.accountId) : undefined), e.accountId ? accountById.get(e.accountId) : undefined);
  for (const i of input.incomes) visit(feeSourceFromIncome(i, i.accountId ? accountById.get(i.accountId) : undefined), i.accountId ? accountById.get(i.accountId) : undefined);
  for (const en of input.entries ?? []) {
    const account = accountById.get(en.accountId);
    visit(feeSourceFromEntry(en, account), account);
  }
  // Drop cache entries for rows that no longer exist.
  for (const key of cache.rows.keys()) if (!seen.has(key)) cache.rows.delete(key);

  // Effective fee pool: user decisions first.
  const fees: PoolFee[] = [];
  for (const [key, review] of reviewByKey) {
    const source = reviewedSources.get(key);
    if (!source || review.decision === "not_fee" || review.role !== "fee") continue;
    fees.push({ key, source, feeType: review.feeType, components: review.components, index: 0 });
  }
  for (const c of candidates) {
    if (reviewByKey.has(c.key)) continue;
    if (c.detection.role === "fee" && c.detection.confidence >= FEE_CANDIDATE_MIN_CONFIDENCE) {
      fees.push({ key: c.key, source: c.source, feeType: c.detection.feeType, components: c.detection.components, index: 0 });
    }
  }
  fees.sort((a, b) => (a.source.date < b.source.date ? -1 : a.source.date > b.source.date ? 1 : a.key.localeCompare(b.key)));
  fees.forEach((fee, index) => { fee.index = index; });
  const pool = buildFeePool(fees);

  // Fees a user already tied a credit to cannot be claimed twice.
  const claimed = new Set<string>();
  for (const review of reviewByKey.values()) {
    if ((review.role === "reversal" || review.role === "refund") && review.linkedKind && review.linkedId) {
      claimed.add(feeReviewDocId({ kind: review.linkedKind, id: review.linkedId }));
    }
  }

  const inferences = new Map<string, FeeInference>();
  // Oldest credits pair first, so each takes the fee closest before it.
  const ordered = [...candidates].sort((a, b) =>
    a.source.date < b.source.date ? -1 : a.source.date > b.source.date ? 1 : a.key.localeCompare(b.key)
  );
  for (const c of ordered) {
    const d = c.detection;
    let confidence = d.confidence;
    let linkedTo: FeeSourceRef | undefined;
    let components = d.components;
    const evidence = [...d.evidence];
    let uncertainReason = d.uncertainReason;

    if (d.pairing === "gst") {
      const match = pairGst(c, pool);
      if (match) {
        linkedTo = match.fee.source.ref;
        confidence += match.weight;
        evidence.push(ev("tax_pattern", "pair.gst_18", `18% of the ${match.fee.source.date} charge of ₹${match.fee.components.fee}`, match.weight));
      } else {
        uncertainReason = "ambiguous";
      }
    } else if (d.pairing === "reversal" && !reviewByKey.has(c.key)) {
      const match = pairReversal(c, pool, claimed);
      if (match) {
        claimed.add(match.fee.key);
        linkedTo = match.fee.source.ref;
        components = match.components;
        confidence += match.weight;
        evidence.push(ev("reversal_pair", "pair.reversal", `Gives back the ${match.fee.source.date} charge of ₹${match.fee.source.amount}`, match.weight));
      } else {
        uncertainReason = "ambiguous";
      }
    }

    const final = clamp(confidence);
    if (final < FEE_CANDIDATE_MIN_CONFIDENCE && !reviewByKey.has(c.key)) continue;
    inferences.set(c.key, {
      source: c.source,
      role: d.role,
      ...(d.feeType ? { feeType: d.feeType } : {}),
      ...(d.subtype ? { subtype: d.subtype } : {}),
      components,
      ...(linkedTo ? { linkedTo } : {}),
      confidence: final,
      evidence,
      engineVersion: FEE_ENGINE_VERSION,
      ...(uncertainReason ? { uncertainReason } : {}),
    });
  }

  const resolved: FeeRecord[] = [];
  const keys = new Set([...inferences.keys(), ...reviewedSources.keys()]);
  for (const key of keys) {
    const inference = inferences.get(key) ?? null;
    const source = inference?.source ?? reviewedSources.get(key);
    if (!source) continue;
    const record = resolveFeeRecord({ source, inference, review: reviewByKey.get(key) ?? null });
    if (record) resolved.push(record);
  }
  const records = reconcileFeeLinks(resolved).sort((a, b) =>
    a.source.date < b.source.date ? 1 : a.source.date > b.source.date ? -1 : a.key.localeCompare(b.key)
  );

  return {
    records,
    inferences,
    stats: {
      scanned,
      reclassified,
      detected: records.filter((r) => !needsFeeReview(r) && r.role !== "not_fee").length,
      candidates: records.filter(needsFeeReview).length,
    },
  };
}

/** The review queue: every record the user still has to resolve, newest first. */
export function feeCandidateQueue(records: readonly FeeRecord[]): FeeRecord[] {
  return records.filter(needsFeeReview);
}
