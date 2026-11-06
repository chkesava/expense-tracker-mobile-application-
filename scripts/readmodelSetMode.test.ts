import { describe, expect, it, vi } from "vitest";

vi.mock("firebase-admin/app", () => ({ initializeApp: vi.fn(), applicationDefault: vi.fn(), cert: vi.fn() }));
vi.mock("firebase-admin/firestore", () => ({ getFirestore: vi.fn() }));

import { parseSetModeArgs, setModeField, setModePatch } from "./readmodel-set-mode";
import { READ_MODEL_COLLECTIONS, SWITCHED_COLLECTIONS } from "../shared/utils/readModel/collectionMode";

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

  // SPENDLY-601: the per-collection and app-wide switches.
  it("sets one collection's mode, validated against the synced collections", () => {
    const args = parseSetModeArgs(["--collection=expenses", "--mode=shadow", "--apply"]);
    expect(args).toEqual({ collection: "expenses", mode: "shadow", apply: true });
    expect(setModePatch(args)).toEqual({ readModel: { expenses: "shadow" } });
    expect(() => parseSetModeArgs(["--collection=nope", "--mode=shadow"])).toThrow(/--collection/);
    expect(() => parseSetModeArgs(["--collection=expenses", "--mode=postgres"])).toThrow(/--mode/);
  });

  it("the one-write rollback: localCopy off, nothing else touched", () => {
    const args = parseSetModeArgs(["--switch=localCopy", "--value=false", "--apply"]);
    expect(args).toEqual({ switchName: "localCopy", value: false, apply: true });
    expect(setModePatch(args)).toEqual({ readModel: { localCopy: false } });
    expect(setModeField(args)).toBe("localCopy");
    expect(() => parseSetModeArgs(["--switch=everything", "--value=false"])).toThrow(/--switch/);
    expect(() => parseSetModeArgs(["--switch=realtime", "--value=off"])).toThrow(/--value/);
  });

  // SPENDLY-690: every switched collection in one merge write.
  it("sets every switched collection at once, and nothing else", () => {
    const args = parseSetModeArgs(["--all-collections", "--mode=shadow", "--apply"]);
    expect(args).toEqual({ allCollections: true, mode: "shadow", apply: true });
    const patch = setModePatch(args) as { readModel: Record<string, unknown> };
    expect(Object.keys(patch)).toEqual(["readModel"]);
    expect(Object.keys(patch.readModel).sort()).toEqual([...SWITCHED_COLLECTIONS].sort());
    expect(new Set(Object.values(patch.readModel))).toEqual(new Set(["shadow"]));
    expect(patch.readModel).not.toHaveProperty("localCopy");
    expect(() => parseSetModeArgs(["--all-collections", "--mode=postgres"])).toThrow(/--mode/);
    expect(parseSetModeArgs(["--all-collections", "--mode=supabase"]).apply).toBe(false); // dry run by default
  });

  it("only names synced collections", () => {
    for (const c of SWITCHED_COLLECTIONS) expect(READ_MODEL_COLLECTIONS).toContain(c);
  });
});
