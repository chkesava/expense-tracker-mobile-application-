# SPENDLY-294: Tax payments, advance tax and self-assessment

**Epic:** SPENDLY-288 ([tracker](SPENDLY-288-tax-itr-readiness.md), [plan](SPENDLY-288-plan.md)).

**Branch:** `feature/SPENDLY-294-tax-payments`, from the epic branch.

## What the user sees

**Tax center → Tax payments (`/tax/{fy}/payments`)**
- **Year:** the notice names the year the tax was paid for, through `taxYearLabel` ("FY 2025-26 · AY 2026-27" or "Tax year 2026-27"), so the year is always explicit.
- **Totals:** advance tax, self-assessment and total paid. Each is a sum of the recorded payments, and each payment is listed.
- **Each payment** shows its type, date, challan reference (BSR + serial, or the CIN's last digits), amount and a status:
  - **In your 26AS/AIS:** a matching statement line.
  - **Not in your 26AS/AIS.**
  - **Add the challan details:** no BSR + serial and no CIN.
  - **Recorded:** no statement to compare against.
- **Statement lines:** "In your 26AS but not recorded" lists tax-paid lines no payment accounts for.
- **Actions:** add, edit and delete (soft delete, kept in history). Attach the challan receipt from Documents. A payment entered twice is flagged.
- **States:** empty, loading, error and offline.

## Rules (`shared/features/tax/utils/payments.ts`)

- **Records:** each payment is a `taxEntries` row of kind `tax_payment`: type, date, amount, and optionally BSR code, challan serial and CIN.
- **Validation** (SPENDLY-289): advance tax is dated inside the year. Self-assessment and other payments are dated on or after the year's start, and never in the future. BSR has 7 digits, the serial 5 and the CIN 20; spaces are ignored.
- **Duplicates:** BSR + serial + date identifies a challan. Without one, the key is type + date + amount.
- **Statement:** 26AS if the year has any 26AS line, else AIS, as for TDS (`reconciliationStatement`). Its "tax paid" lines are compared.
- **Matching:** payments in date order, each to the first unused line of the same amount (to the paisa). The result doesn't depend on entry order (tested). Unmatched items on either side are shown, never explained away.
- **No processing:** nothing here pays or tracks payments with a bank or the government.

**Form:** the generic form (`ENTRY_FORMS.tax_payment`) gained two things:
- a `digits` field type (number keypad, exact length, spaces removed);
- a `dateRange: "afterYearStart"` option, so a self-assessment payment can be dated after the year ends, up to today.

`TaxRecordRow` takes an optional status line.

**Not in this story:** suggesting Spendly expenses categorised "Income Tax" as payments to record. The plan mentioned it, but it isn't in the ticket's scope, and it would need the whole year of expenses loaded. It can be a follow-up.

## Demo data (local test only)

The year that ended last gets:
- advance tax of ₹15,000 in September (in the 26AS) and ₹15,000 in December (not in the 26AS);
- a ₹3,460 self-assessment payment without challan details;
- a ₹12,000 26AS tax-paid line with no recorded payment.

## Tests

| File | Covers |
|---|---|
| `payments.test.ts` | Totals by type; date order; missing references flagged; matching both ways against the chosen statement (AIS ignored when 26AS exists); order-independent; deleted and other-year ignored; reference rules and text; the form's year rule for advance tax, reference shapes, and spaces removed from a CIN |
| navigation and route-restoration tests | `/tax/{fy}/payments` |
