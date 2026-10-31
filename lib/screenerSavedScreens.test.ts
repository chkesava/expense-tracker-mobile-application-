import { beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_SCREEN, type Screen } from "@/shared/utils/screener";

import {
  SAVED_SCREENS_KEY,
  deleteScreen,
  getSavedScreens,
  hydrateSavedScreens,
  isSavedScreensHydrated,
  resetSavedScreensForTests,
  saveScreen,
  subscribeSavedScreens,
  updateScreen,
} from "./screenerSavedScreens";

/** SPENDLY-649: saved screens kept on the device. */

const disk = new Map<string, string>();
let failReads = false;
let failWrites = false;

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => {
      if (failReads) throw new Error("storage unavailable");
      return disk.get(key) ?? null;
    },
    setItem: async (key: string, value: string) => {
      if (failWrites) throw new Error("storage full");
      disk.set(key, value);
    },
  },
}));

const GAINERS: Screen = { ...EMPTY_SCREEN, ranges: [{ field: "changePercent", min: 2, max: null }] };

beforeEach(() => {
  disk.clear();
  failReads = false;
  failWrites = false;
  resetSavedScreensForTests();
});

describe("screenerSavedScreens", () => {
  it("survives an app restart", async () => {
    const r = await saveScreen("Big movers", GAINERS, 1000);
    expect(r.ok).toBe(true);
    expect(disk.has(SAVED_SCREENS_KEY)).toBe(true);

    resetSavedScreensForTests();
    expect(getSavedScreens()).toEqual([]);
    await hydrateSavedScreens();
    expect(isSavedScreensHydrated()).toBe(true);
    expect(getSavedScreens().map((s) => ({ name: s.name, screen: s.screen }))).toEqual([{ name: "Big movers", screen: GAINERS }]);
  });

  it("renames and deletes, and the changes persist", async () => {
    const r = await saveScreen("First", GAINERS, 1000);
    const id = r.ok ? r.saved.id : "";
    expect((await updateScreen(id, { name: "Renamed" }, 2000)).ok).toBe(true);
    await saveScreen("Second", EMPTY_SCREEN, 3000);
    await deleteScreen(id);

    resetSavedScreensForTests();
    await hydrateSavedScreens();
    expect(getSavedScreens().map((s) => s.name)).toEqual(["Second"]);
  });

  it("returns validation errors without changing the list", async () => {
    await saveScreen("Taken", GAINERS);
    const r = await saveScreen("taken", GAINERS);
    expect(r).toMatchObject({ ok: false, message: expect.stringMatching(/already/) });
    expect(getSavedScreens()).toHaveLength(1);
  });

  it("notifies subscribers and keeps a stable snapshot between changes", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSavedScreens(listener);
    await hydrateSavedScreens();
    const before = getSavedScreens();
    expect(getSavedScreens()).toBe(before);
    await saveScreen("New", GAINERS);
    expect(listener).toHaveBeenCalledTimes(2); // hydrate + save
    expect(getSavedScreens()).not.toBe(before);
    unsubscribe();
    await saveScreen("Another", GAINERS);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("ignores corrupt data on disk", async () => {
    disk.set(SAVED_SCREENS_KEY, "{not json");
    await hydrateSavedScreens();
    expect(getSavedScreens()).toEqual([]);
  });

  it("works from memory when storage fails, without throwing", async () => {
    failReads = true;
    failWrites = true;
    await expect(hydrateSavedScreens()).resolves.toBeUndefined();
    const r = await saveScreen("Memory only", GAINERS);
    expect(r.ok).toBe(true);
    expect(getSavedScreens().map((s) => s.name)).toEqual(["Memory only"]);
  });

  it("loads the saved list before adding, and puts the new screen on top", async () => {
    disk.set(SAVED_SCREENS_KEY, JSON.stringify({ version: 1, screens: [{ id: "old", name: "From disk", screen: GAINERS, createdAt: 1, updatedAt: 1 }] }));
    const r = await saveScreen("Fresh", GAINERS, 5000);
    expect(r.ok).toBe(true);
    expect(getSavedScreens().map((s) => s.name)).toEqual(["Fresh", "From disk"]);
  });
});
