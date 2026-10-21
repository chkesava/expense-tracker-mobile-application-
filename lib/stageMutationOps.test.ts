import { describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore", () => ({ doc: (_db: unknown, path: string) => ({ path }) }));

import { stageMutationOps } from "./stageMutationOps";

describe("stageMutationOps (SPENDLY-496)", () => {
  it("honours set/merge, update and delete instead of forcing update", () => {
    const calls: string[] = [];
    const batch = {
      set: vi.fn((ref, _data, opts) => calls.push(`set ${ref.path} merge=${Boolean(opts?.merge)}`)),
      update: vi.fn((ref) => calls.push(`update ${ref.path}`)),
      delete: vi.fn((ref) => calls.push(`delete ${ref.path}`)),
    };
    stageMutationOps(batch as never, {} as never, [
      // A missing financialSummaries/netWorth doc must be created, not updated.
      { op: "set", ref: { path: "users/u1/financialSummaries/netWorth" }, data: { a: 1 }, merge: true },
      { op: "set", ref: { path: "users/u1/x/y" }, data: { a: 1 } },
      { op: "update", ref: { path: "users/u1/accounts/a1" }, data: { b: 2 } },
      { op: "delete", ref: { path: "users/u1/x/z" } },
    ]);
    expect(calls).toEqual([
      "set users/u1/financialSummaries/netWorth merge=true",
      "set users/u1/x/y merge=false",
      "update users/u1/accounts/a1",
      "delete users/u1/x/z",
    ]);
  });
});
