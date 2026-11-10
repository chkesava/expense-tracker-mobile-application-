# SPENDLY-296: Tax & ITR readiness dashboard and filing checklist

**Epic:** SPENDLY-288 ([tracker](SPENDLY-288-tax-itr-readiness.md), [plan](SPENDLY-288-plan.md) §10).

**Branch:** `feature/SPENDLY-296-readiness-dashboard`, from the epic branch.

**Invariant:** progress never implies the return is filed, or ready while something required is open. Facts, calculations and tasks are kept apart.

## What the user sees

**Tax center (`/tax`), now the dashboard.** Since SPENDLY-733 it is the Money hub's **Tax & ITR** section (`/ledger?tab=tax`); `/tax` redirects there.
- **Year selector:** the existing year chips.
- **Progress:**
  - "Not started" when nothing is set or entered;
  - "N of 7 sections ready" while required items are open;
  - "Ready to review" at most, never "Filed" or "Done", with a reminder to check each figure against the documents.
- **Sections:** each row shows a headline figure, its kind, and a status ("N to finish", "N worth a look" or "Nothing open"). Tapping a row opens the screen that breaks the figure down.

| Section | Headline figure | Kind |
|---|---|---|
| Your details | — (opens the profile sheet) | — |
| Income | Income counted | fact |
| TDS & Form 16 | TDS on your certificates | fact |
| Deductions | Claims counted | fact |
| Capital gains | Gains | calculated |
| Tax payments | Tax paid | fact |
| Tax estimate | Estimated tax, by regime | calculated |

- **Documents:** the row stays, without a status.
- **Checklist,** grouped as:
  - To finish (required);
  - Worth a look;
  - Put off;
  - Handled outside Spendly (collapsed).

  Each item opens a menu: open its screen, mark it handled outside Spendly, put it off, or put it back on the list.
- **States:** loading, error with retry, offline notice, and an empty ("not started") year.

## Rules (`shared/features/tax/utils/readiness.ts`)

The readiness is derived on screen and never stored. Only the user's decisions are stored, as `taxReviews/{fy}__checklist__{itemId}` with decision `resolve` or `defer` and no amount. The model, validation and rules already allowed this (SPENDLY-709), so **no rules change**.

**Items** (required unless marked):

| Section | Items |
|---|---|
| Profile | Residential status not set; non-resident (worth a look); age band not set (worth a look) |
| Income | No income and no Form 16; months not loaded; incomes to confirm; incomes to look at again; possible double counts; salary on Form 16 and as income |
| TDS | Salary credits but no Form 16; no AIS/26AS to compare (worth a look); TDS differences with the statement |
| Deductions | Claims to confirm eligibility; possible double counts; claims without proof (worth a look) |
| Capital gains | Sales to confirm; sales without a cost; sales without a buy date; sales to check (worth a look) |
| Payments | Payments without challan details; statement payments not recorded (both worth a look) |
| Estimate | Spendly can't estimate the year; estimated tax still to pay (both worth a look) |

**Item ids** carry what the item is about (a count, the overlapping categories, the unsupported codes). When that changes, the item opens again: resolving "3 incomes to confirm" doesn't hide a fourth.

**Sections:**
- `to_check`: any open required item;
- `worth_a_look`: only optional items open;
- `ready`: nothing open.

A **deferred** required item still blocks readiness. A **resolved** one doesn't: the user handled it outside Spendly.

**Progress** counts the sections with no open required item. "Ready to review" needs all seven. An untouched year always has "Set your residential status" and "Add your income" open, so it can never read ready.

## Read model (READ_MODEL_RULES)

- **No new collection or field.**
- **Reads:** the dashboard reads through `useTaxEstimate` (income, deductions, capital gains, profile and their read switches) only while it's open. Before this story the tax center read nothing.
- **Writes:** checklist decisions go through `saveTaxReview` → `commitMutations` (dual-written). They hold no amount, so there's nothing to re-check on Firestore first.

## Tests

| File | Covers |
|---|---|
| `readiness.test.ts` | Empty year (not started, never ready, only the two required items); partial year by section; complete year → "Ready to review" with 7/7; progress not full while a required item is open or only deferred, ready once resolved; a resolved item opens again when its count changes; facts and calculations labelled, totals from the records; TDS differences flagged; item ids are valid review ids |
| `taxChecklistStore.test.ts` | Defer and resolve stored with no amount under the checklist id; undo deletes |

## Accessibility and performance

- Section rows, checklist rows and the "show handled" toggle are at least 48 dp tall, with labels and roles.
- The progress bar has a text label, and the status is in words (never colour alone).
- The checklist renders a short list (tens of items at most); the summaries are memoised.
