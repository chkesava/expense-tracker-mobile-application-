import type {
  FestivalMember,
  GaneshSummary,
  Household,
  HouseholdStatus,
  PermanentFundLocation,
  PermanentFundSummary,
} from "@/shared/types/ganesh";
import { EMPTY_GANESH_SUMMARY, EMPTY_PERMANENT_FUND } from "@/shared/types/ganesh";
import { formatInr } from "@/shared/utils/ganeshMoney";

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
> & { transferredToPermanentFund?: number }): number {
  return money(
    summary.openingFunds +
      summary.chanda +
      summary.committeeContributions +
      summary.otherCashContributions -
      summary.godFundExpenses -
      summary.reimbursements -
      (summary.transferredToPermanentFund ?? 0)
  );
}

export function festivalCollectedCash(summary: Pick<
  GaneshSummary,
  "chanda" | "committeeContributions" | "otherCashContributions"
>): number {
  return money(
    summary.chanda + summary.committeeContributions + summary.otherCashContributions
  );
}

export function festivalCashSpent(summary: Pick<
  GaneshSummary,
  "godFundExpenses" | "reimbursements"
>): number {
  return money(summary.godFundExpenses + summary.reimbursements);
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

export function assetPurchaseAmountOf(
  summary: Pick<GaneshSummary, "assetPurchaseAmount">
): number {
  return money(summary.assetPurchaseAmount ?? 0);
}

export function regularExpenseAmount(
  summary: Pick<GaneshSummary, "godFundExpenses" | "personalMoneyUsed" | "assetPurchaseAmount">
): number {
  return money(totalExpenses(summary) - assetPurchaseAmountOf(summary));
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

export function validateGodFundSpend(
  godFundAmount: number,
  available: number
): ValidationResult {
  if (money(godFundAmount) <= 0) return { ok: true };
  if (money(godFundAmount) > money(available)) {
    return { ok: false, error: "God Fund does not have enough money for this expense." };
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

/**
 * Guards the reversal half of the reimbursement counter.
 *
 * Reimbursements are not linked to a specific expense — a festival member
 * document carries only `personalExpenses` and `reimbursed` — so "has this
 * expense's personal portion been reimbursed?" is not directly answerable. What
 * is answerable, and equivalent, is whether the reversal exceeds what is still
 * outstanding: `pendingReimbursement` is exactly `personalExpenses - reimbursed`
 * for that member, so a reversal larger than it can only mean the money has
 * already been paid back.
 *
 * Left unguarded this is GS-009: voiding a reimbursed expense drives the counter
 * negative, `validateReimbursement` then rejects every future reimbursement to
 * that member, and the incremental counter permanently disagrees with
 * `summarizeLedger`, which clamps the same figure at zero.
 */
export function validateReimbursementReversal(
  reversal: number,
  pending: number
): ValidationResult {
  if (money(reversal) <= money(pending)) return { ok: true };
  return {
    ok: false,
    error:
      `${formatInr(money(reversal) - money(pending))} of this personal amount has already been reimbursed. ` +
      "Void that reimbursement first, then change this expense.",
  };
}

export function validateCollection(amount: number): ValidationResult {
  return validatePositiveAmount(amount, "Collection");
}

export function validateCashContribution(amount: number): ValidationResult {
  return validatePositiveAmount(amount, "Contribution");
}

export function validateFundTransfer(amount: number, available: number, label = "Transfer"): ValidationResult {
  const positive = validatePositiveAmount(amount, label);
  if (!positive.ok) return positive;
  if (money(amount) > money(available)) {
    return {
      ok: false,
      error: `Insufficient ${label.toLowerCase()} balance. Available: ${money(available)}. Requested: ${money(amount)}.`,
    };
  }
  return { ok: true };
}

export function validateSettlement(input: {
  closing: number;
  transfer: number;
  remaining: number;
}): ValidationResult {
  const closing = money(input.closing);
  const transfer = money(input.transfer);
  const remaining = money(input.remaining);
  if (closing < 0) return { ok: false, error: "Closing balance cannot be negative." };
  if (transfer < 0 || remaining < 0) {
    return { ok: false, error: "Transfer and remaining amounts cannot be negative." };
  }
  if (transfer > closing) {
    return {
      ok: false,
      error: `Transfer amount cannot exceed the festival closing balance. Available: ${closing}. Requested: ${transfer}.`,
    };
  }
  if (money(transfer + remaining) !== closing) {
    return { ok: false, error: "Transfer plus remaining must equal the closing balance." };
  }
  return { ok: true };
}

export function applyPermanentFundDelta(
  current: PermanentFundSummary,
  location: PermanentFundLocation,
  signedAmount: number
): { ok: true; next: PermanentFundSummary } | { ok: false; error: string } {
  if (!Number.isFinite(signedAmount) || signedAmount === 0) {
    return { ok: false, error: "Enter an amount other than zero." };
  }
  const next: PermanentFundSummary = {
    total: money((current.total ?? 0) + signedAmount),
    cash: money(current.cash ?? 0),
    upi: money(current.upi ?? 0),
    bank: money(current.bank ?? 0),
    other: money(current.other ?? 0),
  };
  next[location] = money((current[location] ?? 0) + signedAmount);
  if (next[location] < 0 || next.total < 0) {
    const available = money(current[location] ?? 0);
    return {
      ok: false,
      error: `Insufficient Permanent Fund balance. Available: ${available}. Requested: ${money(Math.abs(signedAmount))}.`,
    };
  }
  return { ok: true, next };
}

export function parsePermanentFund(data?: Partial<PermanentFundSummary> | null): PermanentFundSummary {
  return {
    ...EMPTY_PERMANENT_FUND,
    total: money(Number(data?.total ?? 0)),
    cash: money(Number(data?.cash ?? 0)),
    upi: money(Number(data?.upi ?? 0)),
    bank: money(Number(data?.bank ?? 0)),
    other: money(Number(data?.other ?? 0)),
  };
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

export type CommitteePayStatus = "paid" | "partial" | "pending";

export function committeePayStatus(
  paid: number,
  target: number,
  overridden = false
): CommitteePayStatus {
  if (target <= 0 && overridden) return "paid";
  return deriveHouseholdStatus({
    expectedAmount: target,
    collectedAmount: paid,
  }) as CommitteePayStatus;
}

export function effectiveCommitteeTarget(
  member:
    | Pick<FestivalMember, "contributionTarget" | "contributionTargetOverridden">
    | null
    | undefined,
  defaultTarget: number
): number {
  if (member?.contributionTargetOverridden) {
    return money(Number(member.contributionTarget ?? 0));
  }
  const stored = money(Number(member?.contributionTarget ?? 0));
  if (stored > 0) return stored;
  return money(Number(defaultTarget ?? 0));
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
  assetPurchaseAmounts?: number[];
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
    assetPurchaseAmount: sum(input.assetPurchaseAmounts ?? []),
  };
}

export function canManagePandal(role: FestivalMember["role"] | undefined): boolean {
  return role === "admin";
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
