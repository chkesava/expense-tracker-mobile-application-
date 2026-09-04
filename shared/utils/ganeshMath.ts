import type {
  FestivalMember,
  GaneshSummary,
  CommitteeContributionStatus,
  Household,
  HouseholdStatus,
  PermanentFundLocation,
  PermanentFundSummary,
} from "@/shared/types/ganesh";
import { EMPTY_GANESH_SUMMARY, EMPTY_PERMANENT_FUND } from "@/shared/types/ganesh";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { roundMoney } from "@/shared/utils/money";

/**
 * Round to paise. The one formula every Ganesh money comparison must use.
 *
 * Delegates to `roundMoney` rather than repeating it (GS-080). The canonical
 * helper adds `Number.EPSILON` before rounding and documents why; this copy
 * omitted it, which mattered because two validators compare rounded sums with
 * exact equality — `validateExpenseFunding` and `validateSettlement`.
 *
 * The reachable case is narrower than the ticket describes. Amounts entered to
 * two decimals are provably immune: their float residue is far below the
 * half-paise rounding boundary, and 500,000 randomised three-way 2dp splits
 * produced no disagreement either way. It bites only on **half-paise** input —
 * a user typing three decimals, e.g. a 2.72 / 2.72 / 2.725 split of 8.165,
 * where the summed side landed on 8.17 and the typed total on 8.16 and a
 * balanced expense was refused. One implementation removes the divergence
 * whether or not anyone types three decimals.
 */
export function money(value: number): number {
  return roundMoney(value);
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

/** The summary fields every God Fund balance question needs. */
export type GodFundLedger = Pick<
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
>;

/**
 * God Fund money whose Cash/UPI/Bank location was never recorded.
 *
 * The per-location buckets landed after festivals were already collecting and
 * nothing backfilled them, so a live festival can hold real money with every
 * bucket still at zero. The committee knows where that money is; the summary
 * document does not. Treating it as spendable from any location is what keeps
 * such a festival usable, instead of rejecting every Cash/UPI/Bank spend until
 * an admin happens to find "Recalculate from ledger".
 *
 * Self-limiting: once every rupee is classified this is zero and the per
 * location ceilings bite exactly as written.
 */
export function unclassifiedGodFund(summary: GodFundLedger): number {
  const onDisk = festivalLocationTotal(festivalLocationsOf(summary));
  return money(Math.max(0, availableGodFund(summary) - onDisk));
}

/**
 * What a God Fund spend from `location` may actually draw on: the bucket plus
 * any unclassified money, never more than the festival holds in total.
 */
export function godFundSpendableAt(
  location: PermanentFundLocation,
  summary: GodFundLedger
): number {
  const locations = festivalLocationsOf(summary);
  return money(
    Math.min(
      availableGodFund(summary),
      (locations[location] ?? 0) + unclassifiedGodFund(summary)
    )
  );
}

/**
 * Display/repair helper. Unclassified God Fund (legacy records, or location
 * fields never written) is absorbed into `other` so Cash + UPI + Bank + Other
 * equals Available God Fund. Does not mutate the ledger.
 */
export function repairFestivalLocations(summary: GodFundLedger): FestivalLocations {
  const locations = festivalLocationsOf(summary);
  const available = availableGodFund(summary);
  // A bucket sits negative when unclassified money was spent from it (see
  // unclassifiedGodFund). "Cash -₹222" tells a committee nothing true, so an
  // overdrawn bucket reads as empty and `other` carries the difference — the
  // same treatment money of unknown location already gets.
  const shown: FestivalLocations = {
    cash: Math.max(0, locations.cash),
    upi: Math.max(0, locations.upi),
    bank: Math.max(0, locations.bank),
    other: Math.max(0, locations.other),
  };
  const remainder = money(available - festivalLocationTotal(shown));
  if (remainder === 0) return shown;
  const other = money(shown.other + remainder);
  if (other < 0) return shown;
  return { ...shown, other };
}

export function locationInvariantHolds(summary: GaneshSummary): boolean {
  return festivalLocationTotal(festivalLocationsOf(summary)) === availableGodFund(summary);
}

export function validateGodFundLocationSpend(
  godFundAmount: number,
  location: PermanentFundLocation,
  summary: GodFundLedger
): ValidationResult {
  const amount = money(godFundAmount);
  if (amount <= 0) return { ok: true };
  const total = validateGodFundSpend(amount, availableGodFund(summary));
  if (!total.ok) return total;
  const spendable = godFundSpendableAt(location, summary);
  if (amount > spendable) {
    return {
      ok: false,
      error:
        `Insufficient ${fundLocationLabel(location)} in the God Fund. ` +
        `Available: ${formatInr(spendable)}. ` +
        `Requested: ${formatInr(amount)}.`,
    };
  }
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

/**
 * God Fund still sitting in festivals that have been closed (GS-022).
 *
 * Closing a festival does not require moving the balance out — the settlement
 * screen deliberately offers keeping it — so a closed festival can hold real
 * cash. That money appeared in no Pandal-level figure anywhere: the dashboard
 * shows the *active* festival only, and the Permanent Fund total does not
 * include it, so the Pandal understated what it held by the sum of every closed
 * festival's residue and the money could not be found in the app at all.
 *
 * Derived from the summaries rather than stored, so festivals closed long
 * before this existed are counted with no migration.
 */
export function closedFestivalResidue(
  festivals: Array<{ id: string; status?: string }>,
  summaries: Record<string, GodFundLedger | undefined>
): number {
  return money(
    festivals
      .filter((festival) => festival.status === "closed")
      .reduce((total, festival) => {
        const summary = summaries[festival.id];
        if (!summary) return total;
        // Only a positive residue is money the Pandal holds. A negative
        // closing balance is a drift bug, not cash, and adding it would quietly
        // net real money away against it.
        return total + Math.max(0, availableGodFund(summary));
      }, 0)
  );
}

/** What the Pandal holds in total: Permanent Fund + live festival + residue. */
export function totalPandalFunds(input: {
  permanentFundTotal: number;
  activeFestivalGodFund: number;
  closedFestivalResidue: number;
}): number {
  return money(
    input.permanentFundTotal + input.activeFestivalGodFund + input.closedFestivalResidue
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
  // Summed raw, then rounded once — not summed from components that were each
  // rounded first (GS-080). Rounding three parts independently and demanding
  // they equal the rounded whole refuses balanced entries: measured over
  // 400,000 randomised three-decimal splits, 136,817 of them, about one in
  // three. Rounding the sum instead produced zero false rejections across the
  // same set, and still catches an entry that is off by a genuine paise.
  //
  // The epsilon in `money()` is not what fixes this and never was; it is
  // relative to 1.0, so for a figure like 8.165 it is far below that value's
  // own float spacing.
  if (money(input.godFundAmount + input.personalAmount + (input.sponsoredAmount ?? 0)) !== total) {
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
  // Same correction as validateExpenseFunding above (GS-080): sum the raw
  // inputs and round once, rather than comparing independently-rounded parts.
  if (money(input.transfer + input.remaining) !== closing) {
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

export type CommitteePayStatus = "paid" | "partial" | "pending" | "waived";

export function committeePayStatus(
  paid: number,
  target: number,
  overridden = false,
  waived = false
): CommitteePayStatus {
  if (waived) return "waived";
  if (target <= 0 && overridden) return "paid";
  return deriveHouseholdStatus({
    expectedAmount: target,
    collectedAmount: paid,
  }) as CommitteePayStatus;
}

export function committeeContributionStatus(
  member: Pick<FestivalMember, "contributionTarget" | "contributionPaid" | "contributionTargetOverridden" | "contributionWaived">,
): CommitteeContributionStatus {
  return committeePayStatus(
    Number(member.contributionPaid ?? 0),
    Number(member.contributionTarget ?? 0),
    Boolean(member.contributionTargetOverridden),
    Boolean(member.contributionWaived),
  ) as CommitteeContributionStatus;
}

export function contributionAccountingKind(input: {
  kind: string;
  isCommitteeContribution?: boolean;
}): "committee_cash" | "other_cash" | "in_kind" | "sponsorship" {
  if (input.kind === "money") {
    return input.isCommitteeContribution ? "committee_cash" : "other_cash";
  }
  return input.kind === "sponsorship" ? "sponsorship" : "in_kind";
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
  sponsoredExpenseAmounts?: number[];
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
    sponsoredExpenseAmount: sum(input.sponsoredExpenseAmounts ?? []),
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
