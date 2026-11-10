import { useCallback, useState } from "react";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { writeSavedMessage } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import {
  clearSalaryReview,
  confirmSalaryCandidate,
  confirmSalaryCandidatesBulk,
  correctSalaryRecord,
  deleteSalaryRecord,
  rejectSalaryCandidate,
  rejectSalaryCandidatesBulk,
} from "@/services/salary/salaryStore";
import type {
  SalaryCandidate,
  SalaryRecord,
  SalaryRejectionReason,
} from "@/shared/features/salary/types";
import type {
  SalaryConfirmOverrides,
  SalaryRecordCorrection,
} from "@/shared/features/salary/utils/review";

export function useSalaryReviewActions() {
  const { user } = useAuth();
  const uid = user?.uid;
  const [saving, setSaving] = useState(false);

  const run = useCallback(
    async (
      scope: string,
      fallbackError: string,
      action: (u: string) => Promise<string>
    ): Promise<boolean> => {
      if (!uid || saving) return false;
      setSaving(true);
      try {
        const msg = await action(uid);
        toast.success(msg);
        return true;
      } catch (err) {
        logError(scope, err);
        toast.error(friendlyErrorMessage(err, fallbackError));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [saving, uid]
  );

  const confirm = useCallback(
    (
      candidate: SalaryCandidate,
      overrides?: SalaryConfirmOverrides,
      previousRecord?: SalaryRecord
    ) =>
      run("salary.review.confirm", "Could not confirm salary.", async (u) => {
        const outcome = await confirmSalaryCandidate(
          u,
          candidate,
          overrides,
          previousRecord
        );
        const label = overrides ? "Salary corrected & confirmed" : "Salary confirmed";
        return writeSavedMessage(outcome, label);
      }),
    [run]
  );

  const reject = useCallback(
    (
      candidate:
        | SalaryCandidate
        | { incomeId: string; amount: number; date: string },
      reason: SalaryRejectionReason,
      existingRecord?: SalaryRecord
    ) =>
      run("salary.review.reject", "Could not reject salary candidate.", async (u) => {
        const outcome = await rejectSalaryCandidate(
          u,
          candidate,
          reason,
          existingRecord
        );
        return writeSavedMessage(outcome, "Marked as not salary");
      }),
    [run]
  );

  const correct = useCallback(
    (existing: SalaryRecord, correction: SalaryRecordCorrection) =>
      run("salary.review.correct", "Could not update salary record.", async (u) => {
        const outcome = await correctSalaryRecord(u, existing, correction);
        return writeSavedMessage(outcome, "Salary record updated");
      }),
    [run]
  );

  const remove = useCallback(
    (existing: SalaryRecord) =>
      run("salary.review.delete", "Could not delete salary record.", async (u) => {
        const outcome = await deleteSalaryRecord(u, existing);
        return writeSavedMessage(outcome, "Salary record removed");
      }),
    [run]
  );

  const confirmBulk = useCallback(
    (candidates: SalaryCandidate[]) =>
      run("salary.review.confirmBulk", "Could not confirm all candidates.", async (u) => {
        const outcome = await confirmSalaryCandidatesBulk(u, candidates);
        return writeSavedMessage(
          outcome,
          `Confirmed ${candidates.length} salary credits`
        );
      }),
    [run]
  );

  const rejectBulk = useCallback(
    (candidates: SalaryCandidate[], reason: SalaryRejectionReason) =>
      run("salary.review.rejectBulk", "Could not reject candidates.", async (u) => {
        const outcome = await rejectSalaryCandidatesBulk(u, candidates, reason);
        return writeSavedMessage(
          outcome,
          `Excluded ${candidates.length} candidates`
        );
      }),
    [run]
  );

  const undo = useCallback(
    (incomeId: string) =>
      run("salary.review.undo", "Could not reset review.", async (u) => {
        const outcome = await clearSalaryReview(u, incomeId);
        return writeSavedMessage(outcome, "Candidate reset for review");
      }),
    [run]
  );

  return {
    confirm,
    reject,
    correct,
    remove,
    confirmBulk,
    rejectBulk,
    undo,
    saving,
  };
}
