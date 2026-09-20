import { describe, expect, it } from "vitest";
import { SMS_MERCHANT_CATEGORY_RULES } from "@/services/sms/smsCategoryRules";
import {
  CATEGORY_SUGGESTIONS,
  CATEGORY_TAXONOMY,
  HIDDEN_TAXONOMY_PARENT_NAMES,
  PARENT_CATEGORY_NAMES,
  V3_TO_V4_MAP,
  categoryParentMatchesSearch,
  collapseToCurrentTaxonomy,
  collectTaxonomyIntegrityIssues,
  isBalanceSheetMovementNote,
  isExactTaxonomyPair,
  mapLegacyExpense,
  mapToV2Category,
  mapToV4Category,
  suggestCategoryFromNote,
} from "./categoryTaxonomy";

describe("suggestCategoryFromNote", () => {
  it("maps chicken to Meat & Chicken", () => {
    expect(suggestCategoryFromNote("Chicken for dinner")).toEqual({
      category: "Food & Groceries",
      subcategory: "Meat & Chicken",
    });
  });

  it("maps petrol to Petrol", () => {
    expect(suggestCategoryFromNote("Filled petrol")).toEqual({
      category: "Transport & Vehicles",
      subcategory: "Petrol",
    });
  });

  it("maps Claude to AI Tools", () => {
    expect(suggestCategoryFromNote("Claude subscription")).toEqual({
      category: "Bills & Communication",
      subcategory: "AI Tools",
    });
  });

  it("prefers diet chicken over generic chicken", () => {
    expect(suggestCategoryFromNote("Chicken for diet")).toEqual({
      category: "Health & Medical",
      subcategory: "Supplements / Nutrition",
    });
  });

  it("maps common Indian terms", () => {
    expect(suggestCategoryFromNote("kirana shop")).toEqual({
      category: "Food & Groceries",
      subcategory: "Groceries / Kirana",
    });
    expect(suggestCategoryFromNote("sabzi mandi")).toEqual({
      category: "Food & Groceries",
      subcategory: "Vegetables",
    });
    expect(suggestCategoryFromNote("bijli bill")).toEqual({
      category: "Home & Household",
      subcategory: "Electricity",
    });
    expect(suggestCategoryFromNote("FASTag recharge")).toEqual({
      category: "Transport & Vehicles",
      subcategory: "Toll / FASTag",
    });
    expect(suggestCategoryFromNote("paid the maid")).toEqual({
      category: "Home & Household",
      subcategory: "Maid",
    });
    expect(suggestCategoryFromNote("mandir donation")).toEqual({
      category: "Gifts, Donations & Social",
      subcategory: "Temple",
    });
    expect(suggestCategoryFromNote("pooja items")).toEqual({
      category: "Gifts, Donations & Social",
      subcategory: "Temple",
    });
  });

  it("does not treat card payments or bank transfers as ordinary spend", () => {
    expect(isBalanceSheetMovementNote("credit card payment")).toBe(true);
    expect(suggestCategoryFromNote("credit card payment HDFC")).toBeNull();
    expect(suggestCategoryFromNote("NEFT account transfer to savings")).toBeNull();
  });
});

describe("mapLegacyExpense", () => {
  it("maps Brother Related via legacy map onto v4", () => {
    expect(mapLegacyExpense("Brother Related", "")).toEqual({
      category: "Family & Children",
      subcategory: "Family Support",
    });
  });

  it("uses note rules over legacy category", () => {
    expect(mapLegacyExpense("Subscriptions", "Paid for Claude")).toEqual({
      category: "Bills & Communication",
      subcategory: "AI Tools",
    });
  });

  it("maps Food to the Food & Groceries parent", () => {
    expect(mapLegacyExpense("Food", "")).toEqual({
      category: "Food & Groceries",
      subcategory: "Other Food",
    });
  });

  it("maps Petrol legacy name", () => {
    expect(mapLegacyExpense("Petrol", "")).toEqual({
      category: "Transport & Vehicles",
      subcategory: "Petrol",
    });
  });
});

describe("mapToV2Category", () => {
  it("maps Food & Dining groceries onto Food", () => {
    expect(mapToV2Category("Food & Dining", "Groceries")).toEqual({
      category: "Food",
      subcategory: "Groceries",
    });
  });

  it("maps Housing rent onto Home", () => {
    expect(mapToV2Category("Housing", "Rent")).toEqual({
      category: "Home",
      subcategory: "Rent",
    });
  });

  it("maps Bills electricity onto Home so the overlap is gone", () => {
    expect(mapToV2Category("Bills", "Electricity")).toEqual({
      category: "Home",
      subcategory: "Electricity",
    });
  });

  it("leaves custom categories unchanged", () => {
    expect(mapToV2Category("Office Chai Fund", "Snacks")).toBeNull();
  });

  it("keeps already-current v3 pairs", () => {
    expect(mapToV2Category("Travel", "Petrol / Diesel")).toEqual({
      category: "Travel",
      subcategory: "Petrol / Diesel",
    });
  });
});

describe("mapToV4Category", () => {
  it("maps v3 pairs onto the expanded taxonomy", () => {
    expect(mapToV4Category("Food", "Groceries")).toEqual({
      category: "Food & Groceries",
      subcategory: "Groceries / Kirana",
    });
    expect(mapToV4Category("Travel", "Hotel / Stay")).toEqual({
      category: "Travel & Holidays",
      subcategory: "Hotel / Stay",
    });
    expect(mapToV4Category("Savings & EMI", "SIP / Mutual Funds")).toEqual({
      category: "Investments & Savings",
      subcategory: "SIP",
    });
  });

  it("leaves custom categories unchanged", () => {
    expect(mapToV4Category("Office Chai Fund", "Snacks")).toBeNull();
  });

  it("keeps already-current v4 pairs", () => {
    expect(mapToV4Category("Transport & Vehicles", "Petrol")).toEqual({
      category: "Transport & Vehicles",
      subcategory: "Petrol",
    });
  });
});

describe("collapseToCurrentTaxonomy", () => {
  it("maps Brother related onto Family", () => {
    expect(collapseToCurrentTaxonomy("Brother related")).toEqual({
      category: "Family & Children",
      subcategory: "Brother / Sister",
    });
  });

  it("maps custom Food subs like Tiffin and Curd", () => {
    expect(collapseToCurrentTaxonomy("Food", "Tiffin")).toEqual({
      category: "Food & Groceries",
      subcategory: "Tiffin / Meals",
    });
    expect(collapseToCurrentTaxonomy("Food", "Curd")).toEqual({
      category: "Food & Groceries",
      subcategory: "Milk & Dairy",
    });
  });

  it("maps petrol-style custom parents onto Transport", () => {
    expect(collapseToCurrentTaxonomy("Petrol for travel")).toEqual({
      category: "Transport & Vehicles",
      subcategory: "Petrol",
    });
  });

  it("maps leftover custom names onto Miscellaneous when nothing matches", () => {
    expect(collapseToCurrentTaxonomy("Office Chai Fund", "Snacks")).toEqual({
      category: "Miscellaneous",
      subcategory: "Uncategorized",
    });
  });

  it("keeps valid current pairs", () => {
    expect(collapseToCurrentTaxonomy("Food & Groceries", "Groceries / Kirana")).toEqual({
      category: "Food & Groceries",
      subcategory: "Groceries / Kirana",
    });
  });
});

describe("CATEGORY_TAXONOMY", () => {
  it("has unique parent/sub keys and names", () => {
    expect(collectTaxonomyIntegrityIssues()).toEqual([]);
  });

  it("keeps a stable India-focused parent order", () => {
    expect(CATEGORY_TAXONOMY.filter((t) => !t.hidden).map((t) => t.name)).toEqual([
      "Food & Groceries",
      "Home & Household",
      "Transport & Vehicles",
      "Bills & Communication",
      "Shopping & Clothing",
      "Health & Medical",
      "Education",
      "Family & Children",
      "Personal Care",
      "Entertainment & Hobbies",
      "Travel & Holidays",
      "Finance, Loans & Insurance",
      "Investments & Savings",
      "Gifts, Donations & Social",
      "Pets",
      "Work & Professional",
      "Government, Legal & Documents",
      "Miscellaneous",
    ]);
  });

  it("hides Income from expense parent names", () => {
    expect(HIDDEN_TAXONOMY_PARENT_NAMES.has("Income")).toBe(true);
    expect(PARENT_CATEGORY_NAMES).not.toContain("Income");
  });

  it("keeps Transfer under Miscellaneous without duplicating utility bills", () => {
    const bills = CATEGORY_TAXONOMY.find((t) => t.name === "Bills & Communication");
    const home = CATEGORY_TAXONOMY.find((t) => t.name === "Home & Household");
    const misc = CATEGORY_TAXONOMY.find((t) => t.name === "Miscellaneous");
    expect(bills?.subcategories.map((s) => s.name)).not.toContain("Electricity Bill");
    expect(home?.subcategories.some((s) => s.name === "Electricity")).toBe(true);
    expect(misc?.subcategories.some((s) => s.name === "Transfer")).toBe(true);
  });
});

describe("v3 to v4 maps and suggestions", () => {
  it("lands every v3 map on a real v4 pair", () => {
    for (const mapped of Object.values(V3_TO_V4_MAP)) {
      expect(isExactTaxonomyPair(mapped.category, mapped.subcategory)).toBe(true);
    }
  });

  it("lands every suggestion and SMS rule on a real v4 pair", () => {
    for (const item of CATEGORY_SUGGESTIONS) {
      expect(isExactTaxonomyPair(item.category, item.subcategory)).toBe(true);
    }
    for (const rule of SMS_MERCHANT_CATEGORY_RULES) {
      expect(isExactTaxonomyPair(rule.category, rule.subcategory)).toBe(true);
    }
  });

  it("treats Amazon as online shopping, not a permanent merchant category", () => {
    const amazon = SMS_MERCHANT_CATEGORY_RULES.find((r) => r.merchant === "Amazon");
    expect(amazon).toEqual({
      merchant: "Amazon",
      category: "Shopping & Clothing",
      subcategory: "Online Shopping",
    });
    expect(CATEGORY_TAXONOMY.some((t) => t.name === "Amazon")).toBe(false);
  });

  it("does not map UPI wallets onto EMI or SIP", () => {
    for (const merchant of ["Paytm", "PhonePe", "Google Pay"]) {
      const rule = SMS_MERCHANT_CATEGORY_RULES.find((r) => r.merchant === merchant);
      expect(rule?.category).toBe("Miscellaneous");
      expect(rule?.subcategory).toBe("Uncategorized");
    }
  });

  it("matches kirana via alias search", () => {
    expect(
      categoryParentMatchesSearch("Food & Groceries", ["Groceries / Kirana"], "kirana")
    ).toBe(true);
  });
});
