/**
 * SPENDLY-106 — pure statement-import planning.
 * Never writes the ledger. Fingerprints make re-imports idempotent and keep
 * imported rows traceable to a bill / source document.
 */

import type { Expense } from "../types/expense";
import { roundMoney } from "./money";
import type { StatementLine } from "./statementParse";
import {
  matchStatementLines,
  type MatchStatementResult,
} from "./statementMatch";
import {
  expenseDraftFromStatementLine,
  type StatementExpenseDraft,
} from "./statementReview";

export type StatementImportProvenance = {
  creditCardBillId?: string;
  accountDocumentId?: string;
  statementDate?: string;
  periodStart?: string;
  periodEnd?: string;
};

export type StatementImportDraft = StatementExpenseDraft & {
  statementImportFingerprint: string;
  creditCardBillId?: string;
  accountDocumentId?: string;
};

export type StatementImportDecision =
  | {
      status: "import";
      line: StatementLine;
      draft: StatementImportDraft;
      /** Deterministic Firestore id — safe to merge on re-import. */
      expenseId: string;
    }
  | {
      status: "duplicate_ledger";
      line: StatementLine;
      ledgerId: string;
      reason: "matched_amount_date" | "fingerprint";
    }
  | {
      status: "out_of_cycle";
      line: StatementLine;
      reason: string;
    }
  | {
      status: "credit";
      line: StatementLine;
      reason: "statement_credit";
    };

export type StatementImportPlan = {
  match: MatchStatementResult;
  decisions: StatementImportDecision[];
  toImport: Extract<StatementImportDecision, { status: "import" }>[];
  skippedDuplicate: Extract<
    StatementImportDecision,
    { status: "duplicate_ledger" }
  >[];
  outOfCycle: Extract<StatementImportDecision, { status: "out_of_cycle" }>[];
  credits: Extract<StatementImportDecision, { status: "credit" }>[];
};

/** Stable fingerprint for a statement debit line on a card. */
export function buildStatementImportFingerprint(
  accountId: string,
  line: Pick<StatementLine, "date" | "amount" | "kind" | "merchant">,
  provenance?: Pick<StatementImportProvenance, "creditCardBillId">
): string {
  const merchant = line.merchant.trim().toLowerCase().replace(/\s+/g, " ");
  const bill = provenance?.creditCardBillId?.trim() || "";
  return [
    "stmt",
    accountId.trim(),
    line.kind,
    line.date,
    String(roundMoney(line.amount)),
    merchant,
    bill,
  ].join("|");
}

/** Deterministic expense id from a fingerprint (mirrors SMS id pattern). */
export function statementImportExpenseId(fingerprint: string): string {
  return `stmt_${fnv1a64Hex(fingerprint)}`;
}

function fnv1a64Hex(input: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

function isInCycle(
  date: string,
  periodStart?: string,
  periodEnd?: string
): boolean {
  if (!periodStart || !periodEnd) return true;
  return date >= periodStart && date <= periodEnd;
}

/**
 * Plan which statement lines would create new expenses.
 * Duplicate detection: prior fingerprint OR amount/date match in the ledger.
 */
export function planStatementImport(input: {
  accountId: string;
  lines: StatementLine[];
  expenses: Pick<
    Expense,
    "id" | "accountId" | "date" | "amount" | "note" | "statementImportFingerprint"
  >[];
  payments: Parameters<typeof matchStatementLines>[2];
  provenance?: StatementImportProvenance;
}): StatementImportPlan {
  const { accountId, lines, expenses, payments, provenance } = input;
  const match = matchStatementLines(lines, expenses, payments, accountId);

  const fingerprints = new Set(
    expenses
      .filter(
        (expense) =>
          expense.accountId === accountId &&
          typeof expense.statementImportFingerprint === "string" &&
          expense.statementImportFingerprint.trim()
      )
      .map((expense) => expense.statementImportFingerprint!.trim())
  );

  const matchedDebitIds = new Set(
    match.matched
      .filter((row) => row.ledgerKind === "expense")
      .map((row) => row.line.id)
  );

  const decisions: StatementImportDecision[] = [];

  for (const line of lines) {
    if (line.kind === "credit") {
      decisions.push({
        status: "credit",
        line,
        reason: "statement_credit",
      });
      continue;
    }

    if (
      !isInCycle(line.date, provenance?.periodStart, provenance?.periodEnd)
    ) {
      decisions.push({
        status: "out_of_cycle",
        line,
        reason: `Outside ${provenance?.periodStart} → ${provenance?.periodEnd}`,
      });
      continue;
    }

    const fingerprint = buildStatementImportFingerprint(
      accountId,
      line,
      provenance
    );
    if (fingerprints.has(fingerprint)) {
      const existing = expenses.find(
        (expense) => expense.statementImportFingerprint === fingerprint
      );
      decisions.push({
        status: "duplicate_ledger",
        line,
        ledgerId: existing?.id || fingerprint,
        reason: "fingerprint",
      });
      continue;
    }

    if (matchedDebitIds.has(line.id)) {
      const matched = match.matched.find((row) => row.line.id === line.id);
      decisions.push({
        status: "duplicate_ledger",
        line,
        ledgerId: matched?.ledgerId || line.id,
        reason: "matched_amount_date",
      });
      continue;
    }

    const base = expenseDraftFromStatementLine(line, accountId);
    const draft: StatementImportDraft = {
      ...base,
      statementImportFingerprint: fingerprint,
      ...(provenance?.creditCardBillId
        ? { creditCardBillId: provenance.creditCardBillId }
        : {}),
      ...(provenance?.accountDocumentId
        ? { accountDocumentId: provenance.accountDocumentId }
        : {}),
    };
    decisions.push({
      status: "import",
      line,
      draft,
      expenseId: statementImportExpenseId(fingerprint),
    });
  }

  return {
    match,
    decisions,
    toImport: decisions.filter(
      (d): d is Extract<StatementImportDecision, { status: "import" }> =>
        d.status === "import"
    ),
    skippedDuplicate: decisions.filter(
      (
        d
      ): d is Extract<StatementImportDecision, { status: "duplicate_ledger" }> =>
        d.status === "duplicate_ledger"
    ),
    outOfCycle: decisions.filter(
      (d): d is Extract<StatementImportDecision, { status: "out_of_cycle" }> =>
        d.status === "out_of_cycle"
    ),
    credits: decisions.filter(
      (d): d is Extract<StatementImportDecision, { status: "credit" }> =>
        d.status === "credit"
    ),
  };
}
