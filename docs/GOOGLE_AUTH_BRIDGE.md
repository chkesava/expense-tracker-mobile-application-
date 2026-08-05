# Google Sign-In via web bridge (Expo Go)

## Problem

Google rejects Expo Go’s `exp://…` redirect URIs (`Error 400: invalid_request`). Existing expense data is tied to Google Firebase UIDs, so email-only login is not enough.

## Solution

1. Mobile opens the deployed web app at `/mobile-google-auth` inside an auth browser session.
2. Google OAuth runs on the HTTPS Netlify origin (same as desktop).
3. The page redirects back to the app with a **Google OAuth ID token** (`#id_token=…`) from `GoogleAuthProvider.credentialFromResult` — **not** `user.getIdToken()` (that is a Firebase JWT and causes `id token is not issued by Google`).
4. Mobile calls `signInWithCredential(GoogleAuthProvider.credential(idToken))` → **same UID / same data**.

## Setup

1. Ensure mobile `.env` has:

   ```
   EXPO_PUBLIC_APP_URL=https://kesavaexpensetracker.netlify.app
   ```

   (plus the usual `EXPO_PUBLIC_FIREBASE_*` keys — same project as web)

2. **Deploy the web app** so `/mobile-google-auth` is live on that URL.

3. Reload Expo Go → **Continue with Google** → pick the same Google account as on web.
4. After redirect, the app should land on the signed-in home (route `google-auth` only hands off; do not treat “Screen not found” as a failed login).

## Files

| Side | Path |
|------|------|
| Web | `src/pages/MobileGoogleAuthPage.tsx`, route in `App.tsx` |
| Mobile | `lib/googleAuthBridge.ts`, `app/(auth)/login.tsx` |

## Why not native Google Sign-In in Expo Go?

`@react-native-google-signin/google-signin` needs custom native code, so it **does not run in Expo Go**. It requires:

- Android `package` + SHA-1 OAuth client (and usually `google-services.json`)
- A **development / EAS build** (`npx expo run:android` or EAS)

Use native for Play Store / production builds; keep this bridge for Expo Go.

## Phases (do not miss)

Tracked in `docs/MOBILE_MIGRATION_PLAN.md`:

| Phase | Role |
|-------|------|
| **Phase 2** | Auth + Expo Go Google via this web bridge |
| **Phase 24** | Native `@react-native-google-signin/google-signin` + EAS / `expo run:android` + Android package + SHA-1 — **Play Store / production gate** |

v1.0 consumer release explicitly includes Phase 24 before store upload.
