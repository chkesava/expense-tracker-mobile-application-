# Spendly

One Expo + React Native + TypeScript codebase that ships **three apps** for Android and the web:

| App | What it does | Android package | Web path | Routes |
|---|---|---|---|---|
| **Spendly** (Expense) | Personal finance: accounts, ledger/journal, budgets, credit cards, investments, EPF, goals, splits, SMS auto-add | `com.example.expensetracker` | `/expense` | `app/(app)`, `app/(auth)` |
| **Spendly Nutrition** | Meal logging, food photo analysis, nutrition insights | `com.example.nutritiontrackera` | `/nutrition` | `app/(nutrition)` |
| **Ganesh Seva** | Ganesh Pandal management: contributions, seva, funds, people, sponsors, assets | `com.example.ganeshseva` | `/ganesh` | `app/(ganesh)`, `app/(ganesh-auth)` |

A landing page at the web root (`spendly-share.netlify.app/`) links to all three. Each app's name, version, package, icons and permissions live in `products/<app>.json`.

> **New here?** Read this file, then [`docs/AGENT_WORKFLOW.md`](docs/AGENT_WORKFLOW.md) (branching, Jira, validation and safety rules) and [`docs/READ_MODEL_RULES.md`](docs/READ_MODEL_RULES.md) before touching user data.

---

## Contents

1. [Architecture](#architecture)
2. [Repository layout](#repository-layout)
3. [Setup](#setup)
4. [Running the apps](#running-the-apps)
5. [Local test mode (emulator)](#local-test-mode-emulator)
6. [Tests and checks](#tests-and-checks)
7. [How we work](#how-we-work)
8. [Deploying and releasing](#deploying-and-releasing)
9. [CI one-time setup](#ci-one-time-setup)
10. [Troubleshooting](#troubleshooting)
11. [Docs index](#docs-index)

---

## Architecture

```text
            ┌──────────────────────────── Android app (native Firebase SDK, durable on-device cache)
 Client ────┤
            └──────────────────────────── Web app (Firebase JS SDK)
                │            │                 │
          writes + live   history/report     /api/* calls
          reads           reads (opt-in)       │
                ▼            ▼                 ▼
        Firebase         Supabase           Netlify Functions
        Auth + Firestore read model         market data, screener, stock history,
        (source of       (read-only copy,   account deletion, nutrition AI,
         truth)           synced nightly    Ganesh summary/draw, read-model push
                          + per write)
```

| Piece | Where | Notes |
|---|---|---|
| **Firebase Auth + Firestore** | project `expenseapp-27f94` | The **only** write path and the source of truth. Rules in `firestore.rules`, indexes in `firestore.indexes.json`. **Dev and prod share one project; there is no staging.** |
| Native Firebase | `@react-native-firebase/*` 24.0.0 | Android uses the native SDK (`lib/*.native.ts`) for a durable offline cache; web uses the JS SDK (`lib/*.ts`). Metro picks the right file per platform. |
| **Supabase read model** | `supabase-readmodel/` | Read-only copy of Firestore for history, report and filter screens. Reads go through `lib/readModel/screenReadPath.ts` behind a per-screen switch that defaults to Firestore. Current balances never come from here. See [`docs/READ_MODEL_RULES.md`](docs/READ_MODEL_RULES.md) and [`docs/READMODEL_RUNBOOK.md`](docs/READMODEL_RUNBOOK.md). |
| Supabase storage | `supabase/` | File buckets (`spendly-files`, `ganesh-files`) behind edge functions. |
| **Netlify** | `netlify/functions/`, `netlify.toml` | Hosts the web apps and the `/api/*` functions. Native builds call the same site. |
| Cloud Functions | `functions/` | Ganesh Seva festival summary maintenance only. |

### Rules that keep money correct

- Financial correctness beats convenience. Never invent balances, transactions or schemas.
- Don't recompute authoritative totals in UI components, and don't add a parallel ledger.
- Writes go to Firestore only and stamp `createdAt` / `updatedAt`.
- No bulk data fixes or migrations without a dry run, a variance report and explicit approval. Remember: the Firebase project is production.
- User-facing errors and logging go through `lib/errors.ts`.

---

## Repository layout

| Path | What's there |
|---|---|
| `app/` | Expo Router screens, grouped per app (see the table at the top) |
| `components/` | UI. Shared wrappers live in `components/ui` and `components/common`; reuse them instead of adding new UI systems |
| `hooks/`, `providers/` | React hooks and context providers |
| `lib/` | Platform adapters (Firebase, auth, storage), errors, read model, utilities |
| `shared/` | Pure, tested domain logic: finance calculations, mutations, features (EPF, goals…) |
| `services/` | Data services that talk to Firestore and the network |
| `theme/`, `constants/`, `assets/` | Design tokens, palettes, branding and artwork |
| `products/` | Per-app config (name, version, package, icons, web base path) |
| `modules/`, `plugins/`, `patches/` | Local native modules, Expo config plugins, `patch-package` patches |
| `firestore/` | Firestore rules tests |
| `netlify/functions/` | Serverless API endpoints (with tests) |
| `supabase-readmodel/` | Read-model migrations, sync, drills and reports |
| `scripts/` | Build, release, emulator and verification scripts |
| `docs/` | Design docs, story docs (`SPENDLY-<n>-*.md`), runbooks and audits |
| `design/` | Design references (`design/references/DESIGN.md` is the Expense design guide) |

`android/` and `ios/` are generated by `npx expo prebuild`. Don't hand-edit them: prebuild overwrites them.

---

## Setup

### Prerequisites

- **Node.js 22** (the version CI uses) and npm
- Git
- For Android: Android Studio, the Android SDK with `ANDROID_HOME` set, **JDK 21**, and an emulator or a phone with USB debugging
- Firebase CLI (`npm i -g firebase-tools`) for the emulator and rules tests
- iOS is configured but not shipped; it needs macOS and Xcode

### Install

```bash
git clone https://github.com/chkesava/expense-tracker-mobile-application-.git
cd expense-tracker-mobile-application-
npm ci          # also applies patches/ via patch-package
```

### Environment file

Copy `.env.example` to `.env` and ask a teammate for the values (or run `npm run env:copy-from-web` to map them from the legacy web project).

| Variable | Used for |
|---|---|
| `EXPO_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_STORAGE_BUCKET`, `_MESSAGING_SENDER`, `_APP_ID` | Firebase (web SDK) |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Google sign-in (OAuth **web** client ID) |
| `EXPO_PUBLIC_APP_URL`, `EXPO_PUBLIC_SHARE_URL` | Netlify site for `/api/*` calls and share links |
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase file storage |
| `EXPO_PUBLIC_READMODEL_SUPABASE_URL`, `EXPO_PUBLIC_READMODEL_SUPABASE_PUBLISHABLE_KEY` | Supabase read model |
| `MYAPP_RELEASE_STORE_PASSWORD`, `MYAPP_RELEASE_KEY_PASSWORD` | Local signed release builds only |

`EXPO_PUBLIC_*` values are embedded in every build, so they are not secrets; security comes from Firestore rules and Supabase RLS. **Never commit** `.env`, `.env.release`, keystores, service-account JSON or APKs.

---

## Running the apps

### Pick an app

`EXPO_PUBLIC_PRODUCT` selects which app you build:

| Value | Result |
|---|---|
| `expense`, `nutrition`, `ganesh` | Only that app's routes, name, icons and package |
| *(unset)* | Legacy combined build with all three apps' routes |

```bash
# bash
EXPO_PUBLIC_PRODUCT=ganesh npx expo start --web
```
```powershell
# PowerShell
$env:EXPO_PUBLIC_PRODUCT = "ganesh"; npx expo start --web
```

### Web (fastest loop)

```bash
npm run web                 # Expo dev server, opens in the browser
```

### Android

Expo Go **does not work**: the app uses native modules (native Firebase, Google sign-in). Use a development build:

```bash
npx expo prebuild           # generates android/ (wipes local edits there)
npm run android             # build, install and start the dev client
```

> Prebuild regenerates `android/` and drops release-signing edits in `build.gradle` / `gradle.properties`. If you build signed releases locally, back those up first.

Running a dev build against your `.env` talks to **production** Firebase. For UI testing with fake data, use local test mode instead.

---

## Local test mode (emulator)

**Spendly Test** is a separate Android app (`com.example.expensetracker.localtest`) that installs next to the real one and talks only to the Firebase Local Emulator Suite, with seeded demo data. Use it for all on-device QA.

```bash
npm run emulators:local     # keep running; data persists in .emulator-data/
npm run emulators:seed      # once, or any time to reset the demo account
npm run android:test-build  # ~8 min → dist/Spendly-Test.apk
npm run android:install     # install + AOT compile
npm run device:reverse      # after every USB reconnect
```

Sign in with `demo@spendly.test` / `spendly-demo`. Google sign-in, push and Netlify/Supabase/market calls are unavailable in the test app. Full guide: [`docs/LOCAL_TEST_MODE.md`](docs/LOCAL_TEST_MODE.md).

---

## Tests and checks

| Command | What it checks |
|---|---|
| `npx vitest run <path>` | One test file or folder (run this first) |
| `npm test` | Full Vitest suite |
| `npm run typecheck` | TypeScript for the app |
| `npm run typecheck:shared` | TypeScript for `shared/` |
| `npm run test:rules` | Firestore rules against the emulator |
| `npm run perf:verify` | Performance budgets |

**PR Checks** runs on every pull request, including the Firestore rules tests. It must pass before merging. The rules tests run again before every web deploy, rules deploy and release.

---

## How we work

The full rules are in [`docs/AGENT_WORKFLOW.md`](docs/AGENT_WORKFLOW.md), which both developers and AI agents follow (`CLAUDE.md` and `AGENTS.md` point to it). In short:

- Work is tracked in Jira (`SPENDLY-<n>`). Branches go `main` → epic branch (`feature/SPENDLY-<epic>-<slug>`) → one branch per story (`feature/SPENDLY-<story>-<slug>`).
- Each story gets a doc at `docs/SPENDLY-<story>-<slug>.md` and focused tests.
- Ask before merging a story into its epic branch. The epic reaches `main` through a PR once all its stories are in.
- A ticket moves to **Done** only when its changes reach `main`.
- **Ganesh Seva UI** work follows the design rules in `CLAUDE.md` and [`docs/GANESH_SEVA_UI_REDESIGN.md`](docs/GANESH_SEVA_UI_REDESIGN.md). Never change shared UI in a way that affects Expense or Nutrition.
- Read the Expo SDK 57 docs before writing Expo code: https://docs.expo.dev/versions/v57.0.0/

---

## Deploying and releasing

**Merging to `main` deploys nothing.** Every deploy is a manual GitHub Actions workflow. After a merge, check the story doc and [`docs/AFTER_MERGE_CHECKLIST.md`](docs/AFTER_MERGE_CHECKLIST.md) for what it needs.

| Workflow | When to run it | What it does |
|---|---|---|
| **Release — Expense / Nutrition / Ganesh** | App code changed | Builds a signed APK for that app, publishes a GitHub Release, writes the update record so installed apps prompt users, and sends it to Firebase App Distribution. Inputs: `version` (empty = auto patch bump from `products/<app>.json`), `notes`, `mandatory`. |
| **Deploy Web (Netlify)** | Web app or `netlify/functions/` changed | Runs the rules gate, builds all web apps and functions, and deploys to Netlify. New `/api/*` endpoints only exist after this. |
| **Deploy Firestore rules** | `firestore.rules` / `firestore.indexes.json` changed | Manual run deploys. The nightly scheduled run never deploys: it fails if live rules/indexes differ from the repo, and runs a production access probe. |
| Read-model schema | Runs on read-model changes | Tests the migrations on a throwaway Postgres (tables, RLS, grants). It does **not** touch production. Apply new migrations to the read-model project yourself, as described in [`docs/READMODEL_RUNBOOK.md`](docs/READMODEL_RUNBOOK.md). |
| Read-model sync / sync health | Scheduled | Nightly Firestore → Supabase sync and its health check. |
| Android Release | Don't use | Legacy combined-app build, kept for reference. |

**Order matters** when rules change. If new rules *tighten* writes, release the apps first and deploy rules after, so old builds aren't denied. If new rules *allow* a new write, deploy rules first. Native-module changes (new native dependency or config plugin) need a full release; release Expense first and check it on a device before Nutrition and Ganesh.

### How users get updates

The release writes `system_settings/latest_release` in Firestore. The app compares its own `versionCode` (`hooks/useAppUpdate.ts`), shows `components/UpdateAvailableSheet.tsx`, downloads the APK from the GitHub Release and opens Android's install sheet. Mandatory updates can't be dismissed. Settings → App version has a manual check.

---

## CI one-time setup

Repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Base64 of the upload keystore |
| `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD` | Keystore and key passwords |
| `FIREBASE_SERVICE_ACCOUNT` | CI service-account JSON (least privilege, never Owner) |
| `MOBILE_ENV_FILE` *(or the individual `EXPO_PUBLIC_*` secrets)* | Contents of a production `.env` |
| `EXPO_PUBLIC_SUPABASE_*`, `EXPO_PUBLIC_READMODEL_SUPABASE_PUBLISHABLE_KEY` | Supabase keys for release builds |

The CI service account needs only: Firebase App Distribution Admin, Cloud Datastore User, Firebase Rules Admin, and Datastore Index Admin (for index deploys). Netlify-only secrets such as `GEMINI_API_KEY` (nutrition AI) live in the Netlify site env and are never `EXPO_PUBLIC_`.

Encode the keystore on Windows:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("keystores\expense-tracker-upload-key.keystore")) | Set-Clipboard
```

Release workflows never run on `pull_request`, so fork PRs can't reach the signing key. Local signed builds (`npm run release:verify`, `npm run release`) need the keystore in `keystores/`. Ask a teammate for it, and never generate a new one, because the existing signature must match.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `RNGoogleSignin` / `RNFBAppModule` not found | You're in Expo Go. Use `npm run android` (dev build) |
| Firebase "not configured" | Check every `EXPO_PUBLIC_FIREBASE_*` in `.env`, then `npx expo start --clear` |
| Stale bundle or odd Metro errors | `npx expo start --clear` |
| `npm ci` fails with EPERM / EBUSY on Windows | A running Expo/Metro process is locking `node_modules`. Stop it and rerun |
| Google sign-in fails on a new machine or keystore | Add its SHA-1 (`npm run release:sha1`, or `cd android && ./gradlew signingReport`) to the Firebase Android app |
| A market/screener tab says "unavailable" | The Netlify functions aren't deployed yet. Run **Deploy Web (Netlify)** |
| Release signing lost after prebuild | Restore your backed-up `android/app/build.gradle` and `gradle.properties` |

---

## Docs index

| Topic | Doc |
|---|---|
| Team/agent workflow | [`docs/AGENT_WORKFLOW.md`](docs/AGENT_WORKFLOW.md) |
| After-merge steps | [`docs/AFTER_MERGE_CHECKLIST.md`](docs/AFTER_MERGE_CHECKLIST.md) |
| Firestore rules deploy | [`docs/FIREBASE_RULES_DEPLOY.md`](docs/FIREBASE_RULES_DEPLOY.md) |
| Read model rules / runbook | [`docs/READ_MODEL_RULES.md`](docs/READ_MODEL_RULES.md), [`docs/READMODEL_RUNBOOK.md`](docs/READMODEL_RUNBOOK.md) |
| Local test mode | [`docs/LOCAL_TEST_MODE.md`](docs/LOCAL_TEST_MODE.md) |
| Three-app split | [`docs/MULTI_APP_SEPARATION_ANALYSIS.md`](docs/MULTI_APP_SEPARATION_ANALYSIS.md) |
| Native Firestore cache | [`docs/SPENDLY-633-native-firestore-cache.md`](docs/SPENDLY-633-native-firestore-cache.md) |
| Ganesh Seva UI | [`docs/GANESH_SEVA_UI_REDESIGN.md`](docs/GANESH_SEVA_UI_REDESIGN.md) |
| Expense design guide | [`design/references/DESIGN.md`](design/references/DESIGN.md) |
| A specific feature | `docs/SPENDLY-<ticket>-*.md` or `docs/KAN-<ticket>-*.md` |

---

License: see [`LICENSE`](LICENSE).
