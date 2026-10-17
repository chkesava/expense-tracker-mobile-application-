# SPENDLY-544: Phase 4c, Investments: EPF

Epic: [SPENDLY-531](SPENDLY-531-premium-redesign.md). Branch: `feature/SPENDLY-544-epf`.

This story covers:
- the EPF tab: `EpfDashboard` and the profile/portfolio/establishment/current-month cards;
- the establishment screen `app/(app)/epf/[establishmentId].tsx` and its Balance, Current, History, Backfill and Transfers tabs.

It is UI only. The EPF ledger, contribution generation, interest catch-up, transfers and reconciliation are unchanged. The EPF form sheets get their visual pass in Phase 6; only their privacy fix is here.

## Changes
- **Foundations.** Every EPF card (profile, portfolio, current month, establishment, balance, history and current totals, transfers, backfill) is now on the dashboard `Section` container instead of `ui/Card`. Loading states use `DashboardSkeleton`.
  - EPF already used theme tokens (no hex/rgba anywhere), so there was no palette work.
- **Narrow screens.** On 320 dp the Current tab's "Change wage" button squeezed the "Credited to EPF" total onto two lines ("₹35,70 / 0"). The button now wraps below the total.

## Bugs fixed
- **EPF ignored ghost mode almost everywhere.** Twelve components formatted money with a local `formatAmount` helper, so totals, contribution rows, interest, reconciliation history, transfers, backfill previews and the sheets all showed real amounts in ghost mode. They now use `useGhostMoney`. Contribution rows receive their formatter from the parent, so they mask too.
- **"₹NaN" on the EPF portfolio card.** The EPF summary doc is built with Firestore `increment()`, which writes a total only once it moves. A user with no interest or adjustments yet has no `interestTotal`/`adjustmentsTotal` field, so the card showed "Interest ₹NaN" and an "Adjustments ₹NaN" row (`undefined !== 0`).
  - A missing total now displays as 0, and the Adjustments row stays hidden.
  - This is display only; the stored summary is unchanged.
- **Nested buttons on web.** The establishment card's Edit button sat inside its tap-to-reveal button, logging two console errors. The reveal target is now the identity block plus the identifiers, and Edit is a sibling.
- **Raw ISO dates.** These now follow the user's date format:
  - the establishment card ("01 Apr 2026 – Present");
  - the establishment screen header;
  - the last-reconciled line and reconciliation history;
  - transfer rows and transfer detail.
- **Hooks order.** `EpfCreditSheet` and `EpfTransferDetailModal` call the new hooks before their early `return null`.

## Not done
- **The EPF summary data.** Other consumers of the EPF summary may also read the missing `interestTotal`/`adjustmentsTotal` fields. Writing explicit zeros when the summary is created would fix it at the source, but that is a write-path change, so it is left for a separate story.
- **Serif input labels.** The shared `Input` labels (Gluestack `FormControlLabelText`) render in a serif font on web, for example on the Backfill wage field. That is a form concern for Phase 6.
- Contribution rows are still individually bordered rows.

## Validation
- `npx tsc -p tsconfig.json --noEmit` and `npm run typecheck:shared` are clean; `npx vitest run` passed 5,538.
- **Web, local test mode.** EPF was set up through the app's own UI on the emulator: a profile, an employer joined 2026-04-01, and a ₹30,000 wage backfilled for six months, giving ₹35,700 into EPF.
  - **Midnight Emerald 390 dp, Light 390 dp, Midnight Emerald 320 dp:** the EPF tab and the Balance, Current, History, Backfill and Transfers tabs have 0 console errors (down from 2), `scrollWidth` equals viewport width, there are no raw ISO dates and no "NaN".
  - **Ghost mode:** 0 visible ₹ amounts on every EPF view. The "hidden" counts also include the masked UAN/member-ID digits.
- Android and iOS have not been built.
