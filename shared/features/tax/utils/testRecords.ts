/**
 * SPENDLY-289 — representative Indian tax records for tests. Values are
 * invented for testing; TANs/BSR codes have the right shape but are not real.
 */

import type { TaxEntryDraft } from "./validation";

export const FY = "2025-26";

export const SALARY_FORM16: TaxEntryDraft<"form16"> = {
  fy: FY,
  kind: "form16",
  fields: {
    employerName: "Acme Software Pvt Ltd",
    tan: "BLRA12345B",
    periodFrom: "2025-04-01",
    periodTo: "2026-03-31",
    grossSalary: 1_850_000,
    exemptAllowances: null,
    standardDeduction: 75_000,
    professionalTax: 2_400,
    taxableSalary: null,
    tdsDeducted: 182_340,
  },
};

export const BANK_INTEREST_TDS: TaxEntryDraft<"tds"> = {
  fy: FY,
  kind: "tds",
  fields: {
    deductorName: "State Bank of India",
    tan: "MUMS98765C",
    section: "194A",
    form: "16A",
    quarter: "Q3",
    amountPaid: 48_250.4,
    tdsAmount: 4_825.04,
  },
};

export const AIS_DIVIDEND: TaxEntryDraft<"ais_value"> = {
  fy: FY,
  kind: "ais_value",
  fields: {
    statement: "AIS",
    infoCategory: "dividend",
    sourceName: "Infosys Ltd",
    reportedAmount: 3_120,
    tdsAmount: null,
  },
};

export const ELSS_DEDUCTION: TaxEntryDraft<"deduction"> = {
  fy: FY,
  kind: "deduction",
  fields: { category: "elss", amount: 50_000, proofStatus: "missing" },
};

export const EQUITY_SALE: TaxEntryDraft<"capital_gain"> = {
  fy: FY,
  kind: "capital_gain",
  fields: {
    mode: "row",
    assetClass: "listed_equity",
    assetName: "Infosys Ltd",
    isin: "INE009A01021",
    quantity: 10,
    acquiredDate: "2023-05-10",
    soldDate: "2025-11-20",
    costOfAcquisition: 12_600,
    saleValue: 15_430.5,
    transferExpenses: 21.35,
  },
};

export const ADVANCE_TAX_SEPTEMBER: TaxEntryDraft<"tax_payment"> = {
  fy: FY,
  kind: "tax_payment",
  fields: {
    paymentType: "advance_tax",
    date: "2025-09-15",
    amount: 15_000,
    bsrCode: "0510308",
    challanSerial: "00412",
  },
};

export const SELF_ASSESSMENT_JULY: TaxEntryDraft<"tax_payment"> = {
  fy: FY,
  kind: "tax_payment",
  fields: { paymentType: "self_assessment", date: "2026-07-20", amount: 3_460 },
};

export const RENT_RECEIVED: TaxEntryDraft<"income"> = {
  fy: FY,
  kind: "income",
  fields: { category: "rental", amount: 216_000, payer: "Tenant (annual total)" },
};

export const ALL_RECORDS: TaxEntryDraft[] = [
  SALARY_FORM16,
  BANK_INTEREST_TDS,
  AIS_DIVIDEND,
  ELSS_DEDUCTION,
  EQUITY_SALE,
  ADVANCE_TAX_SEPTEMBER,
  SELF_ASSESSMENT_JULY,
  RENT_RECEIVED,
];
