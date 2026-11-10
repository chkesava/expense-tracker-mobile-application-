/**
 * Salary documents → outbox ops (`commitMutations`).
 *
 * Rules:
 * - A create is a `set` stamped with `createdAt` and `updatedAt` server timestamps (READ_MODEL_RULES R1.2).
 * - An update is an `update` with `updatedAt: serverTimestamp()`. `createdAtMs` is preserved.
 * - The document `id` lives in the path, omitted from doc data if desired or kept consistent.
 */

import type { MutationOp } from "@/shared/types/mutations";
import type { SalaryProfile, SalaryRecord, SalaryReview } from "../types";

export type SalaryCollection = "salaryProfiles" | "salaryRecords" | "salaryReviews";

export type SalarySentinels = {
  serverTimestamp: () => unknown;
  deleteField: () => unknown;
};

export function salaryDocPath(uid: string, collection: SalaryCollection, id: string): string {
  return `users/${uid}/${collection}/${id}`;
}

const STAMP_FIELDS = new Set(["id", "uid", "createdAt", "updatedAt"]);

function documentData(doc: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc)) {
    if (STAMP_FIELDS.has(key) || value === undefined) continue;
    out[key] = value;
  }
  return out;
}

export function salaryRecordWriteOps(
  uid: string,
  record: SalaryRecord,
  previous: SalaryRecord | undefined,
  s: SalarySentinels
): MutationOp[] {
  if (!previous) {
    return [
      {
        op: "set",
        ref: { path: salaryDocPath(uid, "salaryRecords", record.id) },
        data: {
          ...documentData(record),
          createdAt: s.serverTimestamp(),
          updatedAt: s.serverTimestamp(),
        },
      },
    ];
  }

  const data: Record<string, unknown> = documentData(record);
  for (const key of Object.keys(documentData(previous))) {
    if (!(key in data)) data[key] = s.deleteField();
  }
  data.updatedAt = s.serverTimestamp();

  return [
    {
      op: "update",
      ref: { path: salaryDocPath(uid, "salaryRecords", record.id) },
      data,
    },
  ];
}

export function salaryProfileWriteOps(
  uid: string,
  profile: SalaryProfile,
  previous: SalaryProfile | undefined,
  s: SalarySentinels
): MutationOp[] {
  if (!previous) {
    return [
      {
        op: "set",
        ref: { path: salaryDocPath(uid, "salaryProfiles", profile.id) },
        data: {
          ...documentData(profile),
          createdAt: s.serverTimestamp(),
          updatedAt: s.serverTimestamp(),
        },
      },
    ];
  }

  const data: Record<string, unknown> = documentData(profile);
  for (const key of Object.keys(documentData(previous))) {
    if (!(key in data)) data[key] = s.deleteField();
  }
  data.updatedAt = s.serverTimestamp();

  return [
    {
      op: "update",
      ref: { path: salaryDocPath(uid, "salaryProfiles", profile.id) },
      data,
    },
  ];
}

export function salaryReviewWriteOps(
  uid: string,
  review: SalaryReview,
  previous: SalaryReview | undefined,
  s: SalarySentinels
): MutationOp[] {
  if (!previous) {
    return [
      {
        op: "set",
        ref: { path: salaryDocPath(uid, "salaryReviews", review.id) },
        data: {
          ...documentData(review),
          createdAt: s.serverTimestamp(),
          updatedAt: s.serverTimestamp(),
        },
      },
    ];
  }

  const data: Record<string, unknown> = documentData(review);
  for (const key of Object.keys(documentData(previous))) {
    if (!(key in data)) data[key] = s.deleteField();
  }
  data.updatedAt = s.serverTimestamp();

  return [
    {
      op: "update",
      ref: { path: salaryDocPath(uid, "salaryReviews", review.id) },
      data,
    },
  ];
}

export function salaryReviewDeleteOps(uid: string, reviewId: string): MutationOp[] {
  return [
    {
      op: "delete",
      ref: { path: salaryDocPath(uid, "salaryReviews", reviewId) },
    },
  ];
}
