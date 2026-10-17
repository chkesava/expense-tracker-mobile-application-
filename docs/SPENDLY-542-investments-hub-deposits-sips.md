# SPENDLY-542: Phase 4a, Investments hub, Deposits and Virtual SIPs

Epic: [SPENDLY-531](SPENDLY-531-premium-redesign.md). Branch: `feature/SPENDLY-542-investments-hub-deposits-sips`.

This story covers:
- the Investments hub header and tabs (`app/(app)/investments.tsx`);
- the Investments (deposits) tab: `InvestmentsList`, `InvestmentCard`, `InvestmentDetailModal`;
- the Virtual SIPs tab: `SipDashboard`, `SipSummaryCard`, `SipVirtualPositions`, `SipHistoryList`.

It is UI only. Valuation (`getInvestmentValuation`), SIP execution, quotes and every write path are unchanged. The create/plan forms are Phase 6.

## Changes
- **Hub:** the tab icons and the header icon use the theme accent. Previously they were `success`, and the header icon was fixed `#FFFFFF` in dark themes.
- **Deposits summary:** a `Section` with the current value (`FinancialAmount xl`) and the net return, signed and toned, plus "±x.x% on principal".
- **Deposit card**, rebuilt with no hardcoded colours:
  - a kind glyph tinted with theme colours (info/success/primary instead of `#3B82F6`/`#10B981`/`#8B5CF6`);
  - a status `Pill`;
  - principal and current value as `FinancialAmount`;
  - a rate pill or a signed return pill, with "+₹… gain" or "−₹… loss";
  - "Matures <date>".
  - Closed investments stay non-pressable, as before.
- **Filter chips** are tabs; the skeletons are `DashboardSkeleton`.
- **Detail modal:**
  - theme kind colour;
  - the started and maturity dates formatted;
  - ghost-aware amounts and a signed gain;
  - a status `Pill`;
  - the specification rows given spacing (the `Card` `gap` never reached them).
- **SIP summary** is now a `Section`: the current value, total profit/loss (signed and toned, with words), and Total invested / Per month tiles.
- **SIP sub-tabs** are `Chip` tabs.
- **SIP plans** are `DataRow`s in a `Section`:
  - the status pill pauses or resumes the plan, with a label;
  - delete is an icon button.
- **SIP positions and history:** `Pill` badges instead of `color + "20"` hex strings.
- **New helpers:**
  - `shared/utils/investmentPresentation.ts`, with tests: `investmentKindLabel`, `investmentReturnPercent`, `formatSignedPercent`, `investmentStatusDisplay`.
  - `components/investments/investmentKind.tsx` (`useInvestmentKindStyle`).

## Bugs fixed
- **Wrong sign on losses.** The portfolio "Net return" and the detail modal's "Accrued gain" always printed "+", so a loss read "+INR -500 (+-3.2%)". Gains and losses now carry their own sign and colour, and the percent never doubles its sign.
- **Matured shown as Active.** The new status pill treats `"matured"` as its own state; it shows as "Matured" (info tone), not "Active".
- **Ghost-mode leaks.** Every deposit, SIP summary, SIP position and SIP history amount ignored ghost mode, about 20 `Amount`s and two formatted strings.
- **SIP profit replaced the currency symbol.** `Amount prefix="+"` showed "+28,736" with no ₹; it is now "+₹28,736".
- **SIP plan amounts** used a hardcoded "₹" (wrong for other currencies) and ignored ghost mode.
- **Raw ISO dates.** The SIP next-run dates, history dates, deposit start dates and maturity dates now follow the user's date format.
- **White text on the theme primary.** The SIP tabs, the "Create SIP Plan" button and the badge used `#FFF`; they now use the theme's foreground tokens.
- **Modals and dialogs drew a light card in dark themes on web** (affects every screen). On web an RN `Modal` portals to the end of `<body>`, outside `SpendlyUIScope`, so `common/Modal` and `common/Dialog` lost the Spendly CSS variables.
  - `SpendlyUIScope` now shares its variables through `useSpendlyScopeVars()`, and both components re-apply them inside their window.
  - Outside the Spendly shell (Ganesh Seva, Nutrition) the context is null and nothing changes.
  - Native rendering was already correct.

## Behaviour notes
- **SIP plan delete** now asks for confirmation first. Before, a single tap on "Delete" removed the plan.
- **Pause/resume** is shown only for active or paused plans. Before, the pill could also flip a completed or cancelled plan back to active. The underlying `toggleSipPlan` is unchanged.

## Not done
- "Trigger Execute Check" keeps its existing layout and label.
- `SipNotificationsModal`, `SipPlanFormModal` and `CreateInvestmentModal` are Phase 6.

## Validation
- `npx tsc -p tsconfig.json --noEmit` and `npm run typecheck:shared` are clean.
- `npx vitest run` passed 5,538, including 7 new `investmentPresentation` tests: kind labels, return percent, a signed percent that never doubles its sign, and matured ≠ active.
- **Web, local test mode.** I used the seeded emulator plus a scratch, emulator-only script that refuses any non-local host. It added:
  - four deposits: an active FD, savings, a mutual fund at a loss, and a matured FD;
  - two SIP plans (active and paused), a position and two logs.
- **Results:**
  - **Midnight Emerald 390 dp, Light 390 dp, Midnight Emerald 320 dp:** the deposits list, the detail sheet and the SIP Plans/Compounded/Logs views have 0 console errors, `scrollWidth` equals viewport width, there are no raw ISO dates, and there are no "+-" or "+INR" strings.
  - **The detail sheet** is dark in Midnight Emerald and unchanged in Light.
  - **Ghost mode:** 0 visible ₹ amounts on deposits (84 hidden), the detail sheet (17), SIPs (36), Compounded (9) and Logs (8).
- Android and iOS have not been built.
