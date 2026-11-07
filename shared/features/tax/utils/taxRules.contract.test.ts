import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  TAX_AGE_BANDS,
  TAX_AIS_CATEGORIES,
  TAX_ASSET_CLASSES,
  TAX_CAPITAL_GAIN_MODES,
  TAX_DOCUMENT_CATEGORIES,
  TAX_DOCUMENT_STATUSES,
  TAX_ENTRY_FIELD_KEYS,
  TAX_ENTRY_KINDS,
  TAX_INCOME_CATEGORIES,
  TAX_LAWS,
  TAX_PAYMENT_TYPES,
  TAX_PROOF_STATUSES,
  TAX_QUARTERS,
  TAX_REGIME_NOTES,
  TAX_RESIDENTIAL_STATUSES,
  TAX_REVIEW_DECISIONS,
  TAX_SNAPSHOT_REASONS,
  TAX_SOURCE_KINDS,
  TAX_STATEMENTS,
  TAX_TDS_FORMS,
  type TaxDocument,
  type TaxEntryKind,
} from "../types";
import { buildTaxEntry, buildTaxProfile, buildTaxReview, buildTaxSnapshot, softDeleteTaxEntry } from "./builders";
import { ALL_RECORDS } from "./testRecords";
import { TAX_DOCUMENT_MIME_TYPES } from "./validation";
import {
  taxDocumentWriteOps,
  taxEntryWriteOps,
  taxProfileWriteOps,
  taxReviewWriteOps,
  taxSnapshotWriteOps,
} from "./writes";

/** SPENDLY-709 — the tax builders and firestore.rules must agree. */
const rules = readFileSync("firestore.rules", "utf8");
const section = rules.slice(
  rules.indexOf("SPENDLY-709 Tax & ITR Readiness (epic SPENDLY-288)"),
  rules.indexOf("END SPENDLY-709 tax")
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

const S = { serverTimestamp: () => "ts", deleteField: () => "del" };

describe("enums", () => {
  it.each([
    ["taxEntryKinds", TAX_ENTRY_KINDS],
    ["taxSourceKinds", TAX_SOURCE_KINDS],
    ["taxIncomeCategories", TAX_INCOME_CATEGORIES],
    ["taxReviewDecisions", TAX_REVIEW_DECISIONS],
    ["taxDocumentCategories", TAX_DOCUMENT_CATEGORIES],
  ] as const)("%s matches the TypeScript list", (name, list) => {
    expect(sorted(quoted(fn(name)))).toEqual(sorted(list));
  });

  it.each([
    ["taxTdsFields", "f.form in", TAX_TDS_FORMS],
    ["taxTdsFields", "f.quarter in", TAX_QUARTERS],
    ["taxAisFields", "f.statement in", TAX_STATEMENTS],
    ["taxAisFields", "f.infoCategory in", TAX_AIS_CATEGORIES],
    ["taxDeductionFields", "f.proofStatus in", TAX_PROOF_STATUSES],
    ["taxCapitalGainFields", "f.mode in", TAX_CAPITAL_GAIN_MODES],
    ["taxCapitalGainFields", "f.assetClass in", TAX_ASSET_CLASSES],
    ["taxPaymentFields", "f.paymentType in", TAX_PAYMENT_TYPES],
    ["taxProfileWellFormed", "d.residentialStatus in", TAX_RESIDENTIAL_STATUSES],
    ["taxProfileWellFormed", "d.ageBand in", TAX_AGE_BANDS],
    ["taxProfileWellFormed", "d.regimeNote in", TAX_REGIME_NOTES],
    ["taxDocumentWellFormed", "d.mimeType in", TAX_DOCUMENT_MIME_TYPES],
    ["taxDocumentWellFormed", "d.status in", TAX_DOCUMENT_STATUSES],
    ["taxSnapshotWellFormed", "d.law in", TAX_LAWS],
    ["taxSnapshotWellFormed", "d.reason in", TAX_SNAPSHOT_REASONS],
  ] as const)("%s %s matches the TypeScript list", (name, marker, list) => {
    expect(sorted(listAfter(fn(name), marker))).toEqual(sorted(list));
  });
});

describe("entry fields", () => {
  const ruleFor: Record<TaxEntryKind, string> = {
    income: "taxIncomeFields",
    form16: "taxForm16Fields",
    tds: "taxTdsFields",
    ais_value: "taxAisFields",
    deduction: "taxDeductionFields",
    capital_gain: "taxCapitalGainFields",
    tax_payment: "taxPaymentFields",
  };

  it.each(TAX_ENTRY_KINDS.map((k) => [k] as const))("%s: rules allow exactly the model's fields", (kind) => {
    expect(sorted(hasOnly(ruleFor[kind]))).toEqual(sorted(TAX_ENTRY_FIELD_KEYS[kind]));
  });
});

describe("written documents fit the rules", () => {
  const entryAllowed = hasOnly("taxEntryWellFormed");

  it("every representative entry, its correction and its soft delete", () => {
    for (const draft of ALL_RECORDS) {
      const first = buildTaxEntry({ id: "e1", draft: { ...draft, note: "n", label: "l", documentIds: ["d1"] }, nowMs: 1 });
      if (!first.ok) throw new Error(JSON.stringify(first.issues));
      const create = taxEntryWriteOps("u", first.value, null, S)[0];
      expect(create.op).toBe("set");
      if (create.op === "delete") throw new Error("unexpected");
      for (const key of Object.keys(create.data)) expect(entryAllowed, `${draft.kind}.${key}`).toContain(key);
      for (const key of Object.keys(first.value.fields)) {
        expect(TAX_ENTRY_FIELD_KEYS[draft.kind] as readonly string[]).toContain(key);
      }

      const second = buildTaxEntry({ id: "e1", draft: { ...draft, duplicateConfirmed: true }, previous: first.value, nowMs: 2 });
      if (!second.ok) throw new Error(JSON.stringify(second.issues));
      const update = taxEntryWriteOps("u", second.value, first.value, S)[0];
      if (update.op === "delete") throw new Error("unexpected");
      for (const key of Object.keys(update.data)) expect(entryAllowed).toContain(key);

      const deleted = softDeleteTaxEntry(second.value, { ms: 3, iso: "2026-01-01T00:00:00.000Z" });
      if (!deleted.ok) throw new Error("expected ok");
      const del = taxEntryWriteOps("u", deleted.value, second.value, S)[0];
      if (del.op === "delete") throw new Error("unexpected");
      for (const key of Object.keys(del.data)) expect(entryAllowed).toContain(key);
    }
  });

  it("reviews, profiles, documents and snapshots", () => {
    const review = buildTaxReview({
      fy: "2025-26",
      source: { kind: "income", id: "i1" },
      decision: "replace",
      replacedBy: "e1",
      sourceAmount: 10,
      engineVersion: 1,
      note: "n",
      nowMs: 1,
    });
    const recat = buildTaxReview({
      fy: "2025-26",
      source: { kind: "income", id: "i1" },
      decision: "recategorize",
      category: "dividend",
      sourceAmount: 10,
      previous: review.ok ? review.value : null,
      nowMs: 2,
    });
    if (!review.ok || !recat.ok) throw new Error("expected ok");
    for (const op of [
      ...taxReviewWriteOps("u", review.value, null, S),
      ...taxReviewWriteOps("u", recat.value, review.value, S),
    ]) {
      if (op.op === "delete") throw new Error("unexpected");
      for (const key of Object.keys(op.data)) expect(hasOnly("taxReviewWellFormed")).toContain(key);
    }

    const profile = buildTaxProfile({
      draft: { fy: "2025-26", residentialStatus: "resident", ageBand: "below_60", employerCount: 1, regimeNote: "new", note: "n" },
      nowMs: 1,
    });
    if (!profile.ok) throw new Error("expected ok");
    const profileOp = taxProfileWriteOps("u", profile.value, null, S)[0];
    if (profileOp.op === "delete") throw new Error("unexpected");
    for (const key of Object.keys(profileOp.data)) expect(hasOnly("taxProfileWellFormed")).toContain(key);

    const document: TaxDocument = {
      id: "d1",
      fy: "2025-26",
      category: "form16",
      name: "Form 16",
      note: "n",
      storagePath: "users/u/tax/d1/f.pdf",
      fileName: "f.pdf",
      mimeType: "application/pdf",
      sizeBytes: 10,
      status: "ready",
      entryIds: ["e1"],
      uploadedAtMs: 2,
      schemaVersion: 1,
      createdAtMs: 1,
      updatedAtMs: 2,
    };
    const documentOp = taxDocumentWriteOps("u", document, null, S)[0];
    if (documentOp.op === "delete") throw new Error("unexpected");
    for (const key of Object.keys(documentOp.data)) expect(hasOnly("taxDocumentWellFormed")).toContain(key);

    const snapshot = buildTaxSnapshot({
      fy: "2025-26",
      law: "ITA1961",
      reason: "export",
      ruleVersion: "FY2025-26.v1",
      inputHash: "abc",
      outputs: { taxNew: 100, taxOld: null },
      unresolvedCount: 0,
      createdAtMs: 1_790_000_000_000,
    });
    if (!snapshot.ok) throw new Error(JSON.stringify(snapshot.issues));
    const snapshotOp = taxSnapshotWriteOps("u", snapshot.value, S)[0];
    if (snapshotOp.op === "delete") throw new Error("unexpected");
    for (const key of Object.keys(snapshotOp.data)) expect(hasOnly("taxSnapshotWellFormed")).toContain(key);
  });
});

describe("limits", () => {
  it("history, document links and amounts use the model's bounds", () => {
    expect(fn("taxHistory")).toContain("size() <= 20");
    expect(fn("taxIdList")).toContain("size() <= 20");
    expect(fn("taxMoney")).toContain("v < 1000000000");
    expect(fn("taxDocumentWellFormed")).toContain(`d.sizeBytes <= ${10 * 1024 * 1024}`);
    expect(fn("taxSnapshotWellFormed")).toContain("d.outputs.size() <= 100");
  });

  it("the tax collections stay off the unvalidated catch-all list", () => {
    const catchAll = rules.slice(rules.indexOf("match /{collection}/{document=**}"));
    const names = quoted(catchAll.slice(0, catchAll.indexOf("];")));
    for (const c of ["taxProfiles", "taxEntries", "taxReviews", "taxDocuments", "taxSnapshots"]) {
      expect(names).not.toContain(c);
    }
  });
});
