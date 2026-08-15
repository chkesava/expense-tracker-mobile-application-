# Expense Tracker Mobile

Expo (SDK 57) + React Native app for the expense tracker. Uses Firebase Auth/Firestore and the deployed web app for market/share URLs and Expo Go Google Sign-In.

---

## What you need after cloning

Git ignores secrets and generated folders. After `git clone`, install dependencies and create local config files that are **not** in the repo.

### Included in the repo (no action)

| File / folder | Purpose |
|---------------|---------|
| `package.json` / lockfile | Dependencies |
| `app.json` | Expo app config (package name, plugins, icons) |
| `eas.json` | EAS Build profiles |
| `google-services.json` | Firebase Android config (root). Prebuild copies it into `android/app/` |
| `.env.example` | Template for local env vars |
| `releases/.gitkeep` | Folder for built APKs (APKs themselves are ignored) |

### Not in the repo — you must create / obtain

| File | Required for | How to get it |
|------|--------------|---------------|
| **`.env`** | Running the app (Firebase + Google) | Copy from `.env.example`, then fill values from a teammate or the web project (see below) |
| **`keystores/expense-tracker-upload-key.keystore`** | Release / signed APK only | Ask a teammate who already has the upload keystore. Do **not** invent a new keystore if you need Play Store / existing signing |
| **`.env.release`** (optional) | Release signing passwords | Same secrets as in `.env`: `MYAPP_RELEASE_STORE_PASSWORD`, `MYAPP_RELEASE_KEY_PASSWORD` |
| **`android/` / `ios/`** | Native runs / release | Generated locally with `npx expo prebuild` (folders are gitignored) |
| **`node_modules/`** | Everything | `npm install` |

Never commit: `.env`, `.env*.local`, `.env.release`, keystores, private keys, or release APKs.

---

## Prerequisites

- **Node.js** 20+ (repo has been run on Node 22)
- **npm** (comes with Node)
- **Git**
- For **Android emulator/device** native builds:
  - Android Studio + Android SDK
  - `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) set
  - A running emulator or USB-debugging device
- For **iOS** (macOS only): Xcode
- Optional: [Expo Go](https://expo.dev/go) on a phone for JS-only smoke tests (native Google Sign-In does **not** work in Expo Go)

---

## Quick start (day-to-day development)

### 1. Clone

```bash
git clone <YOUR_GITHUB_REPO_URL>
cd expense-tracker-mobile-application-
```

Use the real GitHub HTTPS/SSH URL for this repository.

### 2. Install dependencies

```bash
npm install
```

### 3. Create `.env`

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Fill at least these keys in `.env` (same Firebase project as the web app):

```env
EXPO_PUBLIC_APP_URL=https://kesavaexpensetracker.netlify.app

EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER=
EXPO_PUBLIC_FIREBASE_APP_ID=

# Web OAuth client ID (Firebase Console → Project settings → OAuth web client)
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
```

**Ways to get Firebase values**

1. Ask a teammate for a filled `.env` (recommended for the shared project).
2. Or copy from the sibling web app (if it lives next to this repo):

   ```bash
   npm run env:copy-from-web
   # or with an explicit path:
   npm run env:copy-from-web -- --web-dir=../expense-tracker --force
   ```

3. Or copy `VITE_FIREBASE_*` / `VITE_PUBLIC_APP_URL` from the web `.env` and map them to `EXPO_PUBLIC_*` as in `.env.example`.

Release signing passwords can stay empty for local/dev:

```env
MYAPP_RELEASE_STORE_PASSWORD=
MYAPP_RELEASE_KEY_PASSWORD=
```

### 4. Start the Expo bundler

```bash
npm start
# same as: npx expo start
```

Then:

- Press `a` for Android emulator, or scan the QR code with Expo Go.
- Prefer a **dev client / `npm run android`** if you need native Google Sign-In (see below).

Clear cache if the bundle looks stale:

```bash
npx expo start --clear
```

### 5. Native Android debug build (recommended for full features)

Google Sign-In and other native modules need a custom native build, not Expo Go:

```bash
npx expo prebuild
npm run android
# or: npx expo run:android
```

`android/` is generated and gitignored — each developer runs prebuild locally.

---

## Google Sign-In

| Client | How auth works |
|--------|----------------|
| **Expo Go** | Web bridge via `EXPO_PUBLIC_APP_URL` → `/mobile-google-auth` (see `docs/GOOGLE_AUTH_BRIDGE.md`) |
| **Dev / release APK** | Native `@react-native-google-signin/google-signin` + `google-services.json` + SHA-1 registered in Firebase |

If Google Sign-In fails with `DEVELOPER_ERROR` on Android, register your **debug** or **release** SHA-1 in Firebase:

```bash
# Debug keystore (after prebuild)
keytool -list -v -keystore android/app/debug.keystore -alias androiddebugkey -storepass android

# Release upload keystore (once you have the private keystore file)
npm run release:sha1
```

Add that SHA-1 under Firebase → Project settings → Your Android app (`com.example.expensetracker`).

---

## Env reference

| Variable | Required | Notes |
|----------|----------|--------|
| `EXPO_PUBLIC_APP_URL` | Yes (share links / Expo Go Google) | Public Netlify/web origin |
| `EXPO_PUBLIC_FIREBASE_*` | Yes | Client Firebase config |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Yes (Google Sign-In) | OAuth **Web** client ID |
| `EXPO_PUBLIC_MARKET_API_URL` | No | Override market API origin |
| `EXPO_PUBLIC_PERF_MARKS` | No | Set `1` to log perf marks in release |
| `MYAPP_RELEASE_STORE_PASSWORD` | Release only | Unlock upload keystore |
| `MYAPP_RELEASE_KEY_PASSWORD` | Release only | Unlock key alias |

Do **not** put server secrets (`TWELVE_DATA`, `CRON_SECRET`, service-account JSON, etc.) in mobile `.env`.

---

## Automated releases (CI/CD)

Android releases are **manual**. From GitHub: **Actions → Android Release → Run workflow**. That builds a signed APK, ships it to Firebase App Distribution, and tells installed apps that an update exists. Workflow: `.github/workflows/android-release.yml`. Merges to `main` do not start a build.

```text
Actions → Run workflow  ->  GitHub Actions  ->  signed APK  ->  Firebase App Distribution  ->  tester notification
                                                  |
                                                  +->  Firebase Storage releases/{versionCode}/  ->  in-app download
                                                  +->  Firestore system_settings/latest_release  ->  in-app update prompt
```

### One-time setup

**1. Repository secrets** (Settings → Secrets and variables → Actions → Secrets)

| Secret | Value |
|--------|-------|
| `ANDROID_KEYSTORE_BASE64` | Base64 of `keystores/expense-tracker-upload-key.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_PASSWORD` | Key alias password |
| `FIREBASE_SERVICE_ACCOUNT` | Service account JSON (see below) |
| `MOBILE_ENV_FILE` | *(optional)* Full contents of your local `.env` |
| `EXPO_PUBLIC_APP_URL` | Same as local `.env` |
| `EXPO_PUBLIC_FIREBASE_API_KEY` | Same as local `.env` |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | Same as local `.env` |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | Same as local `.env` |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | Same as local `.env` |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER` | Same as local `.env` |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | Same as local `.env` |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Google OAuth **Web** client ID |

Use either **`MOBILE_ENV_FILE`** or the individual `EXPO_PUBLIC_*` secrets (both work). If you use individual secrets, also add `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` so Google Sign-In works in release builds.

Generate the keystore secret on Windows:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("keystores\expense-tracker-upload-key.keystore")) | Set-Clipboard
```

**2. Repository variables** (same page → Variables tab)

| Variable | Value |
|----------|-------|
| `FIREBASE_ANDROID_APP_ID` | `1:246872619658:android:4ecd4bcc317d14bb4c8b73` |
| `VERSION_CODE_OFFSET` | `27` |

`versionCode` is computed as `VERSION_CODE_OFFSET + github.run_number`, so it always increases without CI committing version bumps back to `main`.

**3. Firebase service account**

Google Cloud Console → IAM & Admin → Service Accounts → create one for CI, then grant **only**:

- `Firebase App Distribution Admin` (upload builds)
- `Cloud Datastore User` (write the release doc)
- `Storage Admin` (upload the APK the in-app updater downloads)

Create a JSON key and paste the whole file into `FIREBASE_SERVICE_ACCOUNT`. Do not reuse an Owner-level key.

**4. Firebase App Distribution**

Enable it in the Firebase Console and create a tester group named `testers`. Each user accepts an email invite once and installs the Firebase App Tester app.

### What is and is not secret

Your `EXPO_PUBLIC_FIREBASE_*` values, the Google web client ID, and `google-services.json` are **not** secrets — they are already committed and are embedded in every APK. Firebase security comes from Firestore rules plus the package name and SHA-1 restrictions. Only the keystore, its passwords, and the service account are genuinely sensitive.

The workflow deliberately never triggers on `pull_request`: fork PRs would otherwise gain access to the signing keystore.

### Triggering a release

Actions tab → **Android Release** → **Run workflow**, with optional inputs:
- `version` — version name, e.g. `1.2.0` (defaults to auto-bumped patch from `app.json`)
- `notes` — release notes shown to testers and in the update prompt (defaults to the latest commit subject)
- `mandatory` — set `true` to make the in-app prompt non-dismissible

### How users get the update

`scripts/publish-release-metadata.js` uploads the APK to Firebase Storage and writes `system_settings/latest_release` in Firestore:

```json
{
  "versionName": "1.2.0",
  "versionCode": 42,
  "downloadUrl": "https://firebasestorage.googleapis.com/v0/b/.../o/releases%2F42%2FSpendly-1.2.0-42.apk?alt=media&token=...",
  "storagePath": "releases/42/Spendly-1.2.0-42.apk",
  "testerUrl": "https://appdistribution.firebase.dev/i/...",
  "notes": "Fixed ledger totals",
  "mandatory": false
}
```

The app compares that `versionCode` against its own (`hooks/useAppUpdate.ts`) and shows `components/UpdateAvailableSheet.tsx`. Tapping **Update** downloads the APK and opens the system Install sheet. Optional updates can be dismissed once per version; mandatory ones cannot. Settings → App version also offers a manual "Check for updates".

You can test the publisher without writing to Firestore:

```bash
node scripts/publish-release-metadata.js --apk-path=releases/app-release.apk --dry-run
```

### Cost and quota notes

An Android build takes roughly 15-25 minutes. On GitHub Free, a private repo gets 2000 Actions minutes/month (about 80-130 builds). APK artifacts are kept for 7 days to protect the 500 MB storage quota.

---

## Release / signed APK (manual, local)

Only needed if you build a signed APK locally instead of via CI.

### Extra files (share privately, never commit)

1. Place the upload keystore at:

   ```text
   keystores/expense-tracker-upload-key.keystore
   ```

2. Put passwords in `.env` and/or `.env.release`:

   ```env
   MYAPP_RELEASE_STORE_PASSWORD=...
   MYAPP_RELEASE_KEY_PASSWORD=...
   ```

   Default key alias: `expense-tracker-upload`.

3. Ensure Android SDK + JDK are available (`ANDROID_HOME`).

### Build

```bash
npm run release:verify   # SDK, keystore, google-services, gradle wiring
npm run release          # prepare + build pipeline
```

Or step by step:

```bash
npm run release:prepare
npm run release:build
npm run release:report
```

Signed APKs land under `releases/` (APK files are gitignored; share via Drive/email if needed).

### EAS cloud build (alternative)

```bash
npm install -g eas-cli
eas login
eas build --platform android --profile preview
```

See `eas.json` for `development` / `preview` / `production` profiles.

---

## Useful scripts

| Command | What it does |
|---------|----------------|
| `npm start` | Expo dev server |
| `npm run android` | Native Android run |
| `npm run ios` | Native iOS run (macOS) |
| `npm run web` | Expo web |
| `npm test` | Vitest |
| `npm run typecheck` | TypeScript check |
| `npm run env:copy-from-web` | Map web `VITE_*` → mobile `.env` |
| `npm run release` | Full local release pipeline |
| `npm run release:sha1` | Print release keystore SHA-1 |
| `npm run release:publish` | Publish release metadata to Firestore (used by CI) |

More day-to-day tips: `docs/react_native_handbook.md`.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Firebase “not configured” / auth fails | Ensure `.env` exists and all `EXPO_PUBLIC_FIREBASE_*` values are set; restart Metro (`npx expo start --clear`) |
| `RNGoogleSignin could not be found` | You are in Expo Go — use `npm run android` / a dev build |
| Google `DEVELOPER_ERROR` | Register the app’s SHA-1 in Firebase; confirm package `com.example.expensetracker` |
| Missing `google-services.json` after prebuild | Keep root `google-services.json`; re-run `npx expo prebuild` |
| Release verify fails on keystore | Obtain `keystores/expense-tracker-upload-key.keystore` + passwords from a teammate |
| Stale JS after env change | Restart Expo with `--clear` (env is inlined at bundler start) |
| CI fails at "Restore .env" or "Restore signing keystore" | The matching repository secret is missing or empty |
| CI build succeeds but testers get nothing | Enable Firebase App Distribution and create the `testers` group |
| Workflow red after testers already got the APK | Storage upload failed — in-app updates will not see that build until Storage is set up. Open https://console.firebase.google.com/project/expenseapp-27f94/storage → Get Started, grant CI **Storage Admin**, then re-run Android Release |
| Update prompt never appears | Confirm `system_settings/latest_release` exists, you are signed in, and Firestore rules for `system_settings` are deployed |
| Check for updates says no release information | Deploy `firestore.rules` (signed-in read on `system_settings`) and confirm CI published the release doc |
| In-app download fails / opens the tester webpage | Deploy `storage.rules`, grant CI Storage Admin, and confirm `storagePath` is set on the release doc |
| Update install fails with a signature error | The APK was signed with a different keystore — CI must use the same upload keystore |

---

## Project layout (high level)

```text
app/                 Expo Router screens
components/          UI
hooks/               Data / Firebase hooks
lib/                 Firebase, env, auth helpers
providers/           App providers
assets/              Branding / icons
scripts/             Release + env helpers
.github/workflows/   CI: build, distribute, announce releases
docs/                Migration / auth / perf notes
google-services.json Firebase Android config
.env.example         Env template (committed)
.env                 Local secrets (gitignored)
```

---

## Security checklist for teammates

- [ ] Clone the repo
- [ ] `npm install`
- [ ] Create `.env` from `.env.example` (get values from the team — do not invent a second Firebase project unless intentional)
- [ ] Run `npm start` or `npm run android`
- [ ] For release builds only: obtain the **same** upload keystore + passwords offline
- [ ] Never commit `.env`, `.env.release`, `*.keystore`, or `releases/*.apk`
