import { describe, expect, it, vi } from "vitest";

import type { ShadowResult } from "@/shared/utils/readModel/shadowCompare";

import { copyAgreesWithFirestore } from "./verifyCopy";

const clean = (): ShadowResult => ({ firestore: 1, copy: 1, missing: 0, extra: 0, differing: 0 } as ShadowResult);
const doc = { id: "a", data: { currentBalance: 10 } };

describe("copyAgreesWithFirestore (SPENDLY-599)", () => {
  it("checks nothing, and reads nothing, when no input comes from the copy", async () => {
    const readServer = vi.fn();
    const ok = await copyAgreesWithFirestore([{ collection: "accounts" }, { collection: "holdings" }], {
      modeOf: (c) => (c === "accounts" ? "firestore" : "shadow"),
      readServer,
      compare: vi.fn(),
    });
    expect(ok).toBe(true);
    expect(readServer).not.toHaveBeenCalled();
  });

  it("agrees when every copy-served input matches Firestore", async () => {
    const ok = await copyAgreesWithFirestore([{ collection: "accounts" }, { collection: "holdings" }], {
      modeOf: () => "supabase",
      readServer: async () => [doc],
      compare: async () => clean(),
    });
    expect(ok).toBe(true);
  });

  it.each([
    ["missing", { missing: 1 }],
    ["extra", { extra: 1 }],
    ["differing", { differing: 1 }],
  ])("refuses when the copy has a %s row", async (_label, diff) => {
    const ok = await copyAgreesWithFirestore([{ collection: "accounts" }], {
      modeOf: () => "supabase",
      readServer: async () => [doc],
      compare: async () => ({ ...clean(), ...diff }),
    });
    expect(ok).toBe(false);
  });

  it("refuses when Firestore can't confirm (cache data or a failure)", async () => {
    const ok = await copyAgreesWithFirestore([{ collection: "accounts" }], {
      modeOf: () => "supabase",
      readServer: async () => null,
      compare: async () => clean(),
    });
    expect(ok).toBe(false);
  });

  it("refuses when the copy can't be compared (not ready)", async () => {
    const ok = await copyAgreesWithFirestore([{ collection: "accounts" }], {
      modeOf: () => "supabase",
      readServer: async () => [doc],
      compare: async () => null,
    });
    expect(ok).toBe(false);
  });

  it("a one-document check ignores the copy's other documents", async () => {
    const ok = await copyAgreesWithFirestore([{ collection: "financialSummaries", docId: "epf" }], {
      modeOf: () => "supabase",
      readServer: async () => [doc],
      compare: async () => ({ ...clean(), extra: 12 }),
    });
    expect(ok).toBe(true);
  });

  it("stops at the first disagreement", async () => {
    const readServer = vi.fn(async () => [doc]);
    const ok = await copyAgreesWithFirestore([{ collection: "accounts" }, { collection: "holdings" }], {
      modeOf: () => "supabase",
      readServer,
      compare: async () => ({ ...clean(), differing: 1 }),
    });
    expect(ok).toBe(false);
    expect(readServer).toHaveBeenCalledTimes(1);
  });
});
