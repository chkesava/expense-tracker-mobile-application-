# SPENDLY-617 — Midnight Slate replaces Midnight Emerald (Expense)

**Decisions (owner, 2026-10-26):** replace Midnight Emerald (no second theme);
keep green, red, amber and blue for money and status meaning only.

## Palette (`midnightSlateColors`, `theme/tokens.ts`)
| Hex | Tokens |
|---|---|
| `#06141B` | background, primaryForeground |
| `#11212D` | card |
| `#1A2B38` | secondaryContainer (an in-between step so containers aren't flat) |
| `#253745` | secondary, muted, surfaceVariant, border, primaryContainer, outlineVariant |
| `#4A5C6A` | outline, used for lines only (2.4–2.7:1, too faint for text) |
| `#9BA8AB` | mutedForeground, onSurfaceVariant, tabIconDefault |
| `#CCD0CF` | foreground and the accent: primary, tint, tabIconSelected, on-containers |
| `#35E889` / `#FF7777` / `#F5C451` / `#78B8FF` | success / destructive / warning / info (unchanged) |

Chart categories drop green and red so a category never reads as gain or loss.
`chart.positive`/`negative` stay green and red.

The theme id stays `midnight-emerald`, so saved preferences need no migration.
Only the label changed, to "Midnight Slate".

## Hard-coded emerald moved onto the theme
- `components/layout/PageHeader.tsx`: icon tile and tab tint follow the accent
  **only for the Expense preset**. Nutrition and Ganesh Seva keep their green.
- `components/analytics/FilterSheetModal.tsx`: selected chips and Apply use the
  theme accent (the SPENDLY-538 hooks) instead of a fixed green.
- `components/accounts/BillingCycleCard.tsx`: the decorative calendar icon uses
  primaryContainer.

## Left as is (by design)
- Green and red that mean money or status: ledger health, amounts, badges,
  over-budget.
- Category colours, confetti, onboarding and error-boundary art, and Ganesh
  and Nutrition colours. A per-file review of the ~183 hex literals found no
  other emerald brand use.
- Native splash and adaptive icon background `#071423`. It is already navy
  and close to `#06141B`, and changing it needs a native build.

## Tests
`theme/midnightSlate.test.ts` (renamed from `midnightEmerald.test.ts`) covers
the contrast pairs, the six-colour rule, green and red reserved for money, and
`#4A5C6A` kept off text. `lib/navContrast.test.ts` now expects the slate
active-tab tile.
