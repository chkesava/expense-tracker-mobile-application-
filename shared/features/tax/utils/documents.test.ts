import { describe, expect, it } from "vitest";

import type { TaxDocument } from "../types";
import {
  buildTaxDocumentPath,
  editedTaxDocument,
  groupTaxDocuments,
  isStuckTaxDocument,
  linkedTaxDocuments,
  newTaxDocument,
  readyTaxDocument,
  taxFileRejection,
} from "./documents";
import { validateTaxDocument } from "./validation";

const pdf = { uri: "file:///f16.pdf", fileName: "Form 16 (Acme) FY25.pdf", mimeType: "application/pdf", size: 120_000 };

function doc(id: string, patch: Partial<TaxDocument> = {}): TaxDocument {
  const r = newTaxDocument({ uid: "u1", id, fy: "2025-26", category: "form16", name: "", file: pdf, nowMs: 1_000 });
  if (!r.ok) throw new Error("expected ok");
  return { ...r.value, ...patch };
}

describe("paths", () => {
  it("puts the file under the user's own tax folder with a safe key", () => {
    expect(buildTaxDocumentPath("u1", "td1", "Form 16 (Acme) FY25.pdf")).toEqual({
      storagePath: "users/u1/tax/td1/Form_16__Acme__FY25.pdf",
      fileName: "Form_16__Acme__FY25.pdf",
    });
    expect(buildTaxDocumentPath("u1", "td1", "फ़ॉर्म.pdf").fileName).toMatch(/^_+.pdf$/);
    expect(buildTaxDocumentPath("u1", "td1", "....").fileName).toBe("document");
  });

  it("refuses unsafe ids", () => {
    expect(() => buildTaxDocumentPath("a/b", "td1", "x.pdf")).toThrow();
    expect(() => buildTaxDocumentPath("u1", "../x", "x.pdf")).toThrow();
  });
});

describe("taxFileRejection", () => {
  it("allows PDFs and images up to 10 MB", () => {
    expect(taxFileRejection(pdf)).toBeNull();
    expect(taxFileRejection({ mimeType: "IMAGE/JPEG", size: 10 })).toBeNull();
    expect(taxFileRejection({ mimeType: "text/html", size: 10 })).toMatch(/Only PDFs/);
    expect(taxFileRejection({ mimeType: "application/pdf", size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
    expect(taxFileRejection({ mimeType: "application/pdf", size: 0 })).toMatch(/empty/);
  });
});

describe("the metadata row", () => {
  it("starts pending, keeps the user's name, and passes the stored-shape checks", () => {
    const d = doc("td1");
    expect(d).toMatchObject({
      id: "td1",
      fy: "2025-26",
      category: "form16",
      name: "Form 16 (Acme) FY25.pdf",
      storagePath: "users/u1/tax/td1/Form_16__Acme__FY25.pdf",
      fileName: "Form_16__Acme__FY25.pdf",
      status: "pending",
      sizeBytes: 120_000,
    });
    expect(validateTaxDocument("u1", d)).toEqual([]);
    expect(validateTaxDocument("u2", d)).toContainEqual({ field: "storagePath", code: "not_owner" });
  });

  it("refuses a file that can't be stored, with a reason", () => {
    const r = newTaxDocument({ uid: "u1", id: "td1", fy: "2025-26", category: "ais", name: "x", file: { ...pdf, mimeType: "text/plain" }, nowMs: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Only PDFs/);
  });

  it("becomes ready once the file lands", () => {
    expect(readyTaxDocument(doc("td1"), 5_000)).toMatchObject({ status: "ready", uploadedAtMs: 5_000, updatedAtMs: 5_000 });
  });

  it("edits the name, note and category, never the file", () => {
    const edited = editedTaxDocument(doc("td1", { note: "old" }), { name: " Form 16 ", category: "form16a" }, 9);
    expect(edited).toMatchObject({ name: "Form 16", category: "form16a", storagePath: "users/u1/tax/td1/Form_16__Acme__FY25.pdf" });
    expect(edited).not.toHaveProperty("note");
  });

  it("calls an upload stuck after 15 minutes pending", () => {
    expect(isStuckTaxDocument(doc("td1"), 1_000 + 15 * 60 * 1000 + 1)).toBe(true);
    expect(isStuckTaxDocument(doc("td1"), 1_000 + 60_000)).toBe(false);
    expect(isStuckTaxDocument(readyTaxDocument(doc("td1"), 1_000), 10 ** 12)).toBe(false);
  });
});

describe("grouping and links", () => {
  it("groups by category in a fixed order, newest first", () => {
    const groups = groupTaxDocuments([
      doc("a", { category: "ais", createdAtMs: 1 }),
      doc("b", { category: "form16", createdAtMs: 1 }),
      doc("c", { category: "form16", createdAtMs: 2 }),
    ]);
    expect(groups.map((g) => [g.category, g.documents.map((d) => d.id)])).toEqual([
      ["form16", ["c", "b"]],
      ["ais", ["a"]],
    ]);
  });

  it("drops links to documents that no longer exist", () => {
    expect(linkedTaxDocuments(["a", "gone", "b"], [doc("a"), doc("b")]).map((d) => d.id)).toEqual(["a", "b"]);
    expect(linkedTaxDocuments(undefined, [doc("a")])).toEqual([]);
  });
});
