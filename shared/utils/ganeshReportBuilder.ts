import type {
  FestivalFundTransfer,
  GaneshCollection,
  GaneshContribution,
  GaneshExpense,
  GaneshReimbursement,
  OpeningFund,
} from "@/shared/types/ganesh";
import type { CashReconciliation, CollectionSession } from "@/shared/types/ganeshSessions";
import { money } from "@/shared/utils/ganeshMath";
import { purposeLabel, purposeOf } from "@/shared/utils/ganeshMoneyPurpose";
import { isWithinRange, type ReportRange } from "@/shared/utils/ganeshReportRange";

/**
 * The report both exports render from (GS-079).
 *
 * One builder, two renderers. CSV and PDF disagreeing about a total would be
 * worse than having only one of them, so neither format computes anything —
 * they format what this produces.
 *
 * Everything here respects the caller's permissions: a section the user may not
 * read is passed in empty and reported as withheld rather than as zero. A
 * report that shows ₹0 for data you are not allowed to see is a lie, and the
 * brief was explicit that export must not be a weaker path to the data.
 */

export type ReportSection<T> = {
  /** False when the reader lacks permission; the renderers say so. */
  included: boolean;
  rows: T[];
};

export type ReportTransaction = {
  date: string;
  type: string;
  purpose: string;
  description: string;
  amount: number;
  direction: string;
  paymentMethod: string;
  person: string;
  reference: string;
  /** True when the purpose was derived at read time rather than stored. */
  legacyPurpose: boolean;
};

export type GaneshReport = {
  pandalName: string;
  festivalName: string;
  festivalYear: number | null;
  range: ReportRange;
  generatedAt: string;
  generatedBy: string;

  summary: {
    openingFunds: number;
    collections: number;
    contributions: number;
    expenses: number;
    reimbursements: number;
    transfersIn: number;
    transfersOut: number;
    closingBalance: number;
    promisedOutstanding: number;
    /** True when the range is bounded, so the totals are not the festival's. */
    partialRange: boolean;
  };

  collections: ReportSection<{
    date: string;
    donorName: string;
    amount: number;
    paymentMethod: string;
    collector: string;
    session: string;
    area: string;
    receipt: string;
  }>;

  expenses: ReportSection<{
    date: string;
    name: string;
    purpose: string;
    vendor: string;
    amount: number;
    paymentMethod: string;
    createdBy: string;
  }>;

  reconciliations: ReportSection<{
    date: string;
    collector: string;
    expectedCash: number;
    countedCash: number;
    difference: number;
    status: string;
    countedBy: string;
    approvedBy: string;
  }>;

  /** Flat transaction-level rows for the CSV. */
  transactions: ReportTransaction[];

  /** Anything the reader should be warned about, in plain words. */
  warnings: string[];
};

/** The calendar day of a Firestore timestamp, for rows written before `date`. */
function firestoreDayOf(value: unknown): string | undefined {
  const seconds = (value as { seconds?: number } | undefined)?.seconds;
  if (typeof seconds !== "number") return undefined;
  const date = new Date(seconds * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function sum(rows: Array<{ amount?: number }>): number {
  return money(rows.reduce((total, row) => total + Number(row.amount ?? 0), 0));
}

export function buildGaneshReport(input: {
  pandalName: string;
  festivalName: string;
  festivalYear?: number | null;
  range: ReportRange;
  generatedAt: Date;
  generatedBy: string;

  /** Pass empty arrays for anything the reader may not see. */
  collections: GaneshCollection[];
  contributions: GaneshContribution[];
  expenses: GaneshExpense[];
  reimbursements: GaneshReimbursement[];
  /**
   * Opening-fund rows, not a pre-summed total.
   *
   * The rows are needed rather than `summary.openingFunds` because a transfer
   * from the Permanent Fund writes **both** an opening-fund row and a
   * fund-transfer row — two views of one movement. Counting the summary scalar
   * and the transfers together would report that money twice.
   */
  openingFundRows: OpeningFund[];
  fundTransfers: FestivalFundTransfer[];
  sessions: CollectionSession[];
  reconciliations: CashReconciliation[];

  can: {
    collections: boolean;
    contributions: boolean;
    expenses: boolean;
    reimbursements: boolean;
    reconciliation: boolean;
  };

  nameFor: (userId: string | undefined) => string;
  categoryNameFor: (categoryId: string | undefined) => string;
}): GaneshReport {
  const { range, can } = input;
  const inRange = <T extends { date?: string }>(rows: T[]) =>
    rows.filter((row) => !("voided" in row && (row as { voided?: boolean }).voided))
      .filter((row) => isWithinRange(row.date, range));

  const collections = can.collections ? inRange(input.collections) : [];
  const contributions = can.contributions ? inRange(input.contributions) : [];
  const expenses = can.expenses ? inRange(input.expenses) : [];
  const reimbursements = can.reimbursements ? inRange(input.reimbursements) : [];

  // Opening funds that were genuinely seeded, excluding the rows a Permanent
  // Fund transfer created — those are reported as transfers instead, so one
  // movement is counted once.
  const seededOpening = inRange(
    input.openingFundRows.filter((row) => row.sourceType !== "permanent_fund")
  );
  // Legacy transfers have no `date`; fall back to createdAt's day rather than
  // dropping them from every bounded range.
  const datedTransfers = input.fundTransfers.map((row) => ({
    ...row,
    date: row.date ?? firestoreDayOf(row.createdAt),
  }));
  const transfers = inRange(datedTransfers);
  const transfersIn = sum(transfers.filter((row) => row.direction === "from_permanent"));
  const transfersOut = sum(transfers.filter((row) => row.direction === "to_permanent"));
  const reconciliations = can.reconciliation
    ? input.reconciliations.filter((row) => {
        const session = input.sessions.find((item) => item.id === row.sessionId);
        return isWithinRange(session?.date, range);
      })
    : [];

  const sessionById = new Map(input.sessions.map((row) => [row.id, row]));

  const contributionsReceived = contributions.filter(
    (row) => row.status === "received" && row.kind === "money"
  );
  const promisedOutstanding = contributions.filter((row) => row.status === "promised");

  const collectionTotal = sum(collections);
  const contributionTotal = sum(contributionsReceived);
  const expenseTotal = money(
    expenses.reduce((total, row) => total + Number(row.totalAmount ?? 0), 0)
  );
  const reimbursementTotal = sum(reimbursements);

  const warnings: string[] = [];
  const mismatched = reconciliations.filter((row) => row.status === "mismatch");
  if (mismatched.length > 0) {
    const worst = money(
      mismatched.reduce((total, row) => total + Math.abs(Number(row.difference ?? 0)), 0)
    );
    warnings.push(
      `${mismatched.length} cash ${mismatched.length === 1 ? "count" : "counts"} did not match, totalling ${worst} unexplained.`
    );
  }
  const awaiting = input.sessions.filter(
    (row) => row.status === "closed" && isWithinRange(row.date, range)
  );
  if (awaiting.length > 0) {
    warnings.push(
      `${awaiting.length} collection ${awaiting.length === 1 ? "session has" : "sessions have"} cash that has not been counted yet, so the cash figures may be incomplete.`
    );
  }
  for (const [label, allowed] of [
    ["Collections", can.collections],
    ["Contributions", can.contributions],
    ["Expenses", can.expenses],
    ["Reimbursements", can.reimbursements],
    ["Cash reconciliation", can.reconciliation],
  ] as const) {
    // Named rather than silently omitted: a reader must know a section is
    // missing because of their permissions, not because there was no data.
    if (!allowed) warnings.push(`${label} are not included — your role cannot view them.`);
  }

  const transactions: ReportTransaction[] = [];
  const push = (
    row: ReportTransaction & { legacyPurpose?: boolean }
  ) => transactions.push({ ...row, legacyPurpose: Boolean(row.legacyPurpose) });

  for (const row of collections) {
    const purpose = purposeOf("collections", row as never);
    push({
      date: row.date ?? "",
      type: "Collection",
      purpose: purposeLabel(purpose),
      description: row.donorName ?? "",
      amount: Number(row.amount ?? 0),
      direction: "in",
      paymentMethod: row.paymentMethod ?? "",
      person: input.nameFor(row.collectorId),
      reference: row.receiptNumber ?? "",
      legacyPurpose: "legacy" in purpose,
    });
  }
  for (const row of contributions) {
    const purpose = purposeOf("contributions", row as never);
    push({
      date: row.date ?? "",
      type: "Contribution",
      purpose: purposeLabel(purpose),
      description: row.contributorName ?? "",
      amount: Number(row.amount ?? row.estimatedValue ?? 0),
      direction: "in",
      paymentMethod: row.paymentMethod ?? "",
      person: input.nameFor(row.createdBy),
      reference: row.contributionReference ?? "",
      legacyPurpose: "legacy" in purpose,
    });
  }
  for (const row of expenses) {
    const purpose = purposeOf("expenses", row as never);
    push({
      date: row.date ?? "",
      type: "Expense",
      purpose: purposeLabel(purpose),
      description: row.name ?? "",
      amount: Number(row.totalAmount ?? 0),
      direction: "out",
      paymentMethod: row.paymentMethod ?? "",
      person: input.nameFor(row.createdBy),
      reference: input.categoryNameFor(row.categoryId),
      legacyPurpose: "legacy" in purpose,
    });
  }
  for (const row of reimbursements) {
    const purpose = purposeOf("reimbursements", row as never);
    push({
      date: row.date ?? "",
      type: "Reimbursement",
      purpose: purposeLabel(purpose),
      description: input.nameFor(row.memberId),
      amount: Number(row.amount ?? 0),
      direction: "out",
      paymentMethod: row.paymentMethod ?? "",
      person: input.nameFor(row.createdBy),
      reference: "",
      legacyPurpose: "legacy" in purpose,
    });
  }
  for (const row of transfers) {
    const incoming = row.direction === "from_permanent";
    push({
      date: row.date ?? "",
      type: "Fund transfer",
      purpose: purposeLabel(
        purposeOf("fundTransfers", row as never)
      ),
      description: row.description ?? (incoming ? "From Permanent Fund" : "To Permanent Fund"),
      amount: Number(row.amount ?? 0),
      direction: incoming ? "in" : "out",
      paymentMethod: row.location ?? "",
      person: input.nameFor(row.createdBy),
      reference: row.linkedPermanentTxId ?? "",
      legacyPurpose: !(row as { purposeType?: string }).purposeType,
    });
  }
  transactions.sort((a, b) => a.date.localeCompare(b.date));

  const openingFunds = sum(seededOpening);

  return {
    pandalName: input.pandalName,
    festivalName: input.festivalName,
    festivalYear: input.festivalYear ?? null,
    range,
    generatedAt: input.generatedAt.toISOString(),
    generatedBy: input.generatedBy,

    summary: {
      openingFunds,
      collections: collectionTotal,
      contributions: contributionTotal,
      expenses: expenseTotal,
      reimbursements: reimbursementTotal,
      transfersIn,
      transfersOut,
      closingBalance: money(
        openingFunds
          + collectionTotal
          + contributionTotal
          + transfersIn
          - expenseTotal
          - reimbursementTotal
          - transfersOut
      ),
      promisedOutstanding: money(
        promisedOutstanding.reduce(
          (total, row) => total + Number(row.amount ?? row.estimatedValue ?? 0),
          0
        )
      ),
      // A bounded range means these are the range's totals, not the festival's,
      // and the renderers have to say so or the closing balance reads as the
      // Pandal's actual position.
      partialRange: Boolean(range.start || range.end),
    },

    collections: {
      included: can.collections,
      rows: collections.map((row) => ({
        date: row.date ?? "",
        donorName: row.donorName ?? "",
        amount: Number(row.amount ?? 0),
        paymentMethod: row.paymentMethod ?? "",
        collector: input.nameFor(row.collectorId),
        session: row.sessionId ? (sessionById.get(row.sessionId)?.date ?? row.sessionId) : "",
        area: row.area ?? "",
        receipt: row.receiptNumber ?? "",
      })),
    },

    expenses: {
      included: can.expenses,
      rows: expenses.map((row) => ({
        date: row.date ?? "",
        name: row.name ?? "",
        purpose: purposeLabel(purposeOf("expenses", row as never)),
        vendor: row.vendor ?? "",
        amount: Number(row.totalAmount ?? 0),
        paymentMethod: row.paymentMethod ?? "",
        createdBy: input.nameFor(row.createdBy),
      })),
    },

    reconciliations: {
      included: can.reconciliation,
      rows: reconciliations.map((row) => ({
        date: sessionById.get(row.sessionId)?.date ?? "",
        collector: input.nameFor(row.collectorId),
        expectedCash: Number(row.expectedCash ?? 0),
        countedCash: Number(row.countedCash ?? 0),
        difference: Number(row.difference ?? 0),
        status: row.status,
        countedBy: row.countedByName ?? input.nameFor(row.countedBy),
        approvedBy: row.approvedByName ?? (row.approvedBy ? input.nameFor(row.approvedBy) : ""),
      })),
    },

    transactions,
    warnings,
  };
}
