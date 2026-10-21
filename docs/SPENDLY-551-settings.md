# SPENDLY-551 (Phase 6d): Settings

Story under epic SPENDLY-531. Branch: `feature/SPENDLY-551-settings`, cut from the epic branch (`785a4e4`, which includes SPENDLY-548).

UI only. Settings storage and sync are unchanged. Midnight Emerald is still an opt-in preset.

## What changed
| Finding (from the ticket) | Fix |
|---|---|
| 4 files imported `accountScreenTheme` | None do now. Hub rows, section icons, submenu icons and the section header icon use `theme.colors.primary` with a `surfaces.wash(primary)` tile, as the Phase 3–5 section icons do. The settings search uses the default accent instead of `CARD_ORANGE`. |
| 16 hardcoded colours | None left in `app/(app)/settings` or `components/settings`. Panels and rows use `theme.colors.card` and `border`. |
| Switch `#FFFFFF` thumbs, teal on web | New `ThemedSwitch` in `SettingsControls`, the one switch for the app. It has a primary track and theme thumbs (primary-foreground when on, muted when off), and passes `activeThumbColor` for react-native-web, as in SPENDLY-545. It's used by `RowSwitch`, the dashboard widget toggles and the card-bill reminders. |
| `ChipRow` filled with a hardcoded green | Now renders the outline `Chip` from Phases 3–5, with a radio role and no haptic on re-select. The card-bill reminder chips use the outline appearance too. |
| 4 `Amount`s without `ghostable` | All are `ghostable`: category budgets, goals, and the Appearance preview's sample amounts, so the preview also shows ghost mode. |
| 2 plain `formatAmount` | The Money section's "budget saved" and "saved in your account" text is masked in ghost mode, and keeps the user's number format. |

**Outside Settings:** `ChipRow` and `RowSwitch` are also used by six Expense planning screens: the goal optimizer, the what-if editor and change sheet, the reminder editor, goal plan inputs and runway settings. They pick up the same outline chips and themed switch, which is what "one switch style for the whole app" asks for. No Ganesh Seva or Nutrition code imports these controls.

**Design decision:** Settings used a fixed green identity: `ACCOUNT_GREEN` in dark themes and `success` in light. It now follows the theme accent, like every other redesigned screen. It's emerald in Midnight Emerald and the user's accent elsewhere.

## QA
Web, on the local emulator (`http://127.0.0.1:8091`). Before was captured by stashing the change on the same dev server, then after was captured on the same pages: the hub, all eight sections and runway.
| Check | Before | After |
|---|---|---|
| "On" switch thumbs (Appearance, Preferences, Automation) | `rgb(0,150,136)`, react-native-web's teal fallback, in every theme | The theme's primary-foreground (dark thumb on emerald in Midnight Emerald, light thumb in Light); "off" thumbs muted |
| Selected chip | Hardcoded `rgb(74,222,128)` fill | Outline: control fill plus an accent border (emerald `rgb(53,232,137)` in Midnight Emerald, the accent in Light) |
| Hub and section icons | Fixed green | Theme accent on a washed tile |
| Errors, NaN or undefined text | none | none, across all sections at Midnight Emerald 320, Light 390 and a second 390 run |

**Checks run:**
- `npm test`: 378 files, 5,684 tests passed. Two timing tests ("stays fast") failed once while the emulator and web server were loading the machine. They passed in isolation and in the clean full run.
- `npm run typecheck:shared`: passed.
- `npx tsc -p tsconfig.json --noEmit`: passed.

**Not run:**
- No new unit tests. The story has no pure logic; it's colour, token and component wiring, verified through computed styles above.
- Native device QA hasn't been done.

## Follow-ups
- `RunwaySourceRow` still renders its own `Switch` with the same props. It could switch to `ThemedSwitch` in the planning-forms story (SPENDLY-555).
