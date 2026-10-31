# SPENDLY-649: Saved screens (on the device)

- **Feature:** SPENDLY-623 (Stock Screener), story 3 of 5. See the [tracker](SPENDLY-623-stock-screener.md) and [plan](SPENDLY-623-plan.md) §3.4.
- **Branch:** `feature/SPENDLY-649-saved-screens`, cut from `feature/SPENDLY-623-stock-screener` at `79392be0`.
- **State:** Built and tested; awaiting approval to merge into the feature branch.

## Decision
Saved screens stay **on the device only** (the user chose Option A on 2026-10-30). That means no Firestore collection, no rules, no read-model migration and no purge. Screens aren't synced between devices.

## What changed
| File | Change |
|---|---|
| `shared/utils/savedScreens.ts` (new) | Pure rules: `checkScreenName`, `addSavedScreen`, `updateSavedScreen`, `removeSavedScreen`, `parseSavedScreens` and `serializeSavedScreens`. |
| `lib/screenerSavedScreens.ts` (new) | The device store: one AsyncStorage item `spendly.screener.savedScreens.v1` holding `{ version: 1, screens }`. It provides `hydrateSavedScreens`, `getSavedScreens`, `subscribeSavedScreens` (ready for `useSyncExternalStore` in 651), `saveScreen`, `updateScreen` and `deleteScreen`. |
| Tests | `savedScreens.test.ts` (13, new) and `screenerSavedScreens.test.ts` (7, new). Both files are added to the Firebase-free guard. |

## Rules
- **Limits:** at most **10** screens. Names are 1–40 characters, trimmed with spaces collapsed, and unique ignoring case. A screen keeps its own name when renamed.
- **Validation:** every screen passes the engine's `validateScreen` before it's saved, so a screen using P/E, or with a minimum above its maximum, is refused with the engine's message.
- **Order:** newest first. `updatedAt` is stamped on every rename or edit.
- **Reading from disk** never breaks the screener:
  - corrupt JSON, another version, or the wrong shape gives an empty list;
  - bad entries are dropped **one at a time**, so the rest survive;
  - duplicate ids or names keep the first;
  - the list is capped at 10.
- **Storage failure** falls back to memory, without throwing. Screens still work for the session and are written on the next save, as the other local stores do.
- **Hydration:** the list is read once per session. Every change runs after that read and notifies subscribers. The snapshot reference stays the same between changes.

## Validation
- `savedScreens.test.ts` and `screenerSavedScreens.test.ts`: 20 tests passed. They cover surviving an app restart, rename and delete persisting, limits, name rules, corrupt and other-version data, entry-by-entry dropping, storage failure and subscriptions.
- Full `npm test`: **493 files, 6,682 tests passed** on the first run. `npm run typecheck:shared` and `npx tsc -p tsconfig.json --noEmit` both exited 0.
- `test:rules` was not run, because there's no Firestore and no rules change.
