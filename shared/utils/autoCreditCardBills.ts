import type { Account, Expense } from "../types/expense";
import type {
  CreateCreditCardBillInput,
  CreditCardBill,
} from "../types/creditCardBill";
import {
  AUTO_CREDIT_CARD_BILL_REMINDER_FREQUENCY,
  CREDIT_CARD_PAYMENT_WINDOW_DAYS,
} from "../types/creditCardBill";
import { getAccountKind } from "./accountKind";
import { roundMoney } from "./money";
import {
  getClosedBillingCycle,
  isDateKeyInInclusiveRange,
  normalizeBillGenerationDay,
} from "./billingCycle";
import { daysBetweenDateKeys } from "./creditCardBillStatus";
import { parseLocalDate, shiftDateKey, toLocalDateKey } from "./dates";

const AUTO_BILL_MIN_DUE_RATE = 0.05;
export const AUTO_CREDIT_CARD_BILL_NOTE = "Auto-created from cycle spend";

/**
 * How many closed cycles get a statement document. Statements only generate
 * while the app is open, so a user who skips a few months would otherwise never
 * get documents (or reminders) for the cycles they missed — the ledger already
 * derives and bills those windows either way. Matches the ledger's derived-cycle
 * depth so documents cover exactly the windows it already shows.
 */
export const AUTO_CREDIT_CARD_BILL_BACKFILL_CYCLES = 12;

export type BuildAutoCreditCardBillDraftInput = {
  account: Account;
  typeName?: string;
  expenses: Expense[];
  existingBills: Pick<CreditCardBill, "accountId" | "statementDate">[];
  today: string;
  /** When true, still return a draft if a bill already exists for this cycle. */
  ignoreExisting?: boolean;
  /** 0 = latest closed cycle, 1 = the one before it, and so on. */
  cyclesAgo?: number;
};

function minimumDueForStatement(statementAmount: number): number {
  return Math.min(
    statementAmount,
    roundMoney(statementAmount * AUTO_BILL_MIN_DUE_RATE)
  );
}

type ClosedCycleDraftInput = Omit<
  BuildAutoCreditCardBillDraftInput,
  "existingBills" | "ignoreExisting"
> & {
  existingBills?: BuildAutoCreditCardBillDraftInput["existingBills"];
};

/**
 * Latest closed cycle for a card as of `today`: the day after the previous
 * generation date through this generation date. A card that closes on the 20th
 * bills 21 Jul → 20 Aug.
 *
 * The statement is the *gross* spend for that window. Payments never reduce a
 * statement amount — they settle statements (see `buildCreditCardLedger`), so
 * clearing last month's bill mid-cycle can no longer shrink this one.
 */
export function previewClosedCycleCreditCardBill(
  input: ClosedCycleDraftInput
): CreateCreditCardBillInput | null {
  const { account, typeName, expenses, today } = input;
  if (getAccountKind(typeName || "") !== "credit") return null;
  const billDay = normalizeBillGenerationDay(account.billGenerationDay);
  if (billDay == null) return null;

  const asOf = parseLocalDate(today);
  const { cycleStart, cycleEnd } = getClosedBillingCycle(
    billDay,
    asOf,
    input.cyclesAgo ?? 0
  );
  const statementDate = toLocalDateKey(cycleEnd);
  if (today < statementDate) return null;

  const statementAmount = roundMoney(
    expenses
      .filter((expense) => {
        if (expense.accountId !== account.id) return false;
        return isDateKeyInInclusiveRange(expense.date, cycleStart, cycleEnd);
      })
      .reduce((sum, expense) => sum + expense.amount, 0)
  );

  return {
    accountId: account.id,
    statementAmount,
    minimumDueAmount: minimumDueForStatement(statementAmount),
    statementDate,
    dueDate: shiftDateKey(statementDate, CREDIT_CARD_PAYMENT_WINDOW_DAYS),
    billingPeriodStart: toLocalDateKey(cycleStart),
    billingPeriodEnd: statementDate,
    note: AUTO_CREDIT_CARD_BILL_NOTE,
    reminderEnabled: true,
    reminderFrequency: AUTO_CREDIT_CARD_BILL_REMINDER_FREQUENCY,
  };
}

/**
 * Auto-create draft: same closed cycle as {@link previewClosedCycleCreditCardBill},
 * skipped when the amount is 0 or a bill already exists for this statement date.
 */
export function buildAutoCreditCardBillDraft(
  input: BuildAutoCreditCardBillDraftInput
): CreateCreditCardBillInput | null {
  const { existingBills, ignoreExisting } = input;
  const draft = previewClosedCycleCreditCardBill(input);
  if (!draft || draft.statementAmount <= 0) return null;

  if (!ignoreExisting) {
    const alreadyExists = existingBills.some(
      (bill) =>
        bill.accountId === draft.accountId &&
        bill.statementDate === draft.statementDate
    );
    if (alreadyExists) return null;
  }

  return draft;
}

/**
 * Statement drafts for every closed cycle that has spend but no document yet,
 * oldest first. Cycles with no spend produce nothing, so a sparse history does
 * not generate empty statements. Backfilled statements more than ~30 days past
 * due schedule no reminders (the reminder horizon filters them), so this cannot
 * produce a burst of notifications.
 */
export function collectAutoCreditCardBillDrafts(input: {
  accounts: Account[];
  typeNameById: Map<string, string>;
  expenses: Expense[];
  existingBills: Pick<CreditCardBill, "accountId" | "statementDate">[];
  today: string;
  /** How many closed cycles back to cover. Defaults to the backfill depth. */
  cycles?: number;
}): CreateCreditCardBillInput[] {
  const drafts: CreateCreditCardBillInput[] = [];
  const seen = new Set(
    input.existingBills.map((bill) => `${bill.accountId}:${bill.statementDate}`)
  );
  const depth = Math.max(1, input.cycles ?? AUTO_CREDIT_CARD_BILL_BACKFILL_CYCLES);

  for (const account of input.accounts) {
    const typeName = input.typeNameById.get(account.typeId) || "";
    for (let cyclesAgo = depth - 1; cyclesAgo >= 0; cyclesAgo -= 1) {
      const draft = buildAutoCreditCardBillDraft({
        account,
        typeName,
        expenses: input.expenses,
        existingBills: input.existingBills,
        today: input.today,
        cyclesAgo,
      });
      if (!draft) continue;
      const key = `${draft.accountId}:${draft.statementDate}`;
      if (seen.has(key)) continue;
      seen.add(key);
      drafts.push(draft);
    }
  }

  return drafts;
}

export type AutoBillRefreshPatch = {
  billId: string;
  statementAmount: number;
  minimumDueAmount: number;
  statementDate: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  dueDate: string;
};

type RefreshableBill = Pick<
  CreditCardBill,
  | "id"
  | "accountId"
  | "statementDate"
  | "statementAmount"
  | "billingPeriodStart"
  | "billingPeriodEnd"
  | "note"
  | "amountPaid"
  | "status"
>;

/** How far a stored close date may drift and still be re-dated in place. */
const REDATE_TOLERANCE_DAYS = 3;

function isAutoCreated(bill: Pick<CreditCardBill, "note">): boolean {
  return (bill.note || "") === AUTO_CREDIT_CARD_BILL_NOTE;
}

/**
 * Recompute auto-created statements when the cycle window changes (bill day
 * edited, new spend backdated into a closed cycle). A statement whose close
 * date drifted by a few days is re-dated in place instead of leaving a
 * duplicate behind. Manual and reconciled statements are never touched.
 */
export function collectAutoCreditCardBillRefreshPatches(input: {
  accounts: Account[];
  typeNameById: Map<string, string>;
  expenses: Expense[];
  existingBills: RefreshableBill[];
  today: string;
  /** How many closed cycles back to repair. Defaults to the backfill depth. */
  cycles?: number;
}): AutoBillRefreshPatch[] {
  const patches: AutoBillRefreshPatch[] = [];
  const depth = Math.max(1, input.cycles ?? AUTO_CREDIT_CARD_BILL_BACKFILL_CYCLES);

  for (const account of input.accounts) {
    const typeName = input.typeNameById.get(account.typeId) || "";
    const candidates = input.existingBills.filter(
      (bill) =>
        bill.accountId === account.id &&
        Boolean(bill.id) &&
        bill.status !== "PAID" &&
        bill.status !== "CANCELLED" &&
        isAutoCreated(bill)
    );
    // One statement can only be repaired by one cycle, or a near-miss match
    // would let two adjacent drafts fight over the same document.
    const claimed = new Set<string>();

    for (let cyclesAgo = depth - 1; cyclesAgo >= 0; cyclesAgo -= 1) {
      const draft = buildAutoCreditCardBillDraft({
        account,
        typeName,
        expenses: input.expenses,
        existingBills: input.existingBills,
        today: input.today,
        ignoreExisting: true,
        cyclesAgo,
      });
      if (!draft?.billingPeriodStart || !draft.billingPeriodEnd) continue;

      const unclaimed = candidates.filter(
        (bill) => bill.id && !claimed.has(bill.id)
      );
      const existing =
        unclaimed.find((bill) => bill.statementDate === draft.statementDate) ||
        unclaimed.find(
          (bill) =>
            Math.abs(
              daysBetweenDateKeys(bill.statementDate, draft.statementDate)
            ) <= REDATE_TOLERANCE_DAYS
        );
      if (!existing?.id) continue;
      claimed.add(existing.id);

      const unchanged =
        existing.statementAmount === draft.statementAmount &&
        existing.billingPeriodStart === draft.billingPeriodStart &&
        existing.billingPeriodEnd === draft.billingPeriodEnd &&
        existing.statementDate === draft.statementDate;
      if (unchanged) continue;

      patches.push({
        billId: existing.id,
        statementAmount: draft.statementAmount,
        minimumDueAmount: draft.minimumDueAmount,
        statementDate: draft.statementDate,
        billingPeriodStart: draft.billingPeriodStart,
        billingPeriodEnd: draft.billingPeriodEnd,
        dueDate: draft.dueDate,
      });
    }
  }

  return patches;
}
