# SPENDLY-619 — only the four Expense palettes remain

The owner asked for the four palettes (Slate, Forest, Plum and Cocoa) to be
the only themes.

- `theme/tokens.ts` now defines only `light`, `dark` and the four
  `midnight-*` palettes. Nine presets were removed: `midnight`,
  `midnight-olive`, `vintage-parchment`, `sakura-bloom`, `cyberpunk`, `nordic`,
  `deep-sea`, `glass-3d` and `claymorphism`.
- No screen offered the removed presets. Settings → Appearance already
  listed only the four palettes (SPENDLY-618).
- `light` and `dark` stay because Ganesh Seva and Nutrition follow the saved
  light/dark mode.
- A saved `theme` naming a removed preset now fails `isThemeName`, so it's
  ignored and the app falls back to the system light/dark mode. No migration
  is needed, and the Expense palette preference is unaffected.
- Tests: `theme/expensePalettes.test.ts` pins the theme list and checks that
  removed names are rejected. The parameterised nav-contrast and gluestack
  tests now cover fewer themes, so the total test count dropped to 6427.
