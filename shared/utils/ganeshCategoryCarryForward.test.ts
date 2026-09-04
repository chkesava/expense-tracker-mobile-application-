import { describe, expect, it } from "vitest";

import { DEFAULT_GANESH_CATEGORIES } from "@/shared/data/ganeshCategories";
import { customCategoriesToCarryForward } from "@/shared/utils/ganeshMath";

/**
 * Carrying a committee's own expense categories into the next festival
 * (GS-061).
 *
 * Categories are festival-scoped so a closed year keeps the labels its
 * expenses were filed under. The cost of that design was that
 * `createFestival` seeded only the built-in defaults, so a committee's own
 * categories disappeared every year — and if they retyped one differently, the
 * two years stopped comparing.
 */

const DEFAULT_NAMES = DEFAULT_GANESH_CATEGORIES.map((category) => category.name);

describe("customCategoriesToCarryForward", () => {
  it("carries a committee's own categories", () => {
    const carried = customCategoriesToCarryForward(
      [
        { name: "Dhol Tasha", isDefault: false, sortOrder: 500 },
        { name: "Visarjan Truck", isDefault: false, sortOrder: 510 },
      ],
      DEFAULT_NAMES
    );

    expect(carried).toEqual([
      { name: "Dhol Tasha", sortOrder: 500 },
      { name: "Visarjan Truck", sortOrder: 510 },
    ]);
  });

  it("skips the defaults, which the new festival seeds itself", () => {
    // Copying last year's copies would freeze an old default set forever - the
    // shipped list can change between releases.
    const carried = customCategoriesToCarryForward(
      [
        { name: "Idol", isDefault: true, sortOrder: 10 },
        { name: "Flowers", isDefault: true, sortOrder: 30 },
        { name: "Dhol Tasha", isDefault: false, sortOrder: 500 },
      ],
      DEFAULT_NAMES
    );

    expect(carried).toEqual([{ name: "Dhol Tasha", sortOrder: 500 }]);
  });

  it("skips a disabled category rather than resurrecting it", () => {
    // The committee explicitly turned it off; carrying it forward would undo
    // that decision every single year.
    const carried = customCategoriesToCarryForward(
      [
        { name: "Old Sponsor Banner", isDefault: false, disabled: true, sortOrder: 500 },
        { name: "Dhol Tasha", isDefault: false, disabled: false, sortOrder: 510 },
      ],
      DEFAULT_NAMES
    );

    expect(carried).toEqual([{ name: "Dhol Tasha", sortOrder: 510 }]);
  });

  it("skips a custom name that has since become a default", () => {
    // Otherwise a category promoted into the shipped list appears twice, and
    // expenses get split across two identically named categories.
    const carried = customCategoriesToCarryForward(
      [{ name: "Security", isDefault: false, sortOrder: 500 }],
      DEFAULT_NAMES
    );

    expect(carried).toEqual([]);
  });

  it("matches names case- and whitespace-insensitively", () => {
    const carried = customCategoriesToCarryForward(
      [
        { name: "  security  ", isDefault: false, sortOrder: 500 },
        { name: "SOUND   SYSTEM", isDefault: false, sortOrder: 510 },
      ],
      DEFAULT_NAMES
    );

    expect(carried).toEqual([]);
  });

  it("collapses duplicates within the previous year", () => {
    const carried = customCategoriesToCarryForward(
      [
        { name: "Dhol Tasha", isDefault: false, sortOrder: 500 },
        { name: "dhol tasha", isDefault: false, sortOrder: 520 },
      ],
      DEFAULT_NAMES
    );

    expect(carried).toEqual([{ name: "Dhol Tasha", sortOrder: 500 }]);
  });

  it("survives the malformed documents a real collection contains", () => {
    const carried = customCategoriesToCarryForward(
      [
        { name: "   ", isDefault: false },
        { name: undefined, isDefault: false },
        { name: 42, isDefault: false },
        {},
        { name: "Dhol Tasha", isDefault: false, sortOrder: "not a number" },
        { name: "Mandap Extra", isDefault: false, sortOrder: -5 },
      ],
      DEFAULT_NAMES
    );

    // A missing or nonsensical sortOrder falls back to the same 500 that
    // addCustomCategory writes, so carried categories sort where custom ones do.
    expect(carried).toEqual([
      { name: "Dhol Tasha", sortOrder: 500 },
      { name: "Mandap Extra", sortOrder: 500 },
    ]);
  });

  it("treats a missing isDefault as custom", () => {
    // Older documents predate the flag. Carrying one is recoverable; dropping
    // it silently is the bug being fixed.
    const carried = customCategoriesToCarryForward(
      [{ name: "Dhol Tasha", sortOrder: 500 }],
      DEFAULT_NAMES
    );

    expect(carried).toEqual([{ name: "Dhol Tasha", sortOrder: 500 }]);
  });

  it("returns nothing for a first festival with no previous categories", () => {
    expect(customCategoriesToCarryForward([], DEFAULT_NAMES)).toEqual([]);
  });
});
