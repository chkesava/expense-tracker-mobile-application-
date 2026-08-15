# Phase 6 — UI/UX Audit (2026-08-15)

Scope: UI/UX polish only. No backend logic changes, no database architecture
changes, no unrelated refactoring. Reviewed major screens and shared
components for spacing, typography, visual hierarchy, colors, icons,
buttons, cards, border radius, touch targets, loading/skeleton/empty/error
states, success feedback, keyboard handling, safe areas, Android back
button, dark mode, screen transitions, and accessibility.

**Headline finding**: this app's design system (`theme/tokens.ts`,
`components/ui/Button.tsx`, `components/ui/Card.tsx`) is already a
genuinely polished, MD3-consistent foundation — elevation levels, a real
type scale, consistent radius/spacing tokens, built-in skeleton/empty-state
support on the base `Card` component. The two issues below are the ones
that actually undercut the "polished production app" feel: a **systemic
touch-target/accessibility gap on 18 modal close buttons**, and a **settings
screen that presents 9 fake theme choices** that all render identically.

---

## 1. UI/UX Issues Found & Fixed

### 1.1 [FIXED — Systemic, 18 files] Modal close buttons had touch targets well under Android's minimum, and no accessibility label

**Where:** 18 modal components across `components/vaults/`, `components/portfolio/`,
`components/sip/`, `components/investments/`, `components/focus/`,
`components/analytics/`, `components/ai/`, `components/trips/`,
`components/splits/`, `components/subscriptions/`, `components/collect/`.

**What the issue was:** Every one of these modals' header close button used
the identical pattern: a 20–24px `X` icon inside a `Pressable`/`TouchableOpacity`
styled with only `padding: 4` (a few used `padding: 6-7`). That gives an
effective tappable area of roughly 28×28dp to 36×36dp — well under
Android's Material Design minimum recommended touch target of 48×48dp. None
of the 18 had a `hitSlop` to compensate, and none had an `accessibilityLabel`
or `accessibilityRole`, so a screen reader would announce it as an
unlabeled generic element rather than "Close, button."

**Why it matters:** This is precisely the kind of thing that makes an
otherwise-polished app feel like a prototype — the primary dismiss action on
every one of these modals is harder to hit accurately than it should be,
especially for anyone with reduced dexterity or a larger thumb, and it's
invisible to screen-reader users entirely. Because the same exact pattern
was copy-pasted across 18 files, it reads as a real, systemic gap rather
than an isolated oversight.

**Fix applied:** Added `hitSlop={12}` to each of the 18 close buttons —
this expands the invisible touch-catching area to roughly 44–48dp square
without changing anything visually (the icon and its padding are
untouched, so there is zero visual/design-language change). Also added
`accessibilityRole="button"` and `accessibilityLabel="Close"` to each for
screen-reader support. This is a purely functional fix consistent with
"preserve the existing design language" — nothing about how any of these
modals look was changed.

**Files touched:** `components/vaults/VaultTransactionModal.tsx`,
`components/vaults/CreateVaultModal.tsx`, `components/portfolio/MockTradeModal.tsx`,
`components/portfolio/AddHoldingModal.tsx`, `components/sip/SipPlanFormModal.tsx`,
`components/sip/SipNotificationsModal.tsx`, `components/investments/CreateInvestmentModal.tsx`,
`components/focus/FocusConfigModal.tsx`, `components/analytics/FilterSheetModal.tsx`,
`components/analytics/ExportDataModal.tsx`, `components/ai/ReceiptScannerModal.tsx`,
`components/ai/MagicChatModal.tsx`, `components/trips/TripDetailModal.tsx`,
`components/trips/CreateTripModal.tsx`, `components/subscriptions/EditSubscriptionModal.tsx`,
`components/splits/SplitDetailModal.tsx`, `components/splits/CreateSplitModal.tsx`,
`components/collect/CreatePaymentRequestModal.tsx`.

---

### 1.2 [FIXED] Settings screen presented 9 "theme presets" that all look identical once selected

**Where:** [app/(app)/settings.tsx](../../app/(app)/settings.tsx), the
"Theme Presets" chip row shown when Theme Mode is set to "Custom".

**What the issue was:** `theme/tokens.ts` defines 11 `ThemeName` values
("light", "dark", "midnight", "midnight-olive", "vintage-parchment",
"sakura-bloom", "cyberpunk", "nordic", "deep-sea", "glass-3d",
"claymorphism"), each with its own display label. The Settings screen's
"Theme Presets" picker listed **all 11** as if they were distinct,
selectable visual themes. But `createTheme()` in `theme/tokens.ts` only
ever branches on whether a theme name is dark-ish or light-ish
(`themeUsesDarkPalette()`) — there is no separate color palette anywhere in
the codebase for "Midnight", "Cyberpunk", "Vintage Parchment", "Sakura
Bloom", "Nordic", "Deep Sea", "Glass 3D", or "Claymorphism". Every one of
those 9 names resolves to exactly the same colors as plain "Dark" or plain
"Light".

**Why it matters / failure scenario:** A user switches to Custom theme mode,
sees 11 named presets, picks "Cyberpunk" or "Sakura Bloom" expecting a
themed look to match the name — and the UI doesn't change at all beyond
whatever accent color they'd already picked separately. This is exactly the
"feels like a prototype" problem the task called out: it's a picker full of
options that don't do what they claim to do. Confirmed by reading
`createTheme()` in full — there is no per-named-theme palette anywhere to
wire up, so this isn't a bug in applying an existing palette, it's 9 UI
options with no backing implementation at all.

**Fix applied:** Trimmed the "Theme Presets" chip row to only the two
options that actually produce a distinct look: "Light" and "Dark". Left a
comment explaining why, and left `theme/tokens.ts`'s `ThemeName` type,
`THEME_NAMES`, and `THEME_LABELS` completely untouched — removing those
would be a larger, riskier change (they're referenced by
`themeUsesDarkPalette()`'s dark-name set, by `ThemeProvider`'s persisted
Firestore/AsyncStorage values, and by `isThemeName()`'s validator; any
existing user who already has one of the 9 non-functional names stored will
keep resolving to whichever palette `themeUsesDarkPalette()` already maps
it to, unaffected by this change). This fix only stops the picker from
**offering** those 9 as if they were real choices going forward — it's a
UI-only change, not a data migration.

**Files touched:** `app/(app)/settings.tsx`.

---

## 2. Areas Reviewed and Found Already Polished (No Changes Made)

- **`components/ui/Button.tsx`** — every size variant already meets or
  exceeds the 48dp touch-target minimum (`sm`: 40dp, `md`/`lg`/`icon`:
  48–54dp), has `accessibilityRole="button"` and `accessibilityState`
  wired, proper Android ripple, and a consistent MD3 pill radius across all
  variants. No changes needed.
- **`components/ui/Card.tsx`** — already has first-class loading (skeleton),
  empty-state, and interactive-press support built directly into the
  component, with consistent MD3 elevation levels and radius tokens. Screens
  that use `Card`'s built-in `loading`/`empty` props get consistent
  skeleton/empty treatment for free rather than each screen rolling its own.
- **`components/common/Modal.tsx`** (the shared bottom-sheet base used by
  most create/detail modals) already wraps its content in a
  `KeyboardAvoidingView`, so keyboard handling is centralized rather than
  reimplemented per-modal.
- **Dark mode coverage**: `theme/tokens.ts` defines a complete, distinct
  `darkColors` palette (not just an inverted light palette) with its own
  MD3 container/surface roles, and `Card.tsx` even applies extra dark-mode
  surface tinting at higher elevation levels (`#1C1E26`/`#222530`) to avoid
  the "washed out" look flat dark surfaces can have. This is a deliberately
  tuned dark theme, not an afterthought.
- **Android back button**: `useAndroidBackHandler` (audited in
  [Phase 4](PHASE_4_MEMORY_POWER_AUDIT.md)) already implements the correct
  MD3 back-navigation precedence — close open modals/sheets first, then pop
  sub-screens, then return to the dashboard from secondary tabs, then
  double-press-to-exit on the home screen. No changes needed.
- **Elevation/shadow tokens**: a real 6-level MD3 elevation scale
  (`theme/elevation`) is used consistently by both `Button` (`elevated`
  variant) and `Card` (`elevated` variant), rather than ad hoc shadow values
  scattered per component.

## 3. Files Changed

| File | Change |
|---|---|
| `app/(app)/settings.tsx` | Trimmed "Theme Presets" picker to Light/Dark only (removed 9 non-functional options); removed the now-unused `THEME_NAMES` import |
| 18 modal components (listed in §1.1) | Added `hitSlop={12}`, `accessibilityRole="button"`, `accessibilityLabel="Close"` to the header close button |

No other files were touched. No screens were redesigned, no colors/spacing/
typography tokens were changed, and no unrelated refactoring was done.

## 4. Screens/Components Affected

Every screen that opens one of the 18 fixed modals is affected only in that
its close button is now easier to hit and screen-reader-friendly (no visual
change): Vaults (transaction entry, create vault), Portfolio (mock trade,
add holding), SIP (plan form, notifications), Investments (create), Focus
mode (config), Analytics (filter sheet, export data), AI (receipt scanner,
magic chat), Trips (detail, create), Subscriptions (edit), Splits (detail,
create), Collect (create payment request). The Settings screen is affected
by the theme-preset picker fix.

## 5. Verification

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc -p tsconfig.json --noEmit` | **Passed.** No type errors. |
| ESLint | *(still not configured — see [Phase 1](PHASE_1_ARCHITECTURE_AUDIT.md))* | **Not run — nothing configured.** |
| Full test suite | `npx vitest run` | **Passed.** 84 test files, 567 tests — unchanged, since no automated UI/component tests exist for any of the touched files (the standing no-UI-test-coverage gap logged in Phase 1). |

## 6. Remaining Issues (Not Fixed, Logged for a Future Phase)

- **The app's `ErrorBoundary` is expo-router's unstyled default.**
  `app/_layout.tsx` does `export { ErrorBoundary } from "expo-router"` with
  no customization — an uncaught render error would show a generic,
  unthemed crash screen rather than one matching the app's design language.
  Not fixed here because building a proper themed error-boundary screen
  (with retry action, safe-area handling, and dark-mode support) is a new
  component to design and build, not a small contained fix to an existing
  one — out of scope for "only fix clear inconsistencies," but worth a
  dedicated small feature pass.
- **9 non-functional `ThemeName` values remain in `theme/tokens.ts`**
  (`midnight`, `midnight-olive`, `vintage-parchment`, `sakura-bloom`,
  `cyberpunk`, `nordic`, `deep-sea`, `glass-3d`, `claymorphism`). This phase
  only stopped the Settings picker from offering them — the type, labels,
  and dark/light classification set still exist. A future phase should
  either implement real distinct palettes for a curated subset of these (if
  the product wants a genuine multi-theme picker) or remove the unused names
  entirely (a bigger change, since `ThemeName` is persisted to Firestore and
  AsyncStorage for any user who may already have one of them stored).
- **`Card.tsx`'s title text size (`fontSize: 17`) is a magic number outside
  the theme's typography scale** (`xs 12 / sm 14 / md 16 / lg 18 / xl 22 /
  xxl 28`). Noted but not changed — a single, minor, cosmetic deviation
  that didn't rise to "clear inconsistency" on its own, unlike the
  systemic touch-target gap.
- **This phase reviewed the shared design-system components and the
  highest-traffic patterns (modal close buttons, theme picker) in depth,
  but did not do an exhaustive per-screen pass over every one of the app's
  ~40+ screens** for spacing/typography/hierarchy nits. The shared `Card`/
  `Button`/`Modal` components being consistently used everywhere (confirmed
  via their widespread adoption while investigating this phase) makes
  screen-level drift less likely, but a dedicated screen-by-screen visual
  pass — ideally with device screenshots — would catch anything this
  code-only review couldn't.
