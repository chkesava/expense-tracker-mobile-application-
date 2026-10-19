# SPENDLY-559: Responsive Expense screens on mobile, tablet and desktop web

Story under epic SPENDLY-531. Branch: `feature/SPENDLY-559-responsive-web`, cut from the epic branch after main (v4.1.2, build 123) was merged into it.

This is layout and presentation only. It changes no business logic, Firestore reads or writes, rules, calculations, routes or data contracts.

## Root cause
- `app/_layout.tsx` spread `webWidthConstraintStyle` into the root Stack's `contentStyle`. On web that is `maxWidth: 480`.
- Every Expense screen therefore rendered in a 480px column. So did the header, bottom nav and dock, which are absolutely positioned inside it.
- Stock Holding Details looked wide only because it is an RN `<Modal presentationStyle="fullScreen">`. On web a Modal portals to `<body>`, outside the cap.

## Breakpoints
The breakpoints live in `shared/utils/responsiveLayout.ts`, which is pure and covered by Vitest. `hooks/useResponsiveLayout.ts` is the only code that reads the window.

| Layout | Width (web) | Navigation | Page content | Grids | Sheets |
|---|---|---|---|---|---|
| compact | < 768 (and all native) | Bottom nav / dock, as before | Full width, as before | 1 column | Bottom sheet |
| medium | 768–1023 | Bottom nav / dock | Centred, max 960 (`readable` 720) | 2 columns | Centred dialog, max 560 |
| expanded | ≥ 1024 | Left sidebar (232) | Centred, max 1280 (`readable` 720) | 3 columns | Centred dialog, max 560 |

**Wide layouts are web-only.** `layoutOf(width, isWeb)` always returns `compact` on native, so native phones and tablets don't change. The bucket comes from the live viewport width, and resizing reflows the layout without a reload.

These cuts are separate from Ganesh Seva's own breakpoints (`ganeshBreakpoint.ts`: 600/1024).

## What changed
- **Shell:**
  - The `(app)` Stack.Screen drops the 480 cap, the same way Ganesh opts out. Nutrition and the shared auth, welcome and onboarding screens keep the cap.
  - At expanded, `DesktopSidebar` sits beside the page column and replaces the bottom nav or dock.
    - Its destinations and visibility rules match the side drawer, including the investments feature flag and admin.
    - It has an Add button that opens the existing Add sheet.
    - Profile, ghost mode, switch app and sign out stay in the drawer, which still opens from the header.
  - A new `"sidebar"` value of `BottomNavStyle` (`shared/config/bottomChrome.ts`) zeroes the bottom-chrome clearance, so pages don't pad for a nav that isn't there.
  - Swipe-tabs were already native-only and are unaffected.
- **Pages:**
  - `PageShell` takes `layout="wide" | "readable"` and centres and caps its content above compact.
  - Screens that own their scroll view use `useContentWidthStyle()`: account detail, transaction detail, CC bill detail, discrepancies and EPF establishment.
  - Settings, settings sections, Add, decision edit and what-if edit use `readable`.
- **Dashboard:**
  - Widgets render in `ResponsiveGrid`, a masonry layout. The net-worth hero, quick add and the cash-flow overview keep full rows. Other widgets are dealt into 2 or 3 columns, so different card heights never leave holes.
  - Widget order, slot positions and LazyMount staggering are unchanged.
  - On compact the grid is a plain `{ gap: 12 }` column, the same as before.
- **Overlays:**
  - `common/Modal` opens as a centred dialog above compact, but only inside the Spendly shell (the `useSpendlyScopeVars` signal). Ganesh and Nutrition sheets are unchanged.
  - Six hand-rolled RN `<Modal>` sheets are centred at dialog width via `useSheetWidthStyle()`: merchant correction, CSV import, cash history, recalibration, SIP notifications and SIP plan form.
  - The root toast is centred at 560 above compact. The toast is shared and sits outside the old cap, so it already spanned the browser on every product. This only narrows it on wide web.

## QA
QA ran with Playwright against `expo start --web` and the Firebase emulator seeded with the demo user. The viewport was resized live, with no reload, and each route was checked at each width. The checks were:
- page-level horizontal scroll (`scrollX` after scrolling right);
- whether the sidebar or the bottom capsule is present;
- a screenshot.

| Route | 320 | 768 | 1024 | 1440 |
|---|---|---|---|---|
| /dashboard | ok, bottom nav, unchanged | ok, 2-col grid | ok, sidebar, 3-col | ok, sidebar, 3-col (also 1366×768 via 1024–1440 range) |
| /ledger (Money) | ok | ok | ok | ok |
| /vaults | ok | ok | ok | ok |
| /investments (+ Stocks tab) | ok | ok | ok | ok |
| /insights | ok | ok | ok | ok |
| /calendar | ok | ok | ok | ok |
| /what-if | ok | ok | ok | ok |
| /settings, /settings/appearance | ok | ok, readable | ok, readable | ok, readable |
| /runway | ok | ok | ok | ok |
| /goals/optimizer | ok | ok | ok | ok |
| /decisions | ok | ok | ok | ok |
| /merchants, /fees | ok | ok | ok | ok |
| /add | ok | ok | ok | ok |
| /accounts/[id] (bank, card) | ok | ok | — | ok |
| /transactions/[id] | ok | ok | — | ok |

- "ok" means no page-level horizontal scroll. Painted overflow at 320 comes only from the existing horizontally scrolling chip and tab rows, which are intentional.
- **Add sheet:** a centred dialog at 1440 and a bottom sheet at 390.
- **Stock Holding Details** (the reference screen): unchanged and full window. "Chart unavailable" appears because the emulator has no live market data.
- **Checks run:**
  - `npm test`: 376 files, 5,646 tests passed.
  - `npm run typecheck:shared`: passed.
  - `npx tsc -p tsconfig.json --noEmit`: passed.
- **Not run:**
  - The repository has no component test runner (Vitest only covers pure code) and no lint script.
  - Native device QA was not run. Native is unchanged by construction, because `layoutOf` returns compact.

## Known limits and follow-ups
- The public `payment/[slug]` and `split/[slug]` pages keep their intentional 400px cap.
- Welcome, onboarding and login are shared with other products. They keep the 480 cap and are covered by SPENDLY-556. The login page's decorative background already scrolls sideways on desktop; that is unchanged here.
- Settings → Categories opens an RN `pageSheet` Modal that stays full-window on web. Its inner manager is already capped at 380.
- `OnboardingCarousel` reads `Dimensions` once when its module loads, so it does not reflow on resize. That belongs to onboarding (SPENDLY-556).
- Keyboard focus order runs through the sidebar before the page, because the sidebar comes first in the DOM. Nav items are `role="link"` with a 44px minimum height.
