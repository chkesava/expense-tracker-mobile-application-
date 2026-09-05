import {
  EMPTY_GANESH_SUMMARY,
  type GaneshSummary,
  type PermanentFundLocation,
} from "@/shared/types/ganesh";
import { isReceived } from "@/shared/utils/ganeshContributions";
import {
  money,
  parseGaneshSummary,
  resolveFundLocation,
  summarizeLedger,
  type LedgerLocationDelta,
} from "@/shared/utils/ganeshMath";

/**
 * The festival summary as a pure function of the ledger (GS-004).
 *
 * This is the whole reason the summary can be taken away from the client. Every
 * displayed balance, the God Fund spend guard and the settlement figure read
 * `summary/totals`, and that document used to be maintained by `increment()`
 * deltas the client wrote in the same batch as the ledger row — so any member
 * who could write a ledger side-effect could write a plausible wrong total
 * instead, and no rule could tell the difference.
 *
 * Twenty-two of the twenty-four summary fields are recomputable from the
 * ledger documents alone; this module is that computation, lifted out of
 * `recomputeFestivalSummary` so the trusted trigger and the client's
 * "Recalculate from ledger" tool share one definition rather than drifting
 * apart. The two exceptions are `CARRIED_SUMMARY_FIELDS` below.
 */

/** A ledger document as either SDK sees it: an id and its plain field data. */
export type LedgerDoc = { id: string; data: Record<string, any> };

export interface FestivalLedger {
  openingFunds: LedgerDoc[];
  collections: LedgerDoc[];
  contributions: LedgerDoc[];
  expenses: LedgerDoc[];
  reimbursements: LedgerDoc[];
  fundTransfers: LedgerDoc[];
}

/**
 * Monotonic allocators, not totals. `nextReceiptNumber` and
 * `nextContributionNumber` hand out human-facing numbers that have already been
 * read aloud to donors, so they cannot be recomputed from the ledger and must
 * never be reset by a recompute (GS-077). They stay client-written, inside the
 * transaction that allocates them, and the rules check only that they advance.
 */
export const CARRIED_SUMMARY_FIELDS = [
  "nextReceiptNumber",
  "nextContributionNumber",
] as const;

export type CarriedSummaryField = (typeof CARRIED_SUMMARY_FIELDS)[number];

/** The fields the trusted backend owns — everything except the allocators. */
export const DERIVED_SUMMARY_FIELDS = (
  Object.keys(EMPTY_GANESH_SUMMARY) as Array<keyof GaneshSummary>
).filter((key) => !(CARRIED_SUMMARY_FIELDS as readonly string[]).includes(key));

const notVoided = (row: LedgerDoc) => !row.data.voided;
const received = (row: LedgerDoc) => isReceived(row.data as Parameters<typeof isReceived>[0]);
const num = (value: unknown) => Number(value ?? 0);

function locationDeltasOf(ledger: FestivalLedger): LedgerLocationDelta[] {
  const deltas: Array<{ location: PermanentFundLocation; amount: number }> = [];
  const add = (location: unknown, amount: number) => {
    if (!amount) return;
    deltas.push({
      location: resolveFundLocation(typeof location === "string" ? location : undefined),
      amount,
    });
  };

  // Opening funds written before locations existed carry no `location`, so they
  // resolve to "other" and stay unclassified. Never fall back to `sourceType`:
  // it is a provenance, not a place money sits.
  for (const row of ledger.openingFunds.filter(notVoided)) {
    add(row.data.location, num(row.data.amount));
  }
  for (const row of ledger.collections.filter(notVoided)) {
    add(row.data.paymentMethod, num(row.data.amount));
  }
  for (const row of ledger.contributions.filter((r) => received(r) && r.data.kind === "money")) {
    add(row.data.paymentMethod, num(row.data.amount));
  }
  for (const row of ledger.expenses.filter(notVoided)) {
    add(row.data.paymentMethod, -num(row.data.godFundAmount));
  }
  for (const row of ledger.reimbursements.filter(notVoided)) {
    add(row.data.paymentMethod, -num(row.data.amount));
  }
  for (const row of ledger.fundTransfers.filter((r) => r.data.direction === "to_permanent")) {
    add(row.data.location, -num(row.data.amount));
  }
  return deltas;
}

/**
 * @param carry the allocator values to preserve. Dropping either restarts
 *   numbering and duplicates receipt numbers already handed to donors.
 */
export function deriveFestivalSummary(
  ledger: FestivalLedger,
  carry: Partial<Record<CarriedSummaryField, number>> = {}
): GaneshSummary {
  const { collections, contributions, expenses, reimbursements, openingFunds, fundTransfers } =
    ledger;

  const summary = summarizeLedger({
    openingFunds: openingFunds.filter(notVoided).map((r) => num(r.data.amount)),
    collections: collections.filter(notVoided).map((r) => num(r.data.amount)),
    committeeContributions: contributions
      .filter((r) => received(r) && r.data.kind === "money" && r.data.isCommitteeContribution)
      .map((r) => num(r.data.amount)),
    otherCashContributions: contributions
      .filter((r) => received(r) && r.data.kind === "money" && !r.data.isCommitteeContribution)
      .map((r) => num(r.data.amount)),
    godFundExpenses: expenses.filter(notVoided).map((r) => num(r.data.godFundAmount)),
    reimbursements: reimbursements.filter(notVoided).map((r) => num(r.data.amount)),
    personalAmounts: expenses.filter(notVoided).map((r) => num(r.data.personalAmount)),
    reimbursementAmounts: expenses
      .filter(notVoided)
      .filter((r) => r.data.reimbursementRequired !== false)
      .map((r) => num(r.data.personalAmount)),
    assetPurchaseAmounts: expenses
      .filter(notVoided)
      .filter((r) => r.data.expenseType === "asset_purchase" || r.data.assetId)
      .map((r) => num(r.data.godFundAmount) + num(r.data.personalAmount)),
    sponsoredExpenseAmounts: expenses.filter(notVoided).map((r) => num(r.data.sponsoredAmount)),
    inKindValues: contributions
      .filter((r) => received(r) && r.data.kind !== "money" && r.data.kind !== "sponsorship")
      .map((r) => num(r.data.estimatedValue)),
    sponsoredValues: contributions
      .filter((r) => received(r) && r.data.kind === "sponsorship")
      .map((r) => num(r.data.estimatedValue)),
    locationDeltas: locationDeltasOf(ledger),
  });

  summary.promisedCashContributions = money(
    contributions
      .filter((r) => notVoided(r) && r.data.status === "promised" && r.data.kind === "money")
      .reduce((total, r) => total + num(r.data.amount), 0)
  );
  summary.promisedInKindValue = money(
    contributions
      .filter((r) => notVoided(r) && r.data.status === "promised" && r.data.kind !== "money")
      .reduce((total, r) => total + num(r.data.estimatedValue), 0)
  );
  // Rounded like every other field summarizeLedger produces; these two were the
  // exceptions (GS-081).
  summary.transferredToPermanentFund = money(
    fundTransfers
      .filter((r) => r.data.direction === "to_permanent")
      .reduce((total, r) => total + num(r.data.amount), 0)
  );
  summary.receivedFromPermanentFund = money(
    fundTransfers
      .filter((r) => r.data.direction === "from_permanent")
      .reduce((total, r) => total + num(r.data.amount), 0)
  );

  summary.nextContributionNumber = num(carry.nextContributionNumber);
  summary.nextReceiptNumber = num(carry.nextReceiptNumber);
  return summary;
}

export interface MemberTotals {
  contributionPaid: number;
  personalExpenses: number;
  reimbursed: number;
  pendingReimbursement: number;
}

/**
 * The per-member counters, derived the same way and for the same reason: they
 * are `increment()` side-effects today, so a client can drift them (GS-009 does
 * exactly that) or set them outright.
 */
export function deriveMemberTotals(ledger: FestivalLedger): Map<string, MemberTotals> {
  const totals = new Map<string, MemberTotals>();
  const bump = (id: unknown, field: keyof MemberTotals, amount: number) => {
    if (typeof id !== "string" || !id || !amount) return;
    const row = totals.get(id) ?? {
      contributionPaid: 0,
      personalExpenses: 0,
      reimbursed: 0,
      pendingReimbursement: 0,
    };
    row[field] = money(row[field] + amount);
    totals.set(id, row);
  };

  for (const row of ledger.contributions.filter(
    (r) => received(r) && r.data.kind === "money" && r.data.isCommitteeContribution
  )) {
    bump(row.data.contributorMemberId, "contributionPaid", num(row.data.amount));
  }
  for (const row of ledger.expenses.filter(notVoided)) {
    bump(row.data.paidByMemberId, "personalExpenses", num(row.data.personalAmount));
  }
  for (const row of ledger.reimbursements.filter(notVoided)) {
    bump(row.data.memberId, "reimbursed", num(row.data.amount));
  }
  for (const row of totals.values()) {
    row.pendingReimbursement = money(Math.max(0, row.personalExpenses - row.reimbursed));
  }
  return totals;
}

export interface SummaryAuditDelta {
  movedKeys: Array<keyof GaneshSummary>;
  oldValue: Record<string, number>;
  newValue: Record<string, number>;
  reason: string;
}

/**
 * What a manual recompute changed, for the audit trail (GS-053).
 *
 * A recompute rewrites every total on the festival, and it is the write most
 * likely to be reached for when the numbers already look wrong — exactly when a
 * committee needs to see what moved. Only the fields that actually moved are
 * recorded: a recompute that changes nothing is the common case, and an entry
 * listing every unchanged total would bury the one that did move.
 *
 * The automatic trigger deliberately does not write one of these. It fires on
 * every ledger row, so an entry per rebuild would be noise, and the ledger row
 * itself is already audited.
 */
export function summaryAuditDelta(
  before: Partial<GaneshSummary> | null,
  after: GaneshSummary
): SummaryAuditDelta {
  const parsed = parseGaneshSummary(before);
  const movedKeys = (
    Object.keys(EMPTY_GANESH_SUMMARY) as Array<keyof GaneshSummary>
  ).filter((key) => parsed[key] !== after[key]);
  return {
    movedKeys,
    oldValue: Object.fromEntries(movedKeys.map((key) => [key, parsed[key] as number])),
    newValue: Object.fromEntries(movedKeys.map((key) => [key, after[key] as number])),
    reason:
      movedKeys.length === 0
        ? "Recalculated from ledger; every total already agreed"
        : `Recalculated from ledger; ${movedKeys.length} total(s) changed`,
  };
}
