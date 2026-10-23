import { describe, expect, it } from "vitest";

import { purgedUidsBatch, readModelUidHash } from "./lib/readmodelPurged";

/** SPENDLY-520 / PR #234 review — erased accounts looked up in batches by hash. */
describe("purged accounts by hash", () => {
  it("hashes like readmodel_uid_hash: hex sha256 of the UTF-8 uid", () => {
    // sha256("abc"), the FIPS 180-2 test vector.
    expect(readModelUidHash("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("queries purged_users by hash in chunks and maps hits back to uids", async () => {
    const calls: string[][] = [];
    const purged = new Set([readModelUidHash("u5"), readModelUidHash("u250")]);
    const client = {
      from: (table: string) => ({
        select: () => ({
          in: async (_col: string, hashes: string[]) => {
            expect(table).toBe("purged_users");
            calls.push(hashes);
            return { data: hashes.filter((h) => purged.has(h)).map((uid_hash) => ({ uid_hash })), error: null };
          },
        }),
      }),
    };
    const uids = Array.from({ length: 300 }, (_, i) => `u${i}`);
    const out = await purgedUidsBatch(client as never, uids);
    expect([...out].sort()).toEqual(["u250", "u5"]);
    expect(calls.map((c) => c.length)).toEqual([200, 100]);
  });

  it("fails loudly on a database error rather than treating everyone as not purged", async () => {
    const client = { from: () => ({ select: () => ({ in: async () => ({ data: null, error: { message: "denied" } }) }) }) };
    await expect(purgedUidsBatch(client as never, ["u1"])).rejects.toThrow(/purged_users: denied/);
  });
});
