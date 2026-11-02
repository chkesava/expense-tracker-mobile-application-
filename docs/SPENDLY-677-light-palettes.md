# SPENDLY-677: six premium light Expense palettes

## What changed
Settings → Appearance now offers six light Expense palettes, listed under "Light" below the four dark ones from SPENDLY-618: Rose Elegance, Royal Violet, Ocean Blue, Sunset Orange, Lavender Glass and Midnight Sage.

Decision (owner, 2026-11-02): these are true light palettes. SPENDLY-604's "always dark" now holds only while a dark palette is selected. Midnight Slate stays the default, and the dark palettes render exactly as before.

## Design
- **Tokens** (`theme/tokens.ts`):
  - `expenseLightPaletteColors(spec)` maps each reference palette onto the full `ColorTokens` set. The spec fields are background, card, container, step, edge, line, text, muted text, action and its label, accent, accent text and brand. The colour table is in `design/references/DESIGN.md`.
  - The light theme names (`expense-*`) are kept out of `DARK_APPEARANCE`, so every existing `themeUsesDarkPalette` / `useSurfaces().isDark` branch flips to light automatically.
- **New `accent` / `accentForeground` tokens:**
  - For the existing themes, Ganesh included, they equal the current primary/tint, so nothing there changes.
  - Gluestack's `--ring` (focus ring) now uses `accent`. For every existing theme that is the same colour as before.
- **Light status set** (`EXPENSE_LIGHT_STATUS`): `#15803D` / `#C81E1E` / `#B45309` / `#1D4ED8`, shared by all six palettes and held to AA on every card.
- **Charts** (`theme.chart`): light palettes lead with their accent and deep primary, then hues that read on white. The pale reference secondaries are left out.

## Shell and components
- `app/(app)/_layout.tsx`: the status bar follows the palette (it was always `light`).
- `components/ui/Button.tsx`: outline, ghost and text labels use `tint` when `primary` is under 4.5:1 on the card. Today that means only Sunset's orange.
- `components/ui/Card.tsx`: the glass variant gets a light fill and border on light palettes.
- `NetWorthGlassCard` period chip and `AppBarBrand` logo icon are theme-aware.
- `MagicChatModal`, `ReceiptScannerModal` and `ExportDataModal`: labels and icons on primary buttons and chips use `primaryForeground` instead of white. This also fixes white-on-light-grey on the dark palettes, whose primary is the light text colour.
- Picker (`components/settings/ExpensePalettePicker.tsx`): Dark and Light groups. Light tiles show a miniature card preview: background, card, accent dot, surface chip and action pill.

Left as they are, on purpose:
- The bottom-nav capsule (charcoal smoke glass in every theme, checked by `lib/navContrast.test.ts` over all themes).
- Credit-card plastic icons (white on a saturated gradient).
- The offline banner (a dark toast by design).
- The splash overlay.
- The dashboard hero (white ink over a photo).

## Tests
`theme/expensePalettes.test.ts` covers each light palette:
- AA for text, muted text, container text, the button label, tint, tabs and status colours;
- the accent at 3:1 as a mark;
- reference colours kept on their tokens;
- chart series free of money colours;
- `createTheme` ignoring the accent picker.

`lib/navContrast.test.ts` already loops over every theme.

## Not done / risks
- NativeWind `dark:` classes in `components/ui/button` and `components/ui/input` follow the **device** scheme (`darkMode: 'media'`), not the palette. On a dark-mode device with a light palette, the destructive button renders at 60% and the outline/input fills pick up their `dark:` tints. This was already true for the dark palettes on light devices.
- `components/spending/palette.ts` and `categoryRamp` still use their fixed data-viz tails after the theme's primary. They read on light, but they don't use `theme.chart`.
- Device QA (Android status and navigation bar on a light palette) is pending.
