import type {
  Account,
  CanonicalAccountTypeId,
  InstitutionType,
} from "../types/expense";
import {
  foldInstitutionKey,
  getInstitutionById,
  inferInstitutionFromDisplayName,
  lookupInstitution,
  slugifyInstitutionId,
} from "../data/institutions";
import { canonicalAccountTypeId } from "./accountKind";

export type AccountIdentity = {
  displayName: string;
  institutionId?: string;
  institutionName?: string;
  institutionType?: InstitutionType;
  accountTypeId: CanonicalAccountTypeId;
  last4?: string;
  smsMatchingEnabled: boolean;
  /** Folded keys used for SMS matching — never displayName alone. */
  matchKeys: string[];
};

const ACCOUNT_EXTRA_KEYS = [
  "billGenerationDay",
  "creditLimit",
  "openingBalance",
  "balanceInitialized",
  "balanceAsOfDate",
  "accountNumber",
  "color",
  "currency",
  "displayName",
  "institutionId",
  "institutionName",
  "institutionType",
  "accountTypeId",
  "last4",
  "smsMatchingEnabled",
] as const;

export function normalizeLast4(raw?: string | null): string | undefined {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.length < 4) return undefined;
  return digits.slice(-4);
}

export function getAccountDisplayName(
  account: Pick<Account, "name" | "displayName">
): string {
  const label = (account.displayName || account.name || "").trim();
  return label;
}

export function getAccountLast4(
  account: Pick<Account, "last4" | "accountNumber">
): string | undefined {
  return normalizeLast4(account.last4) || normalizeLast4(account.accountNumber);
}

export function formatAccountIdentityLine(
  account: Pick<Account, "institutionName" | "last4" | "accountNumber">,
  typeName: string
): string {
  const parts: string[] = [account.institutionName?.trim() || typeName];
  const last4 = getAccountLast4(account);
  if (last4) parts.push(`•••• ${last4}`);
  return parts.filter(Boolean).join(" • ");
}

export function defaultSmsMatchingEnabled(
  accountTypeId: CanonicalAccountTypeId
): boolean {
  return accountTypeId !== "cash";
}

function defaultInstitutionType(
  accountTypeId: CanonicalAccountTypeId
): InstitutionType {
  if (accountTypeId === "credit_card") return "card_issuer";
  if (accountTypeId === "bank") return "bank";
  return "other";
}

function resolveInstitutionFields(input: {
  institutionId?: string;
  institutionName?: string;
  institutionType?: InstitutionType;
  displayName: string;
}): {
  institutionId?: string;
  institutionName?: string;
  institutionType?: InstitutionType;
} {
  const byId = getInstitutionById(input.institutionId);
  if (byId) {
    return {
      institutionId: byId.id,
      institutionName: input.institutionName?.trim() || byId.name,
      institutionType: input.institutionType || byId.type,
    };
  }

  const fromName = input.institutionName?.trim()
    ? lookupInstitution(input.institutionName)
    : undefined;
  if (fromName) {
    return {
      institutionId: fromName.id,
      institutionName: fromName.name,
      institutionType: input.institutionType || fromName.type,
    };
  }

  if (input.institutionName?.trim()) {
    const slug = slugifyInstitutionId(input.institutionName);
    return {
      institutionId: input.institutionId?.trim() || slug || undefined,
      institutionName: input.institutionName.trim(),
      institutionType: input.institutionType,
    };
  }

  if (input.institutionId?.trim()) {
    return {
      institutionId: input.institutionId.trim(),
      institutionName: input.institutionName?.trim(),
      institutionType: input.institutionType,
    };
  }

  const inferred = inferInstitutionFromDisplayName(input.displayName);
  if (inferred) {
    return {
      institutionId: inferred.id,
      institutionName: inferred.name,
      institutionType: inferred.type,
    };
  }

  return {};
}

export function accountSmsMatchKeys(
  identity: Pick<
    AccountIdentity,
    "institutionId" | "institutionName" | "last4"
  >
): string[] {
  const keys: string[] = [];
  const institution = getInstitutionById(identity.institutionId);
  if (institution) {
    keys.push(foldInstitutionKey(institution.id));
    keys.push(foldInstitutionKey(institution.name));
    for (const alias of institution.aliases) {
      keys.push(foldInstitutionKey(alias));
    }
  } else {
    if (identity.institutionId) keys.push(foldInstitutionKey(identity.institutionId));
    if (identity.institutionName) {
      keys.push(foldInstitutionKey(identity.institutionName));
    }
  }
  if (identity.last4) keys.push(identity.last4);
  return [...new Set(keys.filter((key) => key.length > 0))];
}

/**
 * Read-time defaults for legacy docs that only have `name` / `typeId` /
 * `accountNumber`. Does not require a Firestore rewrite.
 */
export function hydrateAccountIdentity(
  account: Account,
  typeName?: string
): Account {
  const displayName = getAccountDisplayName(account);
  const last4 = getAccountLast4(account);
  const accountTypeId =
    account.accountTypeId || canonicalAccountTypeId(typeName || "");
  const institution = resolveInstitutionFields({
    institutionId: account.institutionId,
    institutionName: account.institutionName,
    institutionType: account.institutionType,
    displayName,
  });
  const smsMatchingEnabled =
    account.smsMatchingEnabled ?? defaultSmsMatchingEnabled(accountTypeId);

  return {
    ...account,
    name: account.name || displayName,
    displayName,
    last4,
    accountNumber: account.accountNumber || last4,
    accountTypeId,
    smsMatchingEnabled,
    ...institution,
    institutionType:
      institution.institutionType ||
      account.institutionType ||
      (institution.institutionId
        ? defaultInstitutionType(accountTypeId)
        : undefined),
  };
}

export function toAccountIdentity(
  account: Account,
  typeName?: string
): AccountIdentity {
  const hydrated = hydrateAccountIdentity(account, typeName);
  return {
    displayName: hydrated.displayName || hydrated.name,
    institutionId: hydrated.institutionId,
    institutionName: hydrated.institutionName,
    institutionType: hydrated.institutionType,
    accountTypeId: hydrated.accountTypeId || "other",
    last4: hydrated.last4,
    smsMatchingEnabled: hydrated.smsMatchingEnabled !== false,
    matchKeys: accountSmsMatchKeys({
      institutionId: hydrated.institutionId,
      institutionName: hydrated.institutionName,
      last4: hydrated.last4,
    }),
  };
}

/**
 * True when `hint` (SMS body or fragment) matches institution identity or last4.
 * Never succeeds on displayName alone.
 */
export function accountMatchesSmsHint(
  account: Account,
  hint: string,
  typeName?: string
): boolean {
  const identity = toAccountIdentity(account, typeName);
  if (!identity.smsMatchingEnabled) return false;

  const foldedHint = foldInstitutionKey(hint);
  const digits = (hint || "").replace(/\D/g, "");
  if (identity.last4 && digits.includes(identity.last4)) return true;
  if (!foldedHint) return false;

  return identity.matchKeys.some((key) => {
    if (key === identity.last4) return false;
    if (foldedHint === key) return true;
    return key.length >= 4 && foldedHint.includes(key);
  });
}

function put(
  payload: Record<string, unknown>,
  key: string,
  value: unknown
): void {
  if (value === undefined) return;
  payload[key] = value;
}

export type AccountWriteInput = {
  name: string;
  typeId: string;
  typeName?: string;
  extras?: Partial<Omit<Account, "id" | "name" | "typeId" | "createdAt">>;
  createdAt?: unknown;
};

/**
 * Firestore create/update payload. Always writes identity fields so new
 * accounts are matchable; never drops last4/color/currency.
 */
export function buildAccountWritePayload(
  input: AccountWriteInput
): Record<string, unknown> {
  const name = input.name.trim();
  const extras = input.extras ?? {};
  const displayName = (extras.displayName || name).trim();
  const accountTypeId =
    extras.accountTypeId || canonicalAccountTypeId(input.typeName || "");
  const last4 = normalizeLast4(extras.last4) || normalizeLast4(extras.accountNumber);
  const institution = resolveInstitutionFields({
    institutionId: extras.institutionId,
    institutionName: extras.institutionName,
    institutionType: extras.institutionType,
    displayName,
  });
  const smsMatchingEnabled =
    extras.smsMatchingEnabled ?? defaultSmsMatchingEnabled(accountTypeId);

  const payload: Record<string, unknown> = {
    name,
    typeId: input.typeId,
    displayName,
    accountTypeId,
    smsMatchingEnabled,
  };

  put(payload, "last4", last4);
  put(payload, "accountNumber", extras.accountNumber?.trim() || last4);
  put(payload, "institutionId", institution.institutionId);
  put(payload, "institutionName", institution.institutionName);
  put(
    payload,
    "institutionType",
    institution.institutionType ||
      (institution.institutionId
        ? defaultInstitutionType(accountTypeId)
        : undefined)
  );

  for (const key of ACCOUNT_EXTRA_KEYS) {
    if (
      key === "displayName" ||
      key === "accountTypeId" ||
      key === "smsMatchingEnabled" ||
      key === "last4" ||
      key === "accountNumber" ||
      key === "institutionId" ||
      key === "institutionName" ||
      key === "institutionType"
    ) {
      continue;
    }
    put(payload, key, extras[key]);
  }

  if (input.createdAt !== undefined) payload.createdAt = input.createdAt;
  return payload;
}
