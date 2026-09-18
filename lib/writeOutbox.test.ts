import { beforeEach, describe, expect, it } from "vitest";

import {
  WRITE_OUTBOX_MAX_ENTRIES,
  WRITE_OUTBOX_STORAGE_KEY,
  appendWriteOutbox,
  listWriteOutbox,
  removeWriteOutbox,
  resetWriteOutboxForTests,
  type WriteOutboxEntry,
} from "./writeOutbox";

const disk = new Map<string, string>();

const storage = {
  getItem: async (key: string) => disk.get(key) ?? null,
  setItem: async (key: string, value: string) => {
    disk.set(key, value);
  },
};

function entry(id: string, uid = "u1"): WriteOutboxEntry {
  return {
    id,
    uid,
    createdAt: 1,
    ops: [{ op: "set", path: `users/${uid}/expenses/${id}`, data: { amount: 10 } }],
    nonIdempotent: false,
  };
}

beforeEach(() => {
  disk.clear();
  resetWriteOutboxForTests(storage);
});

describe("writeOutbox", () => {
  it("persists an entry and reads it back after a restart", async () => {
    await appendWriteOutbox(entry("e1"));
    resetWriteOutboxForTests(storage);

    const loaded = await listWriteOutbox("u1");
    expect(loaded.map((item) => item.id)).toEqual(["e1"]);
    expect(disk.get(WRITE_OUTBOX_STORAGE_KEY)).toContain("e1");
  });

  it("scopes entries to the writing uid", async () => {
    await appendWriteOutbox(entry("e1", "u1"));
    await appendWriteOutbox(entry("e2", "u2"));
    expect((await listWriteOutbox("u1")).map((item) => item.id)).toEqual(["e1"]);
  });

  it("drops an entry once the server has acked it", async () => {
    await appendWriteOutbox(entry("e1"));
    await removeWriteOutbox("e1");
    expect(await listWriteOutbox("u1")).toEqual([]);
  });

  it("refuses to grow past the cap", async () => {
    for (let i = 0; i < WRITE_OUTBOX_MAX_ENTRIES; i += 1) {
      await appendWriteOutbox(entry(`e${i}`));
    }
    await expect(appendWriteOutbox(entry("overflow"))).rejects.toThrow(
      "Too many unsynced changes"
    );
  });
});
