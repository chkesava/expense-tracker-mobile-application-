# Phase 4 Migration Report — Privacy Lock

> **Date:** 2026-08-05  
> **Scope:** Phase 4 only  
> **Commit:** `feat(mobile): phase-4 privacy`

## Summary

PIN privacy lock, biometrics, inactivity / app-switch re-lock, and duress (`uid_duress`) with Auth `realUser` vs effective `user`.

| Check | Result |
|-------|--------|
| `tsc --noEmit` | Pass |
| Packages | `expo-local-authentication`, `expo-haptics` |

## Built

| Area | Files |
|------|-------|
| Session store | `lib/privacySession.ts` |
| Duress auth | `providers/AuthProvider.tsx` — `user.uid` → `{uid}_duress` when duress |
| Biometrics | `hooks/useBiometrics.ts` — SecureStore `vault_biometric_id` |
| Lock UI | `components/PrivacyLock.tsx` |
| Gate | `app/(app)/_layout.tsx` wraps stack in `PrivacyLock` |
| Settings Privacy | `app/(app)/settings.tsx` — PIN, fake PIN, timeouts, biometrics |
| Home | Duress banner + PIN status |

## Behavior (parity with web)

- 4-digit PIN; auto-submit; 5 fails → 30s lockout  
- Fake PIN → duress unlock (biometrics never enter duress)  
- Settings / UserDoc still use **realUser**  
- Inactivity timer + `AppState` background lock  
- Session unlock is in-memory (cleared on process death / logout)

## Explicitly not in Phase 4

Expense shell / dashboard (Phase 5+), finance data listeners under duress paths (arrive with finance phases).
