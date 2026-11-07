import { describe, expect, it } from "vitest";

import { buildTaxEntry } from "./builders";
import { saleListSummary, holdingText, capitalGainStatus } from "./capitalGainLabels";
import type { CapitalGainRow } from "./capitalGains";
import {
  CAPITAL_GAIN_TOTAL_FORM,
  emptyEntryForm,
  ENTRY_FORMS,
  entryFormSpecFor,
  entryFormToDraft,
  entryToForm,
  parseTaxQuantity,
  type EntryFormSpec,
} from "./entryForms";

const FY = "2025-26";
const TODAY = "2026-11-07";
const SALE = ENTRY_FORMS.capital_gain as EntryFormSpec;

describe("the sale form (SPENDLY-293)", () => {
  const values = {
    ...emptyEntryForm(SALE),
    assetClass: "listed_equity",
    assetName: "Infosys Ltd",
    isin: "ine009a 01021",
    quantity: "1,000.5",
    acquiredDate: "2019-04-02",
    soldDate: "2025-11-20",
    saleValue: "15,430.50",
    costOfAcquisition: "",
  };

  it("makes a row: buy date before the year allowed, ISIN cleaned, empty cost unknown, no term stored", () => {
    const { draft, issues } = entryFormToDraft(SALE, values, FY, {}, TODAY);
    expect(issues).toEqual([]);
    expect(draft?.fields).toEqual({
      mode: "row",
      assetClass: "listed_equity",
      assetName: "Infosys Ltd",
      isin: "INE009A01021",
      quantity: 1000.5,
      acquiredDate: "2019-04-02",
      soldDate: "2025-11-20",
      saleValue: 15430.5,
      costOfAcquisition: null,
    });
  });

  it("rejects a bad quantity and a buy date after the sale", () => {
    expect(entryFormToDraft(SALE, { ...values, quantity: "-3" }, FY, {}, TODAY).issues).toContainEqual({ field: "fields.quantity", code: "invalid_quantity" });
    expect(entryFormToDraft(SALE, { ...values, acquiredDate: "2025-12-01" }, FY, {}, TODAY).issues).toContainEqual({ field: "fields.acquiredDate", code: "date_order" });
    expect(entryFormToDraft(SALE, { ...values, soldDate: "2026-04-02" }, FY, {}, TODAY).draft).toBeNull();
  });

  it("parses quantities", () => {
    expect(parseTaxQuantity("12")).toBe(12);
    expect(parseTaxQuantity("0.12345678")).toBe(0.12345678);
    expect(parseTaxQuantity("0")).toBeNull();
    expect(parseTaxQuantity("1e3")).toBeNull();
    expect(parseTaxQuantity("abc")).toBeNull();
  });
});

describe("the statement total form", () => {
  const values = {
    ...emptyEntryForm(CAPITAL_GAIN_TOTAL_FORM),
    assetClass: "equity_mutual_fund",
    term: "long_term",
    assetName: "CAMS capital gains statement",
    soldDate: "2026-03-31",
    saleValue: "60000",
    costOfAcquisition: "48000",
  };

  it("makes a total with its term and no per-sale fields", () => {
    const { draft, issues } = entryFormToDraft(CAPITAL_GAIN_TOTAL_FORM, values, FY, {}, TODAY);
    expect(issues).toEqual([]);
    expect(draft?.fields).toEqual({
      mode: "statement_total",
      term: "long_term",
      assetClass: "equity_mutual_fund",
      assetName: "CAMS capital gains statement",
      soldDate: "2026-03-31",
      saleValue: 60000,
      costOfAcquisition: 48000,
    });
    expect(entryFormToDraft(CAPITAL_GAIN_TOTAL_FORM, { ...values, term: "" }, FY, {}, TODAY).issues).toContainEqual({ field: "fields.term", code: "required" });
  });

  it("an entry opens in the form it was made with", () => {
    const { draft } = entryFormToDraft(CAPITAL_GAIN_TOTAL_FORM, values, FY, {}, TODAY);
    const built = buildTaxEntry({ id: "e1", draft: draft!, nowMs: 1 });
    if (!built.ok) throw new Error("invalid");
    expect(entryFormSpecFor(built.value)).toBe(CAPITAL_GAIN_TOTAL_FORM);
    expect(entryToForm(CAPITAL_GAIN_TOTAL_FORM, built.value)).toMatchObject({ term: "long_term", saleValue: "60000" });
  });
});

describe("labels", () => {
  const row = (patch: Partial<CapitalGainRow>): CapitalGainRow => ({
    key: "s1:0",
    fy: FY,
    origin: "calculated",
    saleRef: { kind: "portfolio_transaction", id: "s1" },
    assetClass: "listed_equity",
    assetName: "Infosys",
    quantity: 10,
    acquiredDate: "2023-01-10",
    soldDate: "2025-08-01",
    cost: 1000,
    saleValue: 2000,
    transferExpenses: 0,
    holdingDays: 934,
    term: "long_term",
    ruleId: "x",
    gain: 1000,
    attention: [],
    included: false,
    decision: null,
    status: "confirm_to_count",
    ...patch,
  });

  it("sums a sale's lots, and an unknown lot makes the gain unknown", () => {
    const fmt = (d: string) => d;
    expect(saleListSummary([row({}), row({ key: "s1:1", quantity: 5, term: "short_term", gain: 240 })], fmt)).toEqual({
      title: "Infosys",
      subtitle: "15 units · sold 2025-08-01 · Long-term + Short-term · 2 lots",
      gain: 1240,
    });
    expect(saleListSummary([row({}), row({ key: "s1:1", gain: null, cost: null })], fmt).gain).toBeNull();
  });

  it("words the holding period and status", () => {
    expect(holdingText(1)).toBe("Held 1 day");
    expect(holdingText(200)).toBe("Held 6 months");
    expect(holdingText(934)).toBe("Held 2 years 6 months");
    expect(holdingText(null)).toBeNull();
    expect(capitalGainStatus(row({})).label).toBe("Confirm to count it");
    expect(capitalGainStatus(row({ status: "counted" })).label).toBe("Confirmed");
    expect(capitalGainStatus(row({ status: "counted", origin: "user_entered" })).label).toBe("You added this");
  });
});
