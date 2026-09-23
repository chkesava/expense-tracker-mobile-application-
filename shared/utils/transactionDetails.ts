import type { TransactionKind } from "./transactionRef";

export type TransactionRelatedLink = { label: string; href: string };

type Sides = { fromAccountId?: string; toAccountId?: string } | null | undefined;

function counterpartAccount(sides: Sides, contextAccountId: string | null): string | null {
  if (!sides) return null;
  const from = sides.fromAccountId?.trim() || null;
  const to = sides.toAccountId?.trim() || null;
  if (contextAccountId && from === contextAccountId) return to;
  if (contextAccountId && to === contextAccountId) return from;
  return to ?? from;
}

/**
 * Where a read-only transaction is actually managed. Only expense/income are
 * edited from Transaction Details; everything else links to its owner.
 */
export function relatedLinkForTransaction(input: {
  kind: TransactionKind;
  contextAccountId: string | null;
  creditCardBillId?: string | null;
  sides?: Sides;
}): TransactionRelatedLink | null {
  const billId = input.creditCardBillId?.trim();
  switch (input.kind) {
    case "payment": {
      if (billId) {
        return { label: "Open credit card bill", href: `/credit-card-bills/${billId}` };
      }
      const other = counterpartAccount(input.sides, input.contextAccountId);
      return other ? { label: "Open other account", href: `/accounts/${other}` } : null;
    }
    case "transfer": {
      const other = counterpartAccount(input.sides, input.contextAccountId);
      return other ? { label: "Open other account", href: `/accounts/${other}` } : null;
    }
    case "borrowing":
    case "borrowingRepayment":
      return { label: "Open borrowings", href: "/ledger?tab=borrowings" };
    case "receivable":
    case "receivableRepayment":
      return { label: "Open money lent", href: "/ledger?tab=receivables" };
    case "expense":
      return billId
        ? { label: "Open credit card bill", href: `/credit-card-bills/${billId}` }
        : null;
    default:
      return null;
  }
}

/**
 * Confirmation copy for soft-deleting an expense/income, stated in terms of
 * the account it moves. `currentBalance` is the account's derived balance
 * now (bank/cash) — omitted for credit cards and unassigned rows.
 */
export function deletionImpactMessage(input: {
  kind: "expense" | "income";
  amountLabel: string;
  accountName: string | null;
  isCreditCard: boolean;
  currentBalance?: number | null;
  formatAmount: (value: number) => string;
  amount: number;
}): string {
  const { kind, amountLabel, accountName, isCreditCard } = input;
  const lines: string[] = [];
  if (!accountName) {
    lines.push(
      kind === "expense"
        ? `This removes ${amountLabel} from your spending totals.`
        : `This removes ${amountLabel} from your income totals.`
    );
  } else if (isCreditCard) {
    lines.push(
      kind === "expense"
        ? `${accountName}'s outstanding drops by ${amountLabel}.`
        : `${accountName} loses a ${amountLabel} credit.`
    );
  } else {
    lines.push(
      kind === "expense"
        ? `${amountLabel} goes back to ${accountName}.`
        : `${amountLabel} is taken off ${accountName}.`
    );
    if (typeof input.currentBalance === "number") {
      const after =
        kind === "expense"
          ? input.currentBalance + input.amount
          : input.currentBalance - input.amount;
      lines.push(`Balance after deleting: ${input.formatAmount(after)}.`);
    }
  }
  lines.push("The row is kept in the Audit trail.");
  return lines.join("\n");
}
