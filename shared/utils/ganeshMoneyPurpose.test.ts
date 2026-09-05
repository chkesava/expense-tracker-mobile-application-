import { describe, expect, it } from "vitest";

import { DEFAULT_GANESH_CATEGORIES } from "@/shared/data/ganeshCategories";
import {
  EXPENSE_PURPOSE_CATEGORIES,
  MONEY_PURPOSE_CATEGORY_LABELS,
  derivePurposeForLegacyRow,
  directionForPurposeType,
  purposeForCategoryName,
  purposeLabel,
  purposeOf,
} from "@/shared/utils/ganeshMoneyPurpose";

/**
 * Money purpose (GS-078).
 *
 * The value of a controlled enum is entirely in it staying controlled, so what
 * is tested here is that every category maps somewhere real, that nothing falls
 * through, and that legacy rows are classified honestly rather than plausibly.
 */

describe("every shipped default category maps to a real purpose", () => {
  it("uses only categories from the canonical list", () => {
    for (const category of DEFAULT_GANESH_CATEGORIES) {
      expect(EXPENSE_PURPOSE_CATEGORIES).toContain(category.purposeCategory);
    }
  });

  it("agrees with the name-based lookup", () => {
    // Two sources of truth would drift. The seeded value and the lookup a
    // custom category falls back to must give the same answer.
    for (const category of DEFAULT_GANESH_CATEGORIES) {
      expect(purposeForCategoryName(category.name)).toBe(category.purposeCategory);
    }
  });

  it("gives every purpose category a label", () => {
    for (const purpose of EXPENSE_PURPOSE_CATEGORIES) {
      expect(MONEY_PURPOSE_CATEGORY_LABELS[purpose]).toBeTruthy();
    }
  });
});

describe("classifying a category by name", () => {
  it("matches regardless of case and spacing", () => {
    expect(purposeForCategoryName("  SOUND   system ")).toBe("sound");
  });

  it("sends an unrecognised custom category to other, not to a neighbour", () => {
    // A committee's "Dhol Tasha" must not silently join somebody else's
    // spending. "Other" is honest; a guess is not.
    expect(purposeForCategoryName("Dhol Tasha")).toBe("other_festival_expense");
    expect(purposeForCategoryName("Generator hire")).toBe("other_festival_expense");
  });

  it("gives Visarjan and cultural programmes their own categories", () => {
    // Both were folded into "other" in the first pass, which made that bucket
    // one of the largest lines in a report while saying nothing about where the
    // money went. Neither belongs in transportation — a procession is not a
    // delivery.
    expect(purposeForCategoryName("Immersion / Visarjan")).toBe("visarjan");
    expect(purposeForCategoryName("Cultural Programs")).toBe("cultural_programs");
  });

  it("still sends Miscellaneous to other, which is what it means", () => {
    expect(purposeForCategoryName("Miscellaneous")).toBe("other_festival_expense");
  });
});

describe("direction follows the type", () => {
  it("is in for money arriving and out for money leaving", () => {
    expect(directionForPurposeType("collection")).toBe("in");
    expect(directionForPurposeType("contribution")).toBe("in");
    expect(directionForPurposeType("expense")).toBe("out");
    expect(directionForPurposeType("reimbursement")).toBe("out");
  });

  it("is transfer for money moving between the Pandal's own pockets", () => {
    expect(directionForPurposeType("fund_transfer")).toBe("transfer");
    expect(directionForPurposeType("cash_handover")).toBe("transfer");
  });
});

describe("legacy rows", () => {
  it("classifies by the collection the document lives in", () => {
    // A document in `collections` is a collection whatever screen made it —
    // which is the only inference that is safe, because it is not an inference
    // about intent.
    expect(derivePurposeForLegacyRow("collections").purposeType).toBe("collection");
    expect(derivePurposeForLegacyRow("expenses").purposeType).toBe("expense");
    expect(derivePurposeForLegacyRow("reimbursements").purposeType).toBe("reimbursement");
  });

  it("marks itself as legacy so a report can say so", () => {
    expect(derivePurposeForLegacyRow("collections").legacy).toBe(true);
  });

  it("does not pretend to know the category", () => {
    // Guessing the category would make an unclassified row look classified.
    expect(derivePurposeForLegacyRow("collections").purposeCategory).toBe("other");
    expect(derivePurposeForLegacyRow("expenses").purposeCategory).toBe("other_festival_expense");
  });

  it("uses what a contribution row does carry", () => {
    expect(derivePurposeForLegacyRow("contributions", { kind: "money" }).purposeCategory).toBe(
      "cash_donation"
    );
    expect(derivePurposeForLegacyRow("contributions", { kind: "item" }).purposeCategory).toBe(
      "in_kind"
    );
    expect(
      derivePurposeForLegacyRow("contributions", { kind: "money", sponsorshipId: "s1" })
        .purposeCategory
    ).toBe("sponsor");
  });
});

describe("purposeOf prefers what was stored", () => {
  it("returns the stamped purpose untouched", () => {
    const stored = purposeOf("expenses", {
      purposeType: "expense",
      purposeCategory: "food_prasadam",
      purposeDetail: "Prasadam for 400",
    });
    expect(stored).toEqual({
      purposeType: "expense",
      purposeCategory: "food_prasadam",
      purposeDetail: "Prasadam for 400",
    });
  });

  it("falls back only when the record has none", () => {
    expect(purposeOf("expenses", {}).purposeCategory).toBe("other_festival_expense");
  });

  it("does not half-trust a partially stamped row", () => {
    // A type with no category is not a classification, so it goes down the
    // legacy path rather than producing a purpose with a hole in it.
    const result = purposeOf("collections", { purposeType: "collection" });
    expect(result.purposeCategory).toBeTruthy();
  });
});

describe("labels", () => {
  it("names a purpose for the UI", () => {
    expect(purposeLabel({ purposeCategory: "food_prasadam" })).toBe("Food / prasadam");
  });

  it("says Unclassified rather than nothing", () => {
    expect(purposeLabel(null)).toBe("Unclassified");
    expect(purposeLabel({})).toBe("Unclassified");
  });
});
