import type { MutationOp } from "@/shared/types/mutations";
import { doc } from "firebase/firestore";

import { commitMutations } from "@/lib/commitMutations";
import { getFirestoreDb } from "@/lib/firebase";
import type { WriteOutcome } from "@/lib/firestoreWrite";
import type {
  FeeInference,
  FeeRecord,
  FeeReview,
  FeeReviewDecision,
} from "@/shared/types/fee";
import {
  buildFeeReview,
  type FeeClassificationInput,
  type FeeClassificationIssue,
} from "@/shared/utils/feeModel";

/**
 * Persisting fee review decisions (SPENDLY-315).
 *
 * Writes `users/{uid}/feeReviews/{kind}__{id}` and nothing else. The ledger
 * row being classified is never touched — the review is a reading of it, and
 * deleting the review returns the row to whatever the engine infers.
 *
 * Goes through `commitMutations`, so a decision made offline is queued in the
 * outbox and reported as saved-on-device rather than freezing the sheet.
 */

const COLLECTION = "feeReviews";
/** Firestore batch cap is 500 ops; commitMutations adds an ack write. */
const BULK_CHUNK = 200;

export class FeeReviewInvalidError extends Error {
  constructor(readonly issues: FeeClassificationIssue[]) {
    super(`Invalid fee classification: ${issues.join(", ")}`);
    this.name = "FeeReviewInvalidError";
  }
}

export interface FeeReviewRequest {
  record: FeeRecord;
  decision: FeeReviewDecision;
  classification: FeeClassificationInput;
  inference?: FeeInference | null;
  previous?: FeeReview | null;
  note?: string;
}

function reviewOp(uid: string, request: FeeReviewRequest, nowMs: number): MutationOp {
  const database = getFirestoreDb();
  if (!database) throw new Error("Firestore is not available");
  const built = buildFeeReview({
    source: request.record.source,
    decision: request.decision,
    classification: request.classification,
    inference: request.inference,
    previous: request.previous,
    note: request.note,
    nowMs,
  });
  if (!built.ok) throw new FeeReviewInvalidError(built.issues);
  return {
    op: "set",
    ref: doc(database, "users", uid, COLLECTION, built.docId),
    data: built.review,
  };
}

export async function saveFeeReview(uid: string, request: FeeReviewRequest): Promise<WriteOutcome> {
  return commitMutations(uid, [reviewOp(uid, request, Date.now())], { label: "fee review" });
}

/**
 * Several decisions at once. Each chunk is one atomic batch; the outcome of
 * the weakest chunk is returned so the caller never overstates durability.
 */
export async function saveFeeReviewsBulk(uid: string, requests: FeeReviewRequest[]): Promise<WriteOutcome> {
  const nowMs = Date.now();
  const ops = requests.map((request) => reviewOp(uid, request, nowMs));
  const rank: Record<WriteOutcome, number> = { acked: 0, queued: 1, unsafe: 2 };
  let worst: WriteOutcome = "acked";
  for (let i = 0; i < ops.length; i += BULK_CHUNK) {
    const outcome = await commitMutations(uid, ops.slice(i, i + BULK_CHUNK), { label: "fee reviews" });
    if (rank[outcome] > rank[worst]) worst = outcome;
  }
  return worst;
}

/** Forget the decision; the transaction goes back to automatic detection. */
export async function clearFeeReview(uid: string, reviewId: string): Promise<WriteOutcome> {
  const database = getFirestoreDb();
  if (!database) throw new Error("Firestore is not available");
  return commitMutations(
    uid,
    [{ op: "delete", ref: doc(database, "users", uid, COLLECTION, reviewId) }],
    { label: "fee review" }
  );
}
