# SPENDLY-566: Visual First dashboard with time-aware mountain backgrounds

This story is part of epic SPENDLY-531 (Midnight Emerald premium redesign). It is on branch `feature/SPENDLY-566-visual-first-dashboard`, cut from `feature/SPENDLY-531-premium-redesign` after that branch was fast-forwarded to `main` (`4df3061d`).

It redesigns the Expense dashboard to match the approved mockup, `design/references/spendly-dashboard-reference.png`:
- a mountain hero that changes with the device's time of day;
- the net-worth card riding over the bottom of the hero;
- four round quick-action buttons;
- a Spending Overview card with a donut and budget progress;
- Recent Transactions;
- the rest of the cards underneath.

The change is UI only:
- no financial calculation changes;
- no new Firestore listeners or queries;
- no write-path changes;
- no hardcoded values from the mockup.

## Decisions (user, 2026-10-21)
1. **No net-worth chart and no change figure.**
   - There is no net-worth history to draw them from.
   - The card shows net worth plus Assets and Liabilities, all from `useUnifiedNetWorth`.
   - A net-worth snapshot story would be needed before a trend can be shown.
2. **Fixed mockup layout.**
   - Net worth, quick actions, Spending Overview and Recent Transactions have fixed places (`PINNED_DASHBOARD_WIDGETS`).
   - Every other widget is still shown underneath as a "More" card.
   - The More cards keep the user's saved order and on/off toggles. Settings → Dashboard Order now lists only those cards; the pinned ids stay at the end of the saved order, so nothing is lost.
3. **The hero shows on every theme.**
   - It always uses a dark scrim, white text and a light status bar.
   - It fades into the theme background.
   - It was checked on Dark, Midnight Emerald and Light.

## Time of day
- `shared/utils/dayPeriod.ts` holds `DAY_PERIODS`, the single place to change boundaries. The periods are:
  - morning 05:00–11:59;
  - afternoon 12:00–16:59;
  - evening 17:00–20:59;
  - night 21:00–04:59.
- It also has `greetingFor` and `msUntilNextPeriod`.
- It uses the device's local clock, as the ticket asks, not `settings.timezone`.
- `hooks/useDayPeriod.ts` re-checks when the app returns to the foreground (`AppState` "active") and with one timer at the next boundary, so the page never needs a restart.
  - There's no polling loop.
  - State only changes when the period does.

## Hero
- `components/dashboard/hero/dashboardBackgrounds.ts` loads the images with static `require`s only.
- `components/dashboard/hero/DashboardHero.tsx` handles the layout:
  - It pulls itself up and out by the page shell's padding, so the image runs under the status bar.
  - It draws the scene as a bottom-anchored square with 74% of it visible, so the ridgeline shows between the greeting and the card rather than only sky.
  - It has two `LinearGradient` scrims and no blur.
  - It renders `StatusBar style="light"` while it's focused.
- The shared app bar steps aside on `/dashboard`, through `ownsAppBar` in `shared/config/navigation.ts`, the same way it already does on account detail.
  - The hero draws the brand through the new shared `components/layout/AppBarBrand.tsx`, so the TEST DATA pill carries over.
  - It draws `AppBarActions` with a white `ink`.
  - It has its own `SideDrawer`, as `AccountHeader` does.

## Assets
Present:
- `assets/images/dashboard/dashboard-{morning,afternoon,evening,night}.webp`: 78–212 KB, about 1220×1290 or 1254×1254, already mobile-sized, so no conversion was done.
- `README.md`.
- `design/references/*.png`, which are design-only and never imported.

The supplied `dashboard-afternoon.webp` was the orange sunset and `dashboard-evening.webp` was the bright blue lake, the reverse of the ticket's descriptions. **The two filenames were swapped** to match the ticket. The image contents were not changed.

## Changed files
| File | Change |
|---|---|
| `app/(app)/dashboard.tsx` | Visual First layout. One `useUnifiedNetWorth` call shared by the card and the account cards. The More cards come from `getMoreDashboardWidgets`. `hideHeaderOffset`. |
| `components/dashboard/hero/*` | New: the hero and the background map |
| `components/dashboard/SpendingOverviewCard.tsx` | New: donut (the existing `DonutChart`), top-4 + Others legend, budget row, month chip |
| `components/dashboard/PrivacyToggle.tsx` | New: the ghost-mode switch, moved from the old greeting to the net-worth card |
| `components/dashboard/DashboardWelcome.tsx` | Deleted. The greeting moved to the hero, the month chip to Spending Overview and the privacy switch to `PrivacyToggle`. |
| `components/dashboard/NetWorthWidget.tsx` | Takes the summary as a prop. The hero card gains an `action` slot. `AccountSummaryWidget` exported for More. The Money hub (`AccountsList`) is unchanged. |
| `components/dashboard/QuickAddWidget.tsx` | Round orbs: Expense, Income, Transfer, Budget (→ `/settings/money`, where budgets are set). The shortcut rail is now `QuickShortcutsWidget` and also holds Pay card. |
| `components/dashboard/RecentActivityWidget.tsx` | "Recent Transactions" / "See all". Expenses tinted negative. |
| `components/Header.tsx`, `components/layout/AppBarBrand.tsx`, `components/layout/AppBarActions.tsx` | Brand extracted; `ink` override; hidden on `/dashboard` |
| `components/settings/SettingsSubmenus.tsx` | Dashboard Order lists only the movable cards |
| `shared/utils/dayPeriod.ts`, `hooks/useDayPeriod.ts` | New: time of day |
| `shared/utils/dashboardWidgets.ts` | `spendingBreakdown`, `budgetProgressSummary`, `PINNED_DASHBOARD_WIDGETS`, `getMoreDashboardWidgets` |
| `shared/config/navigation.ts` | `isDashboardRoute`, `ownsAppBar` |
| `docs/LOCAL_TEST_MODE.md` | The TEST DATA pill now lives in `AppBarBrand` |

## Firebase reads
No new listener or query was added.
- The net-worth summary was already computed by `NetWorthWidget`. It is now computed once in the screen.
- The budget row uses `useCategoryBudgets`, which ref-counts the shared `ExpenseReferenceDataProvider` subscription that the Monthly Budget card already registers. It is not a listener of its own.

## Tests and checks
- `npx vitest run shared/utils/dayPeriod.test.ts shared/utils/dashboardWidgets.test.ts`: 37 passed.
- `npx vitest run shared/config/navigation.test.ts`: 24 passed.
- `npm test`: 394 files, 5,795 tests passed.
- `npm run typecheck:shared`: clean.
- `npx tsc -p tsconfig.json --noEmit`: clean.
- **Visual check (web):**
  - Setup: Expo web against the Firebase emulator (`EXPO_PUBLIC_FIREBASE_EMULATOR_HOST`), signed in as the seeded demo user, driven by headless Chrome.
  - Covered: 412×915 at 07:15, 14:15, 19:15 and 23:15 (with a scratch-only clock override, not committed); Dark, Midnight Emerald and Light; a 360×780 light shot; and a tall full-page shot.
  - Fixed during review: the hero showed only sky; "TOTAL SPENT" overflowed the ring (now "Spent"); the legend truncated; the afternoon/evening images were swapped.
  - The Midnight Emerald result matches the reference in hierarchy, card style, chart placement and navigation.

## Not done / known limitations
- **No Android device or AVD run yet.** Acceptance criteria 6 and 7 (safe areas on small and large phones, smoothness on a real device) still need Spendly Test (`docs/LOCAL_TEST_MODE.md`).
- No net-worth trend or change figure (decision 1).
- No merchant logos; rows use category glyphs.
- The mockup has a notification bell, but the app bar has none, so none was added.
- The brand text stays the app bar's current "Vault"; the mockup says "Spendly".
- On wide desktop web, the hero image is stretched across the content column, so it is softer there.
