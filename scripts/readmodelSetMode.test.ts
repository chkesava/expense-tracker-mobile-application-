import { describe, expect, it, vi } from "vitest";

vi.mock("firebase-admin/app", () => ({ initializeApp: vi.fn(), applicationDefault: vi.fn(), cert: vi.fn() }));
vi.mock("firebase-admin/firestore", () => ({ getFirestore: vi.fn() }));

import { parseSetModeArgs, setModePatch } from "./readmodel-set-mode";

describe("readmodel-set-mode (SPENDLY-511)", () => {
  it("is a dry run unless --apply", () => {
    expect(parseSetModeArgs(["--screen=journal", "--mode=shadow"])).toEqual({ screen: "journal", mode: "shadow", apply: false });
    expect(parseSetModeArgs(["--screen=journal", "--mode=firestore", "--apply"]).apply).toBe(true);
  });

  it("refuses unknown screens and modes", () => {
    expect(() => parseSetModeArgs(["--screen=dashboard", "--mode=shadow"])).toThrow(/--screen/);
    expect(() => parseSetModeArgs(["--screen=journal", "--mode=postgres"])).toThrow(/--mode/);
    expect(() => parseSetModeArgs([])).toThrow();
  });

  it("writes only readModel.<screen>, merged", () => {
    expect(setModePatch("journal", "supabase")).toEqual({ readModel: { journal: "supabase" } });
  });
});
