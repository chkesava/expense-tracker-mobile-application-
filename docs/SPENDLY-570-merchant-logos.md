# SPENDLY-570: Merchant logos in Recent Transactions

This story is part of epic SPENDLY-531. It is on branch `feature/SPENDLY-570-merchant-logos`, cut from `feature/SPENDLY-531-premium-redesign` at `cb542b7a`, which includes SPENDLY-568. It follows up SPENDLY-566.

## Decision (product owner, 2026-10-22)
**Monogram tiles, not brand artwork.**
- Real merchant logos are trademarks and need licensed files.
- A known merchant gets its initials on a colour picked deterministically from its merchant id. The palette is data-viz hues, not brand colours.
- No logo images are bundled and nothing is fetched, so there are no licensing or privacy questions.
- Swapping in approved logo files later would only change the tile component; `Merchant.logoKey` already exists in the registry type for that.

## Behaviour
- **Matching:** each Recent Transactions row is matched through the existing SPENDLY-186 resolver (`resolveMerchants`), using the same source text as everywhere else (`expenseSourceText` / `incomeSourceText`).
- **When a tile shows** (`merchantMonogram`, in `shared/utils/merchantMonogram.ts`): only when the resolution has a merchant id **and** either:
  - the confidence is `high` or `medium`; or
  - the user named or corrected the merchant (`user_override` / `user_alias`).
- **Fallback:** a low-confidence contextual guess or an unknown keeps today's category glyph (or the income arrow). A row never claims a merchant the resolver isn't sure of, and no row is ever blank.
- **Corrections:** the user's merchant corrections are read **once** per dashboard visit with `listMerchantOverrides`. That is the same one-off read the transaction and merchant screens already make.
  - No listener is added.
  - The read is skipped while the list is empty.
  - If it fails, the rows fall back to registry matches.
- **Nothing is written:** merchant identity stays derived, and no transaction or merchant field changes.
- **Accessibility:** the tile is decorative and hidden from screen readers. The row's label ("Edit expense …") is unchanged.
- **Out of scope:** the ledger activity rows are unchanged, so the story stays small. They could reuse `merchantMonogram` and `MerchantMonogramTile` later.

## Files
| File | Change |
|---|---|
| `shared/utils/merchantMonogram.ts` (+ test) | New: initials, the "sure enough" rule, and a stable colour index (FNV-1a hash of the merchant id) |
| `components/dashboard/MerchantMonogramTile.tsx` | New: the tile (rounded square, tinted background and border, initials) |
| `hooks/useMerchantOverridesOnce.ts` | New: the one-off corrections read |
| `components/dashboard/RecentActivityWidget.tsx` | Resolves rows and shows the tile; falls back to the existing glyph |

## Tests and checks
- `npx vitest run shared/utils/merchantMonogram.test.ts`: 4 passed. These cover initials, the confidence gate, user-named merchants, colour stability, and real registry resolutions: "Zomato" → Z, "SWIGGY ORDER 1234" → S, "Groceries" → no tile.
- `npm test`: 397 files, 5,822 tests passed.
- `npm run typecheck:shared` and `npx tsc -p tsconfig.json --noEmit`: clean.
- **Web, against the Firebase emulator as the demo user (Midnight Emerald):**
  - I re-dated one "Swiggy order" and one "Amazon order" to today, in the emulator only.
  - Recent Transactions showed an **S** tile (sky) and an **A** tile (amber).
  - Cab ride, Milk and Weekly groceries kept their category glyphs.

## Rollout
No rules, indexes or data changes. Ships with the normal web deploy and Android release.

## Not done / known limitations
- Monograms only, not real logos (decision above).
- Recent Transactions only; the ledger rows are unchanged.
- Corrections made elsewhere while the dashboard stays mounted appear on the next dashboard visit.
- No Android device QA yet.
