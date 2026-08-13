import type { AccountKind, CanonicalAccountTypeId } from "../types/expense";

export function getAccountKind(typeName: string): AccountKind {
  const n = typeName.toLowerCase();
  if (n.includes("credit")) return "credit";
  if (
    n.includes("bank") ||
    n.includes("saving") ||
    n.includes("checking") ||
    n.includes("debit")
  ) {
    return "bank";
  }
  return "other";
}

export function isCreditAccount(typeName: string): boolean {
  return getAccountKind(typeName) === "credit";
}

export function isBankAccount(typeName: string): boolean {
  return getAccountKind(typeName) === "bank";
}

/**
 * Canonical product type for SMS identity. Does not change ledger kind
 * (`getAccountKind`): cash stays "other" for balances.
 */
export function canonicalAccountTypeId(
  typeName: string
): CanonicalAccountTypeId {
  const kind = getAccountKind(typeName);
  if (kind === "credit") return "credit_card";
  if (kind === "bank") return "bank";
  const n = typeName.toLowerCase();
  if (/\bcash\b/.test(n)) return "cash";
  if (/\bwallet\b/.test(n)) return "wallet";
  return "other";
}
