/**
 * SPENDLY-675: explains why a card's stored "Total outstanding"
 * (`currentOutstanding`) differs from what its statements say is unpaid.
 *
 * Pure. Reuses the ledger every screen and rebuild uses
 * (`computeOutstandingCredit` → `buildCreditCardLedger`, `planCardRebuild`)
 * and adds no money math of its own beyond sums for display. The CLI in
 * scripts/reconcile-credit-card.ts loads the docs; tests feed fixtures.
 */
import type {
  Account,
  AccountEntry,
  AccountPayment,
  AccountTransfer,
  Expense,
  Income,
} from "../../shared/types/expense";
import { computeOutstandingCredit } from "../../shared/utils/accountBalance";
import {
  buildCreditCardLedger,
  cardMovementLedgerRows,
  collectCreditBillAllocationPatches,
  collectCreditBillDuplicateResolutions,
  type CreditBillAllocationPatch,
  type CreditBillDuplicateResolution,
  type DuplicateCreditCardBillSlice,
  type LedgerBillSlice,
} from "../../shared/utils/creditCardLedger";
import { AUTO_CREDIT_CARD_BILL_NOTE } from "../../shared/utils/autoCreditCardBills";
import { isActiveLedgerRow } from "../../shared/utils/ledgerRow";
import { roundMoney } from "../../shared/utils/money";
import { planCardRebuild } from "../../shared/utils/reconciliation";

export type CardReconcileInput = {
  account: Account & { currentOutstanding?: number; summaryReconciliationStatus?: string };
  expenses: Expense[];
  payments: AccountPayment[];
  bills: LedgerBillSlice[];
  incomes: Income[];
  entries: AccountEntry[];
  transfers: AccountTransfer[];
  today: string;
};

export type CreditRowFinding = {
  id: string;
  date: string;
  amount: number;
  kind: string;
  /** Statement window (close date) the credit is dated in, or "open cycle". */
  datedIn: string;
  /** Statement the ledger settled with it, if any. */
  appliedTo: string | null;
  voided: boolean;
};

export type CardReconcileReport = {
  stored: number | null;
  ledger: {
    statementDue: number;
    unbilledSpend: number;
    cancelledSpend: number;
    totalOutstanding: number;
    unappliedCredit: number;
  };
  /** stored − (statement due + unbilled + cancelled): the gap the user sees. */
  gapVsStatements: number | null;
  /** Rebuild verdict: [] means the stored value is accepted as consistent. */
  rebuildVariances: string[];
  statements: Array<{
    statementDate: string;
    period: string;
    billId: string | null;
    billed: number;
    spendInWindow: number;
    ledgerPaid: number;
    ledgerRemaining: number;
    storedPaid: number | null;
    storedRemaining: number | null;
    status: string;
  }>;
  credits: CreditRowFinding[];
  /** Active credits no statement absorbed: the usual cause of the gap. */
  unappliedCreditRows: CreditRowFinding[];
  /** Every stored bill for the card, including ones no statement claimed. */
  bills: Array<{
    id: string;
    statementDate: string;
    statementAmount: number;
    amountPaid: number;
    remainingAmount: number | null;
    status: string;
    auto: boolean;
    note: string;
    paymentIds: string[];
    claimed: boolean;
  }>;
  /** What the in-app bill pass would write, given complete data. */
  pendingAllocations: CreditBillAllocationPatch[];
  pendingDuplicateResolutions: CreditBillDuplicateResolution[];
};

const sum = (values: number[]) => roundMoney(values.reduce((a, b) => a + b, 0));

export function buildCardReconcileReport(input: CardReconcileInput): CardReconcileReport {
  const { account, today } = input;
  const movements = { incomes: input.incomes, entries: input.entries, transfers: input.transfers };
  const res = computeOutstandingCredit(account, input.expenses, input.payments, input.bills, today, movements);
  const ledger = buildCreditCardLedger({
    account,
    expenses: input.expenses,
    payments: input.payments,
    bills: input.bills,
    movements,
    today,
  });
  const stored = typeof account.currentOutstanding === "number" ? account.currentOutstanding : null;
  const plan = planCardRebuild(
    account as unknown as Record<string, unknown>,
    res.totalOutstanding,
    res.unappliedCredit
  );

  const cardSpend = input.expenses.filter((e) => e.accountId === account.id && isActiveLedgerRow(e));
  const billById = new Map(input.bills.map((b) => [b.id, b]));
  const statements = ledger.statements.map((s) => {
    const bill = s.billId ? billById.get(s.billId) : undefined;
    return {
      statementDate: s.statementDate,
      period: `${s.periodStart} → ${s.periodEnd}`,
      billId: s.billId ?? null,
      billed: s.billed,
      spendInWindow: sum(
        cardSpend.filter((e) => e.date >= s.periodStart && e.date <= s.periodEnd).map((e) => e.amount)
      ),
      ledgerPaid: s.paid,
      ledgerRemaining: s.remaining,
      storedPaid: bill ? bill.amountPaid ?? 0 : null,
      storedRemaining: bill ? bill.remainingAmount ?? null : null,
      status: s.status,
    };
  });

  const appliedBy = new Map<string, string>();
  for (const s of ledger.statements) {
    for (const id of s.paymentIds) appliedBy.set(id, s.statementDate);
  }
  const windowOf = (date: string) =>
    ledger.statements.find((s) => date >= s.periodStart && date <= s.periodEnd)?.statementDate ??
    (date >= ledger.openCycle.start ? "open cycle" : "before first statement");

  const movementCredits = cardMovementLedgerRows(account.id, movements).credits;
  const credits: CreditRowFinding[] = [
    ...input.payments
      .filter((p) => p.toAccountId === account.id)
      .map((p) => ({
        id: p.id,
        date: p.date,
        amount: p.amount,
        kind: `payment:${p.sourceType ?? "bank"}`,
        voided: Boolean(p.voidedAt),
      })),
    ...movementCredits.map((p) => ({
      id: p.id,
      date: p.date,
      amount: p.amount,
      kind: p.id.split(":")[1] ?? "movement",
      voided: false,
    })),
  ]
    .map((c) => ({ ...c, datedIn: windowOf(c.date), appliedTo: appliedBy.get(c.id) ?? null }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  const claimedIds = new Set(ledger.statements.map((s) => s.billId).filter(Boolean));
  const bills = input.bills
    .map((b) => ({
      id: b.id,
      statementDate: b.statementDate,
      statementAmount: b.statementAmount,
      amountPaid: b.amountPaid ?? 0,
      remainingAmount: b.remainingAmount ?? null,
      status: String(b.status),
      auto: b.note === AUTO_CREDIT_CARD_BILL_NOTE,
      note: String(b.note ?? ""),
      paymentIds: (b.paymentIds ?? []).filter(Boolean),
      claimed: claimedIds.has(b.id),
    }))
    .sort((a, b) => b.statementDate.localeCompare(a.statementDate) || a.id.localeCompare(b.id));
  // Same inputs as the CreditCardBillsProvider pass (no movements: real
  // payment ids only), so this is exactly what that pass would write.
  const pendingAllocations = collectCreditBillAllocationPatches({
    accounts: [account],
    isCreditAccount: () => true,
    expenses: input.expenses,
    payments: input.payments,
    bills: input.bills,
    today,
  });
  const pendingDuplicateResolutions = collectCreditBillDuplicateResolutions(
    input.bills as unknown as DuplicateCreditCardBillSlice[],
    today
  );

  const owedPerStatements = roundMoney(res.statementDue + res.unbilledSpend + res.cancelledSpend);
  return {
    stored,
    ledger: {
      statementDue: res.statementDue,
      unbilledSpend: res.unbilledSpend,
      cancelledSpend: res.cancelledSpend,
      totalOutstanding: res.totalOutstanding,
      unappliedCredit: res.unappliedCredit,
    },
    gapVsStatements: stored === null ? null : roundMoney(stored - owedPerStatements),
    rebuildVariances: plan.variances,
    statements,
    credits,
    unappliedCreditRows: credits.filter((c) => !c.voided && c.appliedTo === null),
    bills,
    pendingAllocations,
    pendingDuplicateResolutions,
  };
}

const money = (n: number | null) =>
  n === null
    ? "—"
    : `${n < 0 ? "-" : ""}₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Markdown with account ids only (never the uid), safe to paste into docs/ or Jira. */
export function renderCardReconcileReport(name: string, accountId: string, r: CardReconcileReport): string {
  const lines: string[] = [];
  const out = (s = "") => lines.push(s);
  out(`# Credit card reconciliation: ${name} (${accountId})`);
  out();
  out(`Generated ${new Date().toISOString()} (read-only, nothing was written).`);
  out();
  out("| Figure | Value |");
  out("|---|---|");
  out(`| Stored Total outstanding (currentOutstanding) | ${money(r.stored)} |`);
  out(`| Statement due (open statements' remaining) | ${money(r.ledger.statementDue)} |`);
  out(`| Unbilled (open cycle) | ${money(r.ledger.unbilledSpend)} |`);
  out(`| Cancelled-statement spend | ${money(r.ledger.cancelledSpend)} |`);
  out(`| Ledger total outstanding | ${money(r.ledger.totalOutstanding)} |`);
  out(`| Credit set aside (unappliedCredit) | ${money(r.ledger.unappliedCredit)} |`);
  out(`| Stored − (statement due + unbilled + cancelled) | ${money(r.gapVsStatements)} |`);
  out(`| Rebuild verdict | ${r.rebuildVariances.length ? r.rebuildVariances.join("; ") : "consistent (a rebuild would not change it)"} |`);
  out();
  out("## Statements (newest first)");
  out();
  out("| Close | Period | Bill | Billed | Spend in window | Ledger paid | Ledger remaining | Stored paid | Stored remaining | Status |");
  out("|---|---|---|---|---|---|---|---|---|---|");
  for (const s of r.statements) {
    out(
      `| ${s.statementDate} | ${s.period} | ${s.billId ?? "derived"} | ${money(s.billed)} | ${money(s.spendInWindow)} | ${money(s.ledgerPaid)} | ${money(s.ledgerRemaining)} | ${money(s.storedPaid)} | ${money(s.storedRemaining)} | ${s.status} |`
    );
  }
  out();
  out("## Credits to the card (payments, cashback, refunds, adjustments, transfers in)");
  out();
  out("| Date | Kind | Id | Amount | Dated in statement | Applied to statement | Voided |");
  out("|---|---|---|---|---|---|---|");
  for (const c of r.credits) {
    out(`| ${c.date} | ${c.kind} | ${c.id} | ${money(c.amount)} | ${c.datedIn} | ${c.appliedTo ?? "**none**"} | ${c.voided ? "yes" : ""} |`);
  }
  out();
  out(
    `Active credits applied to no statement: ${r.unappliedCreditRows.length}, totalling ${money(
      sum(r.unappliedCreditRows.map((c) => c.amount))
    )}. Part of these can still have reduced open-cycle spend; the ledger's set-aside figure is ${money(r.ledger.unappliedCredit)}.`
  );
  out();
  out("## Stored bills for this card (all, including unclaimed duplicates)");
  out();
  out("| Id | Close | Amount | Stored paid | Stored remaining | Status | Auto | Note | Payment ids | Claimed by a statement |");
  out("|---|---|---|---|---|---|---|---|---|---|");
  for (const b of r.bills) {
    const note = b.note.replace(/\|/g, "/").slice(0, 40);
    out(
      `| ${b.id} | ${b.statementDate} | ${money(b.statementAmount)} | ${money(b.amountPaid)} | ${money(b.remainingAmount)} | ${b.status} | ${b.auto ? "yes" : "no"} | ${note} | ${b.paymentIds.join(", ") || "—"} | ${b.claimed ? "yes" : "**no**"} |`
    );
  }
  out();
  out("## What the in-app bill pass would write now");
  out();
  if (!r.pendingAllocations.length && !r.pendingDuplicateResolutions.length) {
    out("Nothing: stored bills already match the ledger.");
  }
  for (const a of r.pendingAllocations) {
    out(`- Allocation: bill ${a.billId} → amountPaid ${money(a.amountPaid)}, paymentIds [${a.paymentIds.join(", ")}]`);
  }
  for (const d of r.pendingDuplicateResolutions) {
    const patch = d.canonicalPatch ? ` (amountPaid ${money(d.canonicalPatch.amountPaid)}, ${d.canonicalPatch.status})` : "";
    out(`- Duplicate merge: keep ${d.canonicalId}${patch}, cancel [${d.cancelIds.join(", ")}]`);
  }
  return lines.join("\n") + "\n";
}
