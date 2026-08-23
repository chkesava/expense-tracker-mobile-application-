import type {
  FestivalMember,
  GaneshSummary,
  Household,
  HouseholdStatus,
} from "@/shared/types/ganesh";
import { EMPTY_GANESH_SUMMARY } from "@/shared/types/ganesh";

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

export function availableGodFund(summary: Pick<
  GaneshSummary,
  | "openingFunds"
  | "chanda"
  | "committeeContributions"
  | "otherCashContributions"
  | "godFundExpenses"
  | "reimbursements"
>): number {
  return money(
    summary.openingFunds +
      summary.chanda +
      summary.committeeContributions +
      summary.otherCashContributions -
      summary.godFundExpenses -
      summary.reimbursements
  );
}

export function totalCashIn(summary: Pick<
  GaneshSummary,
  "openingFunds" | "chanda" | "committeeContributions" | "otherCashContributions"
>): number {
  return money(
    summary.openingFunds +
      summary.chanda +
      summary.committeeContributions +
      summary.otherCashContributions
  );
}

export function totalExpenses(summary: Pick<
  GaneshSummary,
  "godFundExpenses" | "personalMoneyUsed"
>): number {
  return money(summary.godFundExpenses + summary.personalMoneyUsed);
}

export type FundingInput = {
  totalAmount: number;
  godFundAmount: number;
  personalAmount: number;
  sponsoredAmount?: number;
};

export type ValidationResult = { ok: true } | { ok: false; error: string };

export function validatePositiveAmount(amount: number, label = "Amount"): ValidationResult {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: `${label} must be greater than 0.` };
  }
  return { ok: true };
}

export function validateNonNegativeAmount(
  amount: number,
  label = "Amount"
): ValidationResult {
  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, error: `${label} cannot be negative.` };
  }
  return { ok: true };
}

export function validateExpenseFunding(input: FundingInput): ValidationResult {
  const total = money(input.totalAmount);
  const godFund = money(input.godFundAmount);
  const personal = money(input.personalAmount);
  const sponsored = money(input.sponsoredAmount ?? 0);

  if (total <= 0) return { ok: false, error: "Expense amount must be greater than 0." };
  if (godFund < 0 || personal < 0 || sponsored < 0) {
    return { ok: false, error: "Funding amounts cannot be negative." };
  }
  if (money(godFund + personal + sponsored) !== total) {
    return {
      ok: false,
      error: "God Fund + Personal + Sponsored must equal the total expense.",
    };
  }
  return { ok: true };
}

export function validateReimbursement(
  amount: number,
  pendingPersonalExpense: number
): ValidationResult {
  const positive = validatePositiveAmount(amount, "Reimbursement");
  if (!positive.ok) return positive;
  if (money(amount) > money(pendingPersonalExpense)) {
    return {
      ok: false,
      error: "Reimbursement cannot exceed the pending personal amount.",
    };
  }
  return { ok: true };
}

export function validateCollection(amount: number): ValidationResult {
  return validatePositiveAmount(amount, "Collection");
}

export function validateCashContribution(amount: number): ValidationResult {
  return validatePositiveAmount(amount, "Contribution");
}

export function validateInKindValue(estimatedValue: number): ValidationResult {
  return validateNonNegativeAmount(estimatedValue, "Estimated value");
}

export function deriveHouseholdStatus(input: {
  expectedAmount: number;
  collectedAmount: number;
  forcedStatus?: HouseholdStatus;
}): HouseholdStatus {
  if (input.forcedStatus === "not_interested" || input.forcedStatus === "not_available") {
    return input.forcedStatus;
  }
  const expected = money(input.expectedAmount);
  const collected = money(input.collectedAmount);
  if (collected <= 0) return "pending";
  if (expected > 0 && collected < expected) return "partial";
  return "paid";
}

export function householdProgressLabel(household: Pick<
  Household,
  "expectedAmount" | "collectedAmount" | "status"
>): string {
  if (household.status === "not_interested") return "Not interested";
  if (household.status === "not_available") return "Not available";
  if (household.expectedAmount > 0) {
    return `${household.collectedAmount} / ${household.expectedAmount}`;
  }
  if (household.status === "paid") return "Paid";
  if (household.status === "partial") return "Partial";
  return "Pending";
}

export function memberPendingReimbursement(
  member: Pick<FestivalMember, "personalExpenses" | "reimbursed">
): number {
  return money(Math.max(0, member.personalExpenses - member.reimbursed));
}

export function memberRemainingContribution(
  member: Pick<FestivalMember, "contributionTarget" | "contributionPaid">
): number {
  return money(Math.max(0, member.contributionTarget - member.contributionPaid));
}

export type LedgerTotalsInput = {
  openingFunds: number[];
  collections: number[];
  committeeContributions: number[];
  otherCashContributions: number[];
  godFundExpenses: number[];
  reimbursements: number[];
  personalAmounts: number[];
  inKindValues: number[];
  sponsoredValues: number[];
};

export function summarizeLedger(input: LedgerTotalsInput): GaneshSummary {
  const sum = (values: number[]) => money(values.reduce((acc, value) => acc + value, 0));
  const personalMoneyUsed = sum(input.personalAmounts);
  const reimbursed = sum(input.reimbursements);
  return {
    ...EMPTY_GANESH_SUMMARY,
    openingFunds: sum(input.openingFunds),
    chanda: sum(input.collections),
    committeeContributions: sum(input.committeeContributions),
    otherCashContributions: sum(input.otherCashContributions),
    godFundExpenses: sum(input.godFundExpenses),
    reimbursements: reimbursed,
    personalMoneyUsed,
    pendingReimbursements: money(Math.max(0, personalMoneyUsed - reimbursed)),
    inKindValue: sum(input.inKindValues),
    sponsoredValue: sum(input.sponsoredValues),
    collectionCount: input.collections.length,
    expenseCount: input.godFundExpenses.length,
  };
}

export function canManagePandal(role: FestivalMember["role"] | undefined): boolean {
  return role === "admin" || role === "treasurer";
}

export function isFestivalWritable(status: FestivalMember["role"] | string): boolean {
  return status === "open";
}

export function possibleHouseholdDuplicates(
  households: Array<Pick<Household, "id" | "name" | "houseNumber" | "mobile">>,
  input: { name: string; houseNumber?: string; mobile?: string; excludeId?: string }
): typeof households {
  const name = input.name.trim().toLowerCase();
  const house = (input.houseNumber ?? "").trim().toLowerCase();
  const mobile = (input.mobile ?? "").replace(/\D/g, "");
  return households.filter((household) => {
    if (household.id === input.excludeId) return false;
    const sameName = household.name.trim().toLowerCase() === name && name.length > 0;
    const sameHouse =
      house.length > 0 && (household.houseNumber ?? "").trim().toLowerCase() === house;
    const sameMobile =
      mobile.length >= 8 && (household.mobile ?? "").replace(/\D/g, "") === mobile;
    return sameName || sameHouse || sameMobile;
  });
}
