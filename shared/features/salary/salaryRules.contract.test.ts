import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  SALARY_CONFIDENCES,
  SALARY_PROVENANCE_SOURCES,
  SALARY_REJECTION_REASONS,
  SALARY_REVIEW_DECISIONS,
  SALARY_STATUSES,
  SALARY_TYPES,
  type SalaryProfile,
  type SalaryRecord,
  type SalaryReview,
} from "./types";
import {
  buildSalaryProfile,
  buildSalaryRecord,
  buildSalaryReview,
  softDeleteSalaryRecord,
} from "./utils/builders";
import {
  salaryProfileWriteOps,
  salaryRecordWriteOps,
  salaryReviewWriteOps,
} from "./utils/writes";

/** SPENDLY-325 — the salary builders and firestore.rules must agree. */
const rules = readFileSync("firestore.rules", "utf8");
const section = rules.slice(
  rules.indexOf("SPENDLY-325 Salary Intelligence (epic SPENDLY-324)"),
  rules.indexOf("END SPENDLY-325 salary")
);

const fn = (name: string) => {
  const start = section.indexOf(`function ${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  const next = section.indexOf("\n      function ", start + 1);
  return section.slice(start, next === -1 ? undefined : next);
};

const quoted = (text: string) => [...text.matchAll(/'([^']+)'/g)].map((m) => m[1]);
const listAfter = (text: string, marker: string) => {
  const at = text.indexOf(marker);
  expect(at, marker).toBeGreaterThan(-1);
  const open = text.indexOf("[", at);
  return quoted(text.slice(open, text.indexOf("]", open)));
};
const hasOnly = (name: string) => listAfter(fn(name), "hasOnly(");
const sorted = (list: readonly string[]) => [...list].sort();

describe("SPENDLY-325 firestore.rules contract", () => {
  const sentinels = {
    serverTimestamp: () => ({ _methodName: "serverTimestamp" }),
    deleteField: () => ({ _methodName: "deleteField" }),
  };

  it("salaryProfiles: firestore.rules hasOnly covers write ops output", () => {
    const profile = buildSalaryProfile({
      id: "primary",
      primaryEmployer: "Acme Corp",
      expectedPaydayWindow: { startDay: 28, endDay: 31 },
      frequency: "monthly",
      notificationEnabled: true,
      primaryAccountId: "acc_1",
      notes: "Direct deposit",
    });

    const [op] = salaryProfileWriteOps("u1", profile, undefined, sentinels);
    const opKeys = Object.keys((op as { data: Record<string, unknown> }).data);
    const allowed = hasOnly("salaryProfileWellFormed");

    for (const key of opKeys) {
      expect(allowed).toContain(key);
    }
  });

  it("salaryRecords: firestore.rules hasOnly covers write ops output", () => {
    const record = buildSalaryRecord({
      id: "rec_1",
      payPeriod: { month: "2026-10", startDate: "2026-10-01", endDate: "2026-10-31" },
      employer: { name: "Acme Corp", rawName: "ACME SAL", normalizedName: "Acme" },
      netAmount: 100000,
      grossAmount: 120000,
      currency: "INR",
      paymentDate: "2026-10-31",
      transactionId: "inc_1",
      accountId: "acc_1",
      type: "regular",
      status: "confirmed",
      confidence: "high",
      evidence: ["narration"],
      breakdown: { netSalary: 100000 },
      provenance: { source: "detection" },
      notes: "October pay",
    });

    const [op] = salaryRecordWriteOps("u1", record, undefined, sentinels);
    const opKeys = Object.keys((op as { data: Record<string, unknown> }).data);
    const allowed = hasOnly("salaryRecordWellFormed");

    for (const key of opKeys) {
      expect(allowed).toContain(key);
    }
  });

  it("salaryRecords soft delete: deletedAt is allowed by hasOnly", () => {
    const record = buildSalaryRecord({
      id: "rec_1",
      payPeriod: { month: "2026-10" },
      employer: { name: "Acme Corp" },
      netAmount: 100000,
      currency: "INR",
      paymentDate: "2026-10-31",
      type: "regular",
      status: "confirmed",
      provenance: { source: "user_created" },
    });
    const deleted = softDeleteSalaryRecord(record, "2026-11-01");
    const [op] = salaryRecordWriteOps("u1", deleted, record, sentinels);
    const opKeys = Object.keys((op as { data: Record<string, unknown> }).data);
    const allowed = hasOnly("salaryRecordWellFormed");

    for (const key of opKeys) {
      expect(allowed).toContain(key);
    }
    expect(allowed).toContain("deletedAt");
  });

  it("salaryReviews: firestore.rules hasOnly covers write ops output", () => {
    const review = buildSalaryReview({
      refKey: "income:inc_100",
      decision: "reject",
      salaryType: "reimbursement",
      correctedEmployerName: "Other Corp",
      correctedPayPeriodMonth: "2026-09",
      rejectionReason: "reimbursement",
      sourceAmount: 15000,
      sourceDate: "2026-10-05",
    });

    const [op] = salaryReviewWriteOps("u1", review, undefined, sentinels);
    const opKeys = Object.keys((op as { data: Record<string, unknown> }).data);
    const allowed = hasOnly("salaryReviewWellFormed");

    for (const key of opKeys) {
      expect(allowed).toContain(key);
    }
  });

  it("rules enum values match TypeScript domain constants", () => {
    const recordRules = fn("salaryRecordWellFormed");
    const typesInRules = listAfter(recordRules, "d.type in");
    expect(sorted(typesInRules)).toEqual(sorted(SALARY_TYPES));

    const statusesInRules = listAfter(recordRules, "d.status in");
    expect(sorted(statusesInRules)).toEqual(sorted(SALARY_STATUSES));

    const confInRules = listAfter(recordRules, "d.confidence in");
    expect(sorted(confInRules)).toEqual(sorted(SALARY_CONFIDENCES));

    const provInRules = listAfter(recordRules, "d.provenance.source in");
    expect(sorted(provInRules)).toEqual(sorted(SALARY_PROVENANCE_SOURCES));

    const reviewRules = fn("salaryReviewWellFormed");
    const decisionsInRules = listAfter(reviewRules, "d.decision in");
    expect(sorted(decisionsInRules)).toEqual(sorted(SALARY_REVIEW_DECISIONS));

    const rejectionsInRules = listAfter(reviewRules, "d.rejectionReason in");
    expect(sorted(rejectionsInRules)).toEqual(sorted(SALARY_REJECTION_REASONS));
  });
});
