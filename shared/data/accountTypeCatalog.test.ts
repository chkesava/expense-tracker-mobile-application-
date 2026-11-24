import { describe, expect, it } from "vitest";
import { canonicalAccountTypeId } from "../utils/accountKind";
import { ACCOUNT_TYPE_CATALOG, matchCatalogEntry } from "./accountTypeCatalog";

describe("matchCatalogEntry", () => {
  it("matches real-world free-text type names", () => {
    expect(matchCatalogEntry("Savings bank account").id).toBe(
      "savings_account"
    );
    expect(matchCatalogEntry("Sallery account").id).toBe("salary_account");
    expect(matchCatalogEntry("Cash").id).toBe("cash");
    expect(matchCatalogEntry("Credit card").id).toBe("credit_card");
    expect(matchCatalogEntry("upi wallet").id).toBe("upi_wallet");
  });

  it("checks a catalog entry's own hints before falling back to Other, even when accountKind.ts's bucket alone would say other", () => {
    // "UPI" alone has none of accountKind.ts's own keywords ("wallet", "cash",
    // etc.) so canonicalAccountTypeId returns "other" for it -- the catalog's
    // own "upi" hint on the UPI/Wallet entry must still catch it.
    expect(matchCatalogEntry("UPI").id).toBe("upi_wallet");
  });

  it("falls back to Other for unrecognized text", () => {
    expect(matchCatalogEntry("Crypto").id).toBe("other");
    expect(matchCatalogEntry("").id).toBe("other");
  });

  it("defaults ambiguous bank-bucket names to Savings Account", () => {
    expect(matchCatalogEntry("HDFC Bank").id).toBe("savings_account");
  });
});

describe("ACCOUNT_TYPE_CATALOG", () => {
  it("never duplicates a catalog id", () => {
    const ids = ACCOUNT_TYPE_CATALOG.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("places Other last", () => {
    expect(ACCOUNT_TYPE_CATALOG[ACCOUNT_TYPE_CATALOG.length - 1].id).toBe(
      "other"
    );
  });

  it("agrees with accountKind.ts's canonical classification for every entry's own label", () => {
    for (const entry of ACCOUNT_TYPE_CATALOG) {
      expect(canonicalAccountTypeId(entry.label)).toBe(
        entry.canonicalAccountTypeId
      );
    }
  });
});
