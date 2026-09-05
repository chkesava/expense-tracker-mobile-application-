import { describe, expect, it } from "vitest";

import {
  describePandalSetupGaps,
  diagnosePandalSetup,
} from "@/shared/utils/ganeshPandalSetup";

/**
 * Detecting a half-created Pandal (GS-071).
 *
 * Firestore cannot roll back across batches, so creation's later steps can fail
 * independently of the atomic first one. These tests pin the two decisions that
 * matter: whether a Pandal is incomplete, and whether the app may finish it
 * without inventing anything.
 */

const HEALTHY = {
  festivals: [{ id: "f-1", status: "open" }],
  summaryExists: true,
  categoryCount: 24,
  memberExists: true,
};

describe("diagnosePandalSetup", () => {
  it("says nothing is wrong with a fully seeded Pandal", () => {
    const result = diagnosePandalSetup(HEALTHY);

    expect(result.complete).toBe(true);
    expect(result.gaps).toEqual([]);
    expect(result.festivalId).toBe("f-1");
  });

  it("reports every gap at once rather than one at a time", () => {
    // A failed seed batch loses all three together, so surfacing them one per
    // repair round-trip would make it look like the repair kept failing.
    const result = diagnosePandalSetup({
      festivals: [{ id: "f-1", status: "open" }],
      summaryExists: false,
      categoryCount: 0,
      memberExists: false,
    });

    expect(result.gaps).toEqual(["missing-summary", "missing-categories", "missing-member"]);
    expect(result.complete).toBe(false);
    expect(result.repairable).toBe(true);
  });

  it("treats a missing festival as not repairable in-app", () => {
    // The name and year were the user's choice and did not survive the
    // failure. Guessing them would put wrong data in the ledger's title.
    const result = diagnosePandalSetup({
      festivals: [],
      summaryExists: false,
      categoryCount: 0,
      memberExists: false,
    });

    expect(result.gaps).toEqual(["no-festival"]);
    expect(result.repairable).toBe(false);
    expect(result.festivalId).toBeNull();
  });

  it("diagnoses the open festival when several exist", () => {
    const result = diagnosePandalSetup({
      ...HEALTHY,
      festivals: [
        { id: "f-2024", status: "closed" },
        { id: "f-2026", status: "open" },
      ],
    });

    expect(result.festivalId).toBe("f-2026");
  });

  it("falls back to the first festival when none is open", () => {
    // A Pandal between festivals is not broken, and must not be reported as
    // such just because its only year is settled.
    const result = diagnosePandalSetup({
      ...HEALTHY,
      festivals: [{ id: "f-2024", status: "closed" }],
    });

    expect(result.complete).toBe(true);
    expect(result.festivalId).toBe("f-2024");
  });

  it("catches a single missing piece", () => {
    expect(diagnosePandalSetup({ ...HEALTHY, categoryCount: 0 }).gaps).toEqual([
      "missing-categories",
    ]);
    expect(diagnosePandalSetup({ ...HEALTHY, summaryExists: false }).gaps).toEqual([
      "missing-summary",
    ]);
    expect(diagnosePandalSetup({ ...HEALTHY, memberExists: false }).gaps).toEqual([
      "missing-member",
    ]);
  });
});

describe("describePandalSetupGaps", () => {
  it("names the consequence, not the internal state", () => {
    // "Setup incomplete" tells a committee nothing they can act on.
    const text = describePandalSetupGaps(["missing-categories"]);

    expect(text).toContain("no expense categories");
  });

  it("reads as a sentence when several things are missing", () => {
    const text = describePandalSetupGaps([
      "missing-summary",
      "missing-categories",
      "missing-member",
    ]);

    expect(text).toBe(
      "Setting up this festival did not finish — its totals were never started, it has no expense categories and you were not added to it."
    );
  });

  it("says something different when there is no festival at all", () => {
    const text = describePandalSetupGaps(["no-festival"]);

    expect(text).toContain("no festival yet");
    expect(text).toContain("Create one");
  });

  it("returns nothing for no gaps", () => {
    expect(describePandalSetupGaps([])).toBe("");
  });
});
