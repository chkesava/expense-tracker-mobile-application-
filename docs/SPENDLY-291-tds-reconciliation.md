# SPENDLY-291: TDS, Form 16/16A and AIS/TIS/26AS reconciliation

**Epic:** SPENDLY-288 ([tracker](SPENDLY-288-tax-itr-readiness.md), [plan](SPENDLY-288-plan.md)).

**Branch:** `feature/SPENDLY-291-tds-reconciliation`, from the epic branch.

## What the user sees

**Tax center → TDS & Form 16 (`/tax/{fy}/tds`)**
- **Add** one of:
  - a **Form 16** (employer, TAN, period, gross salary, optional exemptions, standard deduction, professional tax and taxable salary, and tax deducted);
  - a **TDS certificate** (16A, 16B, 16C or other: deductor, TAN, section, quarter, amount paid, tax deducted);
  - an **AIS / TIS / 26AS line** (statement, what it reports, who reported it, TAN, section, amount, tax deducted).
- **Typed from the documents:** every value is typed from the document. No government portal is reached, and Spendly changes nothing. Proofs from Documents (SPENDLY-298) can be attached.
- **Comparison:** one row per deductor and section, stating:
  - Matches;
  - Doesn't match;
  - Not in your 26AS/AIS;
  - No certificate added;
  - Add the TAN to compare;
  - Difference accepted;
  - Changed since you accepted.

  Opening a row shows both sides (TDS, amount paid, number of lines) and says in words which amount differs, in which direction and by how much. A difference can be **accepted** after the user has checked it, and the acceptance can be undone.
- **Totals:** TDS on your certificates against TDS in your statement.
- **Lists:** your certificates, and your statement lines. **TANs are masked in lists** (`••••••765C`), and a record entered twice shows "Possible duplicate".
- **States:** empty, loading, error and offline.

## Matching (`shared/features/tax/utils/tdsReconcile.ts`)

- **One statement, never both:** 26AS when the year has any 26AS line, else AIS. They report the same tax, so using both would count it twice. TIS is a summary of AIS and isn't used.
- **Statement lines:** those that carry TDS (`tdsAmount > 0`, or category "tds", whose own amount is the tax).
- **Key:** TAN plus section group.
  - Salary is one group: Form 16, section 192 (1961 Act) or 392 (2025 Act), or an AIS "salary" line.
  - Other sections are compared as typed, ignoring case and spaces.
- **Sums:** each side is summed per key, so quarterly certificates meet a yearly statement line.
- **No TAN:** the row is "needs TAN"; it can't be matched deterministically.
- **Amounts:** compared to the paisa. If either side doesn't give the amount paid, only TDS is compared, and the sheet says so.
- **Order:** rows are sorted with problems first, and the result is the same whatever order the entries come in (tested).

## Accepting a difference

- **Stored as:** a `taxReviews` row with the new source kind **`reconciliation`**, id `{fy}__reconciliation__{key}`, decision `confirm` (the only decision allowed). Its `sourceAmount` is the size of the difference.
- **Re-opening:** if the difference changes later, the row becomes "Changed since you accepted". Nothing is overwritten, and the records themselves never change.
- **R4.3a:** before writing, `services/tax/taxTdsStore.ts` reads the year's records from Firestore (bounded to 500) and works the row out again. If the difference isn't what the user saw, nothing is written. Accepting needs a connection.
- **Undo:** deletes the review.

**Model and rules change:**
- `TAX_SOURCE_KINDS` gains `reconciliation`, and validation allows only `confirm` for it.
- `firestore.rules` gets the same, and the contract test keeps the enum in step.
- **Deploy:** this ships with the tax rules deploy (709, still pending).

## Reusable pieces

- **`shared/features/tax/utils/entryForms.ts`:** forms described as data (Form 16, TDS, AIS line) with text-to-draft conversion.
  - An empty optional amount is left out, and an "unknown" amount is stored as `null`, never 0.
  - Messages use the form's own labels.
  - `duplicateTaxEntry` spots a likely duplicate.
- **`components/tax/TaxEntryFormSheet.tsx`:** renders any spec, with the proof attachment, the duplicate warning ("Save anyway") and Delete. Deductions (292), payments (294) and capital gains (293) will add their specs.
- **`hooks/useTaxRecordActions.ts`:** save, soft delete, accept and undo, with honest toasts.

## Demo data (local test only)

`scripts/seed-emulator.js` adds, for the year that ended last:
- a Form 16 (TDS 92,340) and its 26AS salary line (TDS 92,000): **Doesn't match**, by ₹340;
- an SBI 16A and its 26AS interest line: **Matches**;
- a 26AS dividend line with no certificate: **No certificate added**.

## Tests

| File | Covers |
|---|---|
| `tdsReconcile.test.ts` | Salary groups under both Acts, statement choice, TAN masking, quarterly sums meeting a yearly line to the paisa, mismatch amounts, missing on either side, no TAN, TDS-only comparison, acceptance and re-opening, deleted / other-year / TIS / no-TDS lines ignored, problems first and order-independent, record summaries |
| `entryForms.test.ts` | Specs use only allowed fields; Form 16 with unknown optional amounts; unknown amount paid stored as `null`; labelled messages; round trip; duplicates |
| `services/tax/taxTdsStore.test.ts` | Acceptance written with the size Firestore confirms; nothing written when Firestore differs or now matches; undo |
| `validation.test.ts`, `firestore/tax.rules.test.ts` | A reconciliation review can only be `confirm` |
| navigation and route-restoration tests | `/tax/{fy}/tds` |
