# SPENDLY-618 — selectable Expense palettes

Follow-up to SPENDLY-617. Users pick the Expense palette in **Settings →
Appearance**: Slate (default, unchanged), Forest, Plum or Cocoa. The whole
Expense app switches immediately.

## How
- `theme/tokens.ts`
  - `expensePaletteColors(spec)` maps a palette onto the tokens the same way
    for every palette. A test proves it rebuilds Slate exactly.
  - New theme ids `midnight-forest`, `midnight-plum` and `midnight-cocoa`.
    All are dark and own their accent.
  - `EXPENSE_PALETTE_NAMES`, `EXPENSE_PALETTE_SWATCHES` and
    `resolveExpensePalette` (falls back to Slate).
- `theme/ThemeProvider.tsx`: the new `expensePalette` and `setExpensePalette`
  are stored in AsyncStorage (`expense-tracker-palette`) and on `users/{uid}`
  as `expensePalette`, the same way `accentColor` is. The users-doc rule is
  field-agnostic apart from `role`, so no rules change is needed. The read
  model doesn't sync the root users doc.
- `app/(app)/_layout.tsx`: the Expense shell renders the chosen palette.
- `components/settings/ExpensePalettePicker.tsx`: a swatch tile per palette,
  used as a radio group in `AppearanceSection`.

## Contrast
Plum's and Cocoa's third colours (`#45404F`, `#60433D`) give secondary text
only 4.06 and 3.68:1, so their raised surfaces are derived darker shades:
`#373340` (4.99) and `#483430` (4.82). The original colours stay as borders
and primary containers, where the main text still reads at 7.5 and 6.4.

## Unchanged
Ganesh Seva and Nutrition still follow their own saved theme. Money and status
colours are the same in every palette. Forest's mint text is pale, not
saturated, so it stays distinct from the `#35E889` money green.

## Tests
`theme/expensePalettes.test.ts` covers each palette:
- 13 WCAG AA pairs;
- tokens taken from the palette's own colours;
- the line colour kept off text;
- money colours shared, and kept out of category series;
- defaults.

`lib/navContrast.test.ts` and `theme/gluestackVars.test.ts` now cover the new
themes too, because they iterate `THEME_NAMES`.
