# SPENDLY-604: the Expense app is always dark

**Type:** Task, no epic. It follows on from SPENDLY-572.
**Branch:** `fix/SPENDLY-604-expense-always-dark`, cut from `main`.

## Why
SPENDLY-572 made the Visual First dashboard always render in Midnight Emerald, but every other Expense screen still followed the user's theme. A light-theme user switched between a dark dashboard and light screens. The product owner's decision is that **the Expense app is always dark**.

## What changed
- **`theme/tokens.ts`:** `EXPENSE_THEME_NAME = "midnight-emerald"`.
- **`app/(app)/_layout.tsx`:** the Expense shell is wrapped once in `ThemeOverride`, with a light-icon `StatusBar`. That covers:
  - every screen, the header, the bottom nav, dock and sidebar;
  - modals and sheets, and the Gluestack overlay (`SpendlyUIScope` sits inside the override);
  - the Android navigation bar, which already follows `themeName`.
- **Root-level hosts:**
  - `appDialog` alerts and action menus (`providers/AppDialogProvider.tsx`), toasts (`lib/toast.tsx`) and the celebration overlay (`app/_layout.tsx`) render above the shell.
  - They pick up the shell's palette through a new `ShellThemeScope`. The shell registers its palette with `useRegisterShellTheme` (`theme/ThemeProvider.tsx`).
  - When no shell registers a palette (Ganesh Seva or Nutrition), nothing changes.
- **`app/(app)/dashboard.tsx`:** its own override was removed, because it is now redundant.
- **Settings › Appearance:**
  - the theme mode, preset and accent pickers are gone;
  - a line explains that Spendly always uses Midnight Emerald;
  - the live preview and the dashboard widget settings stay.

## Not changed
- The saved `theme`, `themeMode` and `accentColor` on `users/{uid}` are not written or migrated. Ganesh Seva and Nutrition still follow them.
- `(auth)` login is shared with Nutrition, so it keeps the saved theme.
- No Firestore writes, rules or dependency changes.

## Tests
- `lib/expenseTheme.test.ts` (new): the pinned palette is a dark preset and looks identical for every saved accent.
- `npm test`: 454 files and 6,330 tests pass.
- `npm run typecheck:shared` and `npx tsc -p tsconfig.json --noEmit` are clean.
- UI check is pending on local Expo web, with the saved theme set to Light.
