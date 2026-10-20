# SPENDLY-555 (Phase 6h): Planning forms

Story under epic SPENDLY-531. Branch: `feature/SPENDLY-555-planning-forms`, cut from the epic at `a5e39ff5`, which includes SPENDLY-554.

UI only. **Reminder, runway settings, What-If, goal plan and decision writes are unchanged.** That is proven by the A/B check below.

## Ticket findings vs. what was there
| Finding | Ticket | Actual |
|---|---|---|
| Raw `YYYY-MM-DD` inputs | yes | None left. `DateField` already replaced them (SPENDLY-557). |
| Serif shared `Input` labels | yes | Already fixed by the `Input` theme fonts in SPENDLY-548. |
| Hardcoded colours or ghost leaks | none | none |
| Goal optimizer row label reads the ISO date | yes | Fixed |

## What changed
- **6a form pattern.** The submit of New/Edit reminder, Runway settings, Add a change (What-If) and Plan for a goal is pinned in a `SheetActions` footer, with a Cancel button. **The handler, `loading`, `disabled` condition, label and accessibility label are copied verbatim.** The error lists stay in the body.
- **Currency symbol.** `CurrencyPrefix` (from 552) is on every money field in scope:
  - reminder amount;
  - runway reserve amount;
  - What-If amount, down payment and fees;
  - the goal plan's current, minimum and one-time amounts;
  - the decision's expected amount.

  The decision label used to hardcode "₹". It now follows the display currency, which is what the decision detail already uses to show the amount.
- **Goal optimizer screen-reader label.** `goalRowAccessibilityLabel` now reads the completion date as "1 March 2027", using `monthTitle` from the calendar view model. It used to read "2027-03-01". There is a unit test for it.
- **Saved plans.** The "saved" date follows the user's date-format setting, like the rest of the optimizer. It used `toLocaleDateString()` before.
- **What-If loan fields.** The interest/tenure and down payment/fees rows are bottom-aligned. At 320 wide, "Interest (% a year)" wraps onto two lines, which used to push its input below Tenure's.
- **Left as they are:**
  - `WhatIfScenarioPickerSheet` and `GoalFundingPlansSheet` are lists of choices and actions, not forms, so they don't get a footer.
  - The What-If and decision editors are full pages with their own step and save controls (already on `PageShell layout="readable"`).

## QA
**Setup:** web, on an isolated emulator (`127.0.0.2`, Expo `:8093`), freshly seeded for each side.

**A/B write check.** The same UI flows ran on the epic code (A) and the 555 code (B):
1. A reminder: "QA Insurance", 1,200.
2. Runway settings: a fixed reserve of 25,000.
3. A What-If scenario: a one-time purchase of 50,000, saved.
4. A goal plan: minimum 2,000 for Emergency fund, saved as "QA plan".
5. A decision draft: "QA: buy a car?".

| Compared | Result |
|---|---|
| `calendarReminders`, `runwaySettings`, `goalFundingPlans`, `decisions` | identical |
| `whatIfScenarios`, `decisionEvents` | identical except the millisecond timestamps (`atMs`) |
| Every other user collection and the user document | identical |

**Visual:**
- Midnight Emerald 390 and 320, and Light 390: the reminder, runway, What-If change, goal plan, saved plans and scenario picker sheets, and the decision editor. No page errors and no NaN.
- **Ghost mode on:** no ₹ amount on any of them. The goal row's screen-reader label masks its amounts too.

**Checks run:**
- `npm test`: 384 files, 5,718 tests passed (one new: the goal-row date).
- `npm run typecheck:shared` and `npx tsc -p tsconfig.json --noEmit`: both passed.

**Not done:**
- Native device QA.
- Out of scope, but seen on the optimizer: negative amounts read "₹-31,352" (sign after the symbol).
