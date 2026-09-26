# Spendly UI architecture and contribution rules

This is where the Mobile UX and Design System epic ended up (SPENDLY-122). It covers:
- SPENDLY-144: foundation
- SPENDLY-145: screen migration (152, 153)
- SPENDLY-161: capsule glass navigation
- SPENDLY-162: branding
- SPENDLY-146/154: final QA

Read this before building or changing a Spendly screen. For the colour and spacing values, see [UI_TOKENS_CONTRACT.md](UI_TOKENS_CONTRACT.md). For how the library was chosen, see [UI_LIBRARY_EVALUATION.md](UI_LIBRARY_EVALUATION.md).

Ganesh Seva and Nutrition have their own design systems. Nothing here changes them, and any shared primitive change must keep them unchanged (see the Ganesh rules in `CLAUDE.md`).

## 1. Stack

| Layer | What | Where |
|---|---|---|
| Component library | Gluestack UI v5 (alpha), vendored components | `components/ui/<name>/index.tsx` |
| Styling runtime | NativeWind v4 through `jsxImportSource: "nativewind"` | `babel.config.js`, `tailwind.config.js`, `globals.css` |
| Spendly wrappers (use these) | Stable APIs over Gluestack | `components/ui/*.tsx`, `components/common/*` |
| Theme | Colours, spacing, radii, type, elevation | `theme/tokens.ts`, `theme/ThemeProvider.tsx` |
| Theme to Gluestack bridge | Maps tokens onto Gluestack's CSS variables, Spendly only | `theme/gluestackVars.ts`, `components/layout/SpendlyUIScope.tsx` |
| Shared fills | Neutral surfaces and alpha tints | `theme/surfaces.ts` |
| Bottom chrome geometry | Capsule, FAB and list clearance | `shared/config/bottomChrome.ts` |

## 2. Use these components

| Need | Use | Notes |
|---|---|---|
| Action button | `Button` (`components/ui/Button`) | Pill shape, 40/48/54dp heights. String children get the label style. Variants: `primary`, `outline`, `tonal`, `ghost`, `text`, `destructive`. |
| Standard form field | `Input` (`components/ui/Input`) | 52dp, owns its border, colours and placeholder colour. |
| Search field | `SearchBar` (`components/common/SearchBar`) | `accentColor` sets a hub-specific focus ring; `containerStyle` handles row layout. |
| Selectable pill, filter or tab chip | `Chip` (`components/ui/Chip`) | `tone` (primary/success/destructive); `appearance` (solid/outline/tonal); `accentColor` for hub identity. |
| Two-to-four-way switch | `SegmentedControl` (`components/ui/SegmentedControl`) | Pass `activeColor` for per-option icon colour (for example income green, expense red). |
| Card or section | `Card` (`components/ui/Card`) | Dashboard widgets use `Section` from `components/dashboard/primitives`, which renders `Card`. |
| Bottom sheet | `Modal` (`components/common/Modal`) | Gluestack sheet with its own ScrollView. |
| Confirm or alert | `appDialog` (`lib/appDialog`), `Dialog` (`components/common/Dialog`) | Never call `Alert.alert`. |
| Toast | `toast` (`lib/toast`) | |
| Floating glass | `GlassSurface` (`components/ui/GlassSurface`) | `tone="smoke"` is the blue-indigo iOS-style glass used by the nav (SPENDLY-170/172). All its values live in `components/ui/glassTokens`; the active tab uses `glassAccent(theme.colors.primary)` on a blue/purple lens. Pass an explicit `radius`: the specular line is inset from the corner curve. |
| Add FAB | `AddFab` (`components/ui/AddFab`) | In the bottom nav it floats above the capsule's trailing end (SPENDLY-172), so the capsule keeps the full width. |

## 3. Rules for new and changed screens

1. **No `TouchableOpacity`.**
   - Rows and cards that navigate use `Pressable`.
   - Actions use `Button`.
   - Selections use `Chip` or `SegmentedControl`.
2. **No hand-rolled neutral fills.**
   - Don't write `isDark ? "rgba(255,255,255,a)" : "rgba(0,0,0,a)"`. Use `useSurfaces()`: `tile`, `control`, `track`, `divider`, `wash(color)`.
   - Don't write `color + "1A"`. Use `withAlpha(color, a)`.
3. **Colours come from `theme.colors`.** Deliberate identity palettes are the exception, for example `components/accounts/accountScreenTheme` (the Money hub green). Keep those in one named module; don't scatter literals.
4. **Raw `TextInput` is only for compact inline fields.** That means 36–40dp amount boxes inside rows, inline add rows, chat composers, and multi-line notes. Style them with the theme tokens and surfaces.
5. **React Native's own `Modal` is only for:**
   - full-screen pickers;
   - form sheets that host scrolling lists plus text inputs above another open sheet (keyboard and nested-scroll risk).

   Everything else uses `common/Modal`. A bottom-anchored sheet in React Native's own `Modal` must end with `<SheetBottomInset />` (`components/common/SheetBottomInset`). Under Android edge-to-edge the modal window draws behind the system navigation bar, and without the spacer the footer button sits under the 3-button bar.
6. **Lists pad their bottom with `usePageListBottomPadding()`** (or `PageShell` with `listOwnsBottomInset`) so the last row clears the capsule and FAB. Never hard-code a bottom inset.
7. **Touch targets are at least 48dp.** `Button` and `Chip` already meet this. Custom rows need `minHeight: 48`.
8. **Accessibility.**
   - Every icon-only control needs an `accessibilityLabel`.
   - Selections set `accessibilityState.selected`.
   - Tab rows use `accessibilityRole="tablist"` / `"tab"`.
9. **Contrast.** Anything drawn on glass has to hold WCAG AA (4.5:1 for small text). Extend `lib/navContrast.test.ts` when you add glass content.
10. **Shared primitives affect every product.** Before changing `Button`, `Input`, `Card`, `Modal`, `Dialog`, `SearchBar` or `toast`, check the Ganesh and Nutrition callers. Prefer an optional prop over changing the default look.

## 4. Pitfalls this epic hit (read before touching the plumbing)

- **Function-form `Pressable` styles.**
  - Under NativeWind's JSX transform, `style={({ pressed }) => ...}` gets silently dropped, and the component renders unstyled.
  - `lib/pressableStyleFix.ts` shims this and has to stay the first import in `app/_layout.tsx`.
  - After any `nativewind` or `react-native-css-interop` upgrade, check a function-style Pressable on a device (the capsule nav tabs are the quickest).
- **Where sheets render.**
  - `common/Modal` and `common/Dialog` pass `useRNModal`, so each opens a real React Native Modal window, as on `main`. Keep it that way.
  - Without it, Gluestack portals the sheet into the nearest `OverlayProvider`. That causes two problems:
    - The capsule nav's Android `elevation` draws it *above* the sheet and its backdrop.
    - Content rendered at the root loses its caller's context: "useX must be used within a ...Provider", or Ganesh sheets picking up the Spendly theme.
  - The `OverlayProvider` inside `AppShellInner` stays as a fallback for any future portal-based overlay (popover, menu). It sits below every app provider for the same context reason, and anything portalled into it still has to render above the capsule's container (`zIndex` 90). The capsule itself has no `elevation`; its shadow is a `boxShadow`.
- **Android glass blur needs the scope around the chrome.**
  - `GlassSurface` only blurs on Android when it can see the blur target's ref. `GlassBlurScope` publishes it and has to wrap both `GlassBlurTarget` (the screen stack) and the nav or dock that render beside it. Without the scope the glass silently falls back to tint only; the capsule shipped that way until SPENDLY-170.
  - expo-blur's Android radius is `intensity / blurReductionFactor` physical pixels and its dark tint scales with `intensity`. `smokeAndroidBlur()` in `components/ui/glassTokens` solves for both; don't pass a raw intensity for smoke glass.
- **`NavigationBar style` names the button colour.** expo-navigation-bar's type docs say `"dark"` is a dark bar, but the native module treats it as dark *buttons* on a light scrim. Use `navigationBarStyleFor()` from `lib/navigationBarStyle`, whose test pins the native behaviour (SPENDLY-174).
- **Colour-variable scope.** `SpendlyUIScope` applies the Spendly Gluestack variables to the Spendly shell only. Ganesh and Nutrition keep the root defaults.
- **`expo prebuild` wipes the release signing.**
  - It regenerates `android/` even without `--clean`, dropping the hand-edited release signing in `android/app/build.gradle` and `android/gradle.properties`.
  - Back those two files up before a prebuild and restore them after. The installed release build is signed with the upload key, and a debug-key build can't install over it without an uninstall (which wipes local data).
- **Native modules added by this epic:** `expo-blur` (glass) and `expo-navigation-bar` (system bar scrim). Both need a new dev client or EAS build; an OTA update can't deliver them.
- **Case-colliding paths.** `components/ui/Card.tsx` and `components/ui/card/` differ only by case. Import the Gluestack pieces as `@/components/ui/<name>/index`, never `@/components/ui/<name>`, which resolves to the wrapper on Windows and macOS.
- **File encoding.** Config files must be UTF-8. `babel.config.js` was once committed as UTF-16 and broke every bundle.

## 5. Rollback

The work sits on the epic branch `SPENDLY-122-mobile-ux`; `main` doesn't have it yet. Pick the smallest rollback that fixes the problem.

| Problem | Rollback | Needs a native build? |
|---|---|---|
| Blur looks wrong or costs too much on a device | `<GlassSurface blur={false}>` (near-opaque fallback), or `tone="adaptive"` for the lighter theme-tinted glass | No |
| Users dislike the capsule nav | Settings, then Navigation, then "Action dock" (per user); or revert `components/BottomNav.tsx` to its pre-SPENDLY-164 render | No |
| The Pressable shim misbehaves | Remove the `@/lib/pressableStyleFix` import from `app/_layout.tsx`. Function-style Pressables go unstyled again, so treat this as short-term only. | No |
| Branding needs to go back | Revert the SPENDLY-162 merge (`1ac2a1a`) | Yes (icon and splash) |
| Nav work needs to go back | Revert the SPENDLY-161 merge (`c8e0211`) | Yes (drops `expo-blur`) |
| Screen migration needs to go back | Revert the SPENDLY-145 merge (`c8f74f6`) | No |
| Everything | Don't merge the epic; `main` is untouched | n/a |

Build-level verification: on `SPENDLY-154-final-qa`, `assembleRelease` succeeds with the release key, and `npx expo config` resolves for the default, Expense, Nutrition and Ganesh builds. `main` keeps building as it does today, because none of this has been merged into it.

## 6. How to check a UI change

1. `npm run typecheck` and `npm test`. The contrast and bottom-chrome geometry tests live in `lib/` and `shared/config/`.
2. Run it on a real Android device. Unit tests can't catch styling that fails silently; the Pressable bug only showed up in device screenshots.
   - `npx expo run:android` builds the dev client, which is signed with the release key, so it installs as an update.
   - After a prebuild, restore the signing first (see section 4).
3. Look at light theme, dark theme and a non-default accent, at a large font scale, and with 3-button and gesture navigation.
