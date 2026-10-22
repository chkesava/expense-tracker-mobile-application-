import { describe, expect, it, vi } from "vitest";

import { compareLedgerRows, createReadPath, ReadModelTimeout } from "./readPath";

const deps = () => {
  const log = vi.fn();
  let t = 0;
  return { log, path: createReadPath({ timeoutMs: 50, log, now: () => (t += 1000), shadowLogIntervalMs: 5000 }) };
};

describe("read path (SPENDLY-511)", () => {
  it("firestore mode runs only the Firestore source", async () => {
    const { path } = deps();
    const supabase = vi.fn(async () => ["s"]);
    const r = await path.read("journal", "firestore", { firestore: async () => ["f"], supabase });
    expect(r).toEqual({ value: ["f"], servedBy: "firestore" });
    expect(supabase).not.toHaveBeenCalled();
  });

  it("supabase mode serves the read model", async () => {
    const { path } = deps();
    const firestore = vi.fn(async () => ["f"]);
    const r = await path.read("journal", "supabase", { firestore, supabase: async () => ["s"] });
    expect(r).toEqual({ value: ["s"], servedBy: "supabase" });
    expect(firestore).not.toHaveBeenCalled();
  });

  it("on an error falls back to Firestore for the rest of the session, logging once", async () => {
    const { path, log } = deps();
    const supabase = vi.fn(async () => {
      throw new Error("HTTP 540 paused");
    });
    const first = await path.read("journal", "supabase", { firestore: async () => ["f"], supabase });
    const second = await path.read("journal", "supabase", { firestore: async () => ["f2"], supabase });
    expect(first.servedBy).toBe("firestore");
    expect(second).toEqual({ value: ["f2"], servedBy: "firestore" });
    expect(supabase).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
    expect(path.fellBack("journal")).toBe(true);
    path.reset();
    expect(path.fellBack("journal")).toBe(false);
  });

  it("on a timeout falls back to Firestore within the budget", async () => {
    const { path, log } = deps();
    const started = Date.now();
    const r = await path.read("journal", "supabase", {
      firestore: async () => ["f"],
      supabase: () => new Promise(() => {}),
    });
    expect(r.servedBy).toBe("firestore");
    expect(Date.now() - started).toBeLessThan(1000);
    expect(log.mock.calls[0][1]).toBeInstanceOf(ReadModelTimeout);
  });

  it("shadow serves Firestore, compares in the background, and rate-limits the diff log", async () => {
    const { path, log } = deps();
    const sources = {
      firestore: async () => [{ id: "a", amount: 1, date: "2026-10-01" }],
      supabase: async () => [{ id: "a", amount: 2, date: "2026-10-01" }, { id: "b", amount: 3, date: "2026-10-02" }],
      compare: compareLedgerRows,
    };
    const r = await path.read("journal", "shadow", sources);
    expect(r).toEqual({ value: [{ id: "a", amount: 1, date: "2026-10-01" }], servedBy: "firestore" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(log).toHaveBeenCalledWith("readModel.shadow.journal", { differences: ["differs: a", "only in read model: b"], count: 2 });
    // The next shadow diff within the interval is not logged again.
    await path.read("journal", "shadow", sources);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("with no read-model client, shadow and supabase serve Firestore", async () => {
    const { path } = deps();
    expect((await path.read("journal", "supabase", { firestore: async () => 1, supabase: null })).servedBy).toBe("firestore");
    expect((await path.read("journal", "shadow", { firestore: async () => 1, supabase: null })).servedBy).toBe("firestore");
  });

  it("compares ledger rows by id, amount and date", () => {
    expect(compareLedgerRows([{ id: "a", amount: 1, date: "d" }], [{ id: "a", amount: 1.0, date: "d" }])).toEqual([]);
    expect(compareLedgerRows([{ id: "a", amount: 1, date: "d" }], [])).toEqual(["missing in read model: a"]);
  });
});
