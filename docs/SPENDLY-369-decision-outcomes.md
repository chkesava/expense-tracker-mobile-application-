# SPENDLY-369 — Expected-vs-actual outcome tracking and review

**Ticket:** [SPENDLY-369](https://kesavach.atlassian.net/browse/SPENDLY-369) (Story)
**Epic:** [SPENDLY-361](https://kesavach.atlassian.net/browse/SPENDLY-361) — see [epic record](SPENDLY-361-financial-decision-journal.md)
**Branch:** `feature/SPENDLY-369-decision-outcomes`, cut from the epic branch after 368.
**Depends on:** 362 (snapshot, outcome field, lifecycle), 367 (review dates)
**Scope:** Spendly only. No rules change. The model gains an optional `outcome.reviewNotes`, which sits inside the `outcome` map the 362 rules already allow.

---

## 1. What users see

Every decision past draft now has an **Expected vs what happened** section on its detail page.

* **What you expected** is shown as a dashed, neutral card: the summary, the amount ("your estimate") and the by-date. Underneath it says "As you expected it when you decided on …". If the user edited their expectation after deciding, it adds "You edited it later; this is the original."
* **What actually happened** is shown as a solid card tinted in the primary colour. It holds:
  * the user's own summary and amount ("what you recorded");
  * **Your assessment**, if the user gave one;
  * lessons learned and review notes;
  * the recorded date and the "as of" date.
* **Difference** is a neutral line such as "₹1,000 (8.3%) less than you expected." When the two sides can't be compared, it gives the reason instead.
* **Record / Update what happened** opens a sheet with:
  * an "in your words" summary, which is the only required field;
  * an optional amount and an "as of" date, with a **Today** shortcut;
  * an optional assessment: better than I expected, about as expected, worse than I expected, mixed, not sure yet;
  * lessons learned and review notes;
  * **Mark this review complete**, on by default while the decision is decided or tracking.
* **Reopening:** on a reviewed decision the button reads **Reopen review**, which goes back to tracking. On a closed decision it reads **Reopen**, which goes back to reviewed.

## 2. Design

### 2.1 The expected side is the frozen one
`expectedForReview` reads the expected outcome from the snapshot frozen when the user decided (362). That snapshot is pinned by the write builder *and* by the Firestore rules. So editing the live expectation later can never quietly change what "expected" means. The card says when the two differ. Recording an outcome never touches `expected` or the snapshot, and a test checks this.

### 2.2 Difference only when comparable
`outcomeVariance` returns a number only when both sides have an amount *in the same unit*. Otherwise it returns a reason: no expected amount, no actual amount, or different units, each with user-facing text. The wording is "more" or "less than you expected", never "better" or "worse"; a test forbids judgement words.

### 2.3 Qualitative outcomes are complete outcomes
Only the summary is required. "Glad I waited — the price dropped" is a full outcome with no numbers.

### 2.4 No verdict from Spendly
The only judgement anywhere is `userAssessment`. It is optional, labelled **Your assessment**, and never filled in automatically; a test checks this.

### 2.5 Review lifecycle, audited
* `recordOutcome(..., completeReview)` moves a decided or tracking decision to *reviewed*.
* `reopenReview` moves reviewed → tracking, or closed → reviewed. The outcome is kept.
* Closing uses the existing lifecycle action.

Each step is a `buildDecisionWrite`. For example, completing a review logs `action: "status"`, `decided → reviewed`, `changedFields: ["outcome", "status"]`. Editing an outcome logs `action: "update"`, `["outcome"]`.

## 3. Files

| File | What |
|---|---|
| `shared/utils/decisionOutcome.ts` (+test, 13) | Expected-for-review, difference and its reasons, neutral sentence, assessment labels, draft ↔ outcome, record/complete/reopen |
| `shared/types/decision.ts`, `shared/utils/decisionModel.ts` | `outcome.reviewNotes` and its length check |
| `components/decisions/DecisionOutcomeSection.tsx` | Expected/actual cards, difference line, outcome sheet |
| `app/(app)/decisions/[id].tsx` | Section wiring, shared save, reopen labels |

## 4. Validation

* `npm test`: 300 files / 4702 tests.
* `typecheck` and `typecheck:shared`: clean.
* **Not yet checked on a device.**

## 5. Manual testing guide

1. Decide something with an expected amount of ₹12,000. Then edit the expected amount to ₹20,000.
2. In the detail, check that **What you expected** shows ₹12,000 with "You edited it later; this is the original."
3. Tap **Record what happened**, enter "Saved most of it" and ₹11,000, and save. The difference should read "₹1,000 (8.3%) less than you expected", and the status should become *Reviewed*.
4. Tap **Reopen review**. The status goes to tracking and the outcome is kept.
5. On another decision, record only words. The difference line should say no actual amount was recorded.
6. Check that no screen calls the decision a success or failure unless you picked an assessment yourself.
