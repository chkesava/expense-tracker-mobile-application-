# SPENDLY-547: Phase 5c, Planning: Money Decisions

Epic: [SPENDLY-531](SPENDLY-531-premium-redesign.md). Branch: `feature/SPENDLY-547-money-decisions`.

This story covers:
- the Money Decisions screens: `app/(app)/decisions/index.tsx`, `[id].tsx`, `compare.tsx` and `insights.tsx`;
- `components/decisions/*`.

It is UI only. The decision model, lifecycle, snapshots, outcome variance, insights, links and every write path are unchanged. `decisions/edit.tsx` is Phase 6.

Decisions were built recently on the shared `Section`, so the visual pass is light. Most of this story is three correctness bugs.

## Changes
- **One formatter pair.** `components/decisions/useDecisionFormat.ts` returns:
  - `money`: the display currency, ghost-aware;
  - `date`: a `YYYY-MM-DD` key or epoch ms, in the user's date format.

  Every decision view uses it.
- **List.**
  - The status chips are outline `Chip` tabs.
  - "Coming up" is a `Section` with an icon.
  - Rows use the shared round `RowGlyph`, muted for archived decisions.
  - Loading uses `DashboardSkeleton`.
- **Commitments.** The To do / Done / Dropped chips wrap. At 320 dp they used to push each commitment's delete button past the card edge.

## Bugs fixed
- **Hardcoded INR.** These ignored the user's display currency:
  - the alternative workspace (each option's money and its first-year total);
  - "Expected vs what happened" (expected, recorded and the variance sentence);
  - the detail screen's expected amount;
  - the "Amount in ₹" and "Amount, ₹" field labels.

  They now use the display currency. Decision amounts are user-typed and carry no currency of their own; the stored `"inr"` unit is a data-contract label meaning "money", and it is unchanged.
- **Ghost mode.** Those amounts, the linked records' current and captured amounts, and the variance sentence all showed in ghost mode. They are masked now.
- **Raw ISO dates.** These were `toISOString().slice(0, 10)` or raw keys:
  - the list's started/decided dates and its "Coming up" dates;
  - the detail's started, decided, review, "by" and snapshot dates;
  - the outcome's recorded and as-of dates;
  - the commitments' target and done dates;
  - linked-on dates;
  - the link picker's record dates.

  They all follow the user's date format now. Timestamps also use the user's local day, not UTC, so a decision made late in the evening no longer shows the next day.

## Not done
- **`decisions/edit.tsx`**, the new-decision form, is Phase 6. It has no amounts of its own; its alternatives use `AlternativeWorkspaceCard`, which is fixed here.
- **Date inputs.** The commitment and outcome date fields still take `YYYY-MM-DD`. That is form input, and it belongs to Phase 6.
- Android and iOS have not been built.

## Validation
- `npx tsc -p tsconfig.json --noEmit` and `npm run typecheck:shared` are clean; `npx vitest run` passed 5,555.
- **Web, local test mode.** The seeded emulator has no decisions, so a scratch script added two, and only to the local emulator (it refuses any other host):
  - a tracking decision with options, an expected amount, an outcome, two commitments, a review date and a linked subscription;
  - a considering decision.
- **Midnight Emerald 390 dp, Light 390 dp, Midnight Emerald 320 dp:** the list, detail, compare and insights screens had:
  - 0 console errors;
  - `scrollWidth` equal to the viewport width;
  - no raw ISO dates.
- **Ghost mode:** 0 visible ₹ amounts on all four screens. The detail had 40 hidden and compare had 16; the list and insights show no amounts.
