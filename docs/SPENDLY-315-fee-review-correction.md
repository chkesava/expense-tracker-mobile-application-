# SPENDLY-315 — Fee review, confirmation and correction flow

**Ticket:** [SPENDLY-315](https://kesavach.atlassian.net/browse/SPENDLY-315) (Story)
**Epic:** [SPENDLY-312](https://kesavach.atlassian.net/browse/SPENDLY-312) — see [epic record](SPENDLY-312-fee-charges-intelligence.md)
**Branch:** `feature/SPENDLY-315-fee-review-correction`, cut from the epic branch. Not merged yet: waiting for approval.
**Depends on:** SPENDLY-313 (model), SPENDLY-314 (engine)
**Scope:** Spendly only.

---

## 1. What users can do

On the new `/fees` screen, which you reach from a card on Insights → Analytics:

* **Review** tab: every candidate the engine wasn't sure about, newest first. **All fees** tab: every record, each with its status.
* Tap a row to open the review sheet:
  * **Confirm** the reading, or mark it **Not a fee**.
  * **Change the role**: fee / GST on a fee / interest / reversal / refund / not a fee. The choices shown depend on whether money went out or came in.
  * **Change the fee type and subtype.**
  * **Split the amount** into purchase / fee / GST (and interest on credits). A "GST 18% included" button fills in the split, and a live line shows whether the parts add up.
  * **Link or unlink** the fee that a GST row, reversal or refund belongs to. Candidates are nearby confirmed fees on the same account.
  * Add a **note**.
  * The sheet also shows the evidence and confidence behind the reading, and the correction history.
* **Bulk review**: long-press a row, or use the select button, then **Confirm** or **Not fees**.
  * Bulk confirm only applies readings that are internally valid.
  * Readings with conflicting signals, a changed amount or a broken link are skipped, and the user is told to open them one by one.

## 2. Design

### 2.1 Confirm vs correct is computed, not chosen
`decisionFor` compares what the user submits with the engine's reading. If
nothing changed, the decision is *confirm*; otherwise it is *correct*. That
keeps the "Confirmed" and "Corrected" badges honest.

### 2.2 Correction history on the review document
`FeeReview.history` stores earlier states, oldest first, capped at 20
(`FEE_REVIEW_HISTORY_LIMIT`, mirrored in the rules and pinned by the contract
test). I chose this over a subcollection because the history is only ever read
together with its review, and a single document keeps each correction to one
atomic write. This extends the 313 model; the rules and emulator tests were
updated with it.

### 2.3 Original transaction stays intact
`services/fees/feeReviewStore.ts` writes only `users/{uid}/feeReviews/{kind}__{id}`,
through `commitMutations` (the outbox). Nothing touches the expense or income
itself, and the sheet says so.

### 2.4 Data loading
* `useFeeReviews` holds a listener that is mounted only by fee surfaces, never
  by the app shell. It uses no `orderBy`, so it needs no index.
* `useFeeIntelligence` runs `detectFees`:
  * only once the full expense and income history has loaded (`expensesComplete` / `incomesComplete`);
  * after interactions (`InteractionManager`);
  * with one detection cache per uid for the session.

### 2.5 States
* **Loading:** a skeleton while history or reviews load, or while the first detection pass runs.
* **Error:** `ErrorState` with a retry button when the error is retryable.
* **Empty:** two variants, "No fees found yet" and "All caught up".
* **Offline:** a banner on the list and in the sheet. Saves report `writeSavedMessage`, so the wording is honest about queued versus on-device-only writes.

### 2.6 Routing
* The `fees` Stack screen is registered.
* `/fees` is added to `SUB_SCREEN_ROUTES` (Android back pops the screen) and to `RESTORABLE_ROUTES`, both with tests.
* The Insights card is added to the Analytics tab header only.

### 2.7 Out of scope (in later stories)
* Totals and trends: SPENDLY-316. The Insights card deliberately shows only the review count.
* A full detail page and navigation to the source transaction: SPENDLY-317.
* Duplicate and anomaly signals: SPENDLY-319.

## 3. Files

| File | What |
|---|---|
| `shared/utils/feeReviewForm.ts` (+test) | Labels, draft ↔ classification, GST split, remainder, link options, bulk plan, ordering, history text |
| `shared/types/fee.ts`, `shared/utils/feeModel.ts` (+tests) | `FeeReviewHistoryEntry`, `history`, the cap |
| `firestore.rules`, `firestore/feeReviews.rules.test.ts`, `feeModel.rules.contract.test.ts` | `history` list ≤ 20 |
| `services/fees/feeReviewStore.ts` | Single, bulk (chunked) and clear writes |
| `hooks/useFeeReviews.ts`, `hooks/useFeeIntelligence.ts` | Listener and detection hook |
| `components/fees/*` | Row, status badge, review sheet, icons, Insights entry card |
| `app/(app)/fees.tsx`, `app/(app)/_layout.tsx`, `app/(app)/insights.tsx` | Screen, route, entry point |
| `shared/config/navigation.ts`, `routeRestoration.ts` (+tests) | `/fees` back/restore behaviour |

## 4. Tests and validation

* `feeReviewForm.test.ts`: 23 tests.
* New cases for history in the model, contract and emulator suites.
* `npm test`: 295 files / 4727 tests.
* `npm run test:rules`: 16 files / 477 tests.
* `typecheck` and `typecheck:shared` are clean.
* **Not yet checked on a device.** The screen has only been typechecked. Per `UI_ARCHITECTURE.md` §6 it still needs a pass on Spendly Test against the emulator: light and dark themes, large font, and 3-button vs gesture navigation.

## 5. Manual testing guide

1. Run `npm run emulators:local` and `npm run emulators:seed`, then launch Spendly Test (`docs/LOCAL_TEST_MODE.md`).
2. Add expenses with notes such as `ATM WDL CHG` (₹20), `IGST ON ATM WDL CHG` (₹3.60), `IRCTC convenience fee` (₹1,250, Travel & Holidays) and `NON MAINT CHGS` (₹590), plus an income `NON MAINT CHGS REVERSAL` (₹590).
3. Go to Insights → Analytics → **Fees & charges**. The IRCTC row should appear under Review.
4. Open it and try **Not a fee**; then reopen it from All fees and check the history line.
5. Open the ATM fee and press **GST 18% included**. It should show *Adds up*; save it and check that the badge reads **Corrected**.
6. Turn on airplane mode and confirm a row. The offline banner should show and the toast should say it is saved offline.
7. Long-press two rows, then **Confirm**.
