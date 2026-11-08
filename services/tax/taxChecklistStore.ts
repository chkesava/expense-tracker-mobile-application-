import type { WriteOutcome } from "@/lib/firestoreWrite";
import { clearTaxReview, saveTaxReview } from "@/services/tax/taxStore";
import type { FinancialYearKey } from "@/shared/features/tax/types";
import { checklistReviewId } from "@/shared/features/tax/utils/readiness";

/**
 * The user's decision about a readiness checklist item (SPENDLY-296):
 * "resolve" (handled outside Spendly) or "defer" (later). Stored as a
 * `taxReviews` row of kind `checklist` with no amount, through
 * commitMutations (dual-written, SPENDLY-709). Nothing is computed from read
 * data, so there's nothing to re-check on Firestore first.
 */
export async function saveChecklistDecision(
  uid: string,
  fy: FinancialYearKey,
  itemId: string,
  decision: "resolve" | "defer"
): Promise<WriteOutcome> {
  const { outcome } = await saveTaxReview(
    uid,
    { fy, source: { kind: "checklist", id: itemId }, decision, sourceAmount: null },
    { label: "tax checklist decision" }
  );
  return outcome;
}

/** Back to open. */
export function undoChecklistDecision(uid: string, fy: FinancialYearKey, itemId: string): Promise<WriteOutcome> {
  return clearTaxReview(uid, checklistReviewId(fy, itemId), { label: "tax checklist undo" });
}
