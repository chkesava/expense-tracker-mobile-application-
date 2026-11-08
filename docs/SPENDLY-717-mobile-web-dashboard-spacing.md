# SPENDLY-717 — Dashboard: invisible cards and blank space on phones

Bug, standalone (no epic). Branch `fix/SPENDLY-717-mobile-web-dashboard-spacing` from `main`.

## What the report really was
The ticket says "mobile web", but the owner's screenshots came from the **installed Android app, v5.2.2 (build 136)**. Scope agreed with the owner on 2026-11-08: **Android and phone web**. The ticket's line "native unchanged" no longer applies.

## Reproduction and measurements

### Android (the reported case)
- **Setup:** Spendly Test (the existing `dist/Spendly-Test.apk`, v5.0.4, built 2026-10-31, after the SPENDLY-632 fix). Phone: CPH2661, 360 dp wide; display settings were not changed. Firebase emulator with the seeded demo user.
- **Method:** cold start, wait 20 s, then nine 1,000 px swipes. Each step saved a screenshot and a `uiautomator` dump, and the run saved logcat.
- **Result:**
  - Hero, Net Worth, Quick actions, Spending Overview and Recent Transactions all draw.
  - Everything after Recent Transactions is **about two screens of empty background**: Income & expenses, Safe to Spend, Monthly Budget, Smart Insights, Upcoming, Goals, Financial Health, the account cards and Shortcuts.
  - None of those cards appear in the view dump, although `dashboard_hydrated` fired at 2,323 ms, so their `LazyMount` had mounted them.
- **Logcat:** 319 × `Reanimated: synchronouslyUpdateUIProps failed for tag N`, running from first paint until the last `LazyMount` card mounted (11:10:54.8 → 11:10:58.0).

### Phone web (390 px, Playwright, demo data)
- After full load there are no gaps: every card has opacity 1 and the gaps are a steady 14 px.
- The page is 5,235 px tall. The account cards start at about 4,650 px, second-to-last on the page.
- Web blanks are load-time only: 120 px `LazyMount` placeholders and the fade, both gone within about 1 s.

## Root causes
1. **Invisible cards on Android** (`components/dashboard/DashboardEntrance.tsx`).
   - Each card fades in from opacity 0 with Reanimated.
   - On Android, Reanimated 4.5.1 (RN 0.86) sends those frames down its synchronous-props path, which fails for views that aren't mounted yet.
   - SPENDLY-632 dropped the animated style once the entrance ended. That fixed the cards drawn with the screen, but the "More" cards that `LazyMount` adds later still stay at opacity 0: they take up space but draw nothing.
   - This is the "large blank regions" and the "missing account cards".
2. **A very long one-column feed.** Every desktop card stacks into one column on phones. The account cards land second-to-last, after Monthly Budget (about 720 px) and the rest.

## Fix
| Change | Files |
|---|---|
| The card fade is **web only**. Native renders a plain `View` at rest from the first frame and never starts at opacity 0. Web keeps the fade, which works there. | `components/dashboard/DashboardEntrance.tsx` |
| One column (every phone, native included): the "More" cards lead with **the account cards, Safe to Spend, then Income & expenses**. The rest (Monthly Budget, Smart Insights, Upcoming, Goals, Financial Health, Shortcuts and any others) wait behind a **Show more / Show less** button. The user's toggles still decide which cards exist. Tablet and desktop are unchanged. | `shared/utils/dashboardWidgets.ts` (`splitCompactMoreCards`), `app/(app)/dashboard.tsx` |

**Invariants kept:**
- No financial value, hook, listener, read path or flag changed.
- Collapsed cards simply aren't mounted until "Show more" is tapped, so a collapsed widget's own listener isn't attached until then (SPENDLY-406, mount on render).
- The `dashboard_hydrated` perf mark fires on the last card actually rendered.

## Tests
- `shared/utils/dashboardWidgets.test.ts`: `splitCompactMoreCards` covers the lead order, toggled-off cards (never added, never dropped), the user's order for the rest, and an empty list.
- `lib/dashboardEntrance.contract.test.ts`: native never animates a card in.

## Verification
See the Jira comment for the commands and results that actually ran, and the device before/after.
