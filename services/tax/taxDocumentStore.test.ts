import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SPENDLY-298: the tax document store against a fake Firestore (writes land in
 * a map the next read sees) and a fake files client. What matters is the
 * order: the row before the file, the file only once the row is on the
 * server, and on delete the file before the links and the row.
 */

type FakeRef = { path: string; id: string };
const docs = new Map<string, Record<string, unknown>>();
const events: string[] = [];
let outcome: "acked" | "queued" = "acked";

vi.mock("firebase/firestore", () => {
  const snap = (ref: FakeRef) => {
    const data = docs.get(ref.path);
    return { id: ref.id, exists: () => data !== undefined, data: () => data };
  };
  return {
    // doc(collectionRef) mints an id; doc(db, ...segments) names a document.
    doc: (first: { path?: string }, ...segments: string[]): FakeRef =>
      segments.length === 0
        ? { path: `${first.path}/new-id`, id: "new-id" }
        : { path: segments.join("/"), id: segments[segments.length - 1] },
    collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
    query: (ref: { path: string }, ...constraints: { field: string; value: unknown }[]) => ({ ref, constraints }),
    where: (field: string, _op: string, value: unknown) => ({ field, value }),
    limit: () => ({}),
    getDocFromCache: vi.fn(async () => {
      throw new Error("not cached");
    }),
    getDoc: vi.fn(async (ref: FakeRef) => snap(ref)),
    getDocs: vi.fn(async (q: { ref: { path: string }; constraints: { field: string; value: unknown }[] }) => {
      const id = q.constraints.find((c) => c.field === "documentIds")?.value;
      const matches = [...docs.entries()].filter(
        ([path, data]) => path.startsWith(`${q.ref.path}/`) && ((data.documentIds as string[] | undefined) ?? []).includes(id as string)
      );
      return {
        docs: matches.map(([path, data]) => ({ id: path.split("/").pop(), data: () => data })),
        metadata: { fromCache: false },
      };
    }),
    serverTimestamp: () => ({ __ts: true }),
    deleteField: () => ({ __delete: true }),
  };
});

vi.mock("@/lib/firebase", () => ({ getFirestoreDb: () => ({ __db: true }) }));
vi.mock("@/lib/firestoreReadDebug", () => ({ logDirectRead: () => undefined }));

vi.mock("@/lib/commitMutations", () => ({
  commitMutations: vi.fn(async (_uid: string, ops: { op: string; ref: { path: string }; data?: Record<string, unknown> }[]) => {
    for (const op of ops) {
      events.push(`${op.op} ${op.ref.path}`);
      if (op.op === "delete") docs.delete(op.ref.path);
      else if (op.op === "set") docs.set(op.ref.path, { ...op.data });
      else {
        const next = { ...(docs.get(op.ref.path) ?? {}) };
        for (const [k, v] of Object.entries(op.data ?? {})) {
          if (v && typeof v === "object" && "__delete" in v) delete next[k];
          else next[k] = v;
        }
        docs.set(op.ref.path, next);
      }
    }
    return outcome;
  }),
}));

const files = {
  upload: vi.fn(async (path: string) => void events.push(`upload ${path}`)),
  remove: vi.fn(async (path: string) => void events.push(`remove ${path}`)),
};
vi.mock("@/services/accounts/spendlyFilesClient", () => ({
  uploadDocumentObject: (path: string) => files.upload(path),
  removeDocumentObject: (path: string) => files.remove(path),
  createDocumentSignedUrl: async (path: string) => `https://signed/${path}`,
  friendlyDocumentError: (_e: unknown, fallback: string) => new Error(fallback),
}));

const store = await import("./taxDocumentStore");
const { saveTaxEntry } = await import("./taxStore");

const FILE = { uri: "file:///f16.pdf", fileName: "Form16.pdf", mimeType: "application/pdf", size: 1234 };
const DOC_PATH = "users/u1/taxDocuments/new-id";

beforeEach(() => {
  docs.clear();
  events.length = 0;
  outcome = "acked";
  files.upload.mockReset().mockImplementation(async (path: string) => void events.push(`upload ${path}`));
  files.remove.mockReset().mockImplementation(async (path: string) => void events.push(`remove ${path}`));
});

describe("addTaxDocument", () => {
  it("writes the pending row, uploads, then marks it ready", async () => {
    const r = await store.addTaxDocument("u1", { fy: "2025-26", category: "form16", name: "Form 16 – Acme", file: FILE });
    expect(r).toEqual({ ok: true, id: "new-id" });
    expect(events).toEqual([`set ${DOC_PATH}`, "upload users/u1/tax/new-id/Form16.pdf", `update ${DOC_PATH}`]);
    expect(docs.get(DOC_PATH)).toMatchObject({ status: "ready", name: "Form 16 – Acme", category: "form16", fy: "2025-26" });
  });

  it("doesn't upload while the row is only queued (offline): it stays pending to retry", async () => {
    outcome = "queued";
    const r = await store.addTaxDocument("u1", { fy: "2025-26", category: "ais", name: "", file: FILE });
    expect(r).toMatchObject({ ok: false, pending: true, id: "new-id" });
    expect(files.upload).not.toHaveBeenCalled();
    expect(docs.get(DOC_PATH)).toMatchObject({ status: "pending" });
  });

  it("leaves a visible pending row when the upload fails, and a retry finishes it", async () => {
    files.upload.mockRejectedValueOnce(new Error("network"));
    const r = await store.addTaxDocument("u1", { fy: "2025-26", category: "form16", name: "x", file: FILE });
    expect(r).toMatchObject({ ok: false, pending: true });
    expect(docs.get(DOC_PATH)).toMatchObject({ status: "pending" });
    const pending = { ...(docs.get(DOC_PATH) as object), id: "new-id" } as never;
    expect(await store.retryTaxDocumentUpload("u1", pending, FILE)).toEqual({ ok: true, id: "new-id" });
    expect(docs.get(DOC_PATH)).toMatchObject({ status: "ready" });
  });

  it("refuses a file it can't store before writing anything", async () => {
    const r = await store.addTaxDocument("u1", { fy: "2025-26", category: "form16", name: "x", file: { ...FILE, mimeType: "text/html" } });
    expect(r).toMatchObject({ ok: false });
    expect(events).toEqual([]);
  });
});

describe("deleteTaxDocument", () => {
  async function readyDoc() {
    await store.addTaxDocument("u1", { fy: "2025-26", category: "form16", name: "x", file: FILE });
    return { ...(docs.get(DOC_PATH) as object), id: "new-id" } as never as Parameters<typeof store.deleteTaxDocument>[1];
  }

  it("removes the file, then the links from entries, then the row", async () => {
    const document = await readyDoc();
    await saveTaxEntry("u1", "e1", {
      fy: "2025-26",
      kind: "income",
      fields: { category: "rental", amount: 1000 },
      documentIds: ["new-id", "other"],
    });
    events.length = 0;
    expect(await store.deleteTaxDocument("u1", document)).toEqual({ ok: true });
    expect(events).toEqual(["remove users/u1/tax/new-id/Form16.pdf", "update users/u1/taxEntries/e1", `delete ${DOC_PATH}`]);
    expect(docs.get("users/u1/taxEntries/e1")).toMatchObject({ documentIds: ["other"], revision: 2 });
    expect(docs.has(DOC_PATH)).toBe(false);
  });

  it("keeps everything when a ready file can't be removed, so the user can try again", async () => {
    const document = await readyDoc();
    events.length = 0;
    files.remove.mockRejectedValueOnce(new Error("503"));
    expect(await store.deleteTaxDocument("u1", document)).toMatchObject({ ok: false });
    expect(events).toEqual([]);
    expect(docs.has(DOC_PATH)).toBe(true);
  });

  it("clears a pending row even when its file never landed", async () => {
    files.upload.mockRejectedValueOnce(new Error("network"));
    await store.addTaxDocument("u1", { fy: "2025-26", category: "form16", name: "x", file: FILE });
    const pending = { ...(docs.get(DOC_PATH) as object), id: "new-id" } as never;
    files.remove.mockRejectedValueOnce(new Error("not found"));
    expect(await store.deleteTaxDocument("u1", pending)).toEqual({ ok: true });
    expect(docs.has(DOC_PATH)).toBe(false);
  });
});
