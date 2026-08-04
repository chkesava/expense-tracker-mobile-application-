# Phase 1 Migration Report — Foundation

> **Date:** 2026-08-04  
> **Scope:** Phase 1 only (`MOBILE_MIGRATION_PLAN.md`)  
> **Commit message:** `feat(mobile): phase-1 foundation`

## Summary

Expo app foundation: root layout providers, env mapping, Firebase Auth/Firestore bootstrap, light/dark tokens, toast, and shared UI primitives. **No Authentication UI, Dashboard, or Transactions.**

| Check | Result |
|-------|--------|
| `npx tsc -p tsconfig.json --noEmit` | Pass |
| `npm test` (Phase 0 shared vitest) | 38 / 38 pass |
| Auth / Dashboard / Transactions screens | Not built (as required) |

---

## What was built

### Expo Router root layout
- `app/_layout.tsx` — `GestureHandlerRootView` → `SafeAreaProvider` → `AppThemeProvider` → `ToastProvider` → themed `Stack`
- `app/index.tsx` — Foundation diagnostic screen (primitives + Firebase status)
- `app/+not-found.tsx` — themed 404
- Removed template `(tabs)` routes and `modal.tsx` (not Phase 1 product screens)

### Environment
- `lib/env.ts` — `EXPO_PUBLIC_*` mapping (former `VITE_*`)
- `.env.example` — documented public Firebase + app URL keys; server secrets excluded

### Firebase
- `lib/firebase.ts` — lazy init of Auth + Firestore when env is complete
- **Offline strategy**
  - **Web:** `persistentLocalCache` + multi-tab manager (IndexedDB)
  - **Native:** `memoryLocalCache` (documented; durable RN offline deferred)
  - Auth AsyncStorage persistence deferred to Phase 2 with Auth UI

### Theme & tokens
- `theme/tokens.ts` — light/dark color, space, radius, typography tokens
- `theme/ThemeProvider.tsx` — `useTheme`, toggle, memory-backed theme preference
- `constants/Colors.ts` — compatibility re-export for leftover template helpers

### Shared utilities
- `lib/cn.ts` — StyleSheet-friendly style merger
- `lib/toast.tsx` — imperative `toast` API + `ToastProvider` viewport

### UI primitives
| Component | Path |
|-----------|------|
| Button | `components/ui/Button.tsx` |
| Input | `components/ui/Input.tsx` |
| Card | `components/ui/Card.tsx` |
| Amount | `components/common/Amount.tsx` |
| EmptyState | `components/common/EmptyState.tsx` |
| Skeleton | `components/common/Skeleton.tsx` |

---

## Acceptance criteria

- [x] App has Expo Router root layout with providers (launchable shell)
- [x] Firebase clients initialize from env without embedding server-only secrets
- [x] Light/dark tokens apply to primitives
- [x] Toast + Button/Input/Card/Amount/EmptyState/Skeleton available
- [x] Firestore offline strategy documented and enabled (web persistent / native memory)

---

## Deferred to later phases

| Item | Phase |
|------|-------|
| Auth UI / Google / email session persistence (AsyncStorage) | 2 |
| SystemSettings / maintenance gate | 2 |
| UserDoc theme sync to Firestore | 3 |
| Privacy lock | 4 |
| Product navigation (Ledger/Dashboard tabs) | 5+ |
| Durable native Firestore offline | Later / infra |

---

## Notes

- Foundation screen shows Firebase “configured: no” until local `.env` is filled from `.env.example`.
- NativeWind is a dependency but Phase 1 primitives use StyleSheet + token context (no NativeWind setup required to compile).
- Template files (`components/Themed.tsx`, `EditScreenInfo.tsx`, etc.) remain unused but typecheck clean.
