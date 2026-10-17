# SPENDLY-546: Phase 5b, Planning: What-If and Goal optimizer

Epic: [SPENDLY-531](SPENDLY-531-premium-redesign.md). Branch: `feature/SPENDLY-546-what-if-optimizer`.

This story covers:
- What If: the home screen `app/(app)/what-if/index.tsx`, a saved scenario `what-if/[id].tsx`, and `WhatIfResults`. The editor `what-if/edit.tsx` gets only its ghost-mode fix.
- The goal funding optimizer `app/(app)/goals/optimizer.tsx`.

It is UI only. The what-if engine, `whatIfView`, the goal funding optimizer and model, saved plans and scenarios, and every write path are unchanged. `WhatIfChangeSheet`, `GoalPlanInputsSheet`, `GoalFundingPlansSheet` and `WhatIfScenarioPickerSheet` are Phase 6.

## Changes
- **What If home.**
  - The intro and "New scenario" button are the screen's one hero (`HeroSection variant="deep"`).
  - "Your scenarios" is a `Section` with row glyphs and hairline dividers. The empty state is a `Section` too.
  - "Start from an idea" is a `Section` of tile buttons.
  - Archived scenarios are a `Section` with a Show/Hide action.
  - Loading uses `DashboardSkeleton`.
- **Saved scenario.**
  - The scenario header is a `Section`: name, saved date and version, with an "Archived" pill when archived.
  - "Changes and assumptions" and "History" are each a `Section`.
- **Results (`WhatIfResults`).**
  - The headline is the deep hero, "Scenario result", with an "Estimate" pill toned by better or worse.
  - Key numbers are stacked: label and change on one line, then Now and Scenario. The old three-column table squeezed labels into one word per line on phones.
  - "Month by month", "What makes the difference" and "About these numbers" (with Show/Hide) are each a `Section`. Bar tracks use the theme track token.
  - Figures use tabular numerals throughout.
- **Goal funding optimizer.**
  - The plan state is a `Section` with a "Saved plan" / "Not saved" pill.
  - "Available for goals" is the deep hero, with its income, spending and commitment parts as rows that wrap on narrow screens.
  - "How to share it" uses outline `Chip` tabs instead of the settings `ChipRow`.
  - The scenario totals are `DataRow`s. "Over what's available" is shown in red as well as worded.
  - Each goal is a divided row with a status `Pill`:
    - green for on track, ahead or funded;
    - red for behind, not reached or target date passed;
    - muted otherwise.
  - Trade-offs and Assumptions are each a `Section`.

## Bugs fixed
- **What If and the optimizer ignored ghost mode.** Both formatted money with local `formatAmount` helpers. Affected:
  - What If: the results headline and detail, key numbers, the monthly comparison, drivers and EMI assumptions, plus the editor's change summaries and preview.
  - The optimizer: available money and its parts, totals, every goal row, trade-offs, the "why" sheet and the accessibility labels.

  They now use `useGhostMoney`, and signed changes keep their "+" or "−" when masked.
- **Raw ISO dates in the optimizer.** "Finishes 2027-02-17" now follows the user's date format ("Finishes 17 Feb 2027").

## Not done
- **Optimizer accessibility labels.** The goal row's label is built by the shared `goalRowAccessibilityLabel`, which still reads the completion date as ISO. Changing it means changing that view helper.
- **Serif input label.** The optimizer's "Use my own monthly amount" field is the shared `Input`, whose label renders serif on web. This is the known form issue left for Phase 6.
- **Negative amounts** still format as "₹-31,352" (the shared `formatAmount`).
- Android and iOS have not been built.

## Validation
- `npx tsc -p tsconfig.json --noEmit` and `npm run typecheck:shared` are clean; `npx vitest run` passed 5,555.
- **Web, local test mode.** The seeded emulator has 2 goals. One "Salary change" scenario (+₹15,000 a month) was created through the app's own editor on the emulator.
  - **Midnight Emerald 390 dp, Light 390 dp, Midnight Emerald 320 dp:** What If home, the saved scenario, the editor and the optimizer had 0 console errors and no raw ISO dates. On all of them `scrollWidth` equals the viewport width.
  - **Ghost mode:** 0 visible ₹ amounts on all four views. Hidden counts were 360 on the scenario, 32 in the editor and 88 on the optimizer; the home screen shows no amounts.
