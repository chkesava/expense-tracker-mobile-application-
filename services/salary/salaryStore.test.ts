import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SalaryCandidate, SalaryRecord } from "@/shared/features/salary/types";

type MutationCall = [
  string,
  Array<{ op: string; ref: { path: string }; data?: Record<string, unknown> }>,
  { label?: string } | undefined
];

const mockCommitMutations = vi.fn(async (..._args: unknown[]) => "acked" as const);

vi.mock("@/lib/commitMutations", () => ({
  commitMutations: (...args: unknown[]) => mockCommitMutations(...args),
}));

vi.mock("@/lib/firestore", () => ({
  serverTimestamp: () => ({ __serverTimestamp: true }),
  deleteField: () => ({ __deleteField: true }),
}));

import {
  clearSalaryReview,
  confirmSalaryCandidate,
  confirmSalaryCandidatesBulk,
  correctSalaryRecord,
  deleteSalaryRecord,
  rejectSalaryCandidate,
} from "./salaryStore";

describe("Salary Store Mutation Actions (SPENDLY-327)", () => {
  const mockCandidate: SalaryCandidate = {
    incomeId: "inc_101",
    amount: 150000,
    date: "2026-10-31",
    payPeriod: { month: "2026-10" },
    employer: {
      name: "Google India",
      rawName: "GOOGLE SAL",
      normalizedName: "google",
    },
    confidence: "high",
    evidence: ["Explicit SAL token"],
    detectionRule: "rule_explicit_payroll_signal",
    suggestedType: "regular",
    rawNarration: "CMS/001/GOOGLE SAL OCT 2026",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function getCall(index: number = 0): MutationCall {
    return mockCommitMutations.mock.calls[index] as unknown as MutationCall;
  }

  describe("confirmSalaryCandidate", () => {
    it("commits both SalaryRecord and SalaryReview with confirmed status", async () => {
      const outcome = await confirmSalaryCandidate("u1", mockCandidate);

      expect(outcome).toBe("acked");
      expect(mockCommitMutations).toHaveBeenCalledTimes(1);

      const [uid, ops, options] = getCall(0);
      expect(uid).toBe("u1");
      expect(options?.label).toBe("confirm salary candidate");
      expect(ops).toHaveLength(2);

      const recordOp = ops.find(
        (o) => o.ref.path === "users/u1/salaryRecords/sal_inc_101"
      );
      expect(recordOp).toBeDefined();
      expect(recordOp?.op).toBe("set");
      expect(recordOp?.data?.status).toBe("confirmed");
      expect((recordOp?.data?.provenance as any)?.source).toBe("user_confirmed");

      const reviewOp = ops.find(
        (o) => o.ref.path === "users/u1/salaryReviews/income__inc_101"
      );
      expect(reviewOp).toBeDefined();
      expect(reviewOp?.op).toBe("set");
      expect(reviewOp?.data?.decision).toBe("confirm");
    });

    it("applies user overrides and flags user_corrected provenance", async () => {
      await confirmSalaryCandidate("u1", mockCandidate, {
        employerName: "Alphabet India",
        grossAmount: 180000,
        salaryType: "bonus",
      });

      const [, ops] = getCall(0);
      const recordOp = ops[0];
      expect((recordOp?.data?.employer as any)?.name).toBe("Alphabet India");
      expect(recordOp?.data?.grossAmount).toBe(180000);
      expect(recordOp?.data?.type).toBe("bonus");
      expect((recordOp?.data?.provenance as any)?.source).toBe("user_corrected");
    });
  });

  describe("rejectSalaryCandidate", () => {
    it("commits SalaryReview with decision reject and soft deletes any existing record", async () => {
      const existingRecord: SalaryRecord = {
        id: "sal_inc_101",
        month: "2026-10",
        payPeriod: { month: "2026-10" },
        employer: { name: "Google India" },
        netAmount: 150000,
        currency: "INR",
        paymentDate: "2026-10-31",
        transactionId: "inc_101",
        type: "regular",
        status: "confirmed",
        provenance: { source: "user_confirmed" },
        createdAtMs: 1700000000000,
        updatedAtMs: 1700000000000,
      };

      const outcome = await rejectSalaryCandidate(
        "u1",
        mockCandidate,
        "transfer",
        existingRecord
      );

      expect(outcome).toBe("acked");
      const [, ops] = getCall(0);
      expect(ops).toHaveLength(2);

      const reviewOp = ops[0];
      expect(reviewOp.ref.path).toBe("users/u1/salaryReviews/income__inc_101");
      expect(reviewOp.data?.decision).toBe("reject");
      expect(reviewOp.data?.rejectionReason).toBe("transfer");

      const recordOp = ops[1];
      expect(recordOp.op).toBe("update");
      expect(recordOp.ref.path).toBe("users/u1/salaryRecords/sal_inc_101");
      expect(recordOp.data?.deletedAt).toBeDefined();
    });
  });

  describe("correctSalaryRecord", () => {
    it("updates existing record and updates review", async () => {
      const existingRecord: SalaryRecord = {
        id: "sal_inc_101",
        month: "2026-10",
        payPeriod: { month: "2026-10" },
        employer: { name: "Google India" },
        netAmount: 150000,
        currency: "INR",
        paymentDate: "2026-10-31",
        transactionId: "inc_101",
        type: "regular",
        status: "confirmed",
        provenance: { source: "user_confirmed" },
        createdAtMs: 1700000000000,
        updatedAtMs: 1700000000000,
      };

      await correctSalaryRecord("u1", existingRecord, {
        grossAmount: 190000,
        salaryType: "incentive",
      });

      const [, ops] = getCall(0);
      expect(ops).toHaveLength(2);
      expect(ops[0].op).toBe("update");
      expect(ops[0].data?.grossAmount).toBe(190000);
      expect(ops[0].data?.type).toBe("incentive");
      expect((ops[0].data?.provenance as any)?.source).toBe("user_corrected");
    });
  });

  describe("deleteSalaryRecord", () => {
    it("performs soft-delete by writing deletedAt", async () => {
      const existingRecord: SalaryRecord = {
        id: "sal_inc_101",
        month: "2026-10",
        payPeriod: { month: "2026-10" },
        employer: { name: "Google India" },
        netAmount: 150000,
        currency: "INR",
        paymentDate: "2026-10-31",
        type: "regular",
        status: "confirmed",
        provenance: { source: "user_confirmed" },
        createdAtMs: 1700000000000,
        updatedAtMs: 1700000000000,
      };

      await deleteSalaryRecord("u1", existingRecord);

      const [, ops] = getCall(0);
      expect(ops).toHaveLength(1);
      expect(ops[0].op).toBe("update");
      expect(ops[0].data?.deletedAt).toBeDefined();
    });
  });

  describe("confirmSalaryCandidatesBulk", () => {
    it("batches multiple candidate confirmations into commitMutations chunks", async () => {
      const candidates: SalaryCandidate[] = [
        mockCandidate,
        { ...mockCandidate, incomeId: "inc_102" },
      ];

      await confirmSalaryCandidatesBulk("u1", candidates);

      expect(mockCommitMutations).toHaveBeenCalledTimes(1);
      const [, ops] = getCall(0);
      expect(ops).toHaveLength(4); // 2 ops per candidate
    });
  });

  describe("clearSalaryReview", () => {
    it("deletes the salary review doc", async () => {
      await clearSalaryReview("u1", "inc_101");

      const [, ops] = getCall(0);
      expect(ops).toHaveLength(1);
      expect(ops[0].op).toBe("delete");
      expect(ops[0].ref.path).toBe("users/u1/salaryReviews/income__inc_101");
    });
  });
});
