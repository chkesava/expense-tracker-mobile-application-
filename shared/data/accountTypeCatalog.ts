import type { CanonicalAccountTypeId } from "../types/expense";
import { canonicalAccountTypeId } from "../utils/accountKind";

export type AccountTypeCatalogId =
  | "savings_account"
  | "salary_account"
  | "cash"
  | "credit_card"
  | "upi_wallet"
  | "other";

/** Resolved to an actual icon component at the UI layer — see components/accounts/accountTypeIcons.tsx. */
export type AccountTypeCatalogIconName =
  | "PiggyBank"
  | "Landmark"
  | "Banknote"
  | "CreditCard"
  | "Wallet"
  | "HelpCircle";

export interface AccountTypeCatalogEntry {
  id: AccountTypeCatalogId;
  label: string;
  canonicalAccountTypeId: CanonicalAccountTypeId;
  iconName: AccountTypeCatalogIconName;
  /** Lowercase substrings used to match an existing free-text type name onto this entry for display only. */
  matchHints: string[];
}

/**
 * Picker options for "Account Type". Display-only: `shared/utils/accountKind.ts`
 * stays the single source of truth for bank/credit_card/cash/wallet/other
 * classification used by balance math. Adding an entry here never changes
 * money math — it only changes which label/icon a user is offered or sees.
 *
 * Kept free of any RN/UI import (like shared/data/institutions.ts) so it can
 * run in plain Node (vitest's `shared/**` suite runs in `environment: "node"`).
 */
export const ACCOUNT_TYPE_CATALOG: AccountTypeCatalogEntry[] = [
  {
    id: "savings_account",
    label: "Savings Account",
    canonicalAccountTypeId: "bank",
    iconName: "PiggyBank",
    matchHints: ["saving", "checking", "debit", "bank"],
  },
  {
    id: "salary_account",
    label: "Salary Account",
    canonicalAccountTypeId: "bank",
    iconName: "Landmark",
    matchHints: ["salary", "sallery", "income"],
  },
  {
    id: "cash",
    label: "Cash",
    canonicalAccountTypeId: "cash",
    iconName: "Banknote",
    matchHints: ["cash", "hand cash"],
  },
  {
    id: "credit_card",
    label: "Credit Card",
    canonicalAccountTypeId: "credit_card",
    iconName: "CreditCard",
    matchHints: ["credit"],
  },
  {
    id: "upi_wallet",
    label: "UPI/Wallet",
    canonicalAccountTypeId: "wallet",
    iconName: "Wallet",
    matchHints: ["upi", "wallet"],
  },
  {
    id: "other",
    label: "Other",
    canonicalAccountTypeId: "other",
    iconName: "HelpCircle",
    matchHints: [],
  },
];

const OTHER_ENTRY = ACCOUNT_TYPE_CATALOG[ACCOUNT_TYPE_CATALOG.length - 1];
const SAVINGS_ENTRY = ACCOUNT_TYPE_CATALOG[0];
const SALARY_ENTRY = ACCOUNT_TYPE_CATALOG[1];

/**
 * Maps a free-text account type name (as stored in `AccountType.name`) onto a
 * catalog entry, for display (label/icon) purposes only. Never returns
 * undefined — unmatched names fall back to the "Other" entry.
 */
export function matchCatalogEntry(typeName: string): AccountTypeCatalogEntry {
  const bucket = canonicalAccountTypeId(typeName);

  if (bucket === "bank") {
    const n = typeName.toLowerCase();
    return SALARY_ENTRY.matchHints.some((hint) => n.includes(hint))
      ? SALARY_ENTRY
      : SAVINGS_ENTRY;
  }

  const entry = ACCOUNT_TYPE_CATALOG.find(
    (candidate) =>
      candidate.canonicalAccountTypeId === bucket && candidate.id !== "other"
  );
  if (entry) return entry;

  // accountKind.ts's bucket came back "other" (e.g. a name like "UPI" alone,
  // with none of its keywords), but one of the catalog's own declared hints
  // still recognizes it -- check those before giving up to the Other entry,
  // so an existing custom type isn't both shown with the wrong icon AND left
  // addable a second time under its real catalog entry.
  const n = typeName.toLowerCase();
  const hinted = ACCOUNT_TYPE_CATALOG.find(
    (candidate) =>
      candidate.id !== "other" && candidate.matchHints.some((hint) => n.includes(hint))
  );
  return hinted ?? OTHER_ENTRY;
}
