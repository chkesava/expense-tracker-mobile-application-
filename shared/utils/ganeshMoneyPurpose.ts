import type {
  ExpensePurposeCategory,
  MoneyDirection,
  MoneyPurpose,
  MoneyPurposeCategory,
  MoneyPurposeType,
} from "@/shared/types/ganeshSessions";

/**
 * Money purpose (GS-078).
 *
 * Every movement carries `purposeType` + `purposeCategory`, both closed enums,
 * so reports group on a stable axis. Two rules shape everything here:
 *
 * 1. **Purpose is stamped at the write, never inferred from the screen.** The
 *    same expense recorded from three places must classify identically, so the
 *    classification travels with the record.
 * 2. **It does not replace the committee's own vocabulary.** Expenses keep
 *    `categoryId`, which points at a festival-scoped category the Pandal names
 *    and edits (GS-061). Purpose is the canonical axis *underneath* that, so
 *    "Dhol Tasha" and "Dhol-Tasha" in two different years still roll up
 *    together.
 */

/* ------------------------------------------------------------------ *
 * Labels
 * ------------------------------------------------------------------ */

export const MONEY_PURPOSE_TYPE_LABELS: Record<MoneyPurposeType, string> = {
  collection: "Collection",
  contribution: "Contribution",
  expense: "Expense",
  reimbursement: "Reimbursement",
  fund_transfer: "Fund transfer",
  cash_handover: "Cash handover",
  adjustment: "Adjustment",
};

export const MONEY_PURPOSE_CATEGORY_LABELS: Record<MoneyPurposeCategory, string> = {
  // collection
  household: "Household collection",
  street: "Street collection",
  other: "Other collection",
  // contribution
  cash_donation: "Cash donation",
  sponsor: "Sponsor contribution",
  in_kind: "In-kind contribution",
  // expense
  pandal_setup: "Pandal setup",
  decoration: "Decoration",
  electrical: "Electrical",
  sound: "Sound",
  lighting: "Lighting",
  idol_religious: "Idol / religious items",
  flowers_pooja: "Flowers / pooja materials",
  food_prasadam: "Food / prasadam",
  water: "Water",
  transportation: "Transportation",
  printing_publicity: "Printing / publicity",
  cleaning: "Cleaning",
  security: "Security",
  volunteer_support: "Volunteer support",
  government_fees: "Government / permission fees",
  vendor_payment: "Vendor payment",
  visarjan: "Immersion / Visarjan",
  cultural_programs: "Cultural programmes",
  other_festival_expense: "Other festival expense",
  // reimbursement
  volunteer: "Volunteer reimbursement",
  admin: "Admin reimbursement",
  // fund transfer
  personal_to_fund: "Personal money to festival fund",
  fund_to_personal: "Festival fund to personal money",
  festival_to_permanent: "Festival fund to Permanent Fund",
  permanent_to_festival: "Permanent Fund to festival fund",
  other_authorized: "Other authorized transfer",
  // cash handover
  collector_to_treasurer: "Collector to treasurer",
  treasurer_to_bank: "Treasurer to bank",
  treasurer_to_custodian: "Treasurer to custodian",
  // adjustment
  correction: "Correction",
  reconciliation_discrepancy: "Reconciliation discrepancy",
  refund: "Refund",
  reversal: "Reversal",
};

export function purposeLabel(purpose: Partial<MoneyPurpose> | null | undefined): string {
  if (!purpose?.purposeCategory) return "Unclassified";
  return (
    MONEY_PURPOSE_CATEGORY_LABELS[purpose.purposeCategory] ?? String(purpose.purposeCategory)
  );
}

/* ------------------------------------------------------------------ *
 * Expense categories
 * ------------------------------------------------------------------ */

/** The canonical purpose each shipped default category rolls up to. */
export const EXPENSE_PURPOSE_CATEGORIES: ExpensePurposeCategory[] = [
  "pandal_setup",
  "decoration",
  "electrical",
  "sound",
  "lighting",
  "idol_religious",
  "flowers_pooja",
  "food_prasadam",
  "water",
  "transportation",
  "printing_publicity",
  "cleaning",
  "security",
  "volunteer_support",
  "government_fees",
  "vendor_payment",
  "visarjan",
  "cultural_programs",
  "other_festival_expense",
];

/**
 * Default category name → canonical purpose.
 *
 * Visarjan and cultural programmes have their own canonical categories rather
 * than being folded into `transportation` or `volunteer_support`. A Visarjan is
 * a procession, not a delivery, and the two were previously the reason "other"
 * was one of the largest lines in a report — a bucket that big tells a
 * committee nothing about where the money went.
 *
 * "Miscellaneous" still maps to `other_festival_expense`, which is not a
 * compromise: that is what the category means.
 */
const DEFAULT_CATEGORY_PURPOSE: Record<string, ExpensePurposeCategory> = {
  idol: "idol_religious",
  decoration: "decoration",
  flowers: "flowers_pooja",
  "pooja materials": "flowers_pooja",
  "sound system": "sound",
  lighting: "lighting",
  electricity: "electrical",
  "mandap / pandal": "pandal_setup",
  "chairs / tables": "pandal_setup",
  food: "food_prasadam",
  prasadam: "food_prasadam",
  water: "water",
  transportation: "transportation",
  cleaning: "cleaning",
  printing: "printing_publicity",
  invitations: "printing_publicity",
  "cultural programs": "cultural_programs",
  music: "sound",
  security: "security",
  "immersion / visarjan": "visarjan",
  miscellaneous: "other_festival_expense",
};

/**
 * The purpose for a category name.
 *
 * Falls back to `other_festival_expense` for anything unrecognised, which is
 * every custom category a committee has added. That is the right default — an
 * unclassified custom category should report as "other", not silently join a
 * bucket somebody else's spending is in — and the category screen lets an admin
 * set the real one.
 */
export function purposeForCategoryName(name: string): ExpensePurposeCategory {
  const key = name.trim().toLowerCase().replace(/\s+/g, " ");
  return DEFAULT_CATEGORY_PURPOSE[key] ?? "other_festival_expense";
}

/* ------------------------------------------------------------------ *
 * Direction
 * ------------------------------------------------------------------ */

const DIRECTION_BY_TYPE: Record<MoneyPurposeType, MoneyDirection> = {
  collection: "in",
  contribution: "in",
  expense: "out",
  reimbursement: "out",
  fund_transfer: "transfer",
  cash_handover: "transfer",
  // An adjustment can go either way, so callers pass their own; this is only
  // the fallback when none was given.
  adjustment: "transfer",
};

export function directionForPurposeType(type: MoneyPurposeType): MoneyDirection {
  return DIRECTION_BY_TYPE[type];
}

/* ------------------------------------------------------------------ *
 * Legacy rows
 * ------------------------------------------------------------------ */

/**
 * A purpose for a record written before GS-078.
 *
 * **Read-time only.** The spec's rule — never infer purpose from the screen
 * that created the transaction — governs writes, where the classification must
 * be explicit and stored. But documents already in Firestore have no purpose
 * field, and a report that silently dropped or mislabelled them would be worse
 * than one that classifies them from what they demonstrably are: a document in
 * `collections` is a collection, whatever screen made it.
 *
 * Only the *type* is derived. Category falls back to the neutral "other" of
 * that type rather than being guessed, so a legacy row never masquerades as
 * having been classified.
 */
export function derivePurposeForLegacyRow(
  subcollection: string,
  row?: { kind?: string; sponsorshipId?: string; direction?: string }
): MoneyPurpose & { legacy: true } {
  switch (subcollection) {
    case "collections":
      return { purposeType: "collection", purposeCategory: "other", legacy: true };
    case "contributions":
      return {
        purposeType: "contribution",
        purposeCategory: row?.sponsorshipId
          ? "sponsor"
          : row?.kind === "money"
            ? "cash_donation"
            : "in_kind",
        legacy: true,
      };
    case "expenses":
      return {
        purposeType: "expense",
        purposeCategory: "other_festival_expense",
        legacy: true,
      };
    case "reimbursements":
      return { purposeType: "reimbursement", purposeCategory: "other", legacy: true };
    case "fundTransfers":
      return {
        purposeType: "fund_transfer",
        purposeCategory:
          row?.direction === "to_permanent" ? "festival_to_permanent" : "permanent_to_festival",
        legacy: true,
      };
    default:
      return { purposeType: "adjustment", purposeCategory: "correction", legacy: true };
  }
}

/** Purpose as stored, or a derived one for a legacy row. */
export function purposeOf(
  subcollection: string,
  row: Partial<MoneyPurpose> & { kind?: string; sponsorshipId?: string; direction?: string }
): MoneyPurpose {
  if (row.purposeType && row.purposeCategory) {
    return {
      purposeType: row.purposeType,
      purposeCategory: row.purposeCategory,
      purposeDetail: row.purposeDetail,
    };
  }
  return derivePurposeForLegacyRow(subcollection, row);
}
