import { describe, expect, it } from "vitest";

import { EMPTY_SCREEN, type Screen } from "./screener";
import {
  MAX_SAVED_SCREENS,
  addSavedScreen,
  checkScreenName,
  parseSavedScreens,
  removeSavedScreen,
  serializeSavedScreens,
  updateSavedScreen,
  type SavedScreen,
} from "./savedScreens";

/** SPENDLY-649: saved screener screens (pure rules). */

const T = 1_793_400_000_000;
const GAINERS: Screen = { ...EMPTY_SCREEN, ranges: [{ field: "changePercent", min: 2, max: null }] };
const saved = (id: string, name: string, screen: Screen = GAINERS): SavedScreen => ({ id, name, screen, createdAt: T, updatedAt: T });

describe("checkScreenName", () => {
  it("trims and collapses spaces", () => {
    expect(checkScreenName("  Big   movers ", [])).toEqual({ ok: true, name: "Big movers" });
  });

  it("rejects empty, too long and duplicate names (ignoring case)", () => {
    expect(checkScreenName("   ", [])).toEqual({ ok: false, message: "Give the screen a name." });
    expect(checkScreenName("x".repeat(41), [])).toMatchObject({ ok: false, message: expect.stringMatching(/40 characters/) });
    expect(checkScreenName("big MOVERS", [saved("a", "Big movers")])).toMatchObject({ ok: false, message: expect.stringMatching(/already/) });
  });

  it("lets a screen keep its own name on rename", () => {
    expect(checkScreenName("Big movers", [saved("a", "Big movers")], "a")).toEqual({ ok: true, name: "Big movers" });
  });
});

describe("addSavedScreen", () => {
  it("adds newest first with a validated screen", () => {
    const r = addSavedScreen([saved("a", "Old")], "New", GAINERS, "b", T + 1);
    expect(r.ok && r.screens.map((s) => s.id)).toEqual(["b", "a"]);
    expect(r.ok && r.saved).toEqual({ id: "b", name: "New", screen: GAINERS, createdAt: T + 1, updatedAt: T + 1 });
  });

  it("stops at the limit", () => {
    const full = Array.from({ length: MAX_SAVED_SCREENS }, (_, i) => saved(`s${i}`, `Screen ${i}`));
    expect(addSavedScreen(full, "One more", GAINERS, "x", T)).toEqual({
      ok: false,
      message: "You can keep up to 10 screens. Delete one to save another.",
    });
  });

  it("refuses an invalid screen with the validation message", () => {
    const bad: Screen = { ...EMPTY_SCREEN, ranges: [{ field: "price", min: 500, max: 100 }] };
    expect(addSavedScreen([], "Bad", bad, "x", T)).toMatchObject({ ok: false, message: expect.stringMatching(/minimum is above the maximum/) });
  });
});

describe("updateSavedScreen and removeSavedScreen", () => {
  it("renames and replaces filters, stamping updatedAt", () => {
    const next: Screen = { ...EMPTY_SCREEN, nifty50Only: true };
    const r = updateSavedScreen([saved("a", "Old")], "a", { name: "Renamed", screen: next }, T + 5);
    expect(r.ok && r.saved).toEqual({ id: "a", name: "Renamed", screen: next, createdAt: T, updatedAt: T + 5 });
  });

  it("reports a missing screen and a clashing name", () => {
    expect(updateSavedScreen([], "nope", { name: "X" }, T)).toEqual({ ok: false, message: "That screen no longer exists." });
    expect(updateSavedScreen([saved("a", "A"), saved("b", "B")], "a", { name: "b" }, T)).toMatchObject({ ok: false });
  });

  it("removes by id", () => {
    expect(removeSavedScreen([saved("a", "A"), saved("b", "B")], "a").map((s) => s.id)).toEqual(["b"]);
  });
});

describe("parseSavedScreens", () => {
  it("round-trips through serialisation", () => {
    const list = [saved("a", "A"), saved("b", "B")];
    expect(parseSavedScreens(serializeSavedScreens(list))).toEqual(list);
  });

  it("returns nothing for missing, corrupt or other-version data", () => {
    expect(parseSavedScreens(null)).toEqual([]);
    expect(parseSavedScreens("{not json")).toEqual([]);
    expect(parseSavedScreens(JSON.stringify({ version: 2, screens: [saved("a", "A")] }))).toEqual([]);
    expect(parseSavedScreens(JSON.stringify([saved("a", "A")]))).toEqual([]);
  });

  it("drops bad entries one by one and keeps the rest", () => {
    const raw = JSON.stringify({
      version: 1,
      screens: [
        saved("a", "Good"),
        { id: "b", name: "No screen", createdAt: T, updatedAt: T },
        saved("c", "Uses P/E", { ...EMPTY_SCREEN, ranges: [{ field: "pe" as never, min: 0, max: 20 }] }),
        saved("a", "Duplicate id"),
        saved("d", "good"),
        saved("e", "x".repeat(41)),
        saved("f", "Also good"),
      ],
    });
    expect(parseSavedScreens(raw).map((s) => s.name)).toEqual(["Good", "Also good"]);
  });

  it("caps an oversized list", () => {
    const many = Array.from({ length: 15 }, (_, i) => saved(`s${i}`, `Screen ${i}`));
    expect(parseSavedScreens(serializeSavedScreens(many))).toHaveLength(MAX_SAVED_SCREENS);
  });
});
