import type { CategorizationRule } from "@/shared/types/expense";
import type {
  RawSmsMessage,
  SmsParsedTransaction,
} from "@/shared/types/smsTransaction";
import { monthFromDateKey } from "@/shared/utils/dates";
import { categorizeSmsMerchant } from "./smsCategorizer";
import {
  detectSmsTransaction,
  isExpenseOrIncomeKind,
} from "./smsDetector";
import { extractSmsFields } from "./smsFieldExtractor";
import { normalizeMerchantName } from "./smsMerchantNormalizer";

export interface SmsParseContext {
  /** Optional account names for matching “from HDFC” style hints */
  accounts?: Array<{ id: string; name: string }>;
  /** User keyword rules from Settings (win over built-in merchant map) */
  categorizationRules?: CategorizationRule[];
  /** Override timezone when deriving date from receivedAtMs */
  timezone?: string;
}

function buildNote(parts: {
  merchant?: string;
  bank?: string;
  paymentMethod?: string;
  accountLast4?: string;
  externalRef?: string;
  fallback: string;
}): string {
  const chunks = [
    parts.merchant,
    parts.paymentMethod,
    parts.bank,
    parts.accountLast4 ? `A/c ${parts.accountLast4}` : undefined,
    parts.externalRef ? `Ref ${parts.externalRef}` : undefined,
  ].filter(Boolean);
  if (chunks.length > 0) return chunks.join(" · ").slice(0, 160);
  return parts.fallback.slice(0, 160);
}

/**
 * Bank / UPI SMS parser.
 * Phase 5: extract fields. Phase 6: normalize merchant. Phase 7: categorize.
 */
export function parseBankSms(
  message: RawSmsMessage,
  context: SmsParseContext = {}
): SmsParsedTransaction {
  const body = (message.body || "").trim();
  if (!body) {
    return {
      kind: "non_financial",
      confidence: 0,
      detectionReasons: ["empty_body"],
    };
  }

  const detection = detectSmsTransaction(message);
  const fields = extractSmsFields(message, { timezone: context.timezone });

  const amount = fields.amount ?? detection.amount;
  const date = fields.date;
  const month = date ? monthFromDateKey(date) : undefined;
  const merchantNorm = normalizeMerchantName(fields.merchant);
  const merchant = merchantNorm.merchant;
  const parseReasons = [...fields.reasons];
  if (merchantNorm.reason) parseReasons.push(`merchant_${merchantNorm.reason}`);

  const parsed: SmsParsedTransaction = {
    kind: detection.kind,
    amount,
    date,
    month,
    time: fields.time,
    merchant,
    merchantRaw: merchantNorm.merchantRaw,
    bank: fields.bank,
    paymentMethod: fields.paymentMethod,
    accountLast4: fields.accountLast4,
    externalRef: fields.externalRef,
    note: buildNote({
      merchant,
      bank: fields.bank,
      paymentMethod: fields.paymentMethod,
      accountLast4: fields.accountLast4,
      externalRef: fields.externalRef,
      fallback: body,
    }),
    confidence: detection.confidence,
    detectionReasons: detection.reasons,
    parseReasons,
    templateId: "phase7-parser",
  };

  if (detection.kind === "expense" && merchant) {
    const cat = categorizeSmsMerchant(
      merchant,
      context.categorizationRules
    );
    if (cat) {
      parsed.category = cat.category;
      parsed.subcategory = cat.subcategory;
      parseReasons.push(`category_${cat.source}`);
      parsed.parseReasons = parseReasons;
    }
  }

  // Prefer matching user account by last4 or name
  if (context.accounts?.length) {
    const lower = body.toLowerCase();
    const byName = context.accounts.find((a) =>
      lower.includes(a.name.trim().toLowerCase())
    );
    if (byName) parsed.accountHint = byName.name;
  }
  if (fields.accountLast4) {
    parsed.accountHint = parsed.accountHint || `…${fields.accountLast4}`;
  }

  // Confidence boosts when key fields are present
  let confidence = parsed.confidence;
  if (isExpenseOrIncomeKind(detection.kind)) {
    if (amount == null) confidence = Math.min(confidence, 0.55);
    else confidence = Math.max(confidence, 0.82);
    if (merchant) confidence = Math.min(0.95, confidence + 0.05);
    if (merchantNorm.matched) confidence = Math.min(0.97, confidence + 0.02);
    if (parsed.category) confidence = Math.min(0.98, confidence + 0.02);
    if (fields.paymentMethod) confidence = Math.min(0.96, confidence + 0.03);
    if (fields.externalRef) confidence = Math.min(0.97, confidence + 0.02);
  }
  parsed.confidence = confidence;

  return parsed;
}

/** Minimum confidence to consider auto-commit without review (product-tunable later). */
export const SMS_AUTO_COMMIT_CONFIDENCE = 0.75;
