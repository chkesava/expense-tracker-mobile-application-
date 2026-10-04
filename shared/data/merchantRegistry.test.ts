import { describe, expect, it } from "vitest";

import { SMS_MERCHANT_CATALOG } from "../../services/sms/smsMerchantCatalog";
import { foldKey, merchantSlug } from "../utils/merchantModel";
import { normalizeMerchantText } from "../utils/merchantNormalize";
import {
  buildMerchantAliasIndex,
  MERCHANT_REGISTRY,
  MERCHANT_REGISTRY_VERSION,
  MIN_ALIAS_LENGTH,
  registryIssues,
} from "./merchantRegistry";

describe("merchant registry", () => {
  it("passes its own review checks", () => {
    expect(registryIssues()).toEqual([]);
    expect(MERCHANT_REGISTRY_VERSION).toBe(1);
  });

  it("carries every SMS catalog merchant and alias, except known collisions", () => {
    const index = buildMerchantAliasIndex();
    for (const entry of SMS_MERCHANT_CATALOG) {
      const id = merchantSlug(entry.canonical);
      expect(index.byId.get(id)?.displayName).toBe(entry.canonical);
      for (const alias of [entry.canonical, ...(entry.aliases ?? [])].map(foldKey)) {
        if (alias === "mcd" || alias.length < MIN_ALIAS_LENGTH) continue;
        expect(index.byAlias.get(alias)).toBe(id);
      }
    }
    // Municipal Corporation of Delhi, not McDonald's.
    expect(index.byAlias.has("mcd")).toBe(false);
  });

  it("drops placeholder categories for payment apps", () => {
    const index = buildMerchantAliasIndex();
    expect(index.byId.get("paytm")?.category).toBeUndefined();
    expect(index.byId.get("swiggy")).toMatchObject({ category: "Food & Groceries", subcategory: "Food Delivery" });
  });

  it("normalized display and legal names land on their own merchant", () => {
    const index = buildMerchantAliasIndex();
    for (const m of MERCHANT_REGISTRY) {
      for (const name of [m.displayName, m.legalName]) {
        if (!name) continue;
        const key = normalizeMerchantText(name.toUpperCase()).normalized;
        if (key.length < MIN_ALIAS_LENGTH) continue; // e.g. "Vi" matches on its longer aliases
        expect({ name, owner: index.byAlias.get(key) }).toEqual({ name, owner: m.id });
      }
    }
  });

  it("reports collisions, bad aliases and unknown categories in a proposed change", () => {
    const issues = registryIssues([
      { id: "a", displayName: "A", aliases: ["shared"], category: "Food & Groceries", subcategory: "Petrol" },
      { id: "b", displayName: "B", aliases: ["shared", "Not Folded", "ab"], category: "Snacks" },
      { id: "b", displayName: "B2", aliases: ["bbb"], subcategory: "OTT" },
    ]);
    expect(issues).toEqual(
      expect.arrayContaining([
        'a: "Petrol" isn\'t a subcategory of "Food & Groceries".',
        'b: alias "Not Folded" isn\'t folded.',
        'b: alias "ab" is too short to match safely.',
        'b: unknown category "Snacks".',
        'Duplicate merchant id "b".',
        "b: subcategory without a category.",
        'Alias "shared" is claimed by a, b.',
      ])
    );
  });
});
