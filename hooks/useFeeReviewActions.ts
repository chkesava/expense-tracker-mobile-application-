import { useCallback, useState } from "react";

import type { FeeReviewSubmit } from "@/components/fees/FeeReviewSheet";
import type { FeeIntelligence } from "@/hooks/useFeeIntelligence";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { writeSavedMessage } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import {
  FeeReviewInvalidError,
  saveFeeReview,
  saveFeeReviewsBulk,
} from "@/services/fees/feeReviewStore";
import type { FeeRecord } from "@/shared/types/fee";
import { bulkReviewPlan, feeIssueMessage } from "@/shared/utils/feeReviewForm";

/**
 * Saving fee review decisions from any fee surface (SPENDLY-315, shared with
 * the detail screen in SPENDLY-317): one place that attaches provenance
 * (inference + previous revision), reports offline outcomes honestly and
 * turns failures into user copy.
 */
export function useFeeReviewActions(intel: Pick<FeeIntelligence, "result" | "reviewById">) {
  const { user } = useAuth();
  const uid = user?.uid;
  const [saving, setSaving] = useState(false);
  const { result, reviewById } = intel;

  const report = useCallback((scope: string, err: unknown) => {
    if (err instanceof FeeReviewInvalidError) {
      toast.error(feeIssueMessage(err.issues[0]));
      return;
    }
    logError(scope, err);
    toast.error(friendlyErrorMessage(err, "Couldn't save your review."));
  }, []);

  /** Resolves true when the decision was saved (acked or queued). */
  const saveOne = useCallback(
    async ({ record, decision, classification, note }: FeeReviewSubmit): Promise<boolean> => {
      if (!uid || saving) return false;
      setSaving(true);
      try {
        const outcome = await saveFeeReview(uid, {
          record,
          decision,
          classification,
          note,
          inference: result?.inferences.get(record.key) ?? null,
          previous: reviewById.get(record.key) ?? null,
        });
        toast.success(
          writeSavedMessage(outcome, decision === "not_fee" ? "Marked as not a fee" : decision === "confirm" ? "Fee confirmed" : "Correction saved")
        );
        return true;
      } catch (err) {
        report("fees.saveReview", err);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [report, result, reviewById, saving, uid]
  );

  const saveBulk = useCallback(
    async (records: readonly FeeRecord[], decision: "confirm" | "not_fee"): Promise<boolean> => {
      if (!uid || saving) return false;
      const plan = bulkReviewPlan(records, decision);
      if (plan.ready.length === 0) {
        toast.info("None of these can be confirmed as they are — open each one to decide.");
        return false;
      }
      setSaving(true);
      try {
        const outcome = await saveFeeReviewsBulk(
          uid,
          plan.ready.map((item) => ({
            record: item.record,
            decision: item.decision,
            classification: item.classification,
            inference: result?.inferences.get(item.record.key) ?? null,
            previous: reviewById.get(item.record.key) ?? null,
          }))
        );
        toast.success(writeSavedMessage(outcome, `${plan.ready.length} ${decision === "confirm" ? "confirmed" : "marked as not fees"}`));
        if (plan.skipped.length > 0) toast.info(`${plan.skipped.length} need a closer look — open each to decide.`);
        return true;
      } catch (err) {
        report("fees.saveBulk", err);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [report, result, reviewById, saving, uid]
  );

  return { saving, saveOne, saveBulk };
}
