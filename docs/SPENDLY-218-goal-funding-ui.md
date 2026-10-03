# SPENDLY-218: Goal Funding Optimizer comparison and funding-plan UI

**Ticket:** [SPENDLY-218](https://kesavach.atlassian.net/browse/SPENDLY-218) (Story)
**Epic:** [SPENDLY-213](https://kesavach.atlassian.net/browse/SPENDLY-213). See the [epic record](SPENDLY-213-goal-funding-optimizer.md).
**Branch:** `feature/SPENDLY-218-goal-funding-ui`, cut from the epic branch after 219's calendar part and merged back with approval.

**Dependencies:** 217 and 219's calendar part. The wait on 219's What-If part was relaxed on 2026-10-03.

**Scope:** no data model, no rules, no writes. Saving plans comes in 220.

---

## 1. What users see
**Entry:** the dashboard's **Financial Goals** card gets a **"Plan funding →"** link once goals exist. With no goals, the screen sends users to add one.

**`/goals/optimizer`**, titled *"Goal funding plan — Planning only, your goals don't change"*:
1. **Available each month for goals**, always labelled **FROM YOUR RECORDS**, **YOUR AMOUNT**, **WHAT-IF** or **UNKNOWN**.
   - A line-by-line breakdown from 215/219: income, everyday spending and scheduled commitments.
   - "Already goes to savings — part of this amount, not extra".
   - A note when commitments have no amount.
   - A note when there's under 3 months of history.
   - **Use my own monthly amount** replaces the figure for this plan only.
2. **How to share it:** By target date / Fixed budget / My priority order / Balanced, with each mode's rule explained. A switch lets you **allow planning beyond what's available**, labelled a what-if.
3. **Totals:** goals need, scenario allocates, and not allocated (or "over what's available (what-if)").
4. **Your goals:** each row shows the name, the **status in words** (On track, Behind target, Ahead…), and **"Current plan: … · Scenario: … (up/down …)"**, followed by:
   - what the goal needs to finish on time;
   - the projected finish date with months ahead or behind.

   Tap a row for **Why**: its reasons, the mode's rule, what it needs and the shortfall. **Plan settings** opens the inputs sheet.
5. **Trade-offs**, for example *"Trip gets more than today; Car gets ₹5,000 less."*
6. **Assumptions:** every active assumption in words, ending with *"Nothing here changes your goals or moves money."*

**Plan settings sheet** (per goal; it belongs to the plan only):
- priority (#1…#n, each used once, or none);
- what you put in now (**blank means unknown, not zero**);
- minimum;
- a one-time top-up with its date;
- yearly growth % ("an assumption, not a guarantee");
- leave the goal out of the plan.

Errors are shown as sentences.

## 2. Guarantees
- **No allocation is ever applied.** The screen only reads goals, through `useGoalFunding`. There's no button that writes a goal, a contribution or a transaction.
- **Current plan and scenario are distinct in words** on every row and in the screen-reader label, never only by colour. Status is written out as well.
- **Every change is explainable:** the Why sheet, the trade-offs and the assumptions.
- **Mobile layout:** plain stacked cards, no chart library, large touch targets.

## 3. Code
| File | What |
|---|---|
| `shared/utils/goalFundingView.ts` (+test, 7) | Mode and status labels, capacity source label, current-vs-scenario text, screen-reader sentence, Why lines, trade-off and assumption lines |
| `components/goals/GoalPlanInputsSheet.tsx` | Per-goal plan settings |
| `app/(app)/goals/optimizer.tsx` | The screen |
| `components/dashboard/FinancialGoalsWidget.tsx` | "Plan funding →" link |
| `app/(app)/_layout.tsx`, `navigation.ts`, `routeRestoration.ts` (+tests) | Route, Android back, restore |

## 4. Acceptance criteria
| Criterion | How |
|---|---|
| Current and optimized plans are visibly distinct | "Current plan: … · Scenario: …" on every row |
| Users can see why an allocation changed | Why sheet; trade-offs |
| Trade-offs visible | Trade-offs section |
| Nothing applied automatically | Read-only screen; no write path exists |
| Understandable on mobile | Stacked cards, plain text, no chart library |
| No colour-only meaning | Status, source and comparison all in words (tested) |
| Existing design system used | PageShell/PageHeader, ChipRow, RowSwitch, Input, Button, Modal, theme tokens |
| Android performance stays smooth | Pure engine with memoised results; 50 goals × 20 recalculations are well within budget (217). **Still needs a device check** |

## 5. Manual testing guide
1. With two or three goals that have target dates, open the dashboard → Financial Goals → **Plan funding**.
2. Check the monthly figure and its breakdown. Type your own amount; the label becomes **YOUR AMOUNT**.
3. Switch modes and watch the allocations and the "Current plan · Scenario" text change.
4. Plan settings: give one goal priority #1 and a current contribution. **Priority** mode should fund it first, and trade-offs should appear.
5. Turn on **Allow planning beyond what's available**. Totals should show the over-allocation as a what-if.
6. Open goals in Settings and check nothing changed.
7. Run through with TalkBack and large fonts.
