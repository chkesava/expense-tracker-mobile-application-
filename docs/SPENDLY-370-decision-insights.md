# SPENDLY-370 — Decision insights and retrospective analytics

**Ticket:** [SPENDLY-370](https://kesavach.atlassian.net/browse/SPENDLY-370) (Story)
**Epic:** [SPENDLY-361](https://kesavach.atlassian.net/browse/SPENDLY-361) — see [epic record](SPENDLY-361-financial-decision-journal.md)
**Branch:** `feature/SPENDLY-370-decision-insights`, cut from the epic branch after 369 and merged back with approval.
**Depends on:** 362–369
**Scope:** Spendly only. No rules or data-model changes.

---

## 1. What users see

A light-bulb button on the `/decisions` header opens **Decision insights** (`/decisions/insights`). It only appears once there is at least one decision past draft. The screen shows:

| Insight | Calculation (also shown in the app) | Shown when |
|---|---|---|
| By category | Count of decisions past draft (including archived), grouped by category. Names a category only if it clearly leads | Any decision |
| Open vs reviewed/closed | Open = considering, decided or tracking. Done = reviewed or closed. Archived excluded | Any |
| Looked back on | Decided-or-later decisions that are reviewed, closed or have an outcome | Any decided |
| Expected vs actual | Counts of more / less / same, only for decisions where the expected amount (from the snapshot) and the actual amount are in the same unit | At least 3 such decisions |
| How you said things turned out | Counts of the user's **own** assessments | Any assessment |
| Repeated themes | Title words of 4+ letters (stop-words removed) that appear in 3 or more decisions; top 3 | 3 or more |
| Time to decide | Median of date decided − date started | 3 or more |
| Time to look back | Median of date outcome recorded − date decided | 3 or more |
| Lessons | The user's lessons, newest first | Any |

Tapping an insight opens **How this was worked out** and **Decisions behind this**. Each decision listed there opens its detail.

## 2. Design

### 2.1 Descriptive and traceable
Every insight carries its `basis` text and a non-empty `decisionIds`. A test checks that every id belongs to a real decision and every basis is present. Insights never mutate decisions.

### 2.2 Small data doesn't mislead
* Percentages appear only when at least `MIN_FOR_PERCENT` (5) decisions sit behind them. Below that the app shows counts, such as "1 of 2", and the basis says why.
* Medians and expected-vs-actual comparisons need at least 3.
* A category is called the leader only if it beats the next one.

### 2.3 No advice, no verdicts
* There are no provider, product or investment suggestions.
* Outcome verdicts come only from the user's own assessments, and the basis says "Spendly doesn't rate decisions".
* The expected-vs-actual insight counts "more" and "less", never "better" or "worse".
* A test forbids phrases such as "recommend", "you should", "invest in", "switch to", "best option", "success" and "failure".

### 2.4 Performance
Grouping happens in a single pass with in-place pushes. A first draft copied an array on every insert, which made it quadratic; the fix was found by the 20,000-decision timing test. 20,000 decisions now build comfortably inside the 2-second budget.

## 3. Files

| File | What |
|---|---|
| `shared/utils/decisionInsights.ts` (+test, 11) | All insights, small-data guards, drill-down ids |
| `app/(app)/decisions/insights.tsx` | Insights screen and drill-down sheet |
| `app/(app)/decisions/index.tsx`, `app/(app)/_layout.tsx` | Entry button and route |

## 4. Validation

* `npm test`: 301 files / 4713 tests.
* `typecheck` and `typecheck:shared`: clean.
* **Not yet checked on a device.**

## 5. Manual testing guide

1. With two decided decisions, open **Decision insights**. It should say "1 of 2", not "50%", and show no medians.
2. Add enough decided and reviewed decisions (5 or more) to get a percentage, and 3 or more with amounts on both sides to see expected vs actual.
3. Tap any insight and check the explanation, then open a decision from the list.
4. Give three decisions titles that share a word, such as "home". The word should show as a theme.
