# Phase 2 Migration Report — Authentication

> **Date:** 2026-08-05  
> **Scope:** Phase 2 only  
> **Commit:** `feat(mobile): phase-2 authentication`

## Summary

Firebase Authentication, protected routes, system settings, maintenance gate, and post-login category hierarchy seeding. No Dashboard / Transactions / Privacy Lock.

| Check | Result |
|-------|--------|
| `tsc --noEmit` | Pass |
| Shared vitest | 38 / 38 pass |

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
| Protected shell | `app/(app)/_layout.tsx` — redirect if logged out; maintenance if enabled |
| Signed-in home | `app/(app)/index.tsx` — session info + logout (not Dashboard) |
| Routing | `app/index.tsx` redirects to auth or app |

## Env

Add to `.env` (not copied from web by default):

```env
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<Web client ID from Firebase Auth → Google>
```

Find it in Firebase Console → Authentication → Sign-in method → Google → Web client ID  
(same project as the web app). Restart with `npx expo start --clear`.

## Acceptance criteria

- [x] Email/password signup, login, password reset, logout
- [x] Google sign-in via `expo-auth-session` + `signInWithCredential` (not popup)
- [x] `disableSignups` blocks email signup and deletes new Google users when flag is on
- [x] `maintenanceMode` shows MaintenanceScreen for non-admins; SUPER_ADMIN can bypass
- [x] `ensureCategoryHierarchy` runs on authenticated session
- [x] Unauthenticated users redirected away from `(app)` routes

## How to verify on device

1. Cold start → login screen  
2. Sign up or sign in with existing web Firebase account  
3. Land on signed-in home with UID/email  
4. Sign out → back to login  
5. Forgot password → toast + email (if Auth email enabled)  
6. Optional: Google after setting `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`  
7. Optional: toggle `maintenanceMode` in Firestore `system_settings/global` as non-admin

## Explicitly not in Phase 2

Privacy lock / duress, UserDoc/Settings sync (Phase 3), Dashboard, Ledger, expenses.
