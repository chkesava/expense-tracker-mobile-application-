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

/** Round to paise. The one formula every Ganesh money comparison must use. */
export function money(value: number): number {
  return Math.round(value * 100) / 100;
}

export type FestivalLocations = {
  cash: number;
  upi: number;
  bank: number;
  other: number;
};

export const EMPTY_FESTIVAL_LOCATIONS: FestivalLocations = {
  cash: 0,
  upi: 0,
  bank: 0,
  other: 0,
};

export function fundLocationLabel(location: PermanentFundLocation): string {
  if (location === "upi") return "UPI";
  return location.charAt(0).toUpperCase() + location.slice(1);
}

export function resolveFundLocation(value?: string | null): PermanentFundLocation {
  if (value === "cash" || value === "upi" || value === "bank" || value === "other") {
    return value;
  }
  return "other";
}

export function festivalLocationsOf(
  summary?: Pick<GaneshSummary, "cash" | "upi" | "bank" | "other"> | null
): FestivalLocations {
  return {
    cash: money(Number(summary?.cash ?? 0)),
    upi: money(Number(summary?.upi ?? 0)),
    bank: money(Number(summary?.bank ?? 0)),
    other: money(Number(summary?.other ?? 0)),
  };
}

export function festivalLocationTotal(locations: FestivalLocations): number {
  return money(locations.cash + locations.upi + locations.bank + locations.other);
}

export function locationDelta(
  location: PermanentFundLocation,
  signedAmount: number
): Partial<FestivalLocations> {
  const amount = money(signedAmount);
  if (amount === 0) return {};
  return { [location]: amount };
}

export function applyFestivalLocationDelta(
  current: FestivalLocations,
  location: PermanentFundLocation,
  signedAmount: number
): { ok: true; next: FestivalLocations } | { ok: false; error: string } {
  if (!Number.isFinite(signedAmount) || signedAmount === 0) {
    return { ok: false, error: "Enter an amount other than zero." };
  }
  const next: FestivalLocations = { ...current };
  next[location] = money((current[location] ?? 0) + signedAmount);
  if (next[location] < 0) {
    return {
      ok: false,
      error:
        `Insufficient ${fundLocationLabel(location)} in the God Fund. ` +
        `Available: ${formatInr(money(current[location] ?? 0))}. ` +
        `Requested: ${formatInr(money(Math.abs(signedAmount)))}.`,
    };
  }
  return { ok: true, next };
}

/**
 * Display/repair helper. Unclassified God Fund (legacy records, or location
 * fields never written) is absorbed into `other` so Cash + UPI + Bank + Other
 * equals Available God Fund. Does not mutate the ledger.
 */
export function repairFestivalLocations(
  summary: Pick<
    GaneshSummary,
    | "openingFunds"
    | "chanda"
    | "committeeContributions"
    | "otherCashContributions"
    | "godFundExpenses"
    | "reimbursements"
    | "transferredToPermanentFund"
    | "cash"
    | "upi"
    | "bank"
    | "other"
  >
): FestivalLocations {
  const locations = festivalLocationsOf(summary);
  const available = availableGodFund(summary);
  const remainder = money(available - festivalLocationTotal(locations));
  if (remainder === 0) return locations;
  const other = money(locations.other + remainder);
  if (other < 0) return locations;
  return { ...locations, other };
}

export function locationInvariantHolds(summary: GaneshSummary): boolean {
  return festivalLocationTotal(festivalLocationsOf(summary)) === availableGodFund(summary);
}

export function validateGodFundLocationSpend(
  godFundAmount: number,
  location: PermanentFundLocation,
  summary: Pick<
    GaneshSummary,
    | "openingFunds"
    | "chanda"
    | "committeeContributions"
    | "otherCashContributions"
    | "godFundExpenses"
    | "reimbursements"
    | "transferredToPermanentFund"
    | "cash"
    | "upi"
    | "bank"
    | "other"
  >
): ValidationResult {
  const amount = money(godFundAmount);
  if (amount <= 0) return { ok: true };
  const total = validateGodFundSpend(amount, availableGodFund(summary));
  if (!total.ok) return total;
  const applied = applyFestivalLocationDelta(repairFestivalLocations(summary), location, -amount);
  if (!applied.ok) return applied;
  return { ok: true };
}

export function parseGaneshSummary(data?: Partial<GaneshSummary> | null): GaneshSummary {
  const src = data ?? {};
  const next = { ...EMPTY_GANESH_SUMMARY };
  (Object.keys(EMPTY_GANESH_SUMMARY) as Array<keyof typeof EMPTY_GANESH_SUMMARY>).forEach((key) => {
    next[key] = money(Number(src[key] ?? 0));
  });
  return { ...next, updatedAt: src.updatedAt };
}

export function repairPermanentFund(fund: PermanentFundSummary): PermanentFundSummary {
  const parsed: PermanentFundSummary = {
    total: money(Number(fund.total ?? 0)),
    cash: money(Number(fund.cash ?? 0)),
    upi: money(Number(fund.upi ?? 0)),
    bank: money(Number(fund.bank ?? 0)),
    other: money(Number(fund.other ?? 0)),
  };
  const parts = money(parsed.cash + parsed.upi + parsed.bank + parsed.other);
  if (parts === parsed.total) return parsed;
  const other = money(parsed.other + (parsed.total - parts));
  if (other < 0) {
    return { ...parsed, total: parts };
  }
  return { ...parsed, other };
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
  return repairPermanentFund({
    ...EMPTY_PERMANENT_FUND,
    total: Number(data?.total ?? 0),
    cash: Number(data?.cash ?? 0),
    upi: Number(data?.upi ?? 0),
    bank: Number(data?.bank ?? 0),
    other: Number(data?.other ?? 0),
  });
}

export function validateInKindValue(estimatedValue: number): ValidationResult {
  return validateNonNegativeAmount(estimatedValue, "Estimated value");
}

export function deriveHouseholdStatus(input: {
  expectedAmount: number;
  collectedAmount: number;
  forcedStatus?: HouseholdStatus;
}): HouseholdStatus {
  const expected = money(input.expectedAmount);
  const collected = money(input.collectedAmount);
  // Money received clears sticky visit statuses — not_available / not_interested
  // only stick when there is no cash yet (edits and zero-amount visits).
  if (
    collected <= 0
    && (input.forcedStatus === "not_interested" || input.forcedStatus === "not_available")
  ) {
    return input.forcedStatus;
  }
  if (collected <= 0) return "pending";
  if (expected > 0 && collected < expected) return "partial";
  return "paid";
}

/** Year-aware receipt: GNS26-000182. Sequence is 1-based. */
export function formatCollectionReceipt(year: number, sequence: number): string {
  const yy = String(Math.abs(Math.trunc(year)) % 100).padStart(2, "0");
  const n = Math.max(1, Math.trunc(sequence));
  return `GNS${yy}-${String(n).padStart(6, "0")}`;
}

export type CollectionDuplicateMatch = {
  id: string;
  donorName: string;
  houseNumber?: string;
  amount: number;
  date: string;
  collectorId: string;
  receiptNumber?: string;
};

/**
 * Warn (do not block) when the same house looks like it already paid a
 * similar amount on the same calendar day. Legitimate instalments on
 * another day must not match.
 */
export function possibleDuplicateCollections(
  collections: Array<{
    id: string;
    householdId?: string;
    donorName: string;
    houseNumber?: string;
    amount: number;
    date: string;
    collectorId: string;
    receiptNumber?: string;
    voided?: boolean;
  }>,
  input: {
    householdId?: string | null;
    donorName: string;
    houseNumber?: string;
    amount: number;
    date: string;
    amountTolerance?: number;
  }
): CollectionDuplicateMatch[] {
  if (!(input.amount > 0) || !input.date) return [];
  const name = input.donorName.trim().toLowerCase();
  const house = (input.houseNumber ?? "").trim().toLowerCase();
  const tolerance = money(input.amountTolerance ?? 0.01);
  return collections
    .filter((row) => {
      if (row.voided) return false;
      if (row.date !== input.date) return false;
      if (Math.abs(money(row.amount) - money(input.amount)) > tolerance) return false;
      if (input.householdId && row.householdId === input.householdId) return true;
      const sameName = name.length > 0 && row.donorName.trim().toLowerCase() === name;
      const sameHouse =
        house.length > 0 && (row.houseNumber ?? "").trim().toLowerCase() === house;
      return sameName && (sameHouse || !house);
    })
    .map((row) => ({
      id: row.id,
      donorName: row.donorName,
      houseNumber: row.houseNumber,
      amount: row.amount,
      date: row.date,
      collectorId: row.collectorId,
      receiptNumber: row.receiptNumber,
    }));
}

export function householdOverpayAmount(input: {
  expectedAmount: number;
  collectedAmount: number;
  thisAmount: number;
}): number {
  const expected = money(input.expectedAmount);
  if (!(expected > 0)) return 0;
  const next = money(input.collectedAmount + input.thisAmount);
  return money(Math.max(0, next - expected));
}

/**
 * Identity fields copied into a new festival (GS-062). Never copies
 * `collectedAmount` or collection history.
 */
export function mapHouseholdForNewFestival(
  prev: {
    name?: unknown;
    houseNumber?: unknown;
    mobile?: unknown;
    area?: unknown;
    notes?: unknown;
    expectedAmount?: unknown;
    collectedAmount?: unknown;
    status?: unknown;
  },
  fallbackExpected: number
): {
  name: string;
  houseNumber?: string;
  mobile?: string;
  area?: string;
  notes?: string;
  expectedAmount: number;
  collectedAmount: 0;
  status: HouseholdStatus;
} {
  const previousExpected = Number(prev.expectedAmount ?? 0);
  const previousStatus = prev.status as HouseholdStatus | undefined;
  return {
    name: typeof prev.name === "string" && prev.name.trim() ? prev.name : "Household",
    houseNumber: typeof prev.houseNumber === "string" ? prev.houseNumber : undefined,
    mobile: typeof prev.mobile === "string" ? prev.mobile : undefined,
    area: typeof prev.area === "string" ? prev.area : undefined,
    notes: typeof prev.notes === "string" ? prev.notes : undefined,
    expectedAmount: previousExpected > 0 ? previousExpected : fallbackExpected,
    collectedAmount: 0,
    status: previousStatus === "not_interested" ? "not_interested" : "pending",
  };
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

export type LedgerLocationDelta = {
  location: PermanentFundLocation;
  amount: number;
};

export type LedgerTotalsInput = {
  openingFunds: number[];
  collections: number[];
  committeeContributions: number[];
  otherCashContributions: number[];
  godFundExpenses: number[];
  reimbursements: number[];
  personalAmounts: number[];
  reimbursementAmounts?: number[];
  inKindValues: number[];
  sponsoredValues: number[];
  assetPurchaseAmounts?: number[];
  locationDeltas?: LedgerLocationDelta[];
};

export function summarizeFestivalLocations(deltas: LedgerLocationDelta[]): FestivalLocations {
  const next = { ...EMPTY_FESTIVAL_LOCATIONS };
  for (const delta of deltas) {
    const location = resolveFundLocation(delta.location);
    next[location] = money(next[location] + delta.amount);
  }
  return next;
}

export function summarizeLedger(input: LedgerTotalsInput): GaneshSummary {
  const sum = (values: number[]) => money(values.reduce((acc, value) => acc + value, 0));
  const personalMoneyUsed = sum(input.personalAmounts);
  const reimbursementObligation = sum(input.reimbursementAmounts ?? input.personalAmounts);
  const reimbursed = sum(input.reimbursements);
  const summary: GaneshSummary = {
    ...EMPTY_GANESH_SUMMARY,
    openingFunds: sum(input.openingFunds),
    chanda: sum(input.collections),
    committeeContributions: sum(input.committeeContributions),
    otherCashContributions: sum(input.otherCashContributions),
    godFundExpenses: sum(input.godFundExpenses),
    reimbursements: reimbursed,
    personalMoneyUsed,
    pendingReimbursements: money(Math.max(0, reimbursementObligation - reimbursed)),
    inKindValue: sum(input.inKindValues),
    sponsoredValue: sum(input.sponsoredValues),
    collectionCount: input.collections.length,
    expenseCount: input.godFundExpenses.length,
    assetPurchaseAmount: sum(input.assetPurchaseAmounts ?? []),
  };
  if (input.locationDeltas) {
    const locations = summarizeFestivalLocations(input.locationDeltas);
    const repaired = repairFestivalLocations({ ...summary, ...locations });
    summary.cash = repaired.cash;
    summary.upi = repaired.upi;
    summary.bank = repaired.bank;
    summary.other = repaired.other;
  }
  return summary;
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
