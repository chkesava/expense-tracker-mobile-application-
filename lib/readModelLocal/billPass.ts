import type { CreditCardBill } from "@/shared/types/creditCardBill";
import type { Account, AccountPayment, AccountType, Expense } from "@/shared/types/expense";
import { getAccountKind } from "@/shared/utils/accountKind";
import {
  collectAutoCreditCardBillDrafts,
  collectAutoCreditCardBillRefreshPatches,
} from "@/shared/utils/autoCreditCardBills";
import { parseStoredBill } from "@/shared/utils/creditCardBillStatus";
import { collectCreditBillAllocationPatches, collectCreditBillDuplicateResolutions } from "@/shared/utils/creditCardLedger";
import { isActiveLedgerRow } from "@/shared/utils/ledgerRow";
import { sortLedgerByDateDesc } from "@/shared/utils/ledgerSnapshot";

import type { SourceDoc } from "./readSource";

/**
 * SPENDLY-597 (READ_MODEL_RULES R4.3a, the user's decision 2026-11-04) — the
 * credit card bill pass writes statements (creates, refreshes, allocates
 * payments, merges duplicates) from accounts, types, expenses, payments and
 * bills. When any of those is served by the on-device copy, the pass must
 * not write from it: a copy a few seconds behind could write a lower
 * `amountPaid` until the next pass.
 *
 * So, in that case:
 * 1. `billPassHasWork` runs the pass's pure calculations on the screen's data
 *    (free). Usually there is nothing to do: no Firestore reads at all.
 * 2. Only when there is, `loadAuthoritativeBillInputs` reads the inputs from
 *    Firestore (bills, accounts, types, payments, and each credit card's
 *    expenses: equality queries, no new index), and the pass runs on those,
 *    unchanged, with its compare-and-set.
 */
export type BillPassInputs = {
  accounts: Account[];
  accountTypes: AccountType[];
  expenses: Expense[];
  payments: AccountPayment[];
  bills: CreditCardBill[];
};

/** A stored bill as the app uses it (CreditCardBillsProvider's listener mapping). */
export function toCreditCardBill(d: SourceDoc, today: string): CreditCardBill {
  return parseStoredBill(d.id, d.data as Record<string, unknown>, today);
}

type Derived = (bill: CreditCardBill) => { status: CreditCardBill["status"]; remainingAmount: number };

/** Whether the pass would write anything: the same checks the pass makes before each write. */
export function billPassHasWork(inputs: BillPassInputs, today: string, derived: Derived): boolean {
  const typeNameById = new Map(inputs.accountTypes.map((t) => [t.id, t.name]));
  const base = { accounts: inputs.accounts, typeNameById, expenses: inputs.expenses, existingBills: inputs.bills, today };
  if (collectAutoCreditCardBillDrafts(base).length) return true;
  const byId = new Map(inputs.bills.map((b) => [b.id, b]));
  const patched = new Map(byId);
  for (const patch of collectAutoCreditCardBillRefreshPatches(base)) {
    const existing = byId.get(patch.billId);
    if (!existing) continue;
    const next = {
      ...existing,
      statementAmount: patch.statementAmount,
      minimumDueAmount: patch.minimumDueAmount,
      statementDate: patch.statementDate,
      billingPeriodStart: patch.billingPeriodStart,
      billingPeriodEnd: patch.billingPeriodEnd,
      dueDate: patch.dueDate,
    } as CreditCardBill;
    const d = derived(next);
    patched.set(patch.billId, { ...next, status: d.status, remainingAmount: d.remainingAmount });
    if (
      existing.statementAmount !== patch.statementAmount ||
      existing.minimumDueAmount !== patch.minimumDueAmount ||
      existing.statementDate !== patch.statementDate ||
      existing.billingPeriodStart !== patch.billingPeriodStart ||
      existing.billingPeriodEnd !== patch.billingPeriodEnd ||
      existing.dueDate !== patch.dueDate ||
      existing.status !== d.status ||
      existing.remainingAmount !== d.remainingAmount
    ) {
      return true;
    }
  }
  const allocations = collectCreditBillAllocationPatches({
    accounts: inputs.accounts,
    isCreditAccount: (account) => getAccountKind(typeNameById.get(account.typeId) || "") === "credit",
    expenses: inputs.expenses,
    payments: inputs.payments,
    bills: [...patched.values()],
    today,
  });
  for (const allocation of allocations) {
    const existing = patched.get(allocation.billId);
    if (!existing) continue;
    if (existing.amountPaid !== allocation.amountPaid || JSON.stringify(existing.paymentIds ?? []) !== JSON.stringify(allocation.paymentIds)) {
      return true;
    }
    patched.set(allocation.billId, { ...existing, amountPaid: allocation.amountPaid, paymentIds: allocation.paymentIds });
  }
  return collectCreditBillDuplicateResolutions([...patched.values()], today).length > 0;
}

/** Reads Firestore (never the copy). `where` is an equality query on one field. */
export type AuthoritativeReader = {
  all(collection: "accounts" | "accountTypes" | "accountPayments" | "creditCardBills"): Promise<SourceDoc[]>;
  where(collection: "expenses", field: "accountId", value: string): Promise<SourceDoc[]>;
};

/** The pass's inputs from Firestore, mapped exactly as the providers map their listeners. */
export async function loadAuthoritativeBillInputs(read: AuthoritativeReader, today: string): Promise<BillPassInputs> {
  const [accountDocs, typeDocs, paymentDocs, billDocs] = await Promise.all([
    read.all("accounts"),
    read.all("accountTypes"),
    read.all("accountPayments"),
    read.all("creditCardBills"),
  ]);
  const accounts = accountDocs.map((d) => ({ ...d.data, id: d.id }) as Account);
  const accountTypes = typeDocs.map((d) => ({ ...d.data, id: d.id }) as AccountType);
  const typeNameById = new Map(accountTypes.map((t) => [t.id, t.name]));
  const cards = accounts.filter((a) => a.id && getAccountKind(typeNameById.get(a.typeId) || "") === "credit");
  const expenseDocs = (await Promise.all(cards.map((card) => read.where("expenses", "accountId", card.id as string)))).flat();
  const expenses = expenseDocs.map((d) => ({ ...d.data, id: d.id }) as Expense).filter((e) => isActiveLedgerRow(e as { deletedAt?: unknown }));
  return {
    accounts,
    accountTypes,
    expenses,
    payments: sortLedgerByDateDesc(paymentDocs.map((d) => ({ ...d.data, id: d.id }) as AccountPayment)),
    bills: billDocs.map((d) => toCreditCardBill(d, today)),
  };
}

/**
 * SPENDLY-719 — what a finished bill pass covered. The provider skips a pass
 * whose fingerprint matches the last finished one.
 *
 * It has to include each bill's **stored** settlement (`amountPaid`,
 * `paymentIds`, `status`, `remainingAmount`), not only what the pass would
 * write. Otherwise, when a payment stamp (`increment`) lands between the
 * pass's read and its compare-and-set, the pass skips the write ("let the
 * next pass recompute") but records a fingerprint the next pass matches, so
 * the stale stamp stays: a bill the ledger settles with cashback keeps
 * showing PARTIALLY_PAID, and the server sends an overdue reminder for it.
 */
export function billPassFingerprint(input: {
  drafts: readonly { accountId: string; billingPeriodStart?: string | null; statementAmount: number }[];
  patches: readonly {
    billId: string;
    statementAmount: number;
    dueDate: string;
    billingPeriodStart?: string | null;
    billingPeriodEnd?: string | null;
  }[];
  allocations: readonly { billId: string; amountPaid: number; paymentIds: readonly string[] }[];
  duplicates: readonly {
    canonicalId: string;
    canonicalPatch?: { amountPaid?: number; status?: string } | null;
    cancelIds: readonly string[];
  }[];
  bills: readonly Pick<CreditCardBill, "id" | "amountPaid" | "paymentIds" | "status" | "remainingAmount">[];
}): string {
  return JSON.stringify({
    drafts: input.drafts.map((d) => `${d.accountId}:${d.billingPeriodStart}:${d.statementAmount}`).sort(),
    patches: input.patches
      .map((p) => `${p.billId}:${p.statementAmount}:${p.dueDate}:${p.billingPeriodStart}:${p.billingPeriodEnd}`)
      .sort(),
    allocations: input.allocations.map((a) => `${a.billId}:${a.amountPaid}:${a.paymentIds.join(",")}`).sort(),
    duplicates: input.duplicates
      .map(
        (r) =>
          `${r.canonicalId}:${r.canonicalPatch?.amountPaid ?? ""}:${r.canonicalPatch?.status ?? ""}:${r.cancelIds.join(",")}`
      )
      .sort(),
    stored: input.bills
      .map((b) => `${b.id}:${b.amountPaid}:${(b.paymentIds ?? []).join(",")}:${b.status}:${b.remainingAmount}`)
      .sort(),
  });
}

/** True when any of the pass's inputs is served by the on-device copy. */
export function billPassReadsCopy(modes: string[]): boolean {
  return modes.includes("supabase");
}

/**
 * SPENDLY-732 — where the bill pass takes its inputs from.
 *
 * - `screen`: the providers' own Firestore listeners, which hold the whole
 *   ledger (`expensesComplete`).
 * - `checkScreenThenFirestore`: some input is the on-device copy (SPENDLY-597).
 *   Check for work on the screen's data first (free), and only if there is
 *   some, run on Firestore's inputs.
 * - `firestore`: the screen holds only the staged expenses page (300 rows,
 *   SPENDLY-409: there is no idle upgrade to the whole ledger any more). The
 *   pass must not run on a partial ledger (SPENDLY-97: understated
 *   statements), and a work check on it means nothing, so it reads its inputs
 *   from Firestore (`loadAuthoritativeBillInputs`: every credit card's
 *   expenses by equality query, plus accounts, types, payments and bills).
 *
 * Before SPENDLY-732 the pass was skipped in that last case, so for anyone
 * with 300 or more expenses it never ran in normal use: no statement
 * creation, refresh, payment/cashback allocation or duplicate merge.
 */
export type BillPassInputPlan = "screen" | "checkScreenThenFirestore" | "firestore";

export function billPassInputPlan(input: { readsCopy: boolean; ledgerComplete: boolean }): BillPassInputPlan {
  if (!input.ledgerComplete) return "firestore";
  return input.readsCopy ? "checkScreenThenFirestore" : "screen";
}

/** What asked for a pass. `background` = app focus or a new bill id appearing. */
export type BillPassTrigger = "initial" | "requested" | "background";

/**
 * A `firestore` pass reads every card's expenses (hundreds of reads). App
 * focus happens many times a day, so background triggers in that plan run at
 * most once per interval. The first pass of a session and passes asked for
 * after a money action always run.
 */
export const BILL_PASS_FIRESTORE_MIN_INTERVAL_MS = 30 * 60 * 1000;

export function billPassThrottled(input: {
  plan: BillPassInputPlan;
  trigger: BillPassTrigger;
  lastFirestorePassAt: number | null;
  now: number;
}): boolean {
  if (input.plan !== "firestore" || input.trigger !== "background") return false;
  if (input.lastFirestorePassAt == null) return false;
  return input.now - input.lastFirestorePassAt < BILL_PASS_FIRESTORE_MIN_INTERVAL_MS;
}

/** The pass may start once every listener it reads has delivered (not necessarily the whole ledger). */
export function billPassListenersReady(state: { billsLoading: boolean; expensesLoading: boolean; paymentsLoading: boolean }): boolean {
  return !state.billsLoading && !state.expensesLoading && !state.paymentsLoading;
}
