import { useCallback, useState } from "react";

import { friendlyErrorMessage, logError } from "@/lib/errors";
import { writeSavedMessage } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { TaxSourceChangedError, saveIncomeDecision, undoIncomeDecision } from "@/services/tax/taxIncomeStore";
import { deleteTaxEntry, newTaxDocId, saveTaxEntry, TaxWriteInvalidError } from "@/services/tax/taxStore";
import type { FinancialYearKey, TaxIncomeFields, TaxLine } from "@/shared/features/tax/types";
import { taxIssueMessage } from "@/shared/features/tax/utils/issueMessages";

export type IncomeDecision =
  | { decision: "confirm" | "exclude" }
  | { decision: "recategorize"; category: string }
  | { decision: "replace"; replacedBy: string };

/**
 * Saving from the tax income screen (SPENDLY-290): decisions about Spendly's
 * items and the user's own income entries. Reports offline outcomes honestly
 * and turns failures into user copy (lib/errors.ts).
 */
export function useTaxIncomeActions(fy: FinancialYearKey, todayKey: string) {
  const { user } = useAuth();
  const uid = user?.uid;
  const [saving, setSaving] = useState(false);

  const report = useCallback((scope: string, err: unknown, fallback: string) => {
    if (err instanceof TaxSourceChangedError) {
      toast.info(err.message);
      return;
    }
    if (err instanceof TaxWriteInvalidError) {
      toast.error(taxIssueMessage(err.issues[0]));
      return;
    }
    logError(scope, err);
    toast.error(friendlyErrorMessage(err, fallback));
  }, []);

  const run = useCallback(
    async (scope: string, fallback: string, work: (uid: string) => Promise<string>): Promise<boolean> => {
      if (!uid || saving) return false;
      setSaving(true);
      try {
        toast.success(await work(uid));
        return true;
      } catch (err) {
        report(scope, err, fallback);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [report, saving, uid]
  );

  const decide = useCallback(
    (line: TaxLine, choice: IncomeDecision) =>
      run("tax.income.decide", "Couldn't save your decision.", async (u) => {
        const outcome = await saveIncomeDecision(u, { line, todayKey, ...choice });
        const message =
          choice.decision === "confirm"
            ? "Counted"
            : choice.decision === "exclude"
              ? "Left out"
              : choice.decision === "recategorize"
                ? "Category changed"
                : "Replaced";
        return writeSavedMessage(outcome, message);
      }),
    [run, todayKey]
  );

  const undo = useCallback(
    (line: TaxLine) =>
      run("tax.income.undo", "Couldn't undo your decision.", async (u) =>
        writeSavedMessage(await undoIncomeDecision(u, line), "Back to Spendly's view")
      ),
    [run]
  );

  /** Add (no `id`) or correct an income the user enters. Never a ledger row. */
  const saveEntry = useCallback(
    (input: { id?: string; fields: TaxIncomeFields; note?: string; duplicateConfirmed?: boolean }) =>
      run("tax.income.saveEntry", "Couldn't save this income.", async (u) => {
        const id = input.id ?? newTaxDocId(u, "taxEntries");
        const { outcome } = await saveTaxEntry(
          u,
          id,
          {
            fy,
            kind: "income",
            fields: input.fields,
            note: input.note,
            ...(input.duplicateConfirmed ? { duplicateConfirmed: true } : {}),
          },
          { ctx: { todayKey } }
        );
        return writeSavedMessage(outcome, input.id ? "Income updated" : "Income added");
      }),
    [fy, run, todayKey]
  );

  const removeEntry = useCallback(
    (id: string) =>
      run("tax.income.deleteEntry", "Couldn't delete this income.", async (u) =>
        writeSavedMessage(await deleteTaxEntry(u, id), "Income deleted")
      ),
    [run]
  );

  return { saving, decide, undo, saveEntry, removeEntry };
}
