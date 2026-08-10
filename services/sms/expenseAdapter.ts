import { monthFromDateKey } from "@/shared/utils/dates";
import type {
  SmsExpenseWritePayload,
  SmsIncomeWritePayload,
  SmsParsedTransaction,
  SmsWritePayload,
} from "@/shared/types/smsTransaction";

export interface AdaptSmsOptions {
  /** Default when parser left category empty */
  defaultCategory?: string;
  defaultSubcategory?: string;
  defaultIncomeSource?: string;
  accountId?: string | null;
  /** Extra tags always applied (e.g. ["sms"]) */
  tags?: string[];
}

function requireAmountAndDate(
  parsed: SmsParsedTransaction
): { amount: number; date: string; month: string } | null {
  if (
    parsed.amount == null ||
    !Number.isFinite(parsed.amount) ||
    parsed.amount <= 0
  ) {
    return null;
  }
  const date = parsed.date?.trim();
  if (!date) return null;
  const month = parsed.month?.trim() || monthFromDateKey(date);
  return { amount: parsed.amount, date, month };
}

/**
 * Maps a parsed SMS draft to the same payload shape ExpenseForm writes.
 * Does not call Firestore — keeps existing create UI untouched.
 */
export function adaptParsedSmsToWritePayload(
  parsed: SmsParsedTransaction,
  options: AdaptSmsOptions = {}
): SmsWritePayload | null {
  const core = requireAmountAndDate(parsed);
  if (!core) return null;

  const accountId = options.accountId ?? null;
  const note =
    parsed.note?.trim() ||
    [parsed.merchant, parsed.externalRef].filter(Boolean).join(" · ") ||
    "SMS import";

  if (parsed.kind === "income") {
    const payload: SmsIncomeWritePayload = {
      amount: core.amount,
      source: options.defaultIncomeSource || "Other",
      date: core.date,
      month: core.month,
      accountId,
      note,
    };
    return { collection: "incomes", payload };
  }

  if (parsed.kind !== "expense") {
    return null;
  }

  const payload: SmsExpenseWritePayload = {
    amount: core.amount,
    category: (parsed.category || options.defaultCategory || "Other").trim(),
    subcategory: (
      parsed.subcategory ||
      options.defaultSubcategory ||
      "Other"
    ).trim(),
    date: core.date,
    month: core.month,
    accountId,
    note,
    tags: options.tags?.length ? [...options.tags] : [],
  };
  return { collection: "expenses", payload };
}
