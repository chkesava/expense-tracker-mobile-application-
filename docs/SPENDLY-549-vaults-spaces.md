# SPENDLY-549 (Phase 6b): Vaults and Spaces

Story under epic SPENDLY-531. Branch: `feature/SPENDLY-549-vaults-spaces`, cut from the epic branch (`83556a3`, after `main` with SPENDLY-495 / v4.1.3 was merged in).

UI only: no vault, space, expense or ledger write-path changes. The forms submit exactly what they did before.

## What changed
| Ticket finding | Fix |
|---|---|
| 64 hardcoded colours | None left in `app/(app)/vaults.tsx`, `components/vaults` or `components/spaces`. Semantic colours (healthy/warning/over, deposit/withdrawal) use `success`/`warning`/`destructive` with `surfaces.wash`. Neutral fills use `surfaces.tile`/`track`. Buttons on primary use `primaryForeground`. |
| 14 `Amount`s without `ghostable` | They're replaced by `FinancialAmount`, which handles ghost mode. Raw-text money the ticket didn't count is now ghost-aware too: vault "Remaining/Spent", member "Deposited/Spent", and space "Budget n" and "n left/over", which used to be bare numbers with no currency. |
| Foundations | The hub summary, vault card, vault detail, space card, space detail and spaces list use `FinancialAmount`, `Pill`, `ProgressIndicator` and `DashboardSkeleton`. Filter pills (space status, category, sort, date) use the outline `Chip`, as in Settings. |
| Words, not colour alone | `shared/utils/vaultSpacePresentation.ts` (pure, tested) gives every vault status and space tier a word: On track / Watch spending / Nearly at budget / Over budget / No budget. Space `warning` and `danger` share the amber tone, so their words keep them apart. Withdrawals show a minus sign. |
| Forms on the 6a pattern | `CreateVaultModal` and `VaultTransactionModal` were hand-rolled RN `Modal`s with their own backdrop, header and footer. They now use `common/Modal`, labelled `Input`s and pinned `SheetActions`. `SpaceFormModal` gets the pinned footer and labelled inputs (helper text through `helperText`). The vault detail's "Add transaction" is pinned in its footer. |

**User colours are data, not styling.** The vault palette moved to `VAULT_COLORS`/`DEFAULT_VAULT_COLOR` in `shared/types/vault.ts`, next to `SPACE_COLORS`. The values are unchanged and pinned by a test, because they're stored on vaults as `themeColor`. Accent strips and bars still use the user's chosen colour.

**Copy fix:** the "assign to space" empty state said to create a space "in the Ledger Hub". Spaces lives under Vaults.

## QA
**Isolated setup:** web, on a separate emulator suite at `127.0.0.2` (ports 9099/8080/9199) with Expo on `:8093`. Another agent was using the default `127.0.0.1` emulators and `:8091`. A scratch copy of the seed script allowed `127.0.0.2`; the repo's guard is unchanged.

**Data:** created through the new forms.
- Vault "Flat 4B", saved as `{budget: 20000, themeColor: "#10B981", currency: "INR"}`.
- A deposit of 30,000 and a withdrawal of 17,500, through the transaction sheet stacked over the detail sheet.
- Space "Home renovation" with a budget of 1,200. Four seeded expenses were tagged to it by an emulator-only script.

| Check | Result |
|---|---|
| Figures | Vault balance ₹12,500 (30,000 − 17,500), spent ₹17,500, ₹2,500 left of ₹20,000. Space spent ₹1,761, "Over budget · ₹561 over". All correct. |
| Ghost mode (setting on) | No ₹ amount visible on the hub, vault detail, spaces list or space detail (1, 10, 3 and 12 masked values). |
| Themes and widths | Midnight Emerald 390 and 320, Light 390: no errors, no NaN. |
| Console | Two `Text`-node errors (string `value`s passed to `ProgressIndicator`) and one serif caption (a `Text` without the theme font) were found and fixed during QA. |

**Checks run:**
- `npm test`: 380 files, 5,705 tests passed, including 7 new presentation and palette tests.
- `npm run typecheck:shared` and `npx tsc -p tsconfig.json --noEmit`: both passed.

**Not done:** native device QA.

## Follow-ups (not in this story)
- `spaceMath`'s `percentUsed` and the category `percentage` carry two decimals ("146.75% used", "76.04% · 3") and can clip at 390. Rounding them is a calculation-presentation change, which belongs outside this UI story.
- The hub doesn't pass `stats` to `VaultCard`, so the list never shows a balance or budget bar. Loading per-vault stats on the hub would be a read-path change.
