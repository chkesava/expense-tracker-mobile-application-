/**
 * Phase 4 — SMS transaction detection.
 * Classifies messages as expense / income / transfer / otp / promotional / non_financial.
 * Pure JS — no Firebase.
 */

import type {
  RawSmsMessage,
  SmsDetectionKind,
} from "@/shared/types/smsTransaction";

export type SmsDetectionResult = {
  kind: SmsDetectionKind;
  confidence: number;
  /** Human-readable rule tags (local debug). */
  reasons: string[];
  /** Best-effort amount when present in the body. */
  amount?: number;
};

const AMOUNT_PATTERNS: RegExp[] = [
  /(?:inr|rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
  /([\d,]+(?:\.\d{1,2})?)\s*(?:inr|rs\.?|₹)/i,
];

const OTP_PATTERNS: RegExp[] = [
  /\botp\b/i,
  /\bone[-\s]?time\s+(?:password|pwd|pin|code)\b/i,
  /\bverification\s+code\b/i,
  /\bdo\s+not\s+share\b/i,
  /\bvalid\s+for\s+\d+\s*(?:min|minute|sec|second)/i,
];

const PROMO_PATTERNS: RegExp[] = [
  /\boffer\b/i,
  /\bdiscount\b/i,
  /\bcashback\s+offer\b/i,
  /\bflat\s+\d+%\s+off\b/i,
  /\blimited\s+period\b/i,
  /\bapply\s+now\b/i,
  /\bclick\s+(?:here|now)\b/i,
  /\bunsubscribe\b/i,
  /\bpre-?approved\b/i,
  /\bloan\s+offer\b/i,
  /\bshop\s+now\b/i,
  /\bwin\s+(?:a|an|the)?\s*(?:prize|voucher|gift)/i,
];

const TRANSFER_PATTERNS: RegExp[] = [
  /\bfund\s+transfer\b/i,
  /\b(?:has\s+been\s+)?transferred\s+(?:to|from)\b/i,
  /\btransfer(?:red)?\s+(?:of|to|from)\b/i,
  /\b(?:neft|imps|rtgs)\b.*\b(?:to|from|transfer)\b/i,
  /\bsent\s+to\s+(?:a\/c|account|acct)\b/i,
  /\breceived\s+from\s+(?:a\/c|account|acct)\b/i,
  /\bself\s+transfer\b/i,
];

const EXPENSE_PATTERNS: RegExp[] = [
  /\b(?:has\s+been\s+)?debited\b/i,
  /\bspent\b/i,
  /\bwithdrawn\b/i,
  /\bpurchase(?:d)?\b/i,
  /\bpaid\s+(?:to|at|for)\b/i,
  /\bpayment\s+(?:of|for|to)\b/i,
  /\bsent\s+(?:rs\.?|inr|₹|money)?/i,
  /\bdr\.?\s*(?:amt|amount)?\b/i,
  /\bpos\s+(?:txn|transaction|purchase)\b/i,
  /\batm\s+wdr\b/i,
];

const INCOME_PATTERNS: RegExp[] = [
  /\b(?:has\s+been\s+)?credited\b/i,
  /\bdeposited\b/i,
  /\breceived\b/i,
  /\bsalary\b/i,
  /\brefund(?:ed)?\b/i,
  /\bcashback\b/i,
  /\bcr\.?\s*(?:amt|amount)?\b/i,
  /\binward\s+(?:neft|imps|rtgs|upi)\b/i,
];

function parseAmount(body: string): number | undefined {
  for (const re of AMOUNT_PATTERNS) {
    const match = body.match(re);
    if (!match?.[1]) continue;
    const value = Number(match[1].replace(/,/g, ""));
    if (Number.isFinite(value) && value > 0) return value;
  }
  return undefined;
}

function hasMoneySignal(body: string, amount?: number): boolean {
  if (amount != null) return true;
  return /(?:inr|rs\.?|₹)\s*[\d,]+/i.test(body) || /[\d,]+\s*(?:inr|rs\.?|₹)/i.test(body);
}

function firstMatchLabel(body: string, patterns: RegExp[], label: string): string | null {
  return patterns.some((re) => re.test(body)) ? label : null;
}

/**
 * Classify an SMS body (+ optional sender) into a detection kind.
 * Priority: OTP → promotional → transfer → expense/income → non_financial.
 */
export function detectSmsTransaction(
  message: Pick<RawSmsMessage, "body" | "address">
): SmsDetectionResult {
  const body = (message.body || "").trim();
  if (!body) {
    return { kind: "non_financial", confidence: 0.95, reasons: ["empty_body"] };
  }

  const amount = parseAmount(body);
  const reasons: string[] = [];

  // 1) OTP — even if amount-like digits appear
  const otpHit = firstMatchLabel(body, OTP_PATTERNS, "otp_keyword");
  const looksLikeOtpCode =
    /\botp\b/i.test(body) ||
    (/\b(?:password|code|pin)\b/i.test(body) && /\b\d{4,8}\b/.test(body));
  if (otpHit || looksLikeOtpCode) {
    if (otpHit) reasons.push(otpHit);
    if (looksLikeOtpCode) reasons.push("otp_code_shape");
    return { kind: "otp", confidence: 0.92, reasons, amount };
  }

  // 2) Promotional — exclude when clear debit/credit money movement
  const promoHit = firstMatchLabel(body, PROMO_PATTERNS, "promo_keyword");
  const strongMoneyMove =
    /\b(?:debited|credited|withdrawn|deposited|spent|purchase)\b/i.test(body) &&
    hasMoneySignal(body, amount);
  if (promoHit && !strongMoneyMove) {
    reasons.push(promoHit);
    return { kind: "promotional", confidence: 0.85, reasons, amount };
  }

  // 3) Transfer
  const transferHit = firstMatchLabel(body, TRANSFER_PATTERNS, "transfer_keyword");
  if (transferHit) {
    reasons.push(transferHit);
    return {
      kind: "transfer",
      confidence: amount != null ? 0.88 : 0.8,
      reasons,
      amount,
    };
  }

  const expenseHit = firstMatchLabel(body, EXPENSE_PATTERNS, "expense_keyword");
  const incomeHit = firstMatchLabel(body, INCOME_PATTERNS, "income_keyword");

  // 4) Prefer explicit debit/credit wording
  if (expenseHit && !incomeHit) {
    reasons.push(expenseHit);
    return {
      kind: "expense",
      confidence: amount != null ? 0.9 : 0.78,
      reasons,
      amount,
    };
  }
  if (incomeHit && !expenseHit) {
    reasons.push(incomeHit);
    // "credit card" alone is not income
    if (/\bcredit\s+card\b/i.test(body) && !/\bcredited\b/i.test(body) && !/\breceived\b/i.test(body)) {
      reasons.push("credit_card_guard");
      return { kind: "non_financial", confidence: 0.55, reasons, amount };
    }
    return {
      kind: "income",
      confidence: amount != null ? 0.9 : 0.78,
      reasons,
      amount,
    };
  }

  // Both expense + income keywords (e.g. "debited ... credited to merchant")
  if (expenseHit && incomeHit) {
    if (/\bdebited\b/i.test(body) || /\bspent\b/i.test(body) || /\bpaid\b/i.test(body)) {
      reasons.push("expense_over_income");
      return {
        kind: "expense",
        confidence: amount != null ? 0.86 : 0.74,
        reasons,
        amount,
      };
    }
    reasons.push("income_over_expense");
    return {
      kind: "income",
      confidence: amount != null ? 0.86 : 0.74,
      reasons,
      amount,
    };
  }

  // Money with UPI send/receive without clear verb
  if (hasMoneySignal(body, amount) && /\bupi\b/i.test(body)) {
    if (/\b(?:to|paid)\b/i.test(body)) {
      reasons.push("upi_outgoing");
      return { kind: "expense", confidence: 0.72, reasons, amount };
    }
    if (/\bfrom\b/i.test(body)) {
      reasons.push("upi_incoming");
      return { kind: "income", confidence: 0.72, reasons, amount };
    }
  }

  if (hasMoneySignal(body, amount)) {
    reasons.push("money_without_clear_direction");
    return { kind: "non_financial", confidence: 0.45, reasons, amount };
  }

  reasons.push("no_financial_signal");
  return { kind: "non_financial", confidence: 0.7, reasons, amount };
}

export function isMoneyMovementKind(kind: SmsDetectionKind): boolean {
  return kind === "expense" || kind === "income" || kind === "transfer";
}

export function isExpenseOrIncomeKind(kind: SmsDetectionKind): boolean {
  return kind === "expense" || kind === "income";
}
