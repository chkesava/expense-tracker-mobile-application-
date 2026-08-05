# Phase 3 Migration Report — User Document, Settings & Theme Sync

> **Date:** 2026-08-05  
> **Scope:** Phase 3 only  
> **Status:** Implemented (awaiting device checklist)

## Summary

Shared `users/{realUid}` listener feeds settings, theme, and role. Settings screen subset (profile / general / personalize). Privacy deferred to Phase 4.


| Check          | Result                              |
| -------------- | ----------------------------------- |
| `tsc --noEmit` | Pass                                |
| Vitest         | Pass (incl. `mergeSettingsFromDoc`) |


---

## Built


| Area                      | Files                                                         |
| ------------------------- | ------------------------------------------------------------- |
| Settings types + defaults | `shared/types/settings.ts`                                    |
| UserDoc                   | `providers/UserDocProvider.tsx` — single `onSnapshot`         |
| Settings                  | `providers/SettingsProvider.tsx` — merge, seed, setters       |
| Theme sync                | `theme/ThemeProvider.tsx` — AsyncStorage + Firestore `theme`  |
| Theme names               | `theme/tokens.ts` — full web theme list → light/dark palettes |
| Role                      | `hooks/useUserRole.ts` — reads UserDoc (no extra getDoc)      |
| Settings UI               | `app/(app)/settings.tsx`                                      |
| Shell                   | `app/_layout.tsx` provider order; `(app)` Settings route      |
| Home                      | `app/(app)/index.tsx` — prefs summary + link to Settings      |




## Provider order

`SystemSettings` → `Auth` → `UserDoc` → `Theme` → `Settings` → `Toast` → routes

## Acceptance criteria

- [x] Single shared listener for `users/{uid}` feeds settings and theme
- [x] Missing user doc seeded with DEFAULTS (`setDoc` merge)
- [x] Theme/settings write to Firestore + AsyncStorage (theme) — verify on device
- [x] `enableInvestments`, `navigationStyle`, `defaultView`, budget/UPI/timezone readable via `useSettings`
- [x] Role from UserDoc (`SUPER_ADMIN` vs `USER`; duress force-USER stub ready)



## How to verify on device

1. Sign in (Google or email) → Home shows role + prefs line
2. Open **Settings** → change theme, timezone, budget, UPI, nav style → Save profile username
3. Kill app / reload → prefs and theme persist
4. Confirm same fields updated on web (same Firebase user doc)



## Explicitly not in Phase 3

Privacy PIN / duress / biometrics (Phase 4), accounts/categories managers, budgets/goals UI, data export/import, Dashboard.