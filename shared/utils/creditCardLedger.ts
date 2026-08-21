import type { Account, AccountPayment, Expense } from "../types/expense";
import type { CreditCardBill } from "../types/creditCardBill";
import {
  CREDIT_CARD_PAYMENT_WINDOW_DAYS,
  OPEN_BILL_STATUSES,
} from "../types/creditCardBill";
import { AUTO_CREDIT_CARD_BILL_NOTE } from "./autoCreditCardBills";
import { roundMoney } from "./money";
import {
  billingCycleEndingOn,
  getBillingCycleDates,
  getDaysUntilReset,
  isDateKeyInInclusiveRange,
  normalizeBillGenerationDay,
} from "./billingCycle";
import { daysBetweenDateKeys } from "./creditCardBillStatus";
import {
  billDateForMonth,
  parseLocalDate,
  shiftDateKey,
  todayDateKey,
  toLocalDateKey,
} from "./dates";

/** Same window as auto-bill re-date: a close date this close is the same cycle. */
const STATEMENT_SNAP_DAYS = 3;

/** Statement fields the ledger reads. Accepts partial bills from any caller. */
export type LedgerBillSlice = Pick<
  CreditCardBill,
  | "id"
  | "accountId"
  | "statementDate"
  | "statementAmount"
  | "amountPaid"
  | "status"
> &
  Partial<
    Pick<
      CreditCardBill,
      | "billingPeriodStart"
      | "billingPeriodEnd"
      | "minimumDueAmount"
      | "remainingAmount"
      | "dueDate"
      | "paymentIds"
      | "note"
    >
  >;

export type LedgerStatement = {
  /** Stored bill id when a statement document exists for this cycle. */
  billId?: string;
  periodStart: string;
  periodEnd: string;
  statementDate: string;
  dueDate: string;
  /** Gross amount statemented for the window. */
  billed: number;
  /** Payments and out-of-band settlements allocated to this statement. */
  paid: number;
  remaining: number;
  minimumDue: number;
  /** Open statements still count as a liability. */
  isOpen: boolean;
  cancelled: boolean;
  status: "unpaid" | "partiallyPaid" | "paid" | "cancelled";
  source: "bill" | "derived";
  /** Payment ids the ledger applied to this statement, oldest first. */
  paymentIds: string[];
  /** Date of the last payment applied here. */
  lastPaymentDate?: string;
};

export type CreditCardLedger = {
  /** Newest statement first. */
  statements: LedgerStatement[];
  /** Sum of remaining on open statements. */
  statementDue: number;
  /** Current cycle spend, net of credit left over after settling statements. */
  unbilledSpend: number;
  /**
   * Spend a cancelled statement covered, net of credit. Still owed, so it stays
   * in `totalOutstanding` — but it is not this-cycle spend, so it must not eat
   * the limit via `availableCredit`.
   */
  cancelledSpend: number;
  totalOutstanding: number;
  availableCredit: number;
  creditLimit: number;
  /** Credit paid beyond every statement and the current cycle spend. */
  unappliedCredit: number;
  openCycle: {
    start: string;
    end: string;
    /** Gross spend in the open window, before any credit is applied. */
    spend: number;
    daysRemaining: number;
  };
};

export type BuildCreditCardLedgerInput = {
  account: Account;
  expenses: Expense[];
  payments: AccountPayment[];
  bills?: LedgerBillSlice[];
  /** YYYY-MM-DD "today" in the user's timezone. */
  today?: string;
  /** How many closed cycles to derive when no statement document exists. */
  cycles?: number;
};

const DEFAULT_DERIVED_CYCLES = 12;

function emptyLedger(account: Account, today: string): CreditCardLedger {
  const limit = Math.max(0, account.creditLimit ?? 0);
  return {
    statements: [],
    statementDue: 0,
    unbilledSpend: 0,
    cancelledSpend: 0,
    totalOutstanding: 0,
    availableCredit: limit,
    creditLimit: limit,
    unappliedCredit: 0,
    openCycle: { start: today, end: today, spend: 0, daysRemaining: 0 },
  };
}

function sortPayments(payments: AccountPayment[]): AccountPayment[] {
  return [...payments].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.id || "").localeCompare(b.id || "")
  );
}

/**
 * Every statement window for a card, oldest first, keyed by close date.
 * Derived from the card's generation day so a stored bill and a cycle with no
 * bill document describe the same window.
 */
function collectStatementWindows(input: {
  billDay: number;
  today: string;
  expenses: Expense[];
  bills: LedgerBillSlice[];
  cycles: number;
}): { statementDate: string; periodStart: string; periodEnd: string }[] {
  const { billDay, today, cycles } = input;
  const { previousBillDate } = getBillingCycleDates(billDay, parseLocalDate(today));
  const windows = new Map<
    string,
    { statementDate: string; periodStart: string; periodEnd: string }
  >();

  const addWindowEndingOn = (cycleEnd: Date) => {
    const { cycleStart } = billingCycleEndingOn(cycleEnd, billDay);
    const statementDate = toLocalDateKey(cycleEnd);
    if (statementDate > today) return;
    windows.set(statementDate, {
      statementDate,
      periodStart: toLocalDateKey(cycleStart),
      periodEnd: statementDate,
    });
  };

  const oldestActivity = input.expenses.reduce(
    (min, expense) => (!min || expense.date < min ? expense.date : min),
    ""
  );
  const oldestBill = input.bills.reduce(
    (min, bill) =>
      !min || bill.statementDate < min ? bill.statementDate : min,
    ""
  );
  const floor =
    [oldestActivity, oldestBill].filter(Boolean).sort()[0] ||
    toLocalDateKey(previousBillDate);

  for (let i = 0; i < Math.max(cycles, 1) * 4; i += 1) {
    const cycleEnd = billDateForMonth(
      previousBillDate.getFullYear(),
      previousBillDate.getMonth() - i,
      billDay
    );
    addWindowEndingOn(cycleEnd);
    if (toLocalDateKey(cycleEnd) < floor) break;
  }

  // A stored statement whose close date drifted from the card's generation day
  // (bill day edited) is the same cycle — don't add a second window or spend
  // is billed twice until the repair pass re-dates it. A genuinely distinct
  // manual bill still has to appear exactly once.
  for (const bill of input.bills) {
    if (windows.has(bill.statementDate)) continue;
    const snapsToDerived = [...windows.keys()].some(
      (key) =>
        Math.abs(daysBetweenDateKeys(bill.statementDate, key)) <=
        STATEMENT_SNAP_DAYS
    );
    if (snapsToDerived) continue;
    const periodEnd = bill.billingPeriodEnd || bill.statementDate;
    const periodStart =
      bill.billingPeriodStart ||
      toLocalDateKey(
        billingCycleEndingOn(parseLocalDate(periodEnd), billDay).cycleStart
      );
    windows.set(bill.statementDate, {
      statementDate: bill.statementDate,
      periodStart,
      periodEnd,
    });
  }

  return [...windows.values()].sort((a, b) =>
    a.statementDate.localeCompare(b.statementDate)
  );
}

/**
 * Prefer an exact statementDate match; otherwise the closest stored bill
 * within {@link STATEMENT_SNAP_DAYS} that hasn't already been claimed.
 */
function claimBillForWindow(
  statementDate: string,
  bills: LedgerBillSlice[],
  claimed: Set<string>
): LedgerBillSlice | undefined {
  const exact = bills.find(
    (bill) => bill.statementDate === statementDate && !claimed.has(bill.id)
  );
  if (exact) {
    claimed.add(exact.id);
    return exact;
  }

  let nearest: LedgerBillSlice | undefined;
  let nearestDist = STATEMENT_SNAP_DAYS + 1;
  for (const bill of bills) {
    if (claimed.has(bill.id) || bill.status === "CANCELLED") continue;
    const dist = Math.abs(daysBetweenDateKeys(bill.statementDate, statementDate));
    if (dist === 0 || dist > STATEMENT_SNAP_DAYS) continue;
    if (dist < nearestDist) {
      nearest = bill;
      nearestDist = dist;
    }
  }
  if (nearest) claimed.add(nearest.id);
  return nearest;
}

/**
 * Single source of truth for a credit card's position.
 *
 * Statements are gross spend for their window — a payment never shrinks a
 * statement amount. Payments settle statements that already existed on the
 * payment date, oldest-first. Leftover reduces the still-open cycle (and
 * becomes unapplied credit once that cycle closes). It does not silently
 * mark the next generated statement as paid. Available credit is limit minus
 * unbilled cycle spend; an unpaid statement is tracked separately until paid.
 */
export function buildCreditCardLedger(
  input: BuildCreditCardLedgerInput
): CreditCardLedger {
  const { account } = input;
  const today = input.today || todayDateKey();
  const billDay = normalizeBillGenerationDay(account.billGenerationDay);
  const limit = Math.max(0, account.creditLimit ?? 0);

  const cardExpenses = input.expenses.filter(
    (expense) => expense.accountId === account.id
  );
  const cardPayments = sortPayments(
    input.payments.filter((payment) => payment.toAccountId === account.id)
  );
  const cardBills = (input.bills || []).filter(
    (bill) => bill.accountId === account.id
  );

  if (billDay == null) {
    // No generation day configured: everything spent is unbilled, payments
    // simply offset it.
    const spend = roundMoney(
      cardExpenses.reduce((sum, expense) => sum + expense.amount, 0)
    );
    const paid = roundMoney(
      cardPayments.reduce((sum, payment) => sum + payment.amount, 0)
    );
    const unbilledSpend = roundMoney(Math.max(0, spend - paid));
    return {
      ...emptyLedger(account, today),
      unbilledSpend,
      totalOutstanding: unbilledSpend,
      availableCredit: roundMoney(Math.max(0, limit - unbilledSpend)),
      unappliedCredit: roundMoney(Math.max(0, paid - spend)),
      openCycle: { start: today, end: today, spend, daysRemaining: 0 },
    };
  }

  const asOf = parseLocalDate(today);
  const { previousBillDate, nextBillDate } = getBillingCycleDates(billDay, asOf);
  const openStart = shiftDateKey(toLocalDateKey(previousBillDate), 1);
  const openEnd = toLocalDateKey(nextBillDate);

  const windows = collectStatementWindows({
    billDay,
    today,
    expenses: cardExpenses,
    bills: cardBills,
    cycles: input.cycles ?? DEFAULT_DERIVED_CYCLES,
  });

  const billByStatementDate = new Map<string, LedgerBillSlice>();
  for (const bill of cardBills) {
    const existing = billByStatementDate.get(bill.statementDate);
    // Prefer a live statement over a cancelled duplicate for the same date.
    if (!existing || (existing.status === "CANCELLED" && bill.status !== "CANCELLED")) {
      billByStatementDate.set(bill.statementDate, bill);
    }
  }
  const billsForClaim = [...billByStatementDate.values()];
  const claimedBillIds = new Set<string>();

  const linkedPaymentIds = new Set(
    cardBills.flatMap((bill) => bill.paymentIds || []).filter(Boolean)
  );

  type WorkingStatement = LedgerStatement & {
    credit: number;
    storedStatus?: LedgerBillSlice["status"];
    storedAmountPaid: number;
    isAuto: boolean;
    linkedIds: string[];
  };
  const working: WorkingStatement[] = windows.map((window) => {
    const bill = claimBillForWindow(
      window.statementDate,
      billsForClaim,
      claimedBillIds
    );
    // A snapped (re-dated) bill keeps its stored amount until repair rewrites
    // it, but the window itself is the card's current generation-day cycle.
    const snapped = Boolean(bill && bill.statementDate !== window.statementDate);
    const periodStart =
      snapped ? window.periodStart : bill?.billingPeriodStart || window.periodStart;
    const periodEnd =
      snapped ? window.periodEnd : bill?.billingPeriodEnd || window.periodEnd;
    const windowSpend = roundMoney(
      cardExpenses
        .filter((expense) =>
          isDateKeyInInclusiveRange(
            expense.date,
            parseLocalDate(periodStart),
            parseLocalDate(periodEnd)
          )
        )
        .reduce((sum, expense) => sum + expense.amount, 0)
    );
    // A stored amount wins so manual edits and statement reconciliation stick.
    const billed = bill ? Math.max(0, Number(bill.statementAmount) || 0) : windowSpend;
    const cancelled = bill?.status === "CANCELLED";

    return {
      billId: bill?.id,
      periodStart,
      periodEnd,
      statementDate: window.statementDate,
      dueDate:
        bill?.dueDate ||
        shiftDateKey(window.statementDate, CREDIT_CARD_PAYMENT_WINDOW_DAYS),
      billed,
      paid: 0,
      remaining: 0,
      minimumDue: bill ? Math.max(0, Number(bill.minimumDueAmount) || 0) : 0,
      isOpen: false,
      cancelled,
      status: cancelled ? "cancelled" : "unpaid",
      source: bill ? "bill" : "derived",
      paymentIds: [],
      credit: 0,
      storedStatus: bill?.status,
      storedAmountPaid: bill ? Math.max(0, Number(bill.amountPaid) || 0) : 0,
      isAuto: (bill?.note || "") === AUTO_CREDIT_CARD_BILL_NOTE,
      linkedIds: cancelled ? [] : [...(bill?.paymentIds || [])].filter(Boolean),
    };
  });

  // Allocate payments oldest statement first. A payment listed on a bill is
  // applied there first so "pay this statement" still wins; leftover then
  // fills older statements, then newer ones that had already closed on the
  // payment date. Leftover from a payment made *before* the next close stays
  // as cycle credit / unapplied credit — it must not stamp PARTIALLY PAID on
  // a statement the user has not paid. `amountPaid` is a floor for mark-as-paid
  // settlements with no ledger row (skipped on auto bills still in flight).
  let freeCredit = 0;
  for (const payment of cardPayments) {
    let left = payment.amount;
    if (payment.id && linkedPaymentIds.has(payment.id)) {
      for (const statement of working) {
        if (left <= 0) break;
        if (statement.cancelled) continue;
        if (statement.statementDate > payment.date) continue;
        if (!statement.linkedIds.includes(payment.id)) continue;
        const room = roundMoney(statement.billed - statement.credit);
        if (room <= 0) continue;
        const applied = Math.min(room, left);
        statement.credit = roundMoney(statement.credit + applied);
        statement.lastPaymentDate = payment.date;
        if (payment.id && !statement.paymentIds.includes(payment.id)) {
          statement.paymentIds.push(payment.id);
        }
        left = roundMoney(left - applied);
      }
    }
    for (const statement of working) {
      if (left <= 0) break;
      if (statement.cancelled) continue;
      if (statement.statementDate > payment.date) break;
      const room = roundMoney(statement.billed - statement.credit);
      if (room <= 0) continue;
      const applied = Math.min(room, left);
      statement.credit = roundMoney(statement.credit + applied);
      if (payment.id && !statement.paymentIds.includes(payment.id)) {
        statement.paymentIds.push(payment.id);
      }
      statement.lastPaymentDate = payment.date;
      left = roundMoney(left - applied);
    }
    if (left > 0) freeCredit = roundMoney(freeCredit + left);
  }

  // The stored `amountPaid` floor exists for out-of-band settlements only —
  // mark-as-paid with no ledger row. Money that *is* a ledger payment has
  // already been placed by the allocation above (or deliberately withheld
  // because the payment predates the statement), so crediting it again here
  // would count the same rupees twice: once on the statement, once as free
  // credit. Only the part of `amountPaid` no linked payment explains counts,
  // and never on a statement that has not closed yet.
  const paymentAmountById = new Map(
    cardPayments.map((payment) => [payment.id || "", payment.amount])
  );
  for (const statement of working) {
    if (statement.cancelled) continue;
    if (statement.isAuto && statement.storedStatus !== "PAID") continue;
    if (statement.statementDate > today) continue;
    const explainedByPayments = roundMoney(
      statement.linkedIds.reduce(
        (sum, id) => sum + (paymentAmountById.get(id) ?? 0),
        0
      )
    );
    const outOfBand = roundMoney(
      Math.max(0, statement.storedAmountPaid - explainedByPayments)
    );
    if (outOfBand <= 0) continue;
    const floor = roundMoney(
      Math.min(statement.billed, statement.credit + outOfBand)
    );
    if (floor > statement.credit) statement.credit = floor;
  }

  const statements: LedgerStatement[] = working.map((statement) => {
    const paid = roundMoney(Math.min(statement.billed, statement.credit));
    const remaining = roundMoney(Math.max(0, statement.billed - paid));
    const storedStatus = statement.storedStatus;
    const status: LedgerStatement["status"] = statement.cancelled
      ? "cancelled"
      : remaining <= 0
        ? "paid"
        : paid > 0
          ? "partiallyPaid"
          : "unpaid";
    return {
      billId: statement.billId,
      periodStart: statement.periodStart,
      periodEnd: statement.periodEnd,
      statementDate: statement.statementDate,
      dueDate: statement.dueDate,
      billed: statement.billed,
      paid,
      remaining,
      minimumDue: statement.minimumDue,
      isOpen:
        !statement.cancelled &&
        remaining > 0 &&
        (storedStatus == null || OPEN_BILL_STATUSES.includes(storedStatus)),
      cancelled: statement.cancelled,
      status,
      source: statement.source,
      paymentIds: statement.paymentIds,
      lastPaymentDate: statement.lastPaymentDate,
    };
  });

  const statementDue = roundMoney(
    statements
      .filter((statement) => statement.isOpen)
      .reduce((sum, statement) => sum + statement.remaining, 0)
  );

  // Anything no live statement covers is still owed, but it is not all the same
  // kind of debt. Spend in the open window is this cycle's unbilled spend and
  // is the only thing that eats the limit. Spend a cancelled statement covered
  // sits outside the open window: still owed, so it falls back here rather than
  // vanishing, but it is not this-cycle spend and must not reduce available
  // credit. Leftover credit settles the older (cancelled) bucket first.
  const billedWindows = statements
    .filter((statement) => !statement.cancelled)
    .map((statement) => ({ start: statement.periodStart, end: statement.periodEnd }));
  const uncovered = cardExpenses.filter(
    (expense) =>
      !billedWindows.some(
        (window) => expense.date >= window.start && expense.date <= window.end
      )
  );
  const openCycleSpend = roundMoney(
    uncovered
      .filter((expense) => expense.date >= openStart)
      .reduce((sum, expense) => sum + expense.amount, 0)
  );
  const voidedSpend = roundMoney(
    uncovered
      .filter((expense) => expense.date < openStart)
      .reduce((sum, expense) => sum + expense.amount, 0)
  );

  const cancelledSpend = roundMoney(Math.max(0, voidedSpend - freeCredit));
  const creditAfterVoided = roundMoney(Math.max(0, freeCredit - voidedSpend));
  const unbilledSpend = roundMoney(
    Math.max(0, openCycleSpend - creditAfterVoided)
  );
  const unappliedCredit = roundMoney(
    Math.max(0, creditAfterVoided - openCycleSpend)
  );
  const totalOutstanding = roundMoney(
    statementDue + unbilledSpend + cancelledSpend
  );

  return {
    statements: [...statements].reverse(),
    statementDue,
    unbilledSpend,
    cancelledSpend,
    totalOutstanding,
    availableCredit: roundMoney(Math.max(0, limit - unbilledSpend)),
    creditLimit: limit,
    unappliedCredit,
    openCycle: {
      start: openStart,
      end: openEnd,
      spend: openCycleSpend,
      daysRemaining: getDaysUntilReset(nextBillDate, asOf),
    },
  };
}

export type CreditBillAllocationPatch = {
  billId: string;
  amountPaid: number;
  paymentIds: string[];
  paymentDate?: string;
};

/**
 * Bring stored statements in line with the ledger's allocation. Payments that
 * were recorded before statements were linked (no `paymentIds`) get attached to
 * the statement they actually settled. Auto bills can also walk a leftover
 * stamp back so a generated statement is not marked PARTIALLY PAID by credit
 * that belonged to the previous cycle.
 */
export function collectCreditBillAllocationPatches(input: {
  accounts: Account[];
  isCreditAccount: (account: Account) => boolean;
  expenses: Expense[];
  payments: AccountPayment[];
  bills: LedgerBillSlice[];
  today?: string;
}): CreditBillAllocationPatch[] {
  const patches: CreditBillAllocationPatch[] = [];
  const billById = new Map(input.bills.map((bill) => [bill.id, bill]));

  for (const account of input.accounts) {
    if (!input.isCreditAccount(account)) continue;
    const ledger = buildCreditCardLedger({
      account,
      expenses: input.expenses,
      payments: input.payments,
      bills: input.bills,
      today: input.today,
    });

    for (const statement of ledger.statements) {
      if (!statement.billId || statement.cancelled) continue;
      const bill = billById.get(statement.billId);
      if (!bill) continue;
      const storedPaid = Math.max(0, Number(bill.amountPaid) || 0);
      const storedIds = (bill.paymentIds || []).filter(Boolean);
      const ledgerIds = statement.paymentIds.filter(Boolean);
      const isAuto = (bill.note || "") === AUTO_CREDIT_CARD_BILL_NOTE;
      const canWalkBack = isAuto && bill.status !== "PAID";

      if (canWalkBack) {
        const idsUnchanged =
          storedIds.length === ledgerIds.length &&
          storedIds.every((id) => ledgerIds.includes(id));
        if (idsUnchanged && storedPaid === statement.paid) continue;
        patches.push({
          billId: statement.billId,
          amountPaid: statement.paid,
          paymentIds: ledgerIds,
          paymentDate: statement.lastPaymentDate,
        });
        continue;
      }

      const newIds = ledgerIds.filter((id) => !storedIds.includes(id));
      if (newIds.length === 0 && statement.paid <= storedPaid) continue;
      patches.push({
        billId: statement.billId,
        amountPaid: Math.max(storedPaid, statement.paid),
        paymentIds: [...storedIds, ...newIds],
        paymentDate: statement.lastPaymentDate,
      });
    }
  }

  return patches;
}

/** Oldest statement still owing, for defaulting a payment target. */
export function oldestOpenStatement(
  ledger: CreditCardLedger
): LedgerStatement | undefined {
  return [...ledger.statements]
    .reverse()
    .find((statement) => statement.isOpen && statement.remaining > 0);
}
