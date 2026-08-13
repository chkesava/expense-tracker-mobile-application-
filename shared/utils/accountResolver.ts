import type { Account, CanonicalAccountTypeId } from "../types/expense";
import {
  getInstitutionById,
  tokensOf,
  type Institution,
} from "../data/institutions";
import {
  matchInstitutionFromSender,
  matchInstitutionFromText,
  resolveInstitutionFromSms,
  type InstitutionMatch,
} from "../data/institutionMatch";
import {
  getAccountLast4,
  hasCatalogInstitution,
  hydrateAccountIdentity,
  normalizeLast4,
  requiresCatalogInstitution,
  requiresSmsLast4,
} from "./accountIdentity";

export type AccountResolutionStatus =
  | "AUTO_MATCHED"
  | "AMBIGUOUS"
  | "NEEDS_REVIEW";

export type AccountMatchSignal =
  | "institutionId"
  | "sender"
  | "alias"
  | "product"
  | "last4"
  | "accountTypeId"
  | "keyword";

export type AccountResolution = {
  accountId: string | null;
  institutionId: string | null;
  accountTypeId: CanonicalAccountTypeId | null;
  confidence: number;
  status: AccountResolutionStatus;
  matchedSignals: AccountMatchSignal[];
};

export type AccountResolverSmsInput = {
  sender?: string | null;
  body?: string | null;
  accountLast4?: string | null;
  paymentMethod?: string | null;
};

const SCORE = {
  last4: 40,
  sender: 20,
  product: 16,
  institutionId: 12,
  accountTypeId: 10,
  alias: 8,
  keyword: 4,
} as const;

const MAX_SCORE =
  SCORE.last4 +
  SCORE.sender +
  SCORE.product +
  SCORE.institutionId +
  SCORE.accountTypeId +
  SCORE.alias +
  SCORE.keyword;

const LAST4_IN_BODY = [
  /(?:a\/c|acct|account|ac)\s*(?:no\.?|number|#)?\s*(?:xx+|x+|\*+)?\s*(\d{4})\b/i,
  /(?:card|ending|ends?\s+with)\s*(?:xx+|x+|\*+)?\s*(\d{4})\b/i,
  /\bxx+(\d{4})\b/i,
];

type ScoredCandidate = {
  accountId: string;
  institutionId: string;
  accountTypeId: CanonicalAccountTypeId;
  score: number;
  signals: AccountMatchSignal[];
  sufficient: boolean;
};

function emptyResolution(
  status: AccountResolutionStatus,
  extras?: Partial<AccountResolution>
): AccountResolution {
  return {
    accountId: null,
    institutionId: null,
    accountTypeId: null,
    confidence: 0,
    status,
    matchedSignals: [],
    ...extras,
  };
}

function smsLast4(sms: AccountResolverSmsInput): string | undefined {
  const direct = normalizeLast4(sms.accountLast4);
  if (direct) return direct;
  const body = sms.body || "";
  for (const pattern of LAST4_IN_BODY) {
    const match = body.match(pattern);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

const CARD_BODY =
  /\bcredit\s+card\b|\bcard\s+(?:ending|xx+|ends?\s+with)\b|\bpos\b/i;
const BANK_ACCOUNT_BODY =
  /\ba\/c\b|\bacct\b|\baccount\b|\bsavings\b|\bchecking\b|\bdebit\s+card\b/i;
const WALLET_BODY = /\bpaytm\b|\bphonepe\b|\bphone\s*pe\b|\bgpay\b|\bgoogle\s*pay\b|\bwallet\b/i;

function hasStrongCreditCardEvidence(
  sms: AccountResolverSmsInput,
  institutionMatch?: InstitutionMatch
): boolean {
  const method = (sms.paymentMethod || "").toUpperCase();
  if (method === "CARD") return true;
  if (CARD_BODY.test(sms.body || "")) return true;
  if (
    institutionMatch?.source === "product" &&
    /\bcard\b/i.test(institutionMatch.matchedValue)
  ) {
    return true;
  }
  const institution = institutionMatch?.institution;
  if (institution?.type === "card_issuer") return true;
  return false;
}

function hasStrongBankEvidence(sms: AccountResolverSmsInput): boolean {
  const method = (sms.paymentMethod || "").toUpperCase();
  if (
    method === "IMPS" ||
    method === "NEFT" ||
    method === "RTGS" ||
    method === "ATM" ||
    method === "NETBANKING"
  ) {
    return true;
  }
  const body = sms.body || "";
  if (BANK_ACCOUNT_BODY.test(body) && !CARD_BODY.test(body)) return true;
  if (method === "UPI" && !CARD_BODY.test(body)) return true;
  return false;
}

/**
 * Best-effort account type from SMS evidence. Credit-card signals win over
 * bank rails such as UPI. Returns undefined when the type cannot be produced.
 */
export function inferSmsAccountType(
  sms: AccountResolverSmsInput,
  institutionMatch?: InstitutionMatch
): CanonicalAccountTypeId | undefined {
  if (hasStrongCreditCardEvidence(sms, institutionMatch)) return "credit_card";

  const institution = institutionMatch?.institution;
  if (institution?.type === "wallet" || WALLET_BODY.test(sms.body || "")) {
    return "wallet";
  }

  if (hasStrongBankEvidence(sms)) return "bank";
  return undefined;
}

function isSmsMatchableType(accountTypeId: CanonicalAccountTypeId): boolean {
  return requiresCatalogInstitution(accountTypeId);
}

function typesCompatible(
  accountTypeId: CanonicalAccountTypeId,
  inferred?: CanonicalAccountTypeId
): boolean {
  if (accountTypeId === "cash") return false;
  if (!isSmsMatchableType(accountTypeId)) return false;
  if (!inferred) return true;
  return accountTypeId === inferred;
}

function bodyHasKeyword(body: string, keyword: string): boolean {
  const bodyTokens = tokensOf(body);
  const kwTokens = tokensOf(keyword);
  if (kwTokens.length === 0 || bodyTokens.length === 0) return false;
  if (kwTokens.length === 1) return bodyTokens.includes(kwTokens[0]!);
  for (let i = 0; i <= bodyTokens.length - kwTokens.length; i += 1) {
    let ok = true;
    for (let j = 0; j < kwTokens.length; j += 1) {
      if (bodyTokens[i + j] !== kwTokens[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

function scoreAccount(input: {
  account: Account;
  institution: Institution;
  sms: AccountResolverSmsInput;
  last4?: string;
  inferredType?: CanonicalAccountTypeId;
  smsInstitution?: InstitutionMatch;
  senderMatch?: InstitutionMatch;
  textMatch?: InstitutionMatch;
}): ScoredCandidate | null {
  const { account, institution, sms, last4, inferredType, smsInstitution, senderMatch, textMatch } =
    input;
  if (!account.id.trim()) return null;

  const accountTypeId = account.accountTypeId || "other";
  if (!typesCompatible(accountTypeId, inferredType)) return null;

  const signals: AccountMatchSignal[] = [];
  let score = 0;

  if (last4 && getAccountLast4(account) === last4) {
    signals.push("last4");
    score += SCORE.last4;
  }

  if (senderMatch?.institution.id === institution.id) {
    signals.push("sender");
    score += SCORE.sender;
  }

  if (smsInstitution?.institution.id === institution.id) {
    signals.push("institutionId");
    score += SCORE.institutionId;
  }

  if (
    textMatch?.institution.id === institution.id &&
    textMatch.source === "product"
  ) {
    signals.push("product");
    score += SCORE.product;
  } else if (
    textMatch?.institution.id === institution.id &&
    (textMatch.source === "alias" ||
      textMatch.source === "name" ||
      textMatch.source === "abbreviation")
  ) {
    signals.push("alias");
    score += SCORE.alias;
  }

  if (inferredType && accountTypeId === inferredType) {
    signals.push("accountTypeId");
    score += SCORE.accountTypeId;
  }

  const body = sms.body || "";
  if (
    body &&
    institution.smsKeywords.some((keyword) => bodyHasKeyword(body, keyword))
  ) {
    signals.push("keyword");
    score += SCORE.keyword;
  }

  const last4Required = requiresSmsLast4(accountTypeId);
  const hasInstitutionIdentity =
    signals.includes("sender") ||
    signals.includes("product") ||
    signals.includes("alias") ||
    signals.includes("institutionId") ||
    signals.includes("keyword");
  const last4Ok = !last4Required || signals.includes("last4");
  const typeOk = Boolean(
    inferredType ? signals.includes("accountTypeId") : true
  );

  return {
    accountId: account.id,
    institutionId: institution.id,
    accountTypeId,
    score,
    signals,
    sufficient: Boolean(hasInstitutionIdentity && last4Ok && typeOk),
  };
}

function confidenceForScore(score: number): number {
  const ratio = score / MAX_SCORE;
  return Math.min(1, Math.round(Math.max(0.8, ratio) * 100) / 100);
}

/**
 * Map an SMS to an exact account from `users/{uid}/accounts`.
 * Never invents account ids, never matches on displayName, and never
 * auto-creates a transaction.
 */
export function resolveAccountFromSms(
  sms: AccountResolverSmsInput,
  accounts: Account[],
  typeNameById?: Map<string, string>
): AccountResolution {
  const last4 = smsLast4(sms);
  const senderMatch = matchInstitutionFromSender(sms.sender || "");
  const textMatch = matchInstitutionFromText(sms.body || "");
  const smsInstitution = resolveInstitutionFromSms({
    sender: sms.sender,
    body: sms.body,
  });
  const inferredType = inferSmsAccountType(sms, smsInstitution ?? textMatch);

  const baseInstitutionId = smsInstitution?.institution.id ?? null;
  const baseType = inferredType ?? null;

  if (!accounts.length) {
    return emptyResolution("NEEDS_REVIEW", {
      institutionId: baseInstitutionId,
      accountTypeId: baseType,
    });
  }

  const candidates: ScoredCandidate[] = [];
  for (const raw of accounts) {
    const account = hydrateAccountIdentity(
      raw,
      typeNameById?.get(raw.typeId)
    );
    if (account.smsMatchingEnabled === false) continue;
    if (!hasCatalogInstitution(account)) continue;
    const institution = getInstitutionById(account.institutionId);
    if (!institution) continue;

    const scored = scoreAccount({
      account,
      institution,
      sms,
      last4,
      inferredType,
      smsInstitution,
      senderMatch,
      textMatch,
    });
    if (scored) candidates.push(scored);
  }

  const sufficient = candidates.filter((row) => row.sufficient);
  if (sufficient.length > 1) {
    const signals = [...new Set(sufficient.flatMap((row) => row.signals))];
    return emptyResolution("AMBIGUOUS", {
      institutionId: baseInstitutionId,
      accountTypeId: baseType,
      confidence: 0.45,
      matchedSignals: signals,
    });
  }

  if (sufficient.length === 1) {
    const winner = sufficient[0]!;
    return {
      accountId: winner.accountId,
      institutionId: winner.institutionId,
      accountTypeId: winner.accountTypeId,
      confidence: confidenceForScore(winner.score),
      status: "AUTO_MATCHED",
      matchedSignals: winner.signals,
    };
  }

  return emptyResolution("NEEDS_REVIEW", {
    institutionId: baseInstitutionId,
    accountTypeId: baseType,
  });
}
