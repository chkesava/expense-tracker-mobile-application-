import { describe, expect, it } from "vitest";

import { ACCOUNT_COLORS } from "./expense";

describe("account colour palette (SPENDLY-552)", () => {
  it("keeps the stored colours and their default unchanged", () => {
    // Saved on accounts as `color`: changing a value would change user data.
    expect(ACCOUNT_COLORS).toEqual([
      "#4F46E5",
      "#2563EB",
      "#0D9488",
      "#16A34A",
      "#D97706",
      "#DC2626",
      "#9333EA",
      "#DB2777",
      "#475569",
    ]);
    expect(ACCOUNT_COLORS[0]).toBe("#4F46E5");
  });
});
