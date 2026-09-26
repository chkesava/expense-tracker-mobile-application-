# Local test mode: Spendly Test on the Firebase emulator

On-device UI testing used to run against production Firebase. The project is shared between dev and prod, so every test cold start re-read the whole account and cost money. SPENDLY-175 splits the two:

| Build | Made by | Talks to | Installs as |
|---|---|---|---|
| Release | GitHub Actions `Release — Expense` | Production Firebase | Spendly (`com.example.expensetracker`) |
| **Spendly Test** | `npm run android:test-build` on your PC | **Firebase Local Emulator Suite** on your PC, filled with mock data | Spendly Test (`com.example.expensetracker.localtest`), next to the real app |

A test build makes no production calls. It uses the `demo-spendly` project, which cannot exist in Google's cloud, and its bundle doesn't contain the production Firebase keys. Netlify, Supabase, market data and other third-party calls are refused by `lib/networkGuard.ts`.

## Run it

You need the Firebase CLI (`npm i -g firebase-tools`), JDK 21 and a phone with USB debugging.

1. **Start the emulators** and leave them running. Data persists in `.emulator-data/` when you stop them with Ctrl+C.
   ```sh
   npm run emulators:local
   ```
2. **Seed the mock data.** Do this once; run it again any time to reset the demo account.
   ```sh
   npm run emulators:seed
   ```
3. **Build the test app.** It takes about 8 minutes and produces `dist/Spendly-Test.apk`.
   ```sh
   npm run android:test-build
   ```
4. **Install it and connect it to the emulator.** Re-run `device:reverse` after every reconnect.
   ```sh
   adb install -r dist/Spendly-Test.apk
   npm run device:reverse
   ```
5. **Sign in.** Open **Spendly Test** and sign in with email and password: `demo@spendly.test` / `spendly-demo`.

A yellow **TEST DATA** pill next to the logo shows you're in the test app.

The mock account has three months of data, dated relative to today:
- 4 accounts: bank, cash and 2 credit cards;
- about 130 expenses and salary incomes;
- budgets, 3 subscriptions, 2 goals and 3 holdings.

The app adds the category list and credit card bills itself on first sign-in, in the emulator. Adding and editing work normally, but only against the emulator.

To test from a device over Wi-Fi instead of USB, build with `npm run android:test-build -- --host=<your PC's LAN IP>`. Start the emulators listening on that interface (set `"host": "0.0.0.0"` under each emulator in `firebase.json` locally).

## What doesn't work in the test app
- **Google sign-in:** the test app ID has no OAuth client, so use the demo email and password.
- **Push notifications:** `google-services.json` has no client for the test app ID.
- **Features that need other backends:** anything using Netlify functions (account deletion, Ganesh summary and draw, nutrition AI), Supabase file storage, live market prices or OpenFoodFacts. These fail with their normal error or unavailable state, with a `NetworkBlockedInTestMode` error in the logs.
- **In-app update prompt:** it finds no release in the emulator and stays quiet.

## Why a release can never be a test build
The switch is the build-time variable `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST`. Only `scripts/build-test-apk.js` sets it, or you can put it in a gitignored `.env.local`. Three guards keep it out of releases:
- **`release.yml`:** fails if `.env` contains the variable, or if `.env.local` or `.env.release` exists in CI.
- **`scripts/release.js` and `scripts/build-release.js`:** these call `assertNotLocalTestBuild()` from `scripts/common.js`. It fails if the variable is in an env file or the environment, or if `android/` was generated for the `.localtest` app.
- **`app.config.js`:** it only produces the `.localtest` app when the variable is set. Without it, the config is exactly the production one (pinned by `lib/localTestMode.test.ts`).

After a test build, `android/` is the test variant. To build a real local release APK again, regenerate it first with `npx expo prebuild --platform android`, which also restores release signing through `release:verify`. CI always prebuilds its own `android/`.

## Files
- `lib/env.ts`: `isLocalTestMode()`, `LOCAL_TEST_PROJECT_ID`, emulator ports.
- `lib/firebase.ts`: uses the demo config and connects Auth, Firestore and Storage to the emulator.
- `lib/networkGuard.ts`: blocks non-emulator HTTP in test mode.
- `app.config.js`: `applyLocalTestBuild()` switches to the "Spendly Test" app ID, name and scheme, and drops `google-services.json`.
- `components/Header.tsx`: the TEST DATA pill.
- `scripts/emulators-local.js`, `scripts/seed-emulator.js`, `scripts/build-test-apk.js`.
- `firebase.json`: Auth emulator on 9099, Firestore on 8080, Storage on 9199.
