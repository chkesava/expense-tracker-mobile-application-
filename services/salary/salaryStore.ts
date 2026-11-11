/**
 * Salary Store & Review Mutation Actions (SPENDLY-327, epic SPENDLY-324).
 *
 * Implements persistence operations for confirming salary paychecks,
 * applying user overrides, rejecting candidates with reasons, updating
 * salary records, and soft-deleting.
 *
 * Every write goes through `commitMutations`: Firestore first, then the
 * read-model copy through the on-device outbox and `rm_client_apply` (READ_MODEL_RULES R1).
 */

import { commitMutations } from "@/lib/commitMutations";
import { deleteField, serverTimestamp } from "@/lib/firestore";
import type { WriteOutcome } from "@/lib/firestoreWrite";
import type {
  SalaryCandidate,
  SalaryRecord,
  SalaryRejectionReason,
  SalaryReview,
} from "@/shared/features/salary/types";
import { softDeleteSalaryRecord } from "@/shared/features/salary/utils/builders";
import {
  applySalaryRecordCorrection,
  buildConfirmedRecordFromCandidate,
  buildReviewDocId,
  buildSalaryReviewDoc,
  type SalaryConfirmOverrides,
  type SalaryRecordCorrection,
} from "@/shared/features/salary/utils/review";
import {
  salaryRecordWriteOps,
  salaryReviewDeleteOps,
  salaryReviewWriteOps,
  type SalarySentinels,
} from "@/shared/features/salary/utils/writes";
import type { MutationOp } from "@/shared/types/mutations";

const SENTINELS: SalarySentinels = { serverTimestamp, deleteField };
const BULK_CHUNK_SIZE = 100;

const OUTCOME_RANK: Record<WriteOutcome, number> = {
  acked: 0,
  queued: 1,
  unsafe: 2,
};

/**
 * Confirms a detected salary candidate and writes both SalaryRecord and SalaryReview.
 * Preserves original detected values in record.provenance.originalValues when overrides exist.
 */
export async function confirmSalaryCandidate(
  uid: string,
  candidate: SalaryCandidate,
  overrides?: SalaryConfirmOverrides,
  previousRecord?: SalaryRecord,
  previousReview?: SalaryReview
): Promise<WriteOutcome> {
  const nowMs = Date.now();
  const record = buildConfirmedRecordFromCandidate(
    candidate,
    overrides,
    uid,
    nowMs
  );

  const review = buildSalaryReviewDoc(
    {
      incomeId: candidate.incomeId,
      amount: candidate.amount,
      date: candidate.date,
    },
    "confirm",
    {
      salaryType: record.type,
      correctedEmployerName: overrides?.employerName,
      correctedPayPeriodMonth: overrides?.payPeriodMonth,
    },
    uid,
    nowMs
  );

  const stampedRecord = previousRecord
    ? { ...record, createdAtMs: previousRecord.createdAtMs }
    : record;
  const stampedReview = previousReview
    ? { ...review, createdAtMs: previousReview.createdAtMs }
    : review;

  const recordOps = salaryRecordWriteOps(uid, stampedRecord, previousRecord, SENTINELS);
  const reviewOps = salaryReviewWriteOps(uid, stampedReview, previousReview, SENTINELS);

  return commitMutations(uid, [...recordOps, ...reviewOps], {
    label: "confirm salary candidate",
  });
}

/**
 * Rejects a candidate (marks as Not Salary).
 * Saves a SalaryReview with decision "reject" and soft-deletes any associated SalaryRecord.
 */
export async function rejectSalaryCandidate(
  uid: string,
  candidate:
    | SalaryCandidate
    | { incomeId: string; amount: number; date: string },
  reason: SalaryRejectionReason,
  existingRecord?: SalaryRecord,
  previousReview?: SalaryReview
): Promise<WriteOutcome> {
  const nowMs = Date.now();
  const review = buildSalaryReviewDoc(
    {
      incomeId: candidate.incomeId,
      amount: candidate.amount,
      date: candidate.date,
    },
    "reject",
    { rejectionReason: reason },
    uid,
    nowMs
  );

  const stampedReview = previousReview
    ? { ...review, createdAtMs: previousReview.createdAtMs }
    : review;

  const ops: MutationOp[] = [
    ...salaryReviewWriteOps(uid, stampedReview, previousReview, SENTINELS),
  ];

  if (existingRecord && !existingRecord.deletedAt) {
    const deletedRecord = softDeleteSalaryRecord(
      existingRecord,
      new Date(nowMs).toISOString().slice(0, 10),
      nowMs
    );
    ops.push(
      ...salaryRecordWriteOps(uid, deletedRecord, existingRecord, SENTINELS)
    );
  }

  return commitMutations(uid, ops, {
    label: "reject salary candidate",
  });
}

/**
 * Applies user corrections to an existing SalaryRecord and updates the associated SalaryReview.
 */
export async function correctSalaryRecord(
  uid: string,
  existing: SalaryRecord,
  correction: SalaryRecordCorrection,
  previousReview?: SalaryReview
): Promise<WriteOutcome> {
  const nowMs = Date.now();
  const updated = applySalaryRecordCorrection(existing, correction, nowMs);
  const stampedRecord = { ...updated, createdAtMs: existing.createdAtMs };

  const ops: MutationOp[] = [
    ...salaryRecordWriteOps(uid, stampedRecord, existing, SENTINELS),
  ];

  if (existing.transactionId) {
    const review = buildSalaryReviewDoc(
      {
        incomeId: existing.transactionId,
        amount: updated.netAmount,
        date: updated.paymentDate,
      },
      "confirm",
      {
        salaryType: updated.type,
        correctedEmployerName: updated.employer.name,
        correctedPayPeriodMonth: updated.month,
      },
      uid,
      nowMs
    );
    const stampedReview = previousReview
      ? { ...review, createdAtMs: previousReview.createdAtMs }
      : review;
    ops.push(...salaryReviewWriteOps(uid, stampedReview, previousReview, SENTINELS));
  }

  return commitMutations(uid, ops, {
    label: "correct salary record",
  });
}

/**
 * Soft deletes an existing SalaryRecord (marks isDeleted/deletedAt).
 */
export async function deleteSalaryRecord(
  uid: string,
  existing: SalaryRecord
): Promise<WriteOutcome> {
  const nowMs = Date.now();
  const deleted = softDeleteSalaryRecord(
    existing,
    new Date(nowMs).toISOString().slice(0, 10),
    nowMs
  );

  const ops = salaryRecordWriteOps(uid, deleted, existing, SENTINELS);
  return commitMutations(uid, ops, {
    label: "delete salary record",
  });
}

/**
 * Confirms multiple candidates in atomic batches.
 */
export async function confirmSalaryCandidatesBulk(
  uid: string,
  candidates: SalaryCandidate[]
): Promise<WriteOutcome> {
  if (candidates.length === 0) return "acked";

  const nowMs = Date.now();
  const allOps: MutationOp[] = [];

  for (const candidate of candidates) {
    const record = buildConfirmedRecordFromCandidate(
      candidate,
      undefined,
      uid,
      nowMs
    );
    const review = buildSalaryReviewDoc(
      {
        incomeId: candidate.incomeId,
        amount: candidate.amount,
        date: candidate.date,
      },
      "confirm",
      { salaryType: record.type },
      uid,
      nowMs
    );

    allOps.push(
      ...salaryRecordWriteOps(uid, record, undefined, SENTINELS),
      ...salaryReviewWriteOps(uid, review, undefined, SENTINELS)
    );
  }

  let worstOutcome: WriteOutcome = "acked";

  // Chunk operations to respect Firestore batch limits
  for (let i = 0; i < allOps.length; i += BULK_CHUNK_SIZE * 2) {
    const chunk = allOps.slice(i, i + BULK_CHUNK_SIZE * 2);
    const outcome = await commitMutations(uid, chunk, {
      label: "bulk confirm salary candidates",
    });
    if (OUTCOME_RANK[outcome] > OUTCOME_RANK[worstOutcome]) {
      worstOutcome = outcome;
    }
  }

  return worstOutcome;
}

/**
 * Rejects multiple candidates in atomic batches.
 */
export async function rejectSalaryCandidatesBulk(
  uid: string,
  candidates: SalaryCandidate[],
  reason: SalaryRejectionReason
): Promise<WriteOutcome> {
  if (candidates.length === 0) return "acked";

  const nowMs = Date.now();
  const allOps: MutationOp[] = [];

  for (const candidate of candidates) {
    const review = buildSalaryReviewDoc(
      {
        incomeId: candidate.incomeId,
        amount: candidate.amount,
        date: candidate.date,
      },
      "reject",
      { rejectionReason: reason },
      uid,
      nowMs
    );

    allOps.push(...salaryReviewWriteOps(uid, review, undefined, SENTINELS));
  }

  let worstOutcome: WriteOutcome = "acked";

  for (let i = 0; i < allOps.length; i += BULK_CHUNK_SIZE) {
    const chunk = allOps.slice(i, i + BULK_CHUNK_SIZE);
    const outcome = await commitMutations(uid, chunk, {
      label: "bulk reject salary candidates",
    });
    if (OUTCOME_RANK[outcome] > OUTCOME_RANK[worstOutcome]) {
      worstOutcome = outcome;
    }
  }

  return worstOutcome;
}

/**
 * Clears a SalaryReview, allowing the transaction to return to automatic detection.
 */
export async function clearSalaryReview(
  uid: string,
  incomeId: string
): Promise<WriteOutcome> {
  const reviewDocId = buildReviewDocId(incomeId);
  const ops = salaryReviewDeleteOps(uid, reviewDocId);
  return commitMutations(uid, ops, {
    label: "clear salary review",
  });
}
