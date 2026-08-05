# Phase 2 Migration Report — Authentication

> **Date:** 2026-08-05  
> **Scope:** Phase 2 only  
> **Status:** **Completed** (device-verified Google + email path)  
> **Commit:** `feat(mobile): phase-2 authentication` (+ follow-ups: Auth persistence, Google web bridge, Google ID token fix, `/google-auth` deep-link screen)

## Summary

Firebase Authentication, protected routes, system settings, maintenance gate, and post-login category hierarchy seeding. No Dashboard / Transactions / Privacy Lock.

| Check | Result |
|-------|--------|
| `tsc --noEmit` | Pass |
| Shared vitest | 38 / 38 pass |
| Device Google via web bridge | Pass — signed-in home with real Google account UID |

---

## Built

| Area | Files |
|------|-------|
| Auth provider | `providers/AuthProvider.tsx` — email login/signup, reset, Google ID token, logout, category ensure on session |
| System settings | `providers/SystemSettingsProvider.tsx` — `system_settings/global` snapshot |
| Role (minimal) | `hooks/useUserRole.ts` — SUPER_ADMIN bypass for maintenance |
| Category seed | `lib/ensureCategoryHierarchy.ts` — ported from web |
| Maintenance UI | `components/MaintenanceScreen.tsx` |
| Auth screen | `app/(auth)/login.tsx` — login / signup / forgot + Google |
| Google bridge | Web `/mobile-google-auth` + mobile `lib/googleAuthBridge.ts` (Expo Go) |
| Deep link handoff | `app/google-auth.tsx` — avoids “Screen not found” after AuthSession |
| Protected shell | `app/(app)/_layout.tsx` — redirect if logged out; maintenance if enabled |
| Signed-in home | `app/(app)/index.tsx` — session info + logout (not Dashboard) |
| Routing | `app/index.tsx` redirects to auth or app |

## Env

```env
EXPO_PUBLIC_APP_URL=https://kesavaexpensetracker.netlify.app
EXPO_PUBLIC_FIREBASE_*=…   # same project as web
```

Web `/mobile-google-auth` must be deployed. Bridge must pass a **Google** OAuth ID token (`credentialFromResult`), not `user.getIdToken()`.

## Acceptance criteria

- [x] Email/password signup, login, password reset, logout
- [x] Google sign-in via web bridge + `signInWithCredential` (same Firebase UID as web Google users)
- [x] `disableSignups` blocks email signup and deletes new Google users when flag is on
- [x] `maintenanceMode` shows MaintenanceScreen for non-admins; SUPER_ADMIN can bypass
- [x] `ensureCategoryHierarchy` runs on authenticated session
- [x] Unauthenticated users redirected away from `(app)` routes
- [x] Phase 24 listed for native Google / Play Store (not in Phase 2 scope)

## Device verification (completed)

1. Cold start → login screen  
2. Continue with Google → same account as web  
3. Landed on signed-in home with name / email / UID  
4. Phase 2 copy visible; Dashboard deferred  

## Explicitly not in Phase 2

Privacy lock / duress, UserDoc/Settings sync (Phase 3), Dashboard, Ledger, expenses.  
Native `@react-native-google-signin/google-signin` → **Phase 24**.
