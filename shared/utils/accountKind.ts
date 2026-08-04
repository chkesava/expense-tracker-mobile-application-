import type { AccountKind } from "../types/expense";

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
