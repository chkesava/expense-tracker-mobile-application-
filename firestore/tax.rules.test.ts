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
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

import type { MutationOp } from "../shared/types/mutations";
import type { TaxDocument, TaxEntry, TaxReview } from "../shared/features/tax/types";
import {
  buildTaxEntry,
  buildTaxProfile,
  buildTaxReview,
  buildTaxSnapshot,
  softDeleteTaxEntry,
} from "../shared/features/tax/utils/builders";
import { ALL_RECORDS, RENT_RECEIVED } from "../shared/features/tax/utils/testRecords";
import type { TaxEntryDraft } from "../shared/features/tax/utils/validation";
import {
  taxDocumentWriteOps,
  taxEntryWriteOps,
  taxProfileWriteOps,
  taxReviewDeleteOps,
  taxReviewWriteOps,
  taxSnapshotWriteOps,
} from "../shared/features/tax/utils/writes";

/**
 * SPENDLY-709 — Tax & ITR Readiness rules (firestore.rules, "SPENDLY-709 Tax").
 * Every app write is built by the real builders and write ops, so these tests
 * prove the app's writes pass and forged ones fail.
 */

const PROJECT_ID = "spendly-tax-rules";
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

function entry(draft: TaxEntryDraft, id = "e1", previous?: TaxEntry | null): TaxEntry {
  const r = buildTaxEntry({ id, draft, previous, nowMs: (clock += 1000) });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}

/** Write ops as data, for forging one field. */
function setData(ops: MutationOp[]): Record<string, unknown> {
  const op = ops[0];
  if (op.op !== "set") throw new Error("expected set");
  return op.data as Record<string, unknown>;
}

describe("taxEntries", () => {
  it("accepts every kind of entry the app builds, and only from its owner", async () => {
    for (const [i, draft] of ALL_RECORDS.entries()) {
      const e = entry(draft, `e${i}`);
      await assertSucceeds(commit(dbOf(OWNER), taxEntryWriteOps(OWNER, e, null, S)));
      await assertFails(commit(dbOf(OTHER), taxEntryWriteOps(OWNER, { ...e, id: `x${i}` }, null, S)));
    }
    await assertSucceeds(getDoc(doc(dbOf(OWNER), "users", OWNER, "taxEntries", "e0")));
    await assertFails(getDoc(doc(dbOf(OTHER), "users", OWNER, "taxEntries", "e0")));
  });

  it("accepts a correction, then a soft delete, then nothing more", async () => {
    const first = entry({ ...RENT_RECEIVED, note: "draft" });
    await assertSucceeds(commit(dbOf(OWNER), taxEntryWriteOps(OWNER, first, null, S)));
    const second = entry({ ...RENT_RECEIVED, fields: { ...RENT_RECEIVED.fields, amount: 1000 } }, "e1", first);
    await assertSucceeds(commit(dbOf(OWNER), taxEntryWriteOps(OWNER, second, first, S)));
    const deleted = softDeleteTaxEntry(second, { ms: (clock += 1000), iso: "2026-01-01T00:00:00.000Z" });
    if (!deleted.ok) throw new Error("expected ok");
    await assertSucceeds(commit(dbOf(OWNER), taxEntryWriteOps(OWNER, deleted.value, second, S)));

    // A deleted entry is frozen, and is never removed outright.
    await assertFails(
      updateDoc(doc(dbOf(OWNER), "users", OWNER, "taxEntries", "e1"), {
        revision: 9,
        deletedAt: deleteField(),
        updatedAt: serverTimestamp(),
      })
    );
    await assertFails(deleteDoc(doc(dbOf(OWNER), "users", OWNER, "taxEntries", "e1")));
  });

  it("refuses a correction that moves the year or doesn't advance the revision", async () => {
    const first = entry(RENT_RECEIVED);
    await assertSucceeds(commit(dbOf(OWNER), taxEntryWriteOps(OWNER, first, null, S)));
    const ref = doc(dbOf(OWNER), "users", OWNER, "taxEntries", "e1");
    await assertFails(updateDoc(ref, { fy: "2024-25", revision: 2, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { note: "x", updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(ref, { note: "x", revision: 2, updatedAt: serverTimestamp() }));
  });

  it("refuses forged entries", async () => {
    const good = setData(taxEntryWriteOps(OWNER, entry(RENT_RECEIVED), null, S));
    const fields = good.fields as Record<string, unknown>;
    const forged: Record<string, unknown>[] = [
      { ...good, isAdmin: true },
      { ...good, fields: { ...fields, amount: -5 } },
      { ...good, fields: { ...fields, amount: 1e12 } },
      { ...good, fields: { ...fields, category: "lottery" } },
      { ...good, fields: { ...fields, secret: "x" } },
      { ...good, kind: "tds" },
      { ...good, fy: "FY25" },
      { ...good, revision: 2 },
      { ...good, deletedAt: "2026-01-01T00:00:00.000Z" },
      { ...good, createdAt: 5 },
      { ...good, schemaVersion: 2 },
    ];
    for (const [i, data] of forged.entries()) {
      await assertFails(setDoc(doc(dbOf(OWNER), "users", OWNER, "taxEntries", `f${i}`), data));
    }
  });

  it("checks identifiers inside the fields", async () => {
    const tds = ALL_RECORDS.find((r) => r.kind === "tds")!;
    const good = setData(taxEntryWriteOps(OWNER, entry(tds), null, S));
    const fields = good.fields as Record<string, unknown>;
    await assertFails(setDoc(doc(dbOf(OWNER), "users", OWNER, "taxEntries", "t1"), { ...good, fields: { ...fields, tan: "BAD" } }));
    await assertFails(setDoc(doc(dbOf(OWNER), "users", OWNER, "taxEntries", "t2"), { ...good, fields: { ...fields, form: "99" } }));
    await assertSucceeds(setDoc(doc(dbOf(OWNER), "users", OWNER, "taxEntries", "t3"), good));
  });
});

describe("taxReviews", () => {
  function review(args: Partial<Parameters<typeof buildTaxReview>[0]> = {}, previous?: TaxReview) {
    const r = buildTaxReview({
      fy: "2025-26",
      source: { kind: "income", id: "i1" },
      decision: "exclude",
      sourceAmount: 1200,
      previous,
      nowMs: (clock += 1000),
      ...args,
    });
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    return r.value;
  }

  it("accepts the app's review, its correction and its undo", async () => {
    const first = review();
    await assertSucceeds(commit(dbOf(OWNER), taxReviewWriteOps(OWNER, first, null, S)));
    const second = review({ decision: "recategorize", category: "dividend" }, first);
    await assertSucceeds(commit(dbOf(OWNER), taxReviewWriteOps(OWNER, second, first, S)));
    await assertFails(commit(dbOf(OTHER), taxReviewDeleteOps(OWNER, first.id)));
    await assertSucceeds(commit(dbOf(OWNER), taxReviewDeleteOps(OWNER, first.id)));
  });

  it("accepts a deferred checklist item", async () => {
    const r = review({ source: { kind: "checklist", id: "form16-missing" }, decision: "defer", sourceAmount: null });
    await assertSucceeds(commit(dbOf(OWNER), taxReviewWriteOps(OWNER, r, null, S)));
  });

  it("refuses a review under another item's id, or a decision that doesn't fit", async () => {
    const good = setData(taxReviewWriteOps(OWNER, review(), null, S));
    const at = (id: string) => doc(dbOf(OWNER), "users", OWNER, "taxReviews", id);
    await assertFails(setDoc(at("2025-26__income__other"), good));
    await assertFails(setDoc(at("2025-26__income__i1"), { ...good, decision: "defer" }));
    await assertFails(setDoc(at("2025-26__income__i1"), { ...good, decision: "replace" }));
    await assertFails(setDoc(at("2025-26__income__i1"), { ...good, category: "dividend" }));
    await assertFails(setDoc(at("2025-26__income__i1"), { ...good, sourceAmount: -1 }));
    await assertSucceeds(setDoc(at("2025-26__income__i1"), good));
  });
});

describe("taxProfiles", () => {
  it("keys the profile by its year and stores no birth date", async () => {
    const r = buildTaxProfile({
      draft: { fy: "2025-26", residentialStatus: "resident", ageBand: "below_60", employerCount: 2 },
      nowMs: (clock += 1000),
    });
    if (!r.ok) throw new Error("expected ok");
    const ops = taxProfileWriteOps(OWNER, r.value, null, S);
    await assertSucceeds(commit(dbOf(OWNER), ops));
    const data = setData(ops);
    await assertFails(setDoc(doc(dbOf(OWNER), "users", OWNER, "taxProfiles", "2024-25"), data));
    await assertFails(setDoc(doc(dbOf(OWNER), "users", OWNER, "taxProfiles", "2025-26"), { ...data, dateOfBirth: "1990-01-01" }));
    await assertFails(setDoc(doc(dbOf(OWNER), "users", OWNER, "taxProfiles", "2025-26"), { ...data, pan: "ABCDE1234F" }));
  });
});

describe("taxDocuments", () => {
  const meta = (patch: Partial<TaxDocument> = {}): TaxDocument => ({
    id: "d1",
    fy: "2025-26",
    category: "form16",
    name: "Form 16",
    storagePath: `users/${OWNER}/tax/d1/form16.pdf`,
    fileName: "form16.pdf",
    mimeType: "application/pdf",
    sizeBytes: 250_000,
    status: "pending",
    schemaVersion: 1,
    createdAtMs: clock,
    updatedAtMs: clock,
    ...patch,
  });

  it("accepts metadata for the owner's own folder, then ready, then a delete", async () => {
    const pending = meta();
    await assertSucceeds(commit(dbOf(OWNER), taxDocumentWriteOps(OWNER, pending, null, S)));
    const ready = meta({ status: "ready", uploadedAtMs: clock + 5, updatedAtMs: clock + 5 });
    await assertSucceeds(commit(dbOf(OWNER), taxDocumentWriteOps(OWNER, ready, pending, S)));
    await assertSucceeds(deleteDoc(doc(dbOf(OWNER), "users", OWNER, "taxDocuments", "d1")));
  });

  it("refuses a path outside the owner's folder, a moved file, or an unsafe type", async () => {
    const at = doc(dbOf(OWNER), "users", OWNER, "taxDocuments", "d1");
    const data = setData(taxDocumentWriteOps(OWNER, meta(), null, S));
    await assertFails(setDoc(at, { ...data, storagePath: `users/${OTHER}/tax/d1/form16.pdf` }));
    await assertFails(setDoc(at, { ...data, storagePath: `users/${OWNER}/tax/d2/form16.pdf` }));
    await assertFails(setDoc(at, { ...data, mimeType: "text/html" }));
    await assertFails(setDoc(at, { ...data, sizeBytes: 11 * 1024 * 1024 }));
    await assertSucceeds(setDoc(at, data));
    await assertFails(
      updateDoc(at, { storagePath: `users/${OWNER}/tax/d1/other.pdf`, fileName: "other.pdf", updatedAt: serverTimestamp() })
    );
  });
});

describe("taxSnapshots", () => {
  it("are created once and never changed or removed", async () => {
    const r = buildTaxSnapshot({
      fy: "2025-26",
      law: "ITA1961",
      reason: "export",
      ruleVersion: "FY2025-26.v1",
      inputHash: "abc123",
      outputs: { taxNew: 12_345, taxOld: null },
      unresolvedCount: 1,
      createdAtMs: (clock += 1000),
    });
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    const ops = taxSnapshotWriteOps(OWNER, r.value, S);
    await assertSucceeds(commit(dbOf(OWNER), ops));
    const ref = doc(dbOf(OWNER), "users", OWNER, "taxSnapshots", r.value.id);
    await assertFails(updateDoc(ref, { unresolvedCount: 0, updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(ref));
    await assertFails(setDoc(doc(dbOf(OWNER), "users", OWNER, "taxSnapshots", "2025-26__1"), setData(ops)));
    await assertFails(commit(dbOf(OTHER), taxSnapshotWriteOps(OWNER, { ...r.value, id: `${r.value.fy}__${r.value.createdAtMs}` }, S)));
  });
});
