# Android Production Configuration Audit

## 1. Current State Assessment

| Configuration Area | Status | Notes |
| :--- | :--- | :--- |
| **Application ID** | ❌ Blocker | `com.example.expensetracker` is used. Google Play Console prohibits uploads with the `com.example.*` prefix. |
| **versionCode / versionName** | ❌ Fixed | Mismatch between `app.json` (39 / 2.0.0) and `build.gradle` (27 / 2.1.0). |
| **Release Configuration** | ✅ Checked | Build variants setup for release, no dev configuration hardcoded in `build.gradle`. |
| **Debug Flags** | ⚠️ Fixed | `EX_DEV_CLIENT_NETWORK_INSPECTOR=true` was active in `gradle.properties`. |
| **Signing Configuration** | ❌ Fixed | The `release` build type was defaulting to the `debug` keystore configuration. |
| **R8 / ProGuard** | ❌ Fixed | `minifyEnabled` was indirectly false because `android.enableMinifyInReleaseBuilds` was omitted from `gradle.properties`. |
| **Android Permissions** | ⚠️ Warning | Found `android.permission.SYSTEM_ALERT_WINDOW` in `AndroidManifest.xml` (often used by React Native for dev menus, unnecessary in production). |
| **Notification Configuration** | ✅ Clean | Clean setup using Expo notifications and Firebase FCM. Icons and colors are set. |
| **Splash Screen & App Icon** | ✅ Clean | Configuration points to local assets appropriately in `app.json`. |
| **Deep Links** | ⚠️ Warning | Custom scheme `expensetrackermobile` is configured. However, an `https` scheme exists in `<queries>` with no associated host binding. |
| **Edge-to-Edge Behavior** | ✅ Clean | Enabled via `edgeToEdgeEnabled=true` in `gradle.properties`. |
| **Android Back Behavior** | ✅ Clean | `predictiveBackGestureEnabled: false` configured. |
| **Production Env Vars** | ✅ Clean | `EXPO_PUBLIC_APP_URL` correctly targets the Netlify app. |
| **Release API Endpoints** | ✅ Clean | Properly hooked up to Firebase Production (`expenseapp-27f94`). |

---

## 2. Fixes Applied

The following changes were made directly during the audit:

1. **Version Sync**: Reconciled `android/app/build.gradle` to respect the actual version from `app.json` (`versionCode 39`, `versionName "2.0.0"`).
2. **Release Signing**: Updated `signingConfigs` in `build.gradle` to safely extract and use the production keystore (`expense-tracker-upload-key.keystore`) when `MYAPP_RELEASE_STORE_PASSWORD` is injected in the environment.
3. **R8 Enablement**: Added `android.enableMinifyInReleaseBuilds=true` to `gradle.properties` so the release APK is properly minified and shrunk.
4. **Dev Tools Disabled**: Turned off `EX_DEV_CLIENT_NETWORK_INSPECTOR` in `gradle.properties`.

---

## 3. Build Results

**Status:** ✅ `BUILD SUCCESSFUL` (Time: 26m 6s)

**APK Generation:**
- File: `android/app/build/outputs/apk/release/app-release.apk`
- Size: **~121.4 MB** (127,287,531 bytes)
- *Note: This is a universal APK containing all ABIs (`armeabi-v7a`, `arm64-v8a`, `x86`, `x86_64`). For production, an App Bundle (.aab) will be significantly smaller.*

---

## 4. Remaining Release Blockers

> [!CAUTION]
> **Invalid Package Name**
> The Application ID is set to `com.example.expensetracker`. You must change this (e.g., to `com.kesava.expensetracker`) before attempting to publish to Google Play. 
> *Note: Changing this requires updating `app.json`, `build.gradle`, Android source directories, and re-downloading a fresh `google-services.json` from Firebase.*

> [!WARNING]
> **SYSTEM_ALERT_WINDOW Permission**
> The AndroidManifest requests "Draw over other apps" (`SYSTEM_ALERT_WINDOW`). If not explicitly required by a production feature, this should be removed as it often triggers deeper Play Store security reviews.
