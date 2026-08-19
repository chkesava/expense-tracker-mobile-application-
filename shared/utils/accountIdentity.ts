import type {
  Account,
  CanonicalAccountTypeId,
  InstitutionType,
} from "../types/expense";
import type { Institution } from "../data/institutions";
import {
  foldInstitutionKey,
  getInstitutionById,
} from "../data/institutions";
import { institutionSmsMatchKeys } from "../data/institutionMatch";
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

/** Header line for a credit card: institution (if any) plus masked last4. Never invents a network brand. */
export function formatCreditCardHeaderLine(
  account: Pick<Account, "institutionName" | "last4" | "accountNumber">
): string {
  const last4 = getAccountLast4(account);
  const last4Label = last4 ? `•••• ${last4}` : "";
  const institution = account.institutionName?.trim();
  if (institution && last4Label) return `${institution}  ${last4Label}`;
  return last4Label || institution || "Credit Card";
}

export function defaultSmsMatchingEnabled(
  accountTypeId: CanonicalAccountTypeId
): boolean {
  return accountTypeId !== "cash";
}

/** Bank, card, and wallet accounts must pick a catalog institution for SMS matching. */
export function requiresCatalogInstitution(
  accountTypeId: CanonicalAccountTypeId
): boolean {
  return (
    accountTypeId === "bank" ||
    accountTypeId === "credit_card" ||
    accountTypeId === "wallet"
  );
}

/** Bank and credit cards need last4 for exact SMS matching. Wallets often have none. */
export function requiresSmsLast4(
  accountTypeId: CanonicalAccountTypeId
): boolean {
  return accountTypeId === "bank" || accountTypeId === "credit_card";
}

export function hasCatalogInstitution(
  account: Pick<Account, "institutionId">
): boolean {
  return Boolean(getInstitutionById(account.institutionId));
}

export function suggestedAccountDisplayName(
  institution: Institution | undefined,
  accountTypeId: CanonicalAccountTypeId
): string {
  if (accountTypeId === "cash") return "Cash";
  const typeLabel =
    accountTypeId === "credit_card"
      ? "Credit Card"
      : accountTypeId === "bank"
        ? "Bank"
        : accountTypeId === "wallet"
          ? "Wallet"
          : "Account";
  if (!institution) return typeLabel;
  return `${institution.name} ${typeLabel}`;
}

export type AccountConfigurationStatus =
  | "CONFIGURED"
  | "NEEDS_INSTITUTION"
  | "NEEDS_ACCOUNT_TYPE"
  | "NEEDS_LAST4"
  | "NOT_SUPPORTED";

/**
 * Derived SMS-readiness for an account. Not persisted — existing docs stay
 * valid for manual expenses regardless of this status.
 */
export function getAccountConfigurationStatus(
  account: Pick<
    Account,
    "typeId" | "accountTypeId" | "institutionId" | "last4" | "accountNumber"
  >,
  typeName?: string
): AccountConfigurationStatus {
  if (!account.typeId) return "NEEDS_ACCOUNT_TYPE";
  const accountTypeId =
    account.accountTypeId || canonicalAccountTypeId(typeName || "");
  if (!requiresCatalogInstitution(accountTypeId)) return "NOT_SUPPORTED";
  if (!hasCatalogInstitution(account)) return "NEEDS_INSTITUTION";
  if (requiresSmsLast4(accountTypeId) && !getAccountLast4(account)) {
    return "NEEDS_LAST4";
  }
  return "CONFIGURED";
}

/**
 * Bank/credit accounts without a catalog `institutionId` are usable for
 * expenses but cannot participate in SMS matching.
 */
export function smsMatchingUnconfiguredLabel(
  account: Pick<
    Account,
    "institutionId" | "accountTypeId" | "last4" | "accountNumber"
  >,
  typeName?: string
): string | null {
  const accountTypeId =
    account.accountTypeId || canonicalAccountTypeId(typeName || "");
  if (!requiresCatalogInstitution(accountTypeId)) return null;
  if (!hasCatalogInstitution(account)) return "SMS matching not configured";
  if (requiresSmsLast4(accountTypeId) && !getAccountLast4(account)) {
    return "Add last 4 digits for SMS matching";
  }
  return null;
}

export type AccountIdentityMigrationReport = {
  scanned: number;
  migrated: number;
  alreadyMigrated: number;
  requiringConfiguration: number;
  skipped: number;
  errors: number;
  byStatus: Record<AccountConfigurationStatus, number>;
};

function emptyStatusCounts(): Record<AccountConfigurationStatus, number> {
  return {
    CONFIGURED: 0,
    NEEDS_INSTITUTION: 0,
    NEEDS_ACCOUNT_TYPE: 0,
    NEEDS_LAST4: 0,
    NOT_SUPPORTED: 0,
  };
}

/**
 * Count-only migration report. Never includes display names, last4, or
 * account numbers.
 */
export function summarizeAccountIdentityMigration(
  accounts: Account[],
  typeNameById?: Map<string, string>
): AccountIdentityMigrationReport {
  const byStatus = emptyStatusCounts();
  let alreadyMigrated = 0;
  let errors = 0;

  for (const account of accounts) {
    if (!account.id) errors += 1;
    const typeName = typeNameById?.get(account.typeId);
    const hydrated = hydrateAccountIdentity(account, typeName);
    const status = getAccountConfigurationStatus(hydrated, typeName);
    byStatus[status] += 1;
    if (account.accountTypeId) alreadyMigrated += 1;
  }

  const requiringConfiguration =
    byStatus.NEEDS_INSTITUTION +
    byStatus.NEEDS_ACCOUNT_TYPE +
    byStatus.NEEDS_LAST4;

  return {
    scanned: accounts.length,
    migrated: alreadyMigrated,
    alreadyMigrated,
    requiringConfiguration,
    skipped: byStatus.NOT_SUPPORTED,
    errors,
    byStatus,
  };
}

function resolveCatalogInstitution(institutionId?: string | null): {
  institutionId?: string;
  institutionName?: string;
  institutionType?: InstitutionType;
} {
  const catalog = getInstitutionById(institutionId);
  if (!catalog) return {};
  return {
    institutionId: catalog.id,
    institutionName: catalog.name,
    institutionType: catalog.type,
  };
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
    keys.push(...institutionSmsMatchKeys(institution));
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
  const institution = resolveCatalogInstitution(account.institutionId);
  const catalogConfigured = Boolean(institution.institutionId);
  const smsMatchingEnabled = requiresCatalogInstitution(accountTypeId)
    ? catalogConfigured && account.smsMatchingEnabled !== false
    : account.smsMatchingEnabled ?? defaultSmsMatchingEnabled(accountTypeId);

  return {
    ...account,
    id: account.id,
    typeId: account.typeId,
    name: account.name || displayName,
    displayName,
    last4,
    accountNumber: account.accountNumber || last4,
    accountTypeId,
    smsMatchingEnabled,
    ...institution,
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
  if (!getInstitutionById(identity.institutionId)) return false;

  const foldedHint = foldInstitutionKey(hint);
  const digits = (hint || "").replace(/\D/g, "");
  if (identity.last4 && digits.includes(identity.last4)) return true;
  if (!foldedHint) return false;

  return identity.matchKeys.some((key) => {
    if (key === identity.last4) return false;
    if (foldedHint === key) return true;
    return key.length >= 6 && foldedHint.includes(key);
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
  const institution = resolveCatalogInstitution(extras.institutionId);
  const catalogConfigured = Boolean(institution.institutionId);
  const smsMatchingEnabled = requiresCatalogInstitution(accountTypeId)
    ? catalogConfigured && extras.smsMatchingEnabled !== false
    : extras.smsMatchingEnabled ?? defaultSmsMatchingEnabled(accountTypeId);

  const payload: Record<string, unknown> = {
    name,
    typeId: input.typeId,
    displayName,
    accountTypeId,
    smsMatchingEnabled,
  };

  put(payload, "last4", last4);
  put(payload, "accountNumber", last4);
  payload.institutionId = institution.institutionId ?? null;
  payload.institutionName = institution.institutionName ?? null;
  payload.institutionType = institution.institutionType ?? null;

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
