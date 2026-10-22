# SPENDLY-572: Visual First polish

This story is part of epic SPENDLY-531. It is on branch `feature/SPENDLY-572-visual-first-polish`, cut from `feature/SPENDLY-531-premium-redesign`, which was synced to `main` at `39d8e20d`. It follows up SPENDLY-566.

## Why
The live dashboard didn't feel as smooth or premium as the approved reference (`design/references/spendly-dashboard-reference.png`):
- on a light theme the dark scene faded into white;
- figures showed paise;
- the hero cropped to sky;
- cards were flat and the quick actions were pale.

The product owner approved this plan on 2026-10-22. The bottom nav with a notched centre button moved to **SPENDLY-573**.

## What changed
| Part | Change |
|---|---|
| **A. Dark scene** | The dashboard always renders in Midnight Emerald, whatever the app theme. New `ThemeOverride` in `theme/ThemeProvider.tsx` overrides the palette for a subtree without touching the saved theme. A nested `SpendlyUIScope` keeps the Gluestack inputs in step. The profile drawer and every modal render outside the override, so they stay on the user's theme. The decorative aura blobs are off on the dashboard. |
| **B. Hero** (`expo-image`, approved) | The hero is 300 dp tall (was 236). `contentPosition` gives each scene its own focal point (`DASHBOARD_SCENE_FOCUS`, measured on the art), so the sun or moon and the ridgeline stay in view from 360 px to wide desktop. 300 ms crossfade on a period change. Richer scrim. A sun or moon glyph after the greeting, as in the reference. |
| **C. Net-worth card** | New `NetWorthGlassCard` (dashboard only; the Money hub keeps `NetWorthHeroCard`):<br>• emerald gradient, lit top edge, primary hairline and soft glow, with no blur layer;<br>• "Net Worth" with the eye toggle;<br>• a period dropdown: Past month, 3 months, 6 months, 1 year;<br>• whole-rupee figure and the change for the period;<br>• a sparkline (`SpendingCurveChart` with the new `showXAxis={false}`);<br>• an **Assets \| Liabilities \| Gain/Loss** footer with compact ₹ L/Cr figures. Gain/Loss is the period's % change from the SPENDLY-568 history, or "—" without it.<br>The partial-ledger note now sits behind an info icon. |
| **D. Numbers** | Whole rupees on dashboard summaries: net worth, change, donut centre. Compact footer figures via `shared/utils/compactAmount.ts` (₹10.20L, ₹2.35Cr; K/M/B for other currencies). Tabular Inter digits. The donut centre uses the theme font instead of a heavy system fallback, with "Total spent" under the figure (new `DonutChart` props `centerFractionDigits` and `titleBelow`). The month chips read "This month" or "Sep 2026" whatever the date-format preference (`shared/utils/dashboardLabels.ts`). **Display only:** stored values and every calculation are unchanged. Transaction amounts stay exact. |
| **E. Orbs** | 64 dp, a deep opaque tint of each hue, a 1.5 dp ring at 80% and a soft hue glow, 27 dp icons, 14 dp labels. |
| **F. Recent Transactions** | Each row is an inset tile: a 44 dp merchant monogram or category glyph, title, one category line, and the amount stacked over "Today", "Yesterday" or "16 Oct" (`shortRowDate`). The account name moved into the accessibility label. |
| **Cleanup** | `NetWorthTrend.tsx` and `PrivacyToggle.tsx` were deleted because the glass card replaces both. |

**Package.** `expo-image ~57.0.5` was installed with `npx expo install`. Its config plugin is added to both `app.config.js` (SHARED_PLUGINS) and `app.json`. It is a **native module, so Android needs a new build**; an OTA update isn't enough.

## Tests and checks
- New `compactAmount` tests: 5 passed. New `dashboardLabels` tests: 2 passed.
- `npm test`: 5,842 passed.
- `npm run typecheck:shared` and `npx tsc -p tsconfig.json --noEmit`: clean.
- **Visual, on web against the Firebase emulator as the demo user set to the *light* theme**, to prove the override. Synthetic net-worth history was seeded in the emulator only.
  - **412 px:** evening, then a tall morning shot of the full page.
  - **360 px:** night.
  - **1280 px desktop:** afternoon and night, after tuning the afternoon and night focal points to 28% and 26% so the sun and moon survive the deep desktop crop.
  - **Result:** the dashboard is dark even for a light-theme user. The hero, glass card, orbs, donut and tiles match the reference's hierarchy and treatment.

## Not done / known limitations
- The bottom navigation and the floating **+** keep the app theme and the current five-tab layout (SPENDLY-573).
- On wide desktop the hero is wide and short by nature, so it shows a band of each scene rather than the whole picture.
- No Android device QA yet. It needs a fresh native build because of `expo-image`.
- The Firestore rules for SPENDLY-568 still have to be deployed before the next release, or the trend and Gain/Loss show their load-error state.
