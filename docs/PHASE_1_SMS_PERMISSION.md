# Phase 1 — Android SMS Permission

> **Date:** 2026-08-10  
> **Scope:** Manifest permissions, runtime grant/check/revoke-via-settings, Settings → Automation UI.  
> **Out of scope:** Inbox reading, bank SMS parsing, Firebase expense writes.

---

## What landed

### Manifest (`app.json`)

```json
"android.permission.READ_SMS",
"android.permission.RECEIVE_SMS"
```

CNG: run a native rebuild so prebuild regenerates `AndroidManifest.xml`.

### Native access layer

| Module | Role |
|--------|------|
| `services/sms/smsPermissions.ts` | `check` / `request` / `openSettings` via `PermissionsAndroid` |
| `services/sms/smsReader.ts` | `androidSmsReader` + `defaultSmsReader` — permission live, `readMessages()` still `[]` |
| `services/sms/smsAutomationPrefs.ts` | Device-local Enabled / Auto Add / Review prefs (AsyncStorage) |
| `hooks/useSmsPermission.ts` | UI hook; refreshes on AppState `active` after system Settings |

### UI

**Settings → Automation**

- “Automatic Expense Tracking” copy + **Allow SMS Access**
- **SMS Transaction Reader**
  - Enabled / Disabled
  - Auto Add
  - Review Before Adding
- **Manage SMS permission in system settings** (revoke path)

---

## Success criteria mapping

| Criterion | How |
|-----------|-----|
| Grant | Allow SMS Access / Enabled → `PermissionsAndroid.requestMultiple` |
| Revoke | User disables in Android Settings; app detects on resume |
| Detect status | `checkSmsPermission()` → `granted` / `denied` / `blocked` / `unavailable` |
| Denial | Toast + feature stays off; blocked → prompt to open system settings |

---

## Commands the user needs to run

SMS runtime permission **requires a native rebuild** (not Expo Go hot reload alone):

```bash
npx expo prebuild --platform android
npx expo run:android
```

Or your usual release/dev-client build pipeline that already calls prebuild.

Optional verification:

```bash
npm test -- services/sms
npx tsc -p tsconfig.json --noEmit
```

---

## Manual Testing Guide

### Prerequisites

- Physical Android device or emulator with Google Play / permission dialogs
- Fresh install / cleared app data recommended once after adding permissions

### 1. Grant

1. Open **Settings → Automation**.
2. Confirm copy: Automatic Expense Tracking + Allow SMS Access.
3. Tap **Allow SMS Access**.
4. Accept the system SMS permission dialog(s).
5. Expect: status “Permission granted”, toast success, Enabled can turn on.

### 2. Detect

1. Leave Settings and return (or background/foreground the app).
2. Status should still show granted without re-prompting.

### 3. Deny

1. Clear app data or use an account/device state without SMS permission.
2. Tap **Allow SMS Access** → tap Deny.
3. Expect: toast explaining denial; Enabled stays off / turns off.

### 4. Blocked / never ask again

1. Deny with “Don’t ask again” (or deny twice on newer Android).
2. Tap Allow again.
3. Expect: blocked messaging + **Manage SMS permission in system settings**.
4. Grant from Android Settings → return to app → status updates to granted.

### 5. Revoke

1. With permission granted, open **Manage SMS permission in system settings**.
2. Turn SMS / messages permission off for Vault.
3. Return to the app.
4. Expect: status becomes denied; feature can be disabled gracefully.

### 6. Reader toggles

1. With permission granted, expand **SMS Transaction Reader**.
2. Toggle Enabled, Auto Add, Review Before Adding.
3. Auto Add and Review are mutually exclusive (turning one on turns the other off).
4. Disable Enabled — Auto Add / Review controls are disabled.
5. Confirm no SMS content is parsed or saved as expenses (Phase 1).

### 7. Non-Android

1. On iOS/web: Automation card shows Android-only messaging; Allow is disabled / unavailable.
