import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { MutationOp } from "../shared/types/mutations";
import type { SalaryProfile, SalaryRecord, SalaryReview } from "../shared/features/salary/types";
import {
  buildSalaryProfile,
  buildSalaryRecord,
  buildSalaryReview,
  softDeleteSalaryRecord,
} from "../shared/features/salary/utils/builders";
import {
  salaryDocPath,
  salaryProfileWriteOps,
  salaryRecordWriteOps,
  salaryReviewDeleteOps,
  salaryReviewWriteOps,
} from "../shared/features/salary/utils/writes";

/**
 * SPENDLY-325 — Salary Intelligence rules (firestore.rules, "SPENDLY-325 Salary").
 * Tests owner access, schema validations, soft-delete rules, and cross-user rejection.
 */

const PROJECT_ID = "spendly-salary-rules";
const OWNER = "u-owner";
const OTHER = "u-other";
const S = { serverTimestamp, deleteField };

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8080),
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

const dbOf = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore;

async function commit(db: Firestore, ops: MutationOp[]) {
  const batch = writeBatch(db);
  for (const op of ops) {
    const ref = doc(db, op.ref.path);
    if (op.op === "set") batch.set(ref, op.data);
    else if (op.op === "update") batch.update(ref, op.data as Record<string, unknown>);
    else batch.delete(ref);
  }
  await batch.commit();
}

let clock = 1_790_000_000_000;

describe("SPENDLY-325: Salary Intelligence firestore.rules", () => {
  describe("salaryProfiles", () => {
    it("owner can create, read, update, and delete their salary profile", async () => {
      const db = dbOf(OWNER);
      const profile = buildSalaryProfile({
        id: "primary",
        primaryEmployer: "Acme India Pvt Ltd",
        expectedPaydayWindow: { startDay: 28, endDay: 31 },
        frequency: "monthly",
        notificationEnabled: true,
      }, (clock += 1000));

      await assertSucceeds(commit(db, salaryProfileWriteOps(OWNER, profile, undefined, S)));
      const snap = await assertSucceeds(getDoc(doc(db, salaryDocPath(OWNER, "salaryProfiles", "primary"))));
      expect(snap.exists()).toBe(true);

      const updated = { ...profile, notificationEnabled: false, updatedAtMs: (clock += 1000) };
      await assertSucceeds(commit(db, salaryProfileWriteOps(OWNER, updated, profile, S)));

      await assertSucceeds(deleteDoc(doc(db, salaryDocPath(OWNER, "salaryProfiles", "primary"))));
    });

    it("other user cannot read, write, or delete owner's profile", async () => {
      const ownerDb = dbOf(OWNER);
      const otherDb = dbOf(OTHER);
      const profile = buildSalaryProfile({
        id: "primary",
        primaryEmployer: "Acme India Pvt Ltd",
        expectedPaydayWindow: { startDay: 28, endDay: 31 },
        frequency: "monthly",
        notificationEnabled: true,
      }, (clock += 1000));

      await commit(ownerDb, salaryProfileWriteOps(OWNER, profile, undefined, S));

      await assertFails(getDoc(doc(otherDb, salaryDocPath(OWNER, "salaryProfiles", "primary"))));
      await assertFails(setDoc(doc(otherDb, salaryDocPath(OWNER, "salaryProfiles", "primary")), { hacker: true }));
      await assertFails(deleteDoc(doc(otherDb, salaryDocPath(OWNER, "salaryProfiles", "primary"))));
    });

    it("rejects invalid payday window or unallowed fields", async () => {
      const db = dbOf(OWNER);
      const invalidWindow = {
        primaryEmployer: "Acme",
        expectedPaydayWindow: { startDay: 40, endDay: 50 }, // invalid days > 31
        frequency: "monthly",
        notificationEnabled: true,
        createdAtMs: (clock += 1000),
        updatedAtMs: clock,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await assertFails(setDoc(doc(db, salaryDocPath(OWNER, "salaryProfiles", "primary")), invalidWindow));

      const extraField = {
        primaryEmployer: "Acme",
        expectedPaydayWindow: { startDay: 28, endDay: 31 },
        frequency: "monthly",
        notificationEnabled: true,
        unauthorizedField: "leak",
        createdAtMs: (clock += 1000),
        updatedAtMs: clock,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await assertFails(setDoc(doc(db, salaryDocPath(OWNER, "salaryProfiles", "primary")), extraField));
    });
  });

  describe("salaryRecords", () => {
    it("owner can create, read, update, and soft-delete a salary record", async () => {
      const db = dbOf(OWNER);
      const record = buildSalaryRecord({
        id: "rec_2026_10",
        payPeriod: { month: "2026-10", startDate: "2026-10-01", endDate: "2026-10-31" },
        employer: { name: "Acme India", normalizedName: "Acme" },
        netAmount: 125000,
        grossAmount: 150000,
        currency: "INR",
        paymentDate: "2026-10-31",
        type: "regular",
        status: "confirmed",
        provenance: { source: "detection", detectionRule: "recurring" },
      }, (clock += 1000));

      await assertSucceeds(commit(db, salaryRecordWriteOps(OWNER, record, undefined, S)));
      const snap = await assertSucceeds(getDoc(doc(db, salaryDocPath(OWNER, "salaryRecords", "rec_2026_10"))));
      expect(snap.exists()).toBe(true);

      // Hard delete is forbidden
      await assertFails(deleteDoc(doc(db, salaryDocPath(OWNER, "salaryRecords", "rec_2026_10"))));

      // Soft delete succeeds
      const deleted = softDeleteSalaryRecord(record, "2026-11-01", (clock += 1000));
      await assertSucceeds(commit(db, salaryRecordWriteOps(OWNER, deleted, record, S)));
    });

    it("other user cannot access owner's salary records", async () => {
      const ownerDb = dbOf(OWNER);
      const otherDb = dbOf(OTHER);
      const record = buildSalaryRecord({
        id: "rec_2026_10",
        payPeriod: { month: "2026-10" },
        employer: { name: "Acme India" },
        netAmount: 125000,
        currency: "INR",
        paymentDate: "2026-10-31",
        type: "regular",
        status: "confirmed",
        provenance: { source: "user_created" },
      }, (clock += 1000));

      await commit(ownerDb, salaryRecordWriteOps(OWNER, record, undefined, S));
      await assertFails(getDoc(doc(otherDb, salaryDocPath(OWNER, "salaryRecords", "rec_2026_10"))));
      await assertFails(setDoc(doc(otherDb, salaryDocPath(OWNER, "salaryRecords", "rec_2026_10")), { netAmount: 1 }));
    });

    it("rejects non-positive amounts or invalid month format", async () => {
      const db = dbOf(OWNER);
      const negativeNet = {
        payPeriod: { month: "2026-10" },
        employer: { name: "Acme" },
        netAmount: -500,
        currency: "INR",
        paymentDate: "2026-10-31",
        type: "regular",
        status: "confirmed",
        provenance: { source: "user_created" },
        createdAtMs: (clock += 1000),
        updatedAtMs: clock,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await assertFails(setDoc(doc(db, salaryDocPath(OWNER, "salaryRecords", "bad_net")), negativeNet));

      const badMonth = {
        payPeriod: { month: "2026/10" }, // not YYYY-MM
        employer: { name: "Acme" },
        netAmount: 50000,
        currency: "INR",
        paymentDate: "2026-10-31",
        type: "regular",
        status: "confirmed",
        provenance: { source: "user_created" },
        createdAtMs: (clock += 1000),
        updatedAtMs: clock,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await assertFails(setDoc(doc(db, salaryDocPath(OWNER, "salaryRecords", "bad_month")), badMonth));
    });
  });

  describe("salaryReviews", () => {
    it("owner can create, read, update, and delete reviews", async () => {
      const db = dbOf(OWNER);
      const review = buildSalaryReview({
        refKey: "income:inc_abc",
        decision: "reject",
        rejectionReason: "not_salary",
        sourceAmount: 30000,
        sourceDate: "2026-10-15",
      }, (clock += 1000));

      await assertSucceeds(commit(db, salaryReviewWriteOps(OWNER, review, undefined, S)));
      const snap = await assertSucceeds(getDoc(doc(db, salaryDocPath(OWNER, "salaryReviews", review.id))));
      expect(snap.exists()).toBe(true);

      // Updating existing review preserving createdAtMs succeeds
      const updated: SalaryReview = {
        ...review,
        decision: "confirm",
        salaryType: "regular",
        updatedAtMs: (clock += 1000),
      };
      await assertSucceeds(commit(db, salaryReviewWriteOps(OWNER, updated, review, S)));

      // Changing createdAtMs on update is rejected by rules
      const badCreatedAt: SalaryReview = {
        ...review,
        createdAtMs: (clock += 1000),
        updatedAtMs: clock,
      };
      await assertFails(commit(db, salaryReviewWriteOps(OWNER, badCreatedAt, review, S)));

      await assertSucceeds(commit(db, salaryReviewDeleteOps(OWNER, review.id)));
    });

    it("rejects invalid refKey or unauthorized users", async () => {
      const db = dbOf(OWNER);
      const otherDb = dbOf(OTHER);
      const badRefKey = {
        refKey: "expense:exp_123", // only income: candidates allowed
        decision: "reject",
        sourceAmount: 30000,
        sourceDate: "2026-10-15",
        createdAtMs: (clock += 1000),
        updatedAtMs: clock,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await assertFails(setDoc(doc(db, salaryDocPath(OWNER, "salaryReviews", "r1")), badRefKey));

      const review = buildSalaryReview({
        refKey: "income:inc_abc",
        decision: "confirm",
        sourceAmount: 30000,
        sourceDate: "2026-10-15",
      }, (clock += 1000));
      await commit(db, salaryReviewWriteOps(OWNER, review, undefined, S));
      await assertFails(getDoc(doc(otherDb, salaryDocPath(OWNER, "salaryReviews", review.id))));
    });
  });
});
