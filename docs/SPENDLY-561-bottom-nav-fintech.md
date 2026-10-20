# SPENDLY-561: Bottom nav, dark charcoal fintech capsule

Story under epic SPENDLY-531. Branch: `feature/SPENDLY-561-bottom-nav-fintech`, cut from the epic branch (`83556a3`). At the user's request it went straight to `main`: the commit was cherry-picked onto `origin/main` (without SPENDLY-548/551, which stay on the epic) and merged from `feature/SPENDLY-561-bottom-nav-main`.

UI only. Routes, the active-tab logic (`isNavItemActive` on the pathname), the add FAB and its handler, the keyboard hide, the compact-label fallback, and the safe-area and list-clearance geometry in `shared/config/bottomChrome` are all unchanged. Nutrition and Ganesh Seva render their own tab bars, so they are not affected.

## What changed
| Area | Before | After |
|---|---|---|
| Capsule surface (`GlassSurface` `tone="smoke"`, used only by `BottomNav`) | Blue/indigo smoke glass. A thin tint in dark themes, a cool gloss, a specular line and a bottom reflection. | Deep charcoal `rgb(23,27,36)`: 0.86 alpha in dark themes, 0.9 in light, 0.96 without blur, all over the existing light backdrop blur. Faint white sheen. |
| Rim and shadow | Cool blue rim plus a blue atmospheric glow | A low-opacity white hairline (top edge slightly brighter) and one neutral drop shadow, `0 8 16 rgba(0,0,0,.25)` |
| Active tab | A full-height blue/purple pill (emerald in Midnight Emerald), with a glint | A rounded (16) translucent tile in the **theme accent**, inset 4dp inside its tab. It slides between tabs with the existing reduced-motion-aware Reanimated slide. |
| Active colour | Accent, lifted toward white until it reads (`glassAccent`) | Unchanged mechanism. With the orange accent this gives a lifted orange, like the reference's `#FF8A3D`. |
| Inactive tabs | White at 0.85/0.9 | Muted grey: white at 0.62 (labels) and 0.68 (icons) over the charcoal |
| Labels | 10.5/13, active weight 700 | 11/14, active weight 600, inactive 500 |
| Side margin | 4dp | 10dp, so the capsule reads as floating. On a 320dp screen, tabs are still 56.8dp wide, above the 52dp label threshold. |

**Lens:** `smokeLensFor(themeName)` (the blue lens, or emerald for Midnight Emerald) is replaced by `accentLens(primary)`. Midnight Emerald still gets emerald, because emerald is its primary. Every other accent now gets a tile in its own colour.

## Safe area and FAB
No geometry change except the side margin. The capsule sits at `capsuleOffset(insets.bottom)`, which is `max(inset, 12)`. That covers both gesture navigation and three-button navigation without double-counting. The FAB floats `CAPSULE_FAB_GAP` above the capsule's trailing end. Lists pad by `bottomChromeClearance`, which is derived from the same numbers, so the last row clears both.

## QA
Web, on the local emulator (`http://127.0.0.1:8091`), with Playwright. The demo user's theme was set in the emulator only.
| Run | Result |
|---|---|
| Light / orange, 390×844 | Charcoal capsule on a light page, an orange tile on the active tab, grey inactive tabs. All five tabs route (`/dashboard`, `/ledger`, `/vaults`, `/investments`, `/insights`) and the tile follows the route. The FAB opens the Add sheet. |
| Dark / orange, 360×780 | Same. The capsule's tint computes to `rgba(23,27,36,0.96)` (the web, no-blur path). Content behind it shows by at most about 12 levels. |
| Midnight Emerald, 320×640 | Emerald tile. On web, "Dashboard" and "Investments" ellipsize, because `adjustsFontSizeToFit` only works on native (a known web limitation). |

**Checks run:**
- `npx vitest run lib/navContrast.test.ts shared/config/bottomChrome.test.ts theme/midnightEmerald.test.ts shared/config/navigation.test.ts`: 494 passed. This includes AA for every theme × accent on the new surface and accent tile.
- `npm test`: 379 files, 5,700 tests passed.
- `npm run typecheck:shared`: passed.
- `npx tsc -p tsconfig.json --noEmit`: passed.

**Not done:** Android/iOS device QA, where blur is real and the dark-theme film is 0.86 rather than 0.96. Gesture versus three-button navigation and large font scale also still need a device check.
