/**
 * Phase 5 — extract structured fields from bank/UPI SMS bodies.
 * Pure JS — no Firebase.
 */

import { formatDateKey } from "@/shared/utils/dates";
import type { RawSmsMessage } from "@/shared/types/smsTransaction";
import { resolveInstitutionFromSms } from "@/shared/data/institutionMatch";

export type SmsPaymentMethod =
  | "UPI"
  | "IMPS"
  | "NEFT"
  | "RTGS"
  | "CARD"
  | "ATM"
  | "NETBANKING"
  | "UNKNOWN";

export type SmsExtractedFields = {
  amount?: number;
  merchant?: string;
  bank?: string;
  paymentMethod?: SmsPaymentMethod;
  /** YYYY-MM-DD */
  date?: string;
  /** HH:mm when available */
  time?: string;
  accountLast4?: string;
  externalRef?: string;
  reasons: string[];
};

const AMOUNT_PATTERNS: RegExp[] = [
  /(?:inr|rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
  /(?:amount|amt|txn(?:\s*amt)?)\s*(?:of|:)?\s*(?:inr|rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
  /([\d,]+(?:\.\d{1,2})?)\s*(?:inr|rs\.?|₹)/i,
];

const BANK_DEFS: Array<{ name: string; patterns: RegExp[] }> = [
  { name: "SBI", patterns: [/\bsbi\b/i, /sbiin/i, /state\s+bank/i] },
  { name: "HDFC", patterns: [/\bhdfc\b/i] },
  { name: "ICICI", patterns: [/\bicici\b/i] },
  { name: "Axis", patterns: [/\baxis\b/i] },
  { name: "Kotak", patterns: [/\bkotak\b/i] },
  { name: "Yes Bank", patterns: [/\byes\s*bank\b/i, /\byesbank\b/i] },
  { name: "IDFC", patterns: [/\bidfc\b/i] },
  { name: "PNB", patterns: [/\bpnb\b/i, /punjab\s+national/i] },
  { name: "BOB", patterns: [/\bbob\b/i, /bank\s+of\s+baroda/i] },
  { name: "Canara", patterns: [/\bcanara\b/i] },
  { name: "Union Bank", patterns: [/\bunion\s*bank\b/i] },
  { name: "IndusInd", patterns: [/\bindusind\b/i] },
  { name: "Federal", patterns: [/\bfederal\b/i] },
  { name: "RBL", patterns: [/\brbl\b/i] },
  { name: "HSBC", patterns: [/\bhsbc\b/i] },
  { name: "Citi", patterns: [/\bciti\b/i] },
  { name: "Paytm", patterns: [/\bpaytm\b/i] },
  { name: "PhonePe", patterns: [/\bphonepe\b/i] },
  { name: "Google Pay", patterns: [/\bgpay\b/i, /google\s*pay/i] },
];

const MERCHANT_STOP = new Set(
  [
    "inr",
    "rs",
    "upi",
    "imps",
    "neft",
    "rtgs",
    "a/c",
    "ac",
    "acct",
    "account",
    "ref",
    "reference",
    "txn",
    "transaction",
    "debited",
    "credited",
    "paid",
    "sent",
    "from",
    "your",
    "bank",
    "using",
    "via",
    "on",
    "at",
    "to",
    "for",
    "info",
    "avl",
    "bal",
    "balance",
    "total",
  ].map((s) => s.toLowerCase())
);

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

export function extractAmount(body: string): number | undefined {
  for (const re of AMOUNT_PATTERNS) {
    const match = body.match(re);
    if (!match?.[1]) continue;
    const value = Number(match[1].replace(/,/g, ""));
    if (Number.isFinite(value) && value > 0) return value;
  }
  return undefined;
}

export function extractPaymentMethod(body: string): SmsPaymentMethod {
  if (/\bupi\b/i.test(body)) return "UPI";
  if (/\bimps\b/i.test(body)) return "IMPS";
  if (/\bneft\b/i.test(body)) return "NEFT";
  if (/\brtgs\b/i.test(body)) return "RTGS";
  if (/\batm\b/i.test(body)) return "ATM";
  if (/\b(?:credit|debit)\s+card\b|\bpos\b|\bcard\s+xx/i.test(body)) return "CARD";
  if (/\bnet\s*banking\b|\binternet\s+banking\b/i.test(body)) return "NETBANKING";
  return "UNKNOWN";
}

export function extractBank(
  body: string,
  address?: string
): string | undefined {
  const catalog = resolveInstitutionFromSms({ sender: address, body });
  if (catalog) return catalog.institution.name;

  const haystack = `${address || ""} ${body}`;
  for (const bank of BANK_DEFS) {
    if (bank.patterns.some((re) => re.test(haystack))) return bank.name;
  }
  return undefined;
}

export function extractAccountLast4(body: string): string | undefined {
  const patterns = [
    /(?:a\/c|acct|account|ac)\s*(?:no\.?|number|#)?\s*(?:xx+|x+|\*+)?\s*(\d{4})\b/i,
    /(?:card|ending|ends?\s+with)\s*(?:xx+|x+|\*+)?\s*(\d{4})\b/i,
    /\bxx+(\d{4})\b/i,
    /\bx{2,}(\d{4})\b/i,
  ];
  for (const re of patterns) {
    const match = body.match(re);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

export function extractReferenceId(body: string): string | undefined {
  const patterns = [
    /(?:upi\s*)?ref(?:erence)?(?:\s*(?:no|num|number|#))?[:\s-]*([A-Za-z0-9]{6,})/i,
    /(?:txn|transaction|rr|utr)(?:\s*(?:id|no|num|number|#))?[:\s-]*([A-Za-z0-9]{6,})/i,
    /\bUTR[:\s-]*([A-Za-z0-9]{6,})/i,
  ];
  for (const re of patterns) {
    const match = body.match(re);
    if (match?.[1]) return match[1].replace(/[.,;]+$/, "");
  }
  return undefined;
}

function cleanMerchantToken(raw: string): string | undefined {
  let value = raw
    .replace(/["']/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.,;:]+$/g, "")
    .trim();
  if (!value) return undefined;

  // Strip trailing "on 12-08" etc.
  value = value.replace(/\s+on\s+\d{1,2}[-/].*$/i, "").trim();
  value = value.replace(/\s+via\s+\w+$/i, "").trim();

  const lower = value.toLowerCase();
  if (MERCHANT_STOP.has(lower)) return undefined;
  if (/^\d+$/.test(value)) return undefined;
  if (value.length < 2 || value.length > 48) return undefined;

  // Title-ish cleanup for all-caps bank SMS merchants
  if (value === value.toUpperCase() && /[A-Z]/.test(value)) {
    value = value
      .toLowerCase()
      .split(" ")
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" ");
  }
  return value;
}

export function extractMerchant(body: string): string | undefined {
  const patterns = [
    /(?:paid\s+to|sent\s+to|purchased?\s+at|spent\s+at|payment\s+to|towards|info[:\s]+)\s*([A-Za-z0-9][A-Za-z0-9 &*._-]{1,40})/i,
    /\bat\s+([A-Za-z0-9][A-Za-z0-9 &*._-]{1,40})(?:\s+on\b|\s+via\b|\.|$)/i,
    /\bto\s+([A-Za-z0-9][A-Za-z0-9 &*._-]{1,40})(?:\s+on\b|\s+via\b|\s+upi\b|\.|$)/i,
    /\b([A-Za-z0-9._-]{2,40})@(?:upi|ybl|oksbi|okhdfc|okicici|okaxis|paytm|ibl|axl)\b/i,
  ];

  for (const re of patterns) {
    const match = body.match(re);
    if (!match?.[1]) continue;
    const cleaned = cleanMerchantToken(match[1]);
    if (cleaned) return cleaned;
  }
  return undefined;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateKey(year: number, month: number, day: number): string | undefined {
  if (year < 2000 || year > 2100) return undefined;
  if (month < 1 || month > 12) return undefined;
  if (day < 1 || day > 31) return undefined;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function extractDateFromBody(
  body: string,
  fallbackMs?: number,
  timezone?: string
): { date?: string; time?: string; reasons: string[] } {
  const reasons: string[] = [];

  // 12-08-2026 or 12/08/26
  const dmy = body.match(
    /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/
  );
  if (dmy) {
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const date = toDateKey(year, month, day);
    if (date) {
      reasons.push("date_dmy");
      return { date, time: extractTime(body), reasons };
    }
  }

  // 12-Aug-2026 / 12 Aug 2026
  const mon = body.match(
    /\b(\d{1,2})[\/\-\s]([A-Za-z]{3,9})[\/\-\s](\d{2,4})\b/
  );
  if (mon) {
    const month = MONTHS[mon[2].toLowerCase()];
    if (month) {
      let year = Number(mon[3]);
      if (year < 100) year += 2000;
      const date = toDateKey(year, month, Number(mon[1]));
      if (date) {
        reasons.push("date_dmony");
        return { date, time: extractTime(body), reasons };
      }
    }
  }

  if (fallbackMs != null && Number.isFinite(fallbackMs)) {
    reasons.push("date_from_sms_timestamp");
    return {
      date: formatDateKey(new Date(fallbackMs), timezone),
      time: extractTime(body),
      reasons,
    };
  }

  return { time: extractTime(body), reasons };
}

function extractTime(body: string): string | undefined {
  const match = body.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?\b/i);
  if (!match) return undefined;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const ampm = match[3]?.toLowerCase();
  if (ampm === "pm" && hour < 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return undefined;
  return `${pad2(hour)}:${pad2(minute)}`;
}

/**
 * Extract amount, merchant, bank, payment method, date, account last4, ref id.
 */
export function extractSmsFields(
  message: Pick<RawSmsMessage, "body" | "address" | "receivedAtMs">,
  options: { timezone?: string } = {}
): SmsExtractedFields {
  const body = (message.body || "").trim();
  const reasons: string[] = [];
  if (!body) return { reasons: ["empty_body"] };

  const amount = extractAmount(body);
  if (amount != null) reasons.push("amount");

  const paymentMethod = extractPaymentMethod(body);
  if (paymentMethod !== "UNKNOWN") reasons.push(`method_${paymentMethod}`);

  const bank = extractBank(body, message.address);
  if (bank) reasons.push(`bank_${bank}`);

  const merchant = extractMerchant(body);
  if (merchant) reasons.push("merchant");

  const accountLast4 = extractAccountLast4(body);
  if (accountLast4) reasons.push("account_last4");

  const externalRef = extractReferenceId(body);
  if (externalRef) reasons.push("external_ref");

  const dated = extractDateFromBody(
    body,
    message.receivedAtMs,
    options.timezone
  );
  reasons.push(...dated.reasons);

  return {
    amount,
    merchant,
    bank,
    paymentMethod: paymentMethod === "UNKNOWN" ? undefined : paymentMethod,
    date: dated.date,
    time: dated.time,
    accountLast4,
    externalRef,
    reasons,
  };
}
