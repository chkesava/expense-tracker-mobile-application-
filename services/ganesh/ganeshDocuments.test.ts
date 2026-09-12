import { beforeEach, describe, expect, it, vi } from "vitest";

type FakeRef = { path: string };
type Write = { path: string; data: Record<string, unknown>; merge?: boolean };

const fakeDoc = (_db: unknown, ...segments: string[]): FakeRef => ({
  path: segments.join("/"),
});

const docs = new Map<string, Record<string, unknown>>();

vi.mock("firebase/firestore", () => ({
  doc: (db: unknown, ...segments: string[]) => fakeDoc(db, ...segments),
  getDoc: vi.fn(async (ref: FakeRef) => ({
    exists: () => docs.has(ref.path),
    data: () => docs.get(ref.path) ?? {},
  })),
  deleteField: () => ({ __deleteField: true }),
  serverTimestamp: () => ({ __serverTimestamp: true }),
  writeBatch: vi.fn(),
}));

vi.mock("@/lib/firestoreWrite", () => ({
  commitWrite: async (fn: () => Promise<unknown>) => {
    await fn();
    return "acked";
  },
}));

let idCounter = 0;
vi.mock("@/lib/id", () => ({
  newId: () => `id-${++idCounter}`,
}));

import { getDoc, writeBatch } from "firebase/firestore";

import {
  appendVaultIndexUpsert,
  archivePandalDocument,
  attachDocumentFile,
  createFestivalDocument,
} from "./ganeshDocuments";
import { attachExpenseReceipt } from "./ganeshWrites";

function makeRecorder() {
  const writes: Write[] = [];
  const writer = {
    set: (ref: FakeRef, data: Record<string, unknown>, options?: { merge?: boolean }) => {
      writes.push({ path: ref.path, data, merge: options?.merge });
      const previous = docs.get(ref.path) ?? {};
      docs.set(ref.path, options?.merge ? { ...previous, ...data } : data);
    },
    update: (ref: FakeRef, data: Record<string, unknown>) => {
      writes.push({ path: ref.path, data });
      docs.set(ref.path, { ...(docs.get(ref.path) ?? {}), ...data });
    },
    commit: async () => undefined,
  };
  return { writes, writer };
}

const actor = { uid: "u1", displayName: "Treasurer" };
const file = {
  path: "pandals/p1/festivals/f1/expenses/e1/receipt.jpg",
  fileName: "receipt.jpg",
  mimeType: "image/jpeg" as const,
  size: 12000,
};

beforeEach(() => {
  docs.clear();
  idCounter = 0;
  vi.mocked(writeBatch).mockReset();
  vi.mocked(getDoc).mockClear();
});

describe("document vault index", () => {
  it("upserts a deterministic vault row for an entity attachment", () => {
    const { writes, writer } = makeRecorder();
    const id = appendVaultIndexUpsert(writer as never, {} as never, actor, {
      pandalId: "p1",
      festivalId: "f1",
      entityType: "expense",
      entityId: "e1",
      category: "expense_receipt",
      file,
    });

    expect(id).toBe("expense_e1");
    const vault = writes.find((w) => w.path === "pandals/p1/documents/expense_e1");
    expect(vault?.merge).toBe(true);
    expect(vault?.data.storagePath).toBe(file.path);
    expect(vault?.data.entityType).toBe("expense");
    expect(vault?.data.status).toBe("active");
  });

  it("indexes a vault row when an expense receipt is attached", async () => {
    const { writes, writer } = makeRecorder();
    docs.set("pandals/p1/festivals/f1/expenses/e1", {
      name: "Chairs",
      totalAmount: 15000,
    });
    vi.mocked(writeBatch).mockReturnValue(writer as never);

    const previous = await attachExpenseReceipt(
      {} as never,
      actor as never,
      "p1",
      "f1",
      "e1",
      file
    );

    expect(previous).toBeUndefined();
    const vault = writes.find((w) => w.path === "pandals/p1/documents/expense_e1");
    expect(vault?.data.storagePath).toBe(file.path);
    expect(vault?.data.category).toBe("expense_receipt");
    const expense = writes.find((w) => w.path.includes("/expenses/e1"));
    expect(expense?.data.receipt).toEqual(file);
  });

  it("creates a festival document shell without inventing money fields", async () => {
    const { writes, writer } = makeRecorder();
    vi.mocked(writeBatch).mockReturnValue(writer as never);

    const id = await createFestivalDocument({} as never, actor, "p1", {
      festivalId: "f1",
      category: "festival_document",
      description: "Sound quotation",
    });

    const docWrite = writes.find((w) => w.path === `pandals/p1/documents/${id}`);
    expect(docWrite?.data.festivalId).toBe("f1");
    expect(docWrite?.data.entityType).toBe("festival");
    expect(docWrite?.data.storagePath).toBe("");
    expect(docWrite?.data).not.toHaveProperty("amount");
    expect(docWrite?.data).not.toHaveProperty("godFundAmount");
  });

  it("attaches a file to a festival document and archives without deleting", async () => {
    const { writer } = makeRecorder();
    docs.set("pandals/p1/documents/d1", {
      pandalId: "p1",
      festivalId: "f1",
      entityType: "festival",
      entityId: "d1",
      category: "festival_document",
      status: "active",
      storagePath: "",
      fileName: "",
      mimeType: "image/jpeg",
      fileSize: 0,
    });
    vi.mocked(writeBatch).mockReturnValue(writer as never);

    await attachDocumentFile({} as never, actor, "p1", "d1", file);
    expect(docs.get("pandals/p1/documents/d1")?.storagePath).toBe(file.path);

    await archivePandalDocument({} as never, actor, "p1", "d1", "No longer needed");
    expect(docs.get("pandals/p1/documents/d1")?.status).toBe("archived");
    expect(docs.has("pandals/p1/documents/d1")).toBe(true);
  });
});
