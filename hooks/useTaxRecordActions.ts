import { useCallback, useState } from "react";

import { friendlyErrorMessage, logError } from "@/lib/errors";
import { writeSavedMessage } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { TaxSourceChangedError } from "@/services/tax/taxIncomeStore";
import { deleteTaxEntry, newTaxDocId, saveTaxEntry, TaxWriteInvalidError } from "@/services/tax/taxStore";
import { acceptTdsDifference, undoTdsAcceptance } from "@/services/tax/taxTdsStore";
import type { FinancialYearKey } from "@/shared/features/tax/types";
import { taxIssueMessage } from "@/shared/features/tax/utils/issueMessages";
import type { TdsMatchRow } from "@/shared/features/tax/utils/tdsReconcile";
import type { TaxEntryDraft } from "@/shared/features/tax/utils/validation";

/**
 * Saving tax records from the spec-driven forms (SPENDLY-291 onwards: Form 16,
 * TDS certificates, AIS/26AS lines; later deductions and payments), and the
 * TDS acceptance. Offline outcomes are reported honestly; failures become
 * plain copy (lib/errors.ts).
 */
export function useTaxRecordActions(fy: FinancialYearKey, todayKey: string) {
  const { user } = useAuth();
  const uid = user?.uid;
  const [saving, setSaving] = useState(false);

  const run = useCallback(
    async (scope: string, fallback: string, work: (uid: string) => Promise<string>, labels: Record<string, string> = {}): Promise<boolean> => {
      if (!uid || saving) return false;
      setSaving(true);
      try {
        toast.success(await work(uid));
        return true;
      } catch (err) {
        if (err instanceof TaxSourceChangedError) toast.info(err.message);
        else if (err instanceof TaxWriteInvalidError) toast.error(taxIssueMessage(err.issues[0], labels));
        else {
          logError(scope, err);
          toast.error(friendlyErrorMessage(err, fallback));
        }
        return false;
      } finally {
        setSaving(false);
      }
    },
    [saving, uid]
  );

  /** Add (no `id`) or correct a record. */
  const saveRecord = useCallback(
    (input: { id?: string; draft: TaxEntryDraft; duplicateConfirmed?: boolean; title: string; labels?: Record<string, string> }) =>
      run(
        "tax.records.save",
        "Couldn't save this record.",
        async (u) => {
          const id = input.id ?? newTaxDocId(u, "taxEntries");
          const { outcome } = await saveTaxEntry(
            u,
            id,
            { ...input.draft, ...(input.duplicateConfirmed ? { duplicateConfirmed: true } : {}) },
            { ctx: { todayKey } }
          );
          return writeSavedMessage(outcome, input.id ? `${input.title} updated` : `${input.title} added`);
        },
        input.labels
      ),
    [run, todayKey]
  );

  const removeRecord = useCallback(
    (id: string, title: string) =>
      run("tax.records.delete", "Couldn't delete this record.", async (u) => writeSavedMessage(await deleteTaxEntry(u, id), `${title} deleted`)),
    [run]
  );

  const acceptDifference = useCallback(
    (row: TdsMatchRow) =>
      run("tax.tds.accept", "Couldn't save this.", async (u) => writeSavedMessage(await acceptTdsDifference(u, fy, row), "Difference accepted")),
    [fy, run]
  );

  const undoAcceptance = useCallback(
    (row: TdsMatchRow) =>
      run("tax.tds.undo", "Couldn't undo this.", async (u) => writeSavedMessage(await undoTdsAcceptance(u, fy, row), "Acceptance undone")),
    [fy, run]
  );

  return { saving, saveRecord, removeRecord, acceptDifference, undoAcceptance };
}
