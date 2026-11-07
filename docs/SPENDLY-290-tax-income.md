# SPENDLY-290: Tax income aggregation and the tax center shell

**Epic:** SPENDLY-288 ([tracker](SPENDLY-288-tax-itr-readiness.md), [plan](SPENDLY-288-plan.md)).

**Branch:** `feature/SPENDLY-290-tax-income`, from `feature/SPENDLY-288-tax-itr-readiness`.

**Builds on:** SPENDLY-289 (model) and SPENDLY-709 (persistence and read model).

## What the user sees

- **Insights:** a "Tax & ITR readiness" card, shown only when the center is enabled for the user.
- **`/tax`, the tax center:**
  - a year picker (FY 2024-25 to the current year, opening on the year that ended last);
  - the readiness disclaimer;
  - the **Income** section.
  - The readiness dashboard (SPENDLY-296) grows here.
- **`/tax/{fy}/income`, income for one year:**
  - grouped by head of income: Salary, House property, Business or profession, Capital gains, Other sources;
  - then **Not counted** (not income, left out, replaced, or waiting for a decision).
  - Each row shows:
    - what the income is;
    - where the figure came from: "From your Spendly income", "Calculated by Spendly" or "You added";
    - its status in words: Counted, Confirmed, Not counted, Left out, Replaced, Check again, Amount unknown;
    - the amount;
    - why it may need a look.
  - **Salary credits:** shown under Salary as *take-home pay received in the bank*, never counted. Gross salary comes from Form 16 (SPENDLY-291) or an income the user adds.
  - **Tapping a Spendly item:** count it, leave it out, change its category, replace it with an income the user added, or undo the decision.
  - **Tapping the user's own income:** edit it or delete it (soft delete).
  - **Add income:** for rent received in cash, an interest certificate total, or gross salary without a Form 16. It is a tax record only: it never adds a Spendly income or moves a balance. The form warns when the same income was already added for the year.
  - **Notices:**
    - offline;
    - year still loading (head totals show "—" until every month is in);
    - an item changed after the user decided;
    - a category counted both from Spendly and from the user's entry (a likely double count; "Replace" fixes it).

## How income is worked out (`shared/features/tax/utils/income.ts`)

| Spendly `Income.source` | Tax category | Counted by default |
|---|---|---|
| Salary, Bonus | Salary | **Evidence only** (net pay) |
| Pension | Pension | **Evidence only** |
| Freelance | Freelance or professional | yes |
| Business Income | Business | yes (calculation unsupported in v1) |
| Rental Income | Rent received | yes |
| Interest | Other interest (the user can move it to savings or deposit) | yes |
| Dividend | Dividend | yes |
| Cashback, Refund, Reimbursement, Investment Proceeds | Not income | no |
| Gift Received, Government Benefit, Other Income, unknown labels | Gift / Other | no, until confirmed |
| Older labels: "Cashback / Refund", "Freelance / Business", "Investment Profit" | Not income / Professional | no, flagged "may hide interest, dividends or rent" |

- **Year:** the income's `date` (local; 31 March and 1 April fall in different years), else its `month`. Deleted incomes and incomes without an id are skipped, and an id is counted once.
- **Deposits:** fixed deposits and interest-bearing savings get the interest **credited** in the year, up to today, by the existing interest schedule (`computeInterestValuation`; no new interest maths).
  - It is cash basis, so a cumulative FD shows ₹0 until it matures.
  - Every deposit open during the year is listed, marked "Calculated by Spendly". None is counted until the user confirms it or replaces it with the bank's figure (interest certificate or AIS).
  - A deposit without rate or frequency shows the amount as unknown, never a guess.
- **Entries:** the user's incomes are `taxEntries` of kind `income` (SPENDLY-709).
- **Reviews:** the user's decisions are `taxReviews`. The review always wins and stays visible as an override. If the source amount changes later, the item asks again (`needs_review`) and the old decision is not applied.
- **No double counting:**
  - each Spendly item counts once, under one head;
  - `replace` swaps it for the user's entry;
  - if the replacing entry is deleted, the item counts again and asks;
  - a category counted from both sources raises a warning.
- **Completeness:** the provider keeps a newest-rows window, so the screen loads each month of the year once (`loadIncomesForMonth`, bounded by date). A head's total is `null` ("—") until every month is loaded (or the whole ledger is) and every counted amount is known.
- **One rule change in SPENDLY-289:** confirming or recategorising an item that isn't counted by default now counts it (`lines.ts`).

## Saving

- **Decisions** (`services/tax/taxIncomeStore.ts`):
  - before writing, the amount is worked out again from the income or deposit as **Firestore** has it (cache, then server). The screen may be showing the read-model copy (R4.3a);
  - if it differs from what the user saw, nothing is written and the user is asked to look again;
  - the review then goes through `saveTaxReview` → `commitMutations` (dual write);
  - undo deletes the review.
- **Entries:** `saveTaxEntry` / `deleteTaxEntry` (SPENDLY-709), validated by the SPENDLY-289 builders.
- **Feedback:** the actions hook (`hooks/useTaxIncomeActions.ts`) reports "offline, will sync" honestly. Errors go through `lib/errors.ts`, and validation issues become plain copy (`issueMessages.ts`).

## Reads (SPENDLY-406, R3/R4)

- **When:** only while the income screen is open.
- **What:** incomes through the existing provider (its own read switch), deposits through `useInvestments` (its own switch), and entries and reviews through `useTaxEntries` / `useTaxReviews` (709, bounded to the year).
- **No new Firestore listener**, and SQL computes nothing: every total is the TypeScript lines.

## Flag (decision D9)

- **Mechanism:** `system_settings/global.enableTaxCenter` (everyone) or `enableTaxCenterFor: [uid]`. Development builds always show it. The logic is in `shared/features/tax/utils/flag.ts`, read through `hooks/useTaxCenterEnabled.ts`.
- **When off:** both screens redirect, waiting for settings to load first, and the Insights card hides.

## Routes

- `app/(app)/_layout.tsx`: `tax/index`, `tax/[fy]/income`.
- `shared/config/navigation.ts`: `/tax` and the `/tax/` prefix, so Android back pops.
- `shared/config/routeRestoration.ts`: `/tax` and `/tax/` are restorable.
- Tests were updated for both.

## Demo data (local test only)

`scripts/seed-emulator.js` now adds, for the year that ended last:
- incomes: a dividend, savings interest, rent, a gift (confirm to count) and an older "Cashback / Refund" label, with no account, so the seeded balances still match a Rebuild (SPENDLY-620 test);
- one FD;
- `enableTaxCenter: true` in `system_settings/global`, as for Save Goals.

## Tests

| File | Covers |
|---|---|
| `shared/features/tax/utils/income.test.ts` | Source mapping, salary as evidence, year boundaries, deleted/duplicate ids, months needed, credited FD interest, assembly by head, incomplete year, confirm / recategorise / replace / changed source, overlap warning, other years ignored |
| `shared/features/tax/utils/incomePresentation.test.ts` | Status words, origins, hints, sections, incomplete copy |
| `shared/features/tax/utils/incomeEntryForm.test.ts` | Amount parsing, validation messages, round trip, duplicate detection |
| `shared/features/tax/utils/flag.test.ts` | The flag |
| `shared/features/tax/utils/lines.test.ts` | Confirming a not-counted item counts it |
| `services/tax/taxIncomeStore.test.ts` | Re-derive on Firestore before writing; nothing written when changed, deleted or moved to another year; deposit re-derivation; undo |
| `shared/config/navigation.test.ts`, `routeRestoration.test.ts` | The new routes |

## Not in this story

- TDS, Form 16 and AIS (291);
- deductions (292);
- capital gains (293);
- payments (294);
- documents and attachments (298);
- the calculation (295);
- the dashboard and checklist (296).
