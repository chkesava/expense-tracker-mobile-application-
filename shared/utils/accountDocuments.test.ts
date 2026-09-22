import { describe, expect, it } from "vitest";

import type { AccountDocument } from "../types/expense";
import {
  ALLOWED_DOCUMENT_TYPES,
  DOCUMENT_NAME_MAX,
  DOCUMENT_NOTE_MAX,
  MAX_DOCUMENT_BYTES,
  PENDING_DOCUMENT_STALE_MS,
  accountDocumentSortMs,
  accountIdForAccountDocumentPath,
  buildAccountDocumentPath,
  documentRejectionReason,
  documentTypeLabel,
  formatDocumentSize,
  isDocumentMetadataValid,
  isPendingDocument,
  isReadyDocument,
  isStalePendingDocument,
  normalizeDocumentMetadata,
  sanitizeDocumentFileName,
  selectAccountDocuments,
  sortAccountDocuments,
  uidForAccountDocumentPath,
} from "./accountDocuments";

function document(
  overrides: Partial<AccountDocument> & { id: string }
): AccountDocument {
  return {
    accountId: "acc-1",
    name: "Statement",
    note: "",
    storagePath: "users/u1/accounts/acc-1/doc1/statement.pdf",
    fileName: "statement.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    status: "ready",
    ...overrides,
  };
}

describe("buildAccountDocumentPath", () => {
  it("puts the uid first so ownership is derivable from the path", () => {
    expect(
      buildAccountDocumentPath({
        uid: "u1",
        accountId: "acc-1",
        documentId: "doc1",
        fileName: "statement.pdf",
      })
    ).toBe("users/u1/accounts/acc-1/doc1/statement.pdf");
  });

  // "Statement.pdf" downloaded twelve months running is the normal case, so the
  // document id has to be its own segment rather than folded into the name.
  it("keeps same-named files apart by document id", () => {
    const a = buildAccountDocumentPath({
      uid: "u1",
      accountId: "acc-1",
      documentId: "doc1",
      fileName: "Statement.pdf",
    });
    const b = buildAccountDocumentPath({
      uid: "u1",
      accountId: "acc-1",
      documentId: "doc2",
      fileName: "Statement.pdf",
    });
    expect(a).not.toBe(b);
  });

  it.each([
    ["uid", { uid: "../etc", accountId: "acc-1", documentId: "doc1" }],
    ["account", { uid: "u1", accountId: "a/b", documentId: "doc1" }],
    ["document", { uid: "u1", accountId: "acc-1", documentId: "" }],
  ])("refuses an unsafe %s segment", (_label, parts) => {
    expect(() =>
      buildAccountDocumentPath({ ...parts, fileName: "x.pdf" } as never)
    ).toThrow();
  });

  it("sanitizes the file name rather than rejecting the upload", () => {
    expect(
      buildAccountDocumentPath({
        uid: "u1",
        accountId: "acc-1",
        documentId: "doc1",
        fileName: "my statement (2026).pdf",
      })
    ).toBe("users/u1/accounts/acc-1/doc1/my_statement__2026_.pdf");
  });
});

describe("sanitizeDocumentFileName", () => {
  it("strips directory components", () => {
    expect(sanitizeDocumentFileName("../../etc/passwd", "doc")).toBe("passwd");
    expect(sanitizeDocumentFileName("C:\\Users\\me\\s.pdf", "doc")).toBe("s.pdf");
  });

  it("refuses to produce a dotfile", () => {
    expect(sanitizeDocumentFileName("...hidden", "doc")).toBe("hidden");
  });

  // A file named entirely in a non-Latin script should still be storable; the
  // user's own name for it lives in Firestore, not in the object key.
  it("falls back rather than failing on an unrepresentable name", () => {
    expect(sanitizeDocumentFileName("…", "doc")).toBe("doc");
    expect(sanitizeDocumentFileName("", "doc")).toBe("doc");
  });
});

describe("uidForAccountDocumentPath", () => {
  it("reads the uid from a well-formed path", () => {
    expect(uidForAccountDocumentPath("users/u1/accounts/acc-1/doc1/s.pdf")).toBe("u1");
  });

  it("reads the account from a well-formed path", () => {
    expect(accountIdForAccountDocumentPath("users/u1/accounts/acc-1/doc1/s.pdf")).toBe(
      "acc-1"
    );
  });

  // These are the cases that matter: the Edge Function takes the uid out of the
  // path, so a malformed path must never reach position 1 with someone else's.
  it.each([
    ["traversal", "users/u1/accounts/acc-1/../../u2/doc1/s.pdf"],
    ["leading slash", "/users/u1/accounts/acc-1/doc1/s.pdf"],
    ["wrong root", "pandals/u1/accounts/acc-1/doc1/s.pdf"],
    ["wrong second segment", "users/u1/notes/acc-1/doc1/s.pdf"],
    ["too few segments", "users/u1/accounts/acc-1/s.pdf"],
    ["too many segments", "users/u1/accounts/acc-1/doc1/sub/s.pdf"],
    ["a space in the file name", "users/u1/accounts/acc-1/doc1/s 1.pdf"],
    ["empty", ""],
    ["non-string", null],
  ])("rejects %s", (_label, path) => {
    expect(uidForAccountDocumentPath(path)).toBeNull();
    expect(accountIdForAccountDocumentPath(path)).toBeNull();
  });

  it("rejects an over-long path", () => {
    expect(
      uidForAccountDocumentPath(`users/u1/accounts/acc-1/doc1/${"a".repeat(600)}.pdf`)
    ).toBeNull();
  });
});

describe("documentRejectionReason", () => {
  it.each(ALLOWED_DOCUMENT_TYPES)("accepts %s", (mimeType) => {
    expect(documentRejectionReason({ mimeType, size: 1024 })).toBeNull();
  });

  it("is case-insensitive about the type", () => {
    expect(documentRejectionReason({ mimeType: "APPLICATION/PDF", size: 10 })).toBeNull();
  });

  it("refuses an executable", () => {
    expect(
      documentRejectionReason({ mimeType: "application/x-msdownload", size: 10 })
    ).toMatch(/PDFs and images/);
  });

  it("refuses a file over the cap", () => {
    expect(
      documentRejectionReason({
        mimeType: "application/pdf",
        size: MAX_DOCUMENT_BYTES + 1,
      })
    ).toMatch(/10 MB/);
  });

  it("accepts a file exactly at the cap", () => {
    expect(
      documentRejectionReason({ mimeType: "application/pdf", size: MAX_DOCUMENT_BYTES })
    ).toBeNull();
  });

  it("refuses an empty file", () => {
    expect(documentRejectionReason({ mimeType: "application/pdf", size: 0 })).toMatch(
      /empty/
    );
  });

  it("refuses a file whose type could not be read", () => {
    expect(documentRejectionReason({ mimeType: "", size: 10 })).toMatch(/type/);
  });

  // The picker does not always report a size; that must not block the upload,
  // because the bucket enforces the limit regardless.
  it("allows an unknown size through to the bucket", () => {
    expect(documentRejectionReason({ mimeType: "application/pdf" })).toBeNull();
  });
});

describe("formatDocumentSize", () => {
  it.each([
    [0, "—"],
    [512, "512 B"],
    [2048, "2 KB"],
    [1024 * 1024 * 2.4, "2.4 MB"],
  ])("formats %d", (bytes, expected) => {
    expect(formatDocumentSize(bytes)).toBe(expected);
  });

  it("shows a dash rather than NaN for a missing size", () => {
    expect(formatDocumentSize(undefined)).toBe("—");
    expect(formatDocumentSize(Number.NaN)).toBe("—");
  });
});

describe("documentTypeLabel", () => {
  it.each([
    ["application/pdf", "PDF"],
    ["image/jpeg", "JPEG"],
    ["image/png", "PNG"],
    ["image/webp", "WebP"],
    ["application/zip", "File"],
    [undefined, "File"],
  ])("labels %s", (mimeType, expected) => {
    expect(documentTypeLabel(mimeType)).toBe(expected);
  });
});

describe("sorting and selection", () => {
  it("puts the newest upload first", () => {
    const sorted = sortAccountDocuments([
      document({ id: "old", uploadedAtMs: 1_000 }),
      document({ id: "new", uploadedAtMs: 9_000 }),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(["new", "old"]);
  });

  it("breaks ties on id so the order is stable across renders", () => {
    const input = [
      document({ id: "z", uploadedAtMs: 1_000 }),
      document({ id: "a", uploadedAtMs: 1_000 }),
    ];
    expect(sortAccountDocuments(input).map((e) => e.id)).toEqual(["a", "z"]);
    expect(sortAccountDocuments([...input].reverse()).map((e) => e.id)).toEqual([
      "a",
      "z",
    ]);
  });

  it("does not mutate its input", () => {
    const input = [
      document({ id: "a", uploadedAtMs: 1 }),
      document({ id: "b", uploadedAtMs: 2 }),
    ];
    sortAccountDocuments(input);
    expect(input.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("keeps only the requested account's documents", () => {
    const selected = selectAccountDocuments(
      [
        document({ id: "mine", accountId: "acc-1" }),
        document({ id: "theirs", accountId: "acc-2" }),
      ],
      "acc-1"
    );
    expect(selected.map((e) => e.id)).toEqual(["mine"]);
  });

  // Switching accounts leaves the previous account's documents in state until
  // the next read lands; showing those under the new name would be a bug.
  it("shows nothing from the previous account while the next read is in flight", () => {
    const stale = [document({ id: "s1", accountId: "acc-1" })];
    expect(selectAccountDocuments(stale, "acc-2")).toEqual([]);
  });

  it("returns nothing for a missing account id", () => {
    expect(selectAccountDocuments([document({ id: "a" })], "")).toEqual([]);
  });

  it("returns 0 for a document with no upload stamp", () => {
    expect(accountDocumentSortMs(document({ id: "a" }))).toBe(0);
  });
});

describe("pending uploads", () => {
  it("distinguishes pending from ready", () => {
    expect(isPendingDocument(document({ id: "a", status: "pending" }))).toBe(true);
    expect(isReadyDocument(document({ id: "a", status: "pending" }))).toBe(false);
    expect(isReadyDocument(document({ id: "a", status: "ready" }))).toBe(true);
  });

  it("does not call a ready document stale", () => {
    expect(
      isStalePendingDocument(document({ id: "a", uploadedAtMs: 0 }), 10_000_000)
    ).toBe(false);
  });

  // Long enough not to sweep up a genuinely slow upload mid-flight.
  it("leaves a recent pending upload alone", () => {
    const now = 1_000_000_000;
    expect(
      isStalePendingDocument(
        document({ id: "a", status: "pending", uploadedAtMs: now - 60_000 }),
        now
      )
    ).toBe(false);
  });

  it("calls an abandoned pending upload stale", () => {
    const now = 1_000_000_000;
    expect(
      isStalePendingDocument(
        document({
          id: "a",
          status: "pending",
          uploadedAtMs: now - PENDING_DOCUMENT_STALE_MS - 1,
        }),
        now
      )
    ).toBe(true);
  });

  it("treats a pending row with no stamp as stale", () => {
    expect(isStalePendingDocument(document({ id: "a", status: "pending" }), 1)).toBe(
      true
    );
  });
});

describe("metadata", () => {
  it("trims and clamps", () => {
    const normalized = normalizeDocumentMetadata({
      name: `  ${"n".repeat(DOCUMENT_NAME_MAX + 20)}  `,
      note: `  ${"b".repeat(DOCUMENT_NOTE_MAX + 20)}  `,
    });
    expect(normalized.name).toHaveLength(DOCUMENT_NAME_MAX);
    expect(normalized.note).toHaveLength(DOCUMENT_NOTE_MAX);
  });

  it("requires a name but not a note", () => {
    expect(isDocumentMetadataValid({ name: "Statement" })).toBe(true);
    expect(isDocumentMetadataValid({ name: "   " })).toBe(false);
    expect(isDocumentMetadataValid({})).toBe(false);
  });
});

describe("documents stay out of the financial record", () => {
  // The ticket asks that documents not be embedded in statement exports. They
  // cannot be: the export builds from account activities, and a document has
  // no field an activity-shaped consumer could read -- no amount, no date key.
  it("exposes no money-shaped fields", () => {
    const shape = document({ id: "a", uploadedAtMs: 1, updatedAtMs: 2 });
    expect(shape).not.toHaveProperty("amount");
    expect(shape).not.toHaveProperty("date");
    expect(Object.keys(shape).sort()).toEqual([
      "accountId",
      "fileName",
      "id",
      "mimeType",
      "name",
      "note",
      "sizeBytes",
      "status",
      "storagePath",
      "updatedAtMs",
      "uploadedAtMs",
    ]);
  });

  // A URL here would rot: the signed URLs for these objects expire in minutes.
  it("stores an object key, never a URL", () => {
    const shape = document({ id: "a" });
    expect(shape.storagePath.startsWith("http")).toBe(false);
    expect(uidForAccountDocumentPath(shape.storagePath)).not.toBeNull();
  });
});
