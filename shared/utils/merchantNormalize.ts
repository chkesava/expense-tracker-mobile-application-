/**
 * India-first merchant text normalization (SPENDLY-188, epic SPENDLY-186).
 *
 * Turns a noisy narration — UPI/VPA strings, UPI QR, card descriptors,
 * gateway prefixes, NEFT/IMPS/RTGS references, city/store suffixes, legal
 * suffixes — into a cleaned name and a folded matching key. Pure and
 * deterministic; the raw text is returned untouched.
 *
 * Only known, non-semantic noise is removed. Words that can carry meaning
 * ("INDIA", "STORE", "FOOD", a city at the end of a manual note) are kept
 * unless the context makes them noise (a card descriptor's trailing city).
 *
 * The cleaned name never contains a VPA, an account or card number, or a
 * reference number. A VPA's local part is kept only as a matching hint, and
 * only when it doesn't look personal (no phone-like digit runs).
 *
 * This is independent of services/recurring/merchantNormalizer.ts, which recurring detection
 * dedupe keys and statement fingerprints depend on and must not change.
 *
 * Documented in docs/SPENDLY-188-merchant-normalization.md.
 */

import type { MerchantRail } from "../types/merchant";
import { foldKey, MERCHANT_LIMITS } from "./merchantModel";

/** Bumped whenever a rule here changes what a narration normalizes to. */
export const MERCHANT_NORMALIZE_VERSION = 1;

export interface NormalizedMerchantText {
  /** The original text, untouched. */
  raw: string;
  rail: MerchantRail;
  /** Cleaned human name; empty when the text holds no safe name (e.g. a bare VPA or ATM). */
  display: string;
  /** Folded matching key of `display` (or of the VPA hint when there's no name). */
  normalized: string;
  /** Lowercase words of the cleaned name. */
  tokens: string[];
  /** Gateway the payment went through, when a known prefix was removed. */
  gateway?: string;
  /** Folded descriptor detail after a `*` ("UBER *TRIP" → "trip"). */
  detail?: string;
  /** VPA handle and a non-personal local part, for matching only. Never displayed. */
  vpa?: { handle: string; local?: string };
  /** Folded keys to try when matching, best first, de-duplicated. */
  candidates: string[];
}

// ── Vocabulary ────────────────────────────────────────────────────────────

const GATEWAYS: Record<string, string> = {
  RAZORPAY: "Razorpay",
  RZP: "Razorpay",
  PAYU: "PayU",
  PYU: "PayU",
  CCAVENUE: "CCAvenue",
  BILLDESK: "BillDesk",
  PAYTM: "Paytm",
  CASHFREE: "Cashfree",
  JUSPAY: "Juspay",
  EASEBUZZ: "Easebuzz",
  INSTAMOJO: "Instamojo",
};
/** A gateway prefix needs a separator, so "PAYTMQR…" or "PAYU" alone isn't read as one. */
const GATEWAY_PREFIX = new RegExp(`^(${Object.keys(GATEWAYS).join("|")})\\s*[*_:\\-]\\s*(.*)$`, "i");

/** Narration segments that are rail or direction markers. */
const RAIL_WORDS = new Set([
  "UPI", "DR", "CR", "P2A", "P2M", "P2P", "MOB", "IB", "INB", "ONL", "BIL", "REV", "NEFT", "IMPS", "RTGS",
  "UPIINTENT", "INTENT", "COLLECT", "TRANSFER", "TRF", "TO", "BY", "FROM", "NETBANKING",
]);

/** 4-letter IFSC bank prefixes seen alone in narrations. */
const BANK_CODES = new Set([
  "SBIN", "HDFC", "ICIC", "UTIB", "YESB", "KKBK", "PUNB", "BARB", "CNRB", "UBIN", "IDIB", "IOBA", "FDRL",
  "INDB", "IDFB", "AIRP", "PYTM", "CBIN", "MAHB", "BKID", "UCBA", "SIBL", "KARB", "RATN", "AUBL", "ESFB",
]);

const REMARK = /^(?:PAYMENT|PAY|PAID|SENT|RECEIVED|NA|N\/A|NIL|NONE|NO REMARKS?|REMARKS?|UPI PAYMENT|(?:PAYMENT|PAID|SENT|PAY)\s+(?:FROM|TO|VIA|FOR|USING)\b.*)$/i;
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/i;
const MASKED = /^(?:\d*X{2,}\d*|\d{4,}\*+\d{2,}|X+)$/i;
const DIGIT_RUN = /\d{5,}/;

/** Leading card-descriptor markers (only stripped on the card rail). */
const CARD_PREFIX = /^(?:POS|ECOM|VPS|VIN|PCD|PUR|PURCHASE|PRCH|TXN|CARD|DEBIT|CREDIT|DC|CC|SI|ME|INTL|ATD)\b[\s:/\-]*/i;

/** Legal-entity suffixes, removed only from the end and never down to nothing. */
const LEGAL = new Set(["PVT", "PRIVATE", "LTD", "LIMITED", "LLP", "INC", "LLC", "CORP", "CORPORATION", "OPC", "PL", "CO"]);

const STORE_WORDS = new Set(["STORE", "OUTLET", "BRANCH", "BR", "NO", "SHOP", "UNIT"]);
const COUNTRY = new Set(["IN", "IND"]);

/** Cities that trail card descriptors. Multi-word names are matched first. */
const CITIES = new Set([
  "BANGALORE", "BENGALURU", "BLR", "MUMBAI", "BOMBAY", "NAVI MUMBAI", "THANE", "DELHI", "NEW DELHI", "GURGAON",
  "GURUGRAM", "NOIDA", "GHAZIABAD", "FARIDABAD", "CHENNAI", "MADRAS", "HYDERABAD", "SECUNDERABAD", "PUNE",
  "KOLKATA", "CALCUTTA", "AHMEDABAD", "JAIPUR", "LUCKNOW", "KOCHI", "COCHIN", "CHANDIGARH", "INDORE", "BHOPAL",
  "NAGPUR", "SURAT", "VADODARA", "COIMBATORE", "MYSORE", "MYSURU", "VISAKHAPATNAM", "VIZAG", "PATNA",
  "BHUBANESWAR", "GOA", "PANAJI", "TRIVANDRUM", "THIRUVANANTHAPURAM", "MANGALORE", "MANGALURU", "MADURAI",
  "VIJAYAWADA", "KANPUR", "LUDHIANA", "NASHIK", "RAJKOT", "GUWAHATI", "DEHRADUN", "RANCHI", "RAIPUR",
]);

/** UPI QR merchant VPAs: paytmqr…, bharatpe…, q123…@ybl. */
const QR_LOCAL = /^(?:paytmqr|bharatpe|bpe|upiqr|qr)|^q\d{6,}/i;

// ── Rail ──────────────────────────────────────────────────────────────────

function detectRail(upper: string, vpa: { handle: string; qr: boolean } | null): MerchantRail {
  if (/\b(?:ATM|ATW|NWD|CASH WDL|CASH WITHDRAWAL)\b/.test(upper)) return "atm";
  if (/\bUPI/.test(upper) || vpa) {
    return vpa?.qr || /\b(?:QR|UPIQR|BHARATPE)\b/.test(upper) ? "upi_qr" : "upi";
  }
  const transfer = upper.match(/\b(NEFT|IMPS|RTGS)\b/);
  if (transfer) return transfer[1].toLowerCase() as MerchantRail;
  if (/^(?:POS|ECOM|VPS|VIN|PCD)\b/.test(upper) || /\b(?:DEBIT|CREDIT)?\s?CARD\b/.test(upper) || /\d{4,}X{2,}|X{4,}\d{2,}/.test(upper)) {
    return "card";
  }
  if (GATEWAY_PREFIX.test(upper.trim())) return "gateway";
  return "other";
}

// ── VPA ───────────────────────────────────────────────────────────────────

// No "-" in the local part: dash-delimited narrations would swallow the segments before it.
const VPA_TOKEN = /([A-Za-z0-9._]*)@([A-Za-z0-9.]*)/;

function parseVpa(text: string): { handle: string; local?: string; qr: boolean } | null {
  const m = text.match(VPA_TOKEN);
  if (!m) return null;
  const rawLocal = m[1].toLowerCase();
  const handle = m[2].toLowerCase().replace(/\.+$/, "");
  const qr = QR_LOCAL.test(rawLocal);
  // A phone-like or long-numeric local part is personal: never kept.
  const personal = DIGIT_RUN.test(rawLocal);
  const local = qr || personal ? undefined : foldKey(rawLocal.replace(/\d+$/, "")) || undefined;
  return { handle, local, qr };
}

// ── Segment classification (rail-delimited narrations) ───────────────────

function isNoiseSegment(segment: string): boolean {
  const s = segment.trim();
  if (!s) return true;
  const up = s.toUpperCase();
  if (up.split(/\s+/).every((w) => RAIL_WORDS.has(w)) || BANK_CODES.has(up)) return true;
  if (s.includes("@")) return true;
  if (IFSC.test(s) || MASKED.test(s)) return true;
  if (/^\d+$/.test(s)) return true;
  // Reference numbers: alphanumeric with a long digit run (N123456789, UTIBR52026…).
  if (/^[A-Z0-9]+$/i.test(s) && DIGIT_RUN.test(s)) return true;
  if (/\bBANK\b/i.test(s)) return true;
  if (REMARK.test(s)) return true;
  return false;
}

/** "UPI/DR/318291/ANANDA BHA/paytmqr6w@/FOOD" → "ANANDA BHA". */
function nameFromDelimited(text: string): string | null {
  const body = text.replace(/^(?:BY|TO)\s+TRANSFER[\s\-]+/i, "").trim();
  if (!/^(?:UPI|NEFT|IMPS|RTGS)(?:\s?(?:CR|DR))?[\/\-]/i.test(body)) return null;
  const parts = body.includes("/") ? body.split("/") : body.split("-");
  return parts.find((p) => !isNoiseSegment(p))?.trim() ?? "";
}

// ── Name cleanup ──────────────────────────────────────────────────────────

function stripDomains(s: string): string {
  return s.replace(/\b(?:WWW\.)?([A-Z0-9\-]+)\.(?:CO\.IN|COM|IN|NET|ORG|IO)\b(?:\/\S*)?/gi, "$1");
}

function stripTrailing(tokens: string[], rail: MerchantRail): string[] {
  const out = [...tokens];
  const up = () => out[out.length - 1].toUpperCase();
  let countryRemoved = false;
  let cityRemoved = false;
  let changed = true;
  while (changed && out.length > 1) {
    changed = false;
    // Store numbers: "#123", "123", and "STORE 123".
    if (/^#?\d+$/.test(out[out.length - 1])) {
      out.pop();
      if (out.length > 1 && STORE_WORDS.has(up())) out.pop();
      changed = true;
      continue;
    }
    if (LEGAL.has(up()) || out[out.length - 1] === "&") {
      out.pop();
      changed = true;
      continue;
    }
    if (rail === "card" && !countryRemoved && COUNTRY.has(up())) {
      out.pop();
      countryRemoved = true;
      changed = true;
      continue;
    }
    // A trailing city is noise only in a card descriptor; one city at most.
    if (!cityRemoved && (rail === "card" || countryRemoved)) {
      const two = out.length > 2 ? `${out[out.length - 2]} ${out[out.length - 1]}`.toUpperCase() : "";
      if (two && CITIES.has(two)) {
        out.splice(-2, 2);
        cityRemoved = true;
        changed = true;
      } else if (CITIES.has(up())) {
        out.pop();
        cityRemoved = true;
        changed = true;
      }
    }
  }
  return out;
}

const CONNECTORS = new Set(["OF", "AND", "THE", "AT", "BY", "FOR", "IN", "ON", "TO"]);

/** Title-case one word of an all-caps name; short or vowel-less words stay acronyms (MG, KFC). */
function caseWord(word: string, index: number): string {
  if (index > 0 && CONNECTORS.has(word.toUpperCase())) return word.toLowerCase();
  if (word.length <= 2 || !/[AEIOU]/i.test(word)) return word.toUpperCase();
  return word[0].toUpperCase() + word.slice(1).toLowerCase();
}

interface CleanedName {
  display: string;
  gateway?: string;
  detail?: string;
}

function cleanName(input: string, rail: MerchantRail): CleanedName {
  let s = input.replace(/\S*@\S*/g, " ").trim();
  if (rail === "card") {
    let prev = "";
    while (prev !== s) {
      prev = s;
      s = s.replace(CARD_PREFIX, "").trim();
    }
  }
  s = stripDomains(s);

  let gateway: string | undefined;
  const gw = s.match(GATEWAY_PREFIX);
  if (gw) {
    gateway = GATEWAYS[gw[1].toUpperCase()];
    s = gw[2].trim() || gw[1];
  }

  let detail: string | undefined;
  const star = s.indexOf("*");
  if (star >= 0) {
    const left = s.slice(0, star).trim();
    const right = s.slice(star + 1).trim();
    detail = foldKey(right) || undefined;
    s = left || right;
    if (!left) detail = undefined;
  }

  const shouty = !/[a-z]/.test(s);
  const tokens = s
    .replace(/[^\p{L}\p{M}\p{N}&'# ]+/gu, " ")
    .split(/\s+/)
    .filter((t) => t && t !== "#" && !DIGIT_RUN.test(t) && !MASKED.test(t));
  const kept = tokens.length ? stripTrailing(tokens, rail) : [];
  const display = kept
    .map((t, i) => (shouty ? caseWord(t, i) : t))
    .join(" ")
    .slice(0, MERCHANT_LIMITS.name)
    .trim();
  return { display, gateway, detail };
}

// ── Entry point ───────────────────────────────────────────────────────────

/**
 * Normalize one narration or note. SMS-imported notes ("Swiggy · UPI · HDFC
 * Bank · A/c 1234") contribute their first segment as the name and the whole
 * text for rail detection.
 */
export function normalizeMerchantText(raw: string | null | undefined): NormalizedMerchantText {
  const text = (raw ?? "").trim();
  const upper = text.toUpperCase();
  const vpaParsed = parseVpa(text);
  const rail = detectRail(upper, vpaParsed);
  const vpa = vpaParsed ? { handle: vpaParsed.handle, ...(vpaParsed.local ? { local: vpaParsed.local } : {}) } : undefined;

  let source = text.includes(" · ") ? text.split(" · ")[0] : text;
  const delimited = nameFromDelimited(source);
  if (delimited !== null) source = delimited;

  const cleaned = rail === "atm" ? { display: "" } : cleanName(source, rail);
  const display = cleaned.display;
  const tokens = display ? display.toLowerCase().split(/\s+/) : [];
  const nameKey = foldKey(display);
  const normalized = nameKey || vpa?.local || "";

  const candidates: string[] = [];
  for (const key of [nameKey, vpa?.local, cleaned.detail]) {
    if (key && !candidates.includes(key)) candidates.push(key);
  }

  return {
    raw: raw ?? "",
    rail,
    display,
    normalized,
    tokens,
    ...(cleaned.gateway ? { gateway: cleaned.gateway } : {}),
    ...(cleaned.detail ? { detail: cleaned.detail } : {}),
    ...(vpa ? { vpa } : {}),
    candidates,
  };
}
