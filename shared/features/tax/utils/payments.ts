/**
 * SPENDLY-294 — tax the user has already paid for a year: advance tax,
 * self-assessment tax and other payments, each a `taxEntries` row of kind
 * `tax_payment`. Spendly processes no payment; it records what the challan
 * says.
 *
 * - Totals are sums of the recorded payments, by type; each one is traceable.
 * - A payment without its challan details (BSR code + challan serial, or the
 *   CIN) is flagged: the reference is what proves it was paid.
 * - Comparison with the statement's "tax paid" lines (26AS if the year has
 *   any 26AS line, else AIS, as for TDS): each payment is matched to an unused
 *   line of the same amount, in date order, so the result is the same every
 *   time. Unmatched on either side is shown, never guessed away.
 */

import { roundMoney } from "@/shared/utils/money";
import type { FinancialYearKey, TaxEntry, TaxEntryOf, TaxPaymentType, TaxStatement } from "../types";
import { reconciliationStatement } from "./tdsReconcile";

export type PaymentMatch = "in_statement" | "not_in_statement" | "no_statement";

export interface TaxPaymentRow {
  entry: TaxEntryOf<"tax_payment">;
  /** No BSR + challan serial and no CIN. */
  missingReference: boolean;
  match: PaymentMatch;
  /** The statement line it matched. */
  statementEntryId?: string;
}

export interface TaxPaymentsSummary {
  fy: FinancialYearKey;
  statement: TaxStatement | null;
  payments: TaxPaymentRow[];
  /** Statement "tax paid" lines no recorded payment accounts for. */
  unmatchedStatement: TaxEntryOf<"ais_value">[];
  totals: Record<TaxPaymentType, number> & { all: number };
  /** Sum of the statement's "tax paid" lines, when there is a statement. */
  statementTotal: number | null;
  missingReferences: number;
}

export function hasPaymentReference(fields: TaxEntryOf<"tax_payment">["fields"]): boolean {
  return Boolean((fields.bsrCode && fields.challanSerial) || fields.cin);
}

function sameAmount(a: number, b: number): boolean {
  return Math.abs(roundMoney(a) - roundMoney(b)) < 0.005;
}

export function summarizeTaxPayments(args: { fy: FinancialYearKey; entries: readonly TaxEntry[] }): TaxPaymentsSummary {
  const live = args.entries.filter((e) => e.fy === args.fy && !e.deletedAt);
  const payments = live
    .filter((e): e is TaxEntryOf<"tax_payment"> => e.kind === "tax_payment")
    .sort((a, b) => a.fields.date.localeCompare(b.fields.date) || a.id.localeCompare(b.id));
  const statement = reconciliationStatement(live);
  const lines = live
    .filter(
      (e): e is TaxEntryOf<"ais_value"> =>
        e.kind === "ais_value" && e.fields.infoCategory === "tax_paid" && e.fields.statement === statement
    )
    .sort((a, b) => a.id.localeCompare(b.id));

  const used = new Set<string>();
  const rows: TaxPaymentRow[] = payments.map((entry) => {
    const missingReference = !hasPaymentReference(entry.fields);
    if (!statement) return { entry, missingReference, match: "no_statement" };
    const line = lines.find((l) => !used.has(l.id) && sameAmount(l.fields.reportedAmount, entry.fields.amount));
    if (!line) return { entry, missingReference, match: "not_in_statement" };
    used.add(line.id);
    return { entry, missingReference, match: "in_statement", statementEntryId: line.id };
  });

  const totals = { advance_tax: 0, self_assessment: 0, other: 0, all: 0 };
  for (const p of payments) {
    totals[p.fields.paymentType] = roundMoney(totals[p.fields.paymentType] + p.fields.amount);
    totals.all = roundMoney(totals.all + p.fields.amount);
  }

  return {
    fy: args.fy,
    statement,
    payments: rows,
    unmatchedStatement: lines.filter((l) => !used.has(l.id)),
    totals,
    statementTotal: statement ? roundMoney(lines.reduce((s, l) => s + l.fields.reportedAmount, 0)) : null,
    missingReferences: rows.filter((r) => r.missingReference).length,
  };
}

export const PAYMENT_TYPE_LABELS: Record<TaxPaymentType, string> = {
  advance_tax: "Advance tax",
  self_assessment: "Self-assessment tax",
  other: "Other tax payment",
};

export function paymentStatus(row: TaxPaymentRow, statement: TaxStatement | null): { label: string; tone: "success" | "warning" | "muted" } {
  if (row.missingReference) return { label: "Add the challan details", tone: "warning" };
  if (row.match === "in_statement") return { label: `In your ${statement}`, tone: "success" };
  if (row.match === "not_in_statement") return { label: `Not in your ${statement}`, tone: "warning" };
  return { label: "Recorded", tone: "muted" };
}

/** "BSR 0510308 · Challan 00412" or "CIN …8412", for a list. */
export function paymentReference(fields: TaxEntryOf<"tax_payment">["fields"]): string | null {
  if (fields.bsrCode && fields.challanSerial) return `BSR ${fields.bsrCode} · Challan ${fields.challanSerial}`;
  if (fields.cin) return `CIN …${fields.cin.slice(-5)}`;
  return null;
}
