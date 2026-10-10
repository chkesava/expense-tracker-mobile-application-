import type {
  Account,
  CanonicalAccountTypeId,
  InstitutionType,
} from "../types/expense";
import type { Institution } from "../data/institutions";
import { getInstitutionById } from "../data/institutions";
import { canonicalAccountTypeId } from "./accountKind";

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

/** Bank, card, and wallet accounts must pick a catalog institution. */
export function requiresCatalogInstitution(
  accountTypeId: CanonicalAccountTypeId
): boolean {
  return (
    accountTypeId === "bank" ||
    accountTypeId === "credit_card" ||
    accountTypeId === "wallet"
  );
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

  return {
    ...account,
    id: account.id,
    typeId: account.typeId,
    name: account.name || displayName,
    displayName,
    last4,
    accountNumber: account.accountNumber || last4,
    accountTypeId,
    ...institution,
  };
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
  extras?: Partial<Omit<Account, "id" | "name" | "typeId" | "createdAt">> & {
    balanceAsOfDate?: string | null;
  };
  createdAt?: unknown;
};

/**
 * Firestore create/update payload. Always writes identity fields; never drops
 * last4/color/currency.
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

  const payload: Record<string, unknown> = {
    name,
    typeId: input.typeId,
    displayName,
    accountTypeId,
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
