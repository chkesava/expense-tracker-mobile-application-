# SPENDLY-323 — Fee & Charges Intelligence: QA, accuracy, privacy, performance and rollout

**Ticket:** [SPENDLY-323](https://kesavach.atlassian.net/browse/SPENDLY-323) (Story)
**Epic:** [SPENDLY-312](https://kesavach.atlassian.net/browse/SPENDLY-312) — see [epic record](SPENDLY-312-fee-charges-intelligence.md)
**Branch:** `feature/SPENDLY-323-fee-qa-rollout`, cut from the epic branch after 322 and merged back with approval.
**Status:** Partial by agreement (2026-09-30). The parts that can be done now are complete. Calendar and notification QA waits for 320/321 (on hold), and device QA needs a device run. **323 stays In Progress, and the epic cannot be marked Done yet.**

---

## 1. Scope status

| Ticket scope item | Status | Where |
|---|---|---|
| Detection/classification accuracy tests | Done | `shared/utils/feeIntelligence.qa.test.ts` §1, `feeDetection.test.ts` (68) |
| GST, interest, principal, reversal and refund separation | Done | QA §2–3, `feeModel.test.ts`, `feeDashboard.test.ts` |
| User correction persistence | Done | QA §5, `feeDetection.test.ts` |
| Dashboard/detail reconciliation | Done | QA §2 |
| Pattern/anomaly false-positive testing | Done | QA §4, `feePatterns.test.ts`, `feeAnomalies.test.ts` |
| Financial Calendar integration | **Open**: needs SPENDLY-320, on hold for SPENDLY-176 | — |
| Notification integration | **Open**: needs SPENDLY-321, on hold for SPENDLY-222 | — |
| Firestore security/privacy tests | Done | `firestore/feeReviews.rules.test.ts`, `feeSignalDismissals.rules.test.ts`, contract tests, QA §6 |
| Offline/loading/error testing | Done (code review + fixes, §5) | — |
| Android performance and memory profiling | **Open**: device | §9 checklist |
| Accessibility and signed-build QA | **Open**: device | §9 checklist |

## 2. Accuracy

The labelled corpus in QA §1 has 33 bank and SMS style narrations:

* 18 fees or interest charges across every fee family, on the account type where they normally occur;
* 4 ambiguous rows that must stay candidates;
* 11 ordinary rows that must not be fees: ATM withdrawals, food, shopping, school fees, a doctor's fee, a card payment, an EMI, a UPI transfer, a utility bill, and a bare "charges".

**Result: 33 of 33 classified as labelled, with 0 false "detected" fees.**

The corpus is hand-built from common Indian narration formats. It shows the
rules behave as designed. It does **not** measure recall on real users'
data, so field recall is unknown until rollout (see §7).

## 3. Reconciliation and double counting

These are checked over one realistic 6-month ledger:

* The dashboard hero equals `feeComponentTotals` of the month's records.
* Every breakdown and the trend's last point add up to the hero.
* The insight headline says the same number.
* Fee-detail net effects summed over all parent fees equal the all-time dashboard cost.
* Interest is reported separately and is never inside fee cost.
* Every fee record points at exactly one existing ledger row, once.
* Each record's parts equal its source amount.
* Counted fee + tax + interest never exceed the counted source rows.
* The pipeline never mutates the ledger rows it reads.

**Existing expense totals are unchanged.** Fee intelligence only reads the
ledger. A fee expense still counts as an expense everywhere else in Spendly,
exactly as before. The fee screens are a separate view of those same rows, not
an adjustment to them.

## 4. Security and privacy

| Collection | Protection | Tests |
|---|---|---|
| `users/{uid}/feeReviews/{kind}__{id}` | Owner and duress twin only; id bound to body (one review per transaction); `hasOnly` field allowlist, which also refuses money fields; closed enums; bounded components, history (≤ 20) and note; identity and `createdAtMs` pinned; revision must advance | 12 emulator tests + contract |
| `users/{uid}/feeSignalDismissals/{signalId}` | Owner and duress twin only; id bound to `kind`; closed enums; 1–12 record keys; no money fields | 3 emulator tests + contract |

The QA §6 contract also checks that every field `buildFeeReview` can write is
in the rules' allowlist. That catches TS–rules drift before a write is refused
in production.

**Privacy:**
* Neither collection stores narration text, merchant names or account numbers. A review stores ids, the classification and the user's own optional note. QA §6 asserts the review payload contains no narration or last-four digits.
* On screen, account labels show only `••1234`, and runs of 5 or more digits in descriptions and evidence are masked.
* Both listeners mount only while a fee screen is open, and are scoped to the signed-in uid.
* On a user switch, the in-memory detection result is cleared.

## 5. Offline, loading and error review

| Surface | Loading | Error | Empty | Offline |
|---|---|---|---|---|
| Fees list (Overview/Review/All) | Skeleton until full history + reviews + first pass | `ErrorState`, retry when retryable | "No fees found yet" / "All caught up" / overview empty | Banner; writes queue through the outbox, and the toast says "saved offline" or "on this device" honestly |
| Fee detail | Skeleton | `ErrorState` + retry | "This fee isn't here any more" | Offline note in the review sheet |
| Review sheet | Button spinner | Inline issues; toast from `lib/errors` | — | Offline note |
| Signals | — | Dismissals fail to load → show **all** signals rather than hide any | Section hidden | Dismiss queues |
| Insights entry card | "Checking…" | **Fixed in 323:** it used to stay on "Checking…" forever after an error; now it says it couldn't check | Default text | — |
| `useFeeIntelligence` | — | — | **Fixed in 323:** no longer reports loading forever when no user is signed in | — |

## 6. Performance (measured under Node; Android not yet profiled)

| Step | Size | Time |
|---|---|---|
| Detection, cold + cached run | 20,500 rows | ~0.9 s total; the cached run is faster than the cold one |
| Dashboard aggregation | 20,000 records | < 1.5 s budget (test) |
| Patterns | 20,000 records | ~0.3 s |

**Design measures:**
* Detection runs only once the full history has loaded, and after interactions (`InteractionManager`).
* One detection cache per uid for the session.
* The reversal and GST pairing pool is indexed by amount.
* Screens memoise their aggregates.
* Listeners exist only while a fee screen is open.
* No new realtime listener on the app shell.

**Android concern to verify on device:** Hermes is slower than Node. A cold
detection run on a very large history could take a few seconds on the JS
thread after the screen opens. If profiling confirms this, the mitigation is to
chunk `detectFees` across frames.

## 7. Known detection limitations

1. The rules are India-first and English-only. Unfamiliar bank abbreviations fall back to category-based detection, or are missed. Missing a fee is accepted; the epic does not promise every fee.
2. GST pairing and the "GST included" split assume 18%.
3. Only expenses, incomes and manual account entries are read. Fees inside card statements are only seen once they are imported as expenses.
4. Reversals must match a fee's whole amount or its fee part, on the same account, within 90 days. Anything else stays a candidate until the user links it.
5. Pattern cadence needs at least 3 charges across 2 months, or an annual fee seen twice. New users see few patterns at first.
6. "Worth understanding" text is general information about charge types, not a statement about the user's account terms.
7. Field recall is unmeasured (§2).

## 8. Rollout, rollback and monitoring

**Rollout order matters.** The fee screens read `feeReviews` from their first
render. If the app ships before the rules, every fee screen shows "Couldn't
load fees" (permission denied).

1. **Deploy Firestore rules first**, using the manual `firestore-rules-deploy.yml` workflow (`docs/FIREBASE_RULES_DEPLOY.md`), after `npm run test:rules` passes. **Deploy rules only, not indexes.** This epic adds no indexes, and the repo's index file is known to be a subset of what is deployed.
2. **Merge the epic** `feature/SPENDLY-312-fee-charges-intelligence` → `main`, only with explicit approval and once the open items are accepted or done.
3. **Release the app** through the normal release workflow. No native module was added, so no new dev client is needed.
4. After release, move the stories to Done (per project convention).

**Rollback:**
* **App:** revert the epic merge on `main` and release. The fee screens and entry points disappear.
* **Data:** both collections are additive and never touch ledger rows, so no migration or cleanup is needed. Leftover `feeReviews` and `feeSignalDismissals` docs are inert.
* **Rules:** the new match blocks are harmless if left in place. They can be reverted with the same workflow.

**Monitoring** (`lib/errors` scopes):
* `snapshot.feeReviews` and `snapshot.feeSignalDismissals`: a spike in permission errors means the rules are not deployed.
* `fees.saveReview`, `fees.saveBulk`, `fees.dismissSignal`, `fees.restoreSignal`.
* `firestoreWrite.lateFailure` with label `fee review`, `fee reviews` or `fee signal`.

## 9. Device QA checklist (open)

Run this on **Spendly Test** against the local emulator (`docs/LOCAL_TEST_MODE.md`), never the real app. Record the display size and density, navigation mode and theme before starting, and restore those exact values afterwards.

- [ ] Seed with the guides in the 315–322 docs; add about 5k synthetic rows for the performance pass.
- [ ] Performance: open Fees on a cold start and capture the JS frame timeline. Note the time until the Overview renders, and any dropped frames while scrolling Overview and All fees.
- [ ] Memory: note the heap before and after opening Fees, the detail screen and the sheets, and after going back.
- [ ] Accessibility:
  - [ ] TalkBack across Overview, rows, sheets, chips and the bulk mode;
  - [ ] large font scale;
  - [ ] light and dark themes and a non-default accent;
  - [ ] 3-button and gesture navigation;
  - [ ] touch targets of at least 48dp.
- [ ] Offline: airplane mode, then confirm, dismiss and correct. Check the toasts, then that everything syncs after reconnecting.
- [ ] Deep links and back:
  - [ ] Insights → Fees → detail → transaction → fee card → detail;
  - [ ] Android back at each step;
  - [ ] cold start restoring `/fees` and `/fees/[key]`.
- [ ] Signed release build (`assembleRelease` with the release key; back up and restore signing around any prebuild). Install over the existing build and smoke-test the above.

## 10. Files

| File | What |
|---|---|
| `shared/utils/feeIntelligence.qa.test.ts` (17) | End-to-end QA suite (§1–6) |
| `components/fees/FeeInsightsEntryCard.tsx` | Error state fix |
| `hooks/useFeeIntelligence.ts` | No perpetual loading without a user |

## 11. Validation

* `npm test`: 301 files / 4809 tests.
* `npm run test:rules`: 17 files / 480 tests.
* `typecheck` and `typecheck:shared` are clean.
