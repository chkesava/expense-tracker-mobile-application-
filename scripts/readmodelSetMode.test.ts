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
    expect(setModePatch({ screen: "journal", mode: "supabase" })).toEqual({ readModel: { journal: "supabase" } });
  });

  it("loopback knobs are for the emulator only (SPENDLY-512)", () => {
    expect(() => parseSetModeArgs(["--screen=journal", "--mode=supabase", "--loopback-fail=true"])).toThrow(/emulator/);
    const args = parseSetModeArgs(["--screen=journal", "--mode=supabase", "--loopback-fail=true", "--loopback-lag=240", "--apply"], true);
    expect(setModePatch(args)).toEqual({ readModel: { journal: "supabase", loopbackFail: true, loopbackLagMinutes: 240 } });
    expect(() => parseSetModeArgs(["--screen=journal", "--mode=supabase", "--loopback-fail=yes"], true)).toThrow(/true or false/);
    expect(() => parseSetModeArgs(["--screen=journal", "--mode=supabase", "--loopback-lag=-5"], true)).toThrow(/minutes/);
  });
});
