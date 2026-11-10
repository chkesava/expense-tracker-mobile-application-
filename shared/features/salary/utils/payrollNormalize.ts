/**
 * India-first Payroll & Employer Text Normalization (SPENDLY-326, epic SPENDLY-324).
 *
 * Normalizes noisy Indian bank narrations into:
 * 1. Cleaned employer display name & normalized matching key.
 * 2. Extracted or inferred wage month (YYYY-MM).
 * 3. Identified payroll rail / gateway.
 * 4. Extracted payroll keywords & exclusion indicators.
 *
 * Pure and deterministic.
 */

import { SalaryEmployer, SalaryType } from "../types";

export interface NormalizedPayrollNarration {
  /** Original raw string. */
  raw: string;
  /** Cleaned employer display name (e.g., "Acme Technologies"). */
  employerDisplay: string;
  /** Normalized lowercase matching key (e.g., "acme technologies"). */
  employerNormalized: string;
  /** Extracted or inferred payroll wage month (YYYY-MM). */
  wageMonth: string;
  /** Whether the wage month was explicitly found in the narration text. */
  isExplicitMonth: boolean;
  /** Detected rail or gateway (e.g., "CMS", "ACH", "RazorpayX"). */
  railOrGateway?: string;
  /** Keywords indicating payroll/salary. */
  payrollTokens: string[];
  /** Inferred salary type (regular, bonus, stipend, reimbursement, severance). */
  suggestedType: SalaryType;
  /** Flags indicating clear non-salary transactions. */
  exclusions: {
    isP2PUpi: boolean;
    isRefund: boolean;
    isCashback: boolean;
    isLoan: boolean;
    isInvestment: boolean;
    isSettlement: boolean;
  };
}

// ── Constants & Dictionaries ───────────────────────────────────────────────────

const MONTH_MAP: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

const PAYROLL_GATEWAYS: Record<string, string> = {
  RAZORPAYX: "RazorpayX",
  RAZORPAY: "RazorpayX",
  GREYTHR: "greytHR",
  KREDILY: "Kredily",
  RIPPLING: "Rippling",
  DARWINBOX: "Darwinbox",
  ZOHO: "Zoho Payroll",
  ZOHOPAYROLL: "Zoho Payroll",
  KAPITTAL: "Kapittal",
};

const CORPORATE_SUFFIXES = [
  /\bPRIVATE\s+LIMITED\b/gi,
  /\bPVT\s+LTD\b/gi,
  /\bPVT\b/gi,
  /\bLIMITED\b/gi,
  /\bLTD\b/gi,
  /\bLLP\b/gi,
  /\bINC(?:\.|\b)/gi,
  /\bCORP(?:ORATION)?(?:\.|\b)/gi,
  /\bENTERPRISES?\b/gi,
  /\bINDIA\b/gi,
];

const BANK_RAIL_PREFIXES = [
  /^(?:CMS|ACH|NEFT|RTGS|NACH|IMPS|UPI|INB|BIL|CLG|SAL)[\s/\-_:]+/i,
  /^(?:BY\s+CLG|BY\s+TRF|BY\s+TRANSFER)[\s/\-_:]+/i,
  /^(?:ACH\s+[CD])[\s/\-_:]+/i,
];

const RAIL_WORDS = new Set([
  "UPI",
  "DR",
  "CR",
  "P2A",
  "P2M",
  "P2P",
  "MOB",
  "IB",
  "INB",
  "ONL",
  "BIL",
  "REV",
  "NEFT",
  "IMPS",
  "RTGS",
  "TRANSFER",
  "TRF",
  "TO",
  "BY",
  "FROM",
  "NETBANKING",
  "CLG",
  "ACH",
  "CMS",
  "NACH",
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Formats a string to Title Case. */
export function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Normalizes an employer name:
 * - Strips legal corporate suffixes (`Pvt Ltd`, `LLP`, `Inc`).
 * - Strips punctuation and extraneous spaces.
 * - Returns clean display name and lowercase normalized key.
 */
export function normalizeEmployerName(raw: string): {
  display: string;
  normalized: string;
} {
  if (!raw || typeof raw !== "string") {
    return { display: "Unknown Employer", normalized: "unknown employer" };
  }

  let cleaned = raw.trim();

  // Strip rail prefixes like CMS/, NEFT-, etc.
  for (const prefix of BANK_RAIL_PREFIXES) {
    cleaned = cleaned.replace(prefix, "");
  }

  // Remove reference / transaction IDs (e.g. numbers longer than 5 digits or alphanumeric refs)
  cleaned = cleaned.replace(/\b\d{6,}\b/g, "");
  cleaned = cleaned.replace(/\bCMS\d+\b/gi, "");
  cleaned = cleaned.replace(/\b[A-Z]{4}0[A-Z0-9]{6}\b/gi, ""); // IFSC

  // Remove explicit salary/payroll tokens
  cleaned = cleaned.replace(/\b(?:SALARY|SAL|PAYROLL|WAGES|STIPEND)\b/gi, "");

  // Remove corporate suffixes for clean display and normalized key
  let displayCleaned = cleaned;
  for (const suffix of CORPORATE_SUFFIXES) {
    displayCleaned = displayCleaned.replace(suffix, " ");
  }

  // Clean characters and filter out common rail noise tokens
  const cleanTokens = displayCleaned
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !RAIL_WORDS.has(token.toUpperCase()));

  const normTokens = cleanTokens.map((t) => t.toLowerCase());

  const display = cleanTokens.length > 0 ? toTitleCase(cleanTokens.join(" ")) : "Unknown Employer";
  const normalized = normTokens.length > 0 ? normTokens.join(" ") : display.toLowerCase();

  return { display, normalized };
}

/**
 * Attempts to extract an explicit wage month (YYYY-MM) from text.
 * Handles patterns such as:
 * - "SAL OCT 2026", "SALARY OCTOBER 2026", "SAL/OCT26", "OCT-2026 SAL"
 * - "SALARY FOR SEP 2026", "SAL 09/2026", "09-2026 SAL"
 */
export function extractPayrollMonth(
  text: string,
  referenceDate: string
): string | undefined {
  if (!text) return undefined;
  const upper = text.toUpperCase();

  // Pattern 1: Month Name + Year (e.g. "OCT 2026", "OCTOBER 2026", "OCT-26", "OCT26")
  const monthNameRegex =
    /\b(JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUN(?:E)?|JUL(?:Y)?|AUG(?:UST)?|SEP(?:TEMBER)?|SEPT|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)\s*[-/]?\s*(20\d{2}|\d{2})\b/i;
  const match1 = text.match(monthNameRegex);
  if (match1) {
    const rawMonth = match1[1].toLowerCase();
    const rawYear = match1[2];
    const monthNum = MONTH_MAP[rawMonth];
    if (monthNum) {
      const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
      return `${year}-${monthNum}`;
    }
  }

  // Pattern 2: Numeric Month/Year (e.g. "SAL 10/2026", "10-2026", "10/26")
  const numericRegex = /\b(?:SAL|SALARY|PAYROLL)?\s*\(?(0[1-9]|1[0-2])\s*[-/]\s*(20\d{2}|\d{2})\)?\b/i;
  const match2 = text.match(numericRegex);
  if (match2) {
    const monthNum = match2[1];
    const rawYear = match2[2];
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    return `${year}-${monthNum}`;
  }

  // Pattern 3: Standalone Month Name near SAL/SALARY (uses reference date's year)
  const standaloneMonthRegex =
    /\b(?:SALARY|SAL|PAYROLL)\s+(?:FOR\s+)?(JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUN(?:E)?|JUL(?:Y)?|AUG(?:UST)?|SEP(?:TEMBER)?|SEPT|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)\b/i;
  const match3 = text.match(standaloneMonthRegex);
  if (match3) {
    const rawMonth = match3[1].toLowerCase();
    const monthNum = MONTH_MAP[rawMonth];
    if (monthNum) {
      const year = referenceDate ? referenceDate.slice(0, 4) : new Date().getFullYear().toString();
      return `${year}-${monthNum}`;
    }
  }

  return undefined;
}

/**
 * Infers the pay period month (wage month) for a given transaction date.
 *
 * In India:
 * - Salaries credited between day 1 and 10 of month M are almost always for month M-1.
 *   (e.g., Nov 01, 2026 payment is for October 2026 wage month).
 * - Salaries credited from day 11 to 31 of month M are for month M.
 *   (e.g., Oct 31, 2026 payment is for October 2026 wage month).
 */
export function inferPayPeriodMonth(
  transactionDate: string,
  explicitMonth?: string
): string {
  if (explicitMonth && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(explicitMonth)) {
    return explicitMonth;
  }

  if (!transactionDate || !/^\d{4}-\d{2}-\d{2}/.test(transactionDate)) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }

  const [yearStr, monthStr, dayStr] = transactionDate.slice(0, 10).split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (day <= 10) {
    // Paid in early days of month -> represents previous wage month
    const prevDate = new Date(year, month - 2, 1);
    const prevYear = prevDate.getFullYear();
    const prevMonth = String(prevDate.getMonth() + 1).padStart(2, "0");
    return `${prevYear}-${prevMonth}`;
  }

  return `${yearStr}-${monthStr}`;
}

/**
 * Determines the suggested SalaryType based on keywords.
 */
export function inferSalaryType(text: string): SalaryType {
  const upper = text.toUpperCase();

  if (
    /\b(?:BONUS|ANNUAL BONUS|PERFORMANCE BONUS|EX-GRATIA|DIWALI BONUS)\b/.test(
      upper
    )
  ) {
    return "bonus";
  }
  if (/\b(?:INCENTIVE|COMMISSION|SALES INCENTIVE|VARIABLE PAY)\b/.test(upper)) {
    return "incentive";
  }
  if (
    /\b(?:REIMBURSEMENT|REIMB|EXPENSE CLAIM|MEDICAL REIMB|LTA REIMB)\b/.test(
      upper
    )
  ) {
    return "reimbursement";
  }
  if (/\b(?:STIPEND|INTERN|FELLOWSHIP)\b/.test(upper)) {
    return "stipend";
  }
  if (
    /\b(?:SEVERANCE|NOTICE PAY|LEAVE ENCASHMENT|GRATUITY PAYOUT)\b/.test(upper)
  ) {
    return "severance";
  }

  return "regular";
}

/**
 * Comprehensive parser for bank transaction narrations.
 */
export function parsePayrollNarration(
  narration: string,
  transactionDate: string
): NormalizedPayrollNarration {
  const raw = narration || "";
  const upper = raw.toUpperCase();

  // 1. Check for payroll tokens
  const payrollTokens: string[] = [];
  const tokenChecks = [
    { pattern: /\bSALARY\b/, token: "SALARY" },
    { pattern: /\bSAL\b/, token: "SAL" },
    { pattern: /\bPAYROLL\b/, token: "PAYROLL" },
    { pattern: /\bWAGES\b/, token: "WAGES" },
    { pattern: /\bSTIPEND\b/, token: "STIPEND" },
    { pattern: /\bCMS\b|\/CMS\/|CMS-/, token: "CMS" },
    { pattern: /\bACH\s*C-|\bACH\b/, token: "ACH" },
    { pattern: /\bNACH\b/, token: "NACH" },
    { pattern: /\bINB\s+SAL\b/, token: "INB_SAL" },
    { pattern: /\bDIRECT\s+DEP\b/, token: "DIRECT_DEP" },
  ];

  for (const { pattern, token } of tokenChecks) {
    if (pattern.test(upper)) payrollTokens.push(token);
  }

  // 2. Check for payroll gateways
  let railOrGateway: string | undefined;
  for (const [key, name] of Object.entries(PAYROLL_GATEWAYS)) {
    if (upper.includes(key)) {
      railOrGateway = name;
      payrollTokens.push(key);
      break;
    }
  }

  if (!railOrGateway) {
    if (/CMS/i.test(upper)) railOrGateway = "CMS";
    else if (/ACH/i.test(upper)) railOrGateway = "ACH";
    else if (/NACH/i.test(upper)) railOrGateway = "NACH";
    else if (/NEFT/i.test(upper)) railOrGateway = "NEFT";
    else if (/RTGS/i.test(upper)) railOrGateway = "RTGS";
    else if (/IMPS/i.test(upper)) railOrGateway = "IMPS";
  }

  // 3. Exclusions
  const isRefund = /\b(?:REFUND|REVERSAL|CHARGEBACK|RETURN|REV)\b/.test(upper);
  const isCashback =
    /\b(?:CASHBACK|REWARD|CRED CASHBACK|PROMO|LOYALTY)\b/.test(upper);
  const isLoan =
    /\b(?:DISBURSAL|LOAN\s+CR|PERSONAL\s+LOAN|MUTHOOT|BAJAJ\s+FINANCE)\b/.test(
      upper
    );
  const isInvestment =
    /\b(?:DIVIDEND|ZERODHA|GROWW|UPSTOX|INDMONEY|SWP|MUTUAL\s+FUND|REDEMPTION|INTEREST\s+CR)\b/.test(
      upper
    );
  const isSettlement = /\b(?:RENT|SPLITWISE|SPLIT|SETTLEMENT)\b/.test(upper);
  const isP2PUpi =
    /@(?:okaxis|okhdfcbank|okicici|oksbi|paytm|ybl|axl|ibl)\b/i.test(upper) &&
    payrollTokens.length === 0;

  // 4. Extract wage month
  const extractedMonth = extractPayrollMonth(raw, transactionDate);
  const wageMonth = inferPayPeriodMonth(transactionDate, extractedMonth);
  const isExplicitMonth = !!extractedMonth;

  // 5. Inferred type
  const suggestedType = inferSalaryType(raw);

  // 6. Employer extraction
  // Clean segments separated by delimiters (/ or - or :)
  let employerCandidate = raw;
  const segments = raw
    .split(/[\/\-:]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);

  // If there are segments, find the one most likely to be the employer name
  // (not a number, not a rail prefix, not a month or date)
  if (segments.length > 1) {
    const candidateSegment = segments.find((seg) => {
      const u = seg.toUpperCase();
      if (/^\d+$/.test(u)) return false;
      if (/^(?:CMS|ACH|NEFT|RTGS|NACH|IMPS|UPI|INB|BIL|CLG|SAL|CR|DR)\d*$/i.test(u))
        return false;
      if (/^[A-Z]{4}0[A-Z0-9]{6}$/.test(u)) return false; // IFSC
      if (
        /^(?:SALARY|SAL|PAYROLL|OCT|NOV|DEC|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP)\b/.test(
          u
        )
      )
        return false;
      return true;
    });
    if (candidateSegment) {
      employerCandidate = candidateSegment;
    }
  }

  const { display: employerDisplay, normalized: employerNormalized } =
    normalizeEmployerName(employerCandidate);

  return {
    raw,
    employerDisplay,
    employerNormalized,
    wageMonth,
    isExplicitMonth,
    railOrGateway,
    payrollTokens,
    suggestedType,
    exclusions: {
      isP2PUpi,
      isRefund,
      isCashback,
      isLoan,
      isInvestment,
      isSettlement,
    },
  };
}
