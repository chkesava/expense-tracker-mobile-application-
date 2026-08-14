/**
 * Phase 16 — on-device fallback when the rule parser is not confident.
 * Raw SMS never leaves the device (no cloud LLM).
 */

import type { CategorizationRule } from "@/shared/types/expense";
import type {
  RawSmsMessage,
  SmsParsedTransaction,
} from "@/shared/types/smsTransaction";
import { monthFromDateKey } from "@/shared/utils/dates";
import { parseNaturalLanguageTransaction } from "@/shared/utils/magicParser";
import { categorizeSmsMerchant } from "./smsCategorizer";
import { classifySmsIncomeSource } from "./smsIncomeClassifier";
import { isExpenseOrIncomeKind } from "./smsDetector";
import { SMS_MERCHANT_CATALOG } from "./smsMerchantCatalog";
import {
  foldMerchantKey,
  normalizeMerchantName,
} from "./smsMerchantNormalizer";

/** Keep in sync with SMS_AUTO_COMMIT_CONFIDENCE in smsParser. */
const AI_TRIGGER_CONFIDENCE = 0.75;

const EXTRA_MERCHANT_PATTERNS: RegExp[] = [
  /(?:m\/s|trf\s+to|debited\s+by|deducted\s+(?:for|at)|auto-?pay(?:\s+for)?)\s*([A-Za-z0-9][A-Za-z0-9 &*._-]{1,40})/i,
  /(?:subscription|autopay)\s+(?:for\s+)?([A-Za-z][A-Za-z0-9 &*._-]{1,40})/i,
];

const EXPENSE_HINT = /\b(?:deducted|auto-?pay|subscription|emi|mandate)\b/i;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function catalogMerchantInBody(body: string): string | undefined {
  const folded = foldMerchantKey(body);
  for (const entry of SMS_MERCHANT_CATALOG) {
    const nameRe = new RegExp(`\\b${escapeRegex(entry.canonical)}\\b`, "i");
    if (nameRe.test(body)) return entry.canonical;
    for (const alias of entry.aliases ?? []) {
      const key = foldMerchantKey(alias);
      if (key.length >= 5 && folded.includes(key)) return entry.canonical;
      if (
        key.length >= 4 &&
        new RegExp(`\\b${escapeRegex(alias)}\\b`, "i").test(body)
      ) {
        return entry.canonical;
      }
    }
  }
  return undefined;
}

function extraMerchantToken(body: string): string | undefined {
  for (const re of EXTRA_MERCHANT_PATTERNS) {
    const match = body.match(re);
    const raw = match?.[1]?.trim();
    if (!raw || raw.length < 2) continue;
    const normalized = normalizeMerchantName(raw);
    if (normalized.merchant) return normalized.merchant;
  }
  return undefined;
}

export function needsSmsAiFallback(parsed: SmsParsedTransaction): boolean {
  if (parsed.amount == null || parsed.amount <= 0) return false;
  if (parsed.kind === "otp" || parsed.kind === "promotional" || parsed.kind === "transfer") {
    return false;
  }
  if (parsed.kind === "credit_card_payment" || parsed.kind === "unknown") {
    return false;
  }
  if (isExpenseOrIncomeKind(parsed.kind)) {
    if (parsed.confidence < AI_TRIGGER_CONFIDENCE) return true;
    if (!parsed.date) return true;
    if (parsed.kind === "income" || parsed.kind === "refund") {
      return !parsed.incomeSource && !parsed.merchant?.trim();
    }
    return !parsed.merchant?.trim();
  }
  // Amount with unclear direction — try to recover a merchant / expense kind.
  return parsed.kind === "non_financial";
}

function rescore(parsed: SmsParsedTransaction): number {
  let confidence = parsed.confidence;
  if (!isExpenseOrIncomeKind(parsed.kind)) return confidence;
  if (parsed.amount == null) confidence = Math.min(confidence, 0.55);
  else confidence = Math.max(confidence, 0.82);
  if (parsed.merchant) confidence = Math.min(0.95, confidence + 0.05);
  if (parsed.category) confidence = Math.min(0.98, confidence + 0.02);
  if (parsed.incomeSource) confidence = Math.min(0.97, confidence + 0.02);
  return confidence;
}

/**
 * Fill missing fields from an on-device second pass. Never overwrites
 * amount/merchant/date the rule parser already set.
 */
export function applySmsAiFallback(
  message: RawSmsMessage,
  parsed: SmsParsedTransaction,
  context: { categorizationRules?: CategorizationRule[] } = {}
): SmsParsedTransaction {
  if (!needsSmsAiFallback(parsed)) return parsed;

  const body = (message.body || "").trim();
  const next: SmsParsedTransaction = {
    ...parsed,
    parseReasons: [...(parsed.parseReasons || [])],
    detectionReasons: [...(parsed.detectionReasons || [])],
  };

  const recovered =
    catalogMerchantInBody(body) || extraMerchantToken(body);
  if (!next.merchant && recovered) {
    const normalized = normalizeMerchantName(recovered);
    next.merchant = normalized.merchant || recovered;
    next.merchantRaw = next.merchantRaw || recovered;
    next.parseReasons = [...(next.parseReasons || []), "ai_fallback_merchant"];
  }

  if (next.kind === "non_financial" && EXPENSE_HINT.test(body) && next.merchant) {
    next.kind = "expense";
    next.detectionReasons = [
      ...(next.detectionReasons || []),
      "ai_fallback_expense",
    ];
    next.confidence = Math.max(next.confidence, 0.72);
  }

  if (!next.date || next.amount == null) {
    const magic = parseNaturalLanguageTransaction(body);
    if (next.amount == null && magic.amount) {
      next.amount = magic.amount;
      next.parseReasons = [...(next.parseReasons || []), "ai_fallback_amount"];
    }
    if (!next.date && magic.date) {
      next.date = magic.date;
      next.month = monthFromDateKey(magic.date);
      next.parseReasons = [...(next.parseReasons || []), "ai_fallback_date"];
    }
  }

  if (next.kind === "expense" && next.merchant && !next.category) {
    const cat = categorizeSmsMerchant(
      next.merchant,
      context.categorizationRules
    );
    if (cat) {
      next.category = cat.category;
      next.subcategory = cat.subcategory;
      next.parseReasons = [...(next.parseReasons || []), "ai_fallback_category"];
    }
  }

  if ((next.kind === "income" || next.kind === "refund") && !next.incomeSource) {
    next.incomeSource = classifySmsIncomeSource(body, next.amount);
    next.parseReasons = [...(next.parseReasons || []), "ai_fallback_income"];
  }

  if (next.date && !next.month) next.month = monthFromDateKey(next.date);

  if (
    next.parseReasons?.some((reason) => reason.startsWith("ai_fallback")) ||
    next.detectionReasons?.includes("ai_fallback_expense")
  ) {
    next.templateId = "ai-fallback";
    next.parseReasons = [...(next.parseReasons || []), "ai_fallback"];
    next.confidence = rescore(next);
  }

  return next;
}
