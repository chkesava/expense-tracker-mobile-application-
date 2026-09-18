import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FakeRef = { path: string };
type Write = { path: string; data: Record<string, unknown>; kind: string };

const docs = new Map<string, Record<string, unknown>>();
const writes: Write[] = [];
let commits = 0;
let commitOutcome: "acked" | "queued" | "unsafe" = "acked";

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
  getDoc: vi.fn(async (ref: FakeRef) => ({
    exists: () => docs.has(ref.path),
    data: () => docs.get(ref.path),
  })),
  writeBatch: () => ({
    set: (ref: FakeRef, data: Record<string, unknown>) => {
      writes.push({ path: ref.path, data, kind: "set" });
      docs.set(ref.path, { ...(docs.get(ref.path) ?? {}), ...data });
    },
    update: (ref: FakeRef, data: Record<string, unknown>) => {
      writes.push({ path: ref.path, data, kind: "update" });
      docs.set(ref.path, { ...(docs.get(ref.path) ?? {}), ...data });
    },
    delete: (ref: FakeRef) => {
      writes.push({ path: ref.path, data: {}, kind: "delete" });
      docs.delete(ref.path);
    },
    commit: async () => {
      commits += 1;
    },
  }),
  serverTimestamp: () => ({ _methodName: "serverTimestamp" }),
  increment: (n: number) => ({ _methodName: "increment", _operand: n }),
  arrayUnion: (...values: unknown[]) => ({ _methodName: "arrayUnion", _elements: values }),
  arrayRemove: (...values: unknown[]) => ({ _methodName: "arrayRemove", _elements: values }),
  deleteField: () => ({ _methodName: "deleteField" }),
  Timestamp: class {
    seconds: number;
    nanoseconds: number;
    constructor(seconds: number, nanoseconds: number) {
      this.seconds = seconds;
      this.nanoseconds = nanoseconds;
    }
    toMillis() {
      return this.seconds * 1000;
    }
  },
}));

vi.mock("@/lib/firebase", () => ({
  getFirestoreDb: () => ({ __db: true }),
}));

vi.mock("@/lib/id", () => ({
  newId: () => "outbox-1",
}));

vi.mock("@/lib/firestoreWrite", () => ({
  commitWrite: async (
    run: () => Promise<unknown>,
    _options: { durable?: boolean; onLateFailure?: (error: unknown) => void }
  ) => {
    await run();
    return commitOutcome;
  },
  reportLateWriteFailure: vi.fn(),
}));

import {
  WRITE_OUTBOX_STORAGE_KEY,
  listWriteOutbox,
  resetWriteOutboxForTests,
} from "./writeOutbox";
import {
  commitMutations,
  replayWriteOutbox,
  setWriteOutboxPersistForTests,
} from "./commitMutations";

const disk = new Map<string, string>();

beforeEach(() => {
  disk.clear();
  docs.clear();
  writes.length = 0;
  commits = 0;
  commitOutcome = "acked";
  resetWriteOutboxForTests({
    getItem: async (key: string) => disk.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      disk.set(key, value);
    },
  });
  setWriteOutboxPersistForTests(true);
});

afterEach(() => {
  setWriteOutboxPersistForTests(null);
  resetWriteOutboxForTests(null);
});

describe("commitMutations", () => {
  it("journals before the SDK write and drops the row once acked", async () => {
    const outcome = await commitMutations(
      "u1",
      [
        {
          op: "set",
          ref: { path: "users/u1/expenses/e1" },
          data: { amount: 12, note: "Tea" },
        },
      ],
      { label: "expense" }
    );

    expect(outcome).toBe("acked");
    expect(commits).toBe(1);
    expect(writes.some((write) => write.path === "users/u1/expenses/e1")).toBe(true);
    expect(writes.some((write) => write.path === "users/u1/meta/outboxAck_outbox-1")).toBe(
      true
    );
    expect(await listWriteOutbox("u1")).toEqual([]);
  });

  it("keeps the journal when the write is only queued", async () => {
    commitOutcome = "queued";
    const outcome = await commitMutations(
      "u1",
      [{ op: "set", ref: { path: "users/u1/expenses/e1" }, data: { amount: 12 } }],
      { label: "expense" }
    );
    expect(outcome).toBe("queued");
    expect((await listWriteOutbox("u1")).map((entry) => entry.id)).toEqual(["outbox-1"]);
    expect(disk.get(WRITE_OUTBOX_STORAGE_KEY)).toContain("expenses/e1");
  });

  it("does not run the write when the journal cannot be persisted", async () => {
    resetWriteOutboxForTests({
      getItem: async () => null,
      setItem: async () => {
        throw new Error("disk full");
      },
    });
    await expect(
      commitMutations("u1", [
        { op: "set", ref: { path: "users/u1/expenses/e1" }, data: { amount: 1 } },
      ])
    ).rejects.toThrow("disk full");
    expect(commits).toBe(0);
  });

  it("replays a queued expense after a process restart", async () => {
    commitOutcome = "queued";
    await commitMutations("u1", [
      { op: "set", ref: { path: "users/u1/expenses/e1" }, data: { amount: 12 } },
    ]);
    resetWriteOutboxForTests({
      getItem: async (key: string) => disk.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        disk.set(key, value);
      },
    });
    writes.length = 0;
    commits = 0;
    commitOutcome = "acked";

    await replayWriteOutbox("u1");

    expect(commits).toBe(1);
    expect(writes.some((write) => write.path === "users/u1/expenses/e1")).toBe(true);
    expect(await listWriteOutbox("u1")).toEqual([]);
  });

  it("skips a non-idempotent replay when the ack doc already exists", async () => {
    commitOutcome = "queued";
    await commitMutations("u1", [
      {
        op: "update",
        ref: { path: "users/u1/trips/t1" },
        data: { spentAmount: { _methodName: "increment", _operand: 5 } },
      },
    ]);
    docs.set("users/u1/meta/outboxAck_outbox-1", { createdAt: 1 });
    resetWriteOutboxForTests({
      getItem: async (key: string) => disk.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        disk.set(key, value);
      },
    });
    writes.length = 0;
    commits = 0;

    await replayWriteOutbox("u1");

    expect(commits).toBe(0);
    expect(await listWriteOutbox("u1")).toEqual([]);
  });
});
