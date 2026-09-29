# SPENDLY-317 — Fee detail, evidence and transaction linkage

**Ticket:** [SPENDLY-317](https://kesavach.atlassian.net/browse/SPENDLY-317) (Story)
**Epic:** [SPENDLY-312](https://kesavach.atlassian.net/browse/SPENDLY-312) — see [epic record](SPENDLY-312-fee-charges-intelligence.md)
**Branch:** `feature/SPENDLY-317-fee-detail`, cut from the epic branch after 316.
**Depends on:** 313–316
**Scope:** Spendly only. No rules, index or data-model changes.

---

## 1. What users see

A new route, `/fees/[key]`, where the key is `{kind}__{id}`. It opens from any
fee row in Overview, Review or All fees. It shows:

* **What the fee is:** the fee title, its status, the signed amount, and whether and how it counts in the totals.
* **Where it came from:** date, account or card (masked as `Name ••1234`), bank or provider, the description (already digit-masked), category, and **Open transaction**, which goes to `/transactions/[id]`.
* **What the amount is made of:** the non-zero parts. Purchase is labelled "not a fee", then fee, GST/tax and interest.
* **Relationships:**
  * For a GST row or a reversal: the fee it belongs to.
  * For a fee: its linked GST rows, reversals and refunds, each with its status and a link to its own detail, plus the net fee after them.
* **Why Spendly shows this:** the evidence and its provenance ("Detected by Spendly (rules v1) with 92% confidence", or "Reviewed by you on … (revision n)").
* **Your note**, and the **correction history**.
* **Review / correct this fee**, which opens the SPENDLY-315 sheet.

The way back: `/transactions/[id]` now shows a **Fees & charges** card
whenever Spendly has a fee record for that transaction, and it links to the fee
detail.

## 2. Design

### 2.1 Same sum as the dashboard
`buildFeeDetail` computes the detail's "net fee after these" as
`feeComponentTotals` over the record plus its *counted* children. That is the
function the overview uses. A test asserts the detail's net fee and GST equal the
overview's by-type row over the same records. Uncertain children are listed, but
they don't change the net.

### 2.2 Masking
* Account labels only ever show the last four digits (`maskedAccountLabel`), taken from `last4` or the digits of the legacy `accountNumber`.
* Descriptions and evidence were already masked at the source by `maskSensitiveDigits` (314).
* The test asserts that no run of 5+ digits can appear.

### 2.3 Review flow moves to the detail
In 315, tapping a row opened the review sheet directly. It now opens the detail,
which is the "every claim is traceable" surface, and the sheet opens from there.
Bulk review stays on the list. The save logic moved into
`hooks/useFeeReviewActions.ts`, so the list and the detail share one path for
provenance, offline messages and error copy.

### 2.4 Route layout
* `app/(app)/fees.tsx` → `fees/index.tsx`, and `fees/[key].tsx` is new.
* Both are registered in the stack.
* `/fees/` is added to the sub-screen prefixes (Android back pops) and to the restorable routes, with tests.

### 2.5 Cost of the transaction card
`TransactionFeeCard` mounts `useFeeIntelligence`. Detection reuses the
per-session cache, so it is cheap after the first run. The `feeReviews`
listener lives only while that screen is open, which matches how
`useLedgerEvents` is used there.

## 3. Files

| File | What |
|---|---|
| `shared/utils/feeDetail.ts` (+test, 9) | Detail model, masking, provenance text, links |
| `app/(app)/fees/[key].tsx` | Detail screen |
| `app/(app)/fees/index.tsx` | Moved from `fees.tsx`; rows open the detail; uses the shared actions hook |
| `hooks/useFeeReviewActions.ts` | Shared save logic (single + bulk) |
| `components/fees/TransactionFeeCard.tsx`, `app/(app)/transactions/[id].tsx` | The way back from a transaction |
| `app/(app)/_layout.tsx`, `shared/config/navigation.ts`, `routeRestoration.ts` (+tests) | Routes |

## 4. Tests and validation

* `npm test`: 297 files / 4750 tests.
* `typecheck` and `typecheck:shared` are clean.
* **Not yet checked on a device.**

## 5. Manual testing guide

1. Seed a fee (₹500), its GST (₹90) and a reversal (₹500) as in the 315 and 316 guides.
2. Go to Fees → Overview and tap the fee under Recent. The detail should show the GST and the reversal under linked records, with a net fee of ₹0 + GST ₹90.
3. Check that this matches the fee type's row in Overview.
4. Tap **Open transaction**. On the transaction screen, the **Fees & charges** card should take you back to the fee.
5. Tap the reversal in the linked list. Its detail should show "Gives back this fee".
6. Check that the account shows only `••` and the last four digits.
7. Tap **Correct this fee**, change the type and save. The detail should update, and correction history should show the earlier revision.
