/**
 * SPENDLY-289 — which income-tax law governs which financial year.
 *
 * The Income-tax Act, 2025 (Act No. 30 of 2025, assent 21 August 2025) came
 * into force on 1 April 2026. It replaces "previous year" and "assessment year"
 * with a single "tax year". Income up to 31 March 2026 stays under the
 * Income-tax Act, 1961, so FY 2025-26 is still filed as AY 2026-27.
 *
 * Verified 2026-11-07; sources in docs/SPENDLY-289-tax-model.md. A change here
 * changes every year label in the app, so it needs a test and a doc update.
 */

import type { TaxLaw } from "../types";

/** First financial year governed by the Income-tax Act, 2025. */
export const ITA2025_FIRST_FY = "2026-27";

/** Start year of `ITA2025_FIRST_FY`. */
export const ITA2025_FIRST_START_YEAR = 2026;

/** Earliest year the tax center offers. Older years have no rules or deadlines. */
export const TAX_CENTER_FIRST_FY = "2024-25";

export const TAX_LAW_NAMES: Record<TaxLaw, string> = {
  ITA1961: "Income-tax Act, 1961",
  ITA2025: "Income-tax Act, 2025",
};
