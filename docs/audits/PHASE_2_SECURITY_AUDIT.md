# Phase 2 — Security Audit & Hardening (2026-08-15)

Scope: security-only audit and hardening of the existing app. No UI redesign,
no unrelated refactors, no business-functionality changes except where a fix
required a small, necessary behavior change (called out explicitly below).
Checked: hardcoded secrets, API keys/tokens/passwords, authentication,
session handling, logout, token expiration, secure storage, AsyncStorage
usage, authorization, API security, Firebase security rules, sensitive/debug
logging, deep links, WebViews, Android permissions, Android backup/data
extraction, dependency vulnerabilities, and environment configuration.

---

## 1. Issues Found

### 1.1 [FIXED — High confidence] Firestore rules allowed any vault member or split participant to rewrite ownership/membership

**Where:** [firestore.rules](../../firestore.rules), `match /vaults/{vaultId}` and `match /splits/{splitId}`.

**What the issue was:** The `update` rule for both collections only checked
whether the *current* document (`resource.data`) showed the caller as an
existing member/participant — it placed no restriction on what fields the
*incoming* write (`request.resource.data`) was allowed to change. Firestore
security rules are the only server-side authorization boundary this app has
for these collections (there is no backend server enforcing anything else).
That meant any signed-in member of a shared vault could call Firestore's
`updateDoc` directly (via the Firebase SDK or REST API, with no app UI
involved at all) and rewrite the vault's `ownerId` to themselves, or rewrite
`memberIds` to add an arbitrary new member or remove an existing one. The
same gap existed for `splits/{splitId}`: any listed participant could rewrite
`createdBy` or `participantIds` on a plain update.

**Why it matters / failure scenario:** A malicious or compromised member of a
shared vault (for example, someone added to a vault who later has a falling
out with the owner, or an attacker who obtains a leaked/short-lived
credential for one member's account) could send a single `updateDoc` call
against `vaults/{id}` setting `memberIds` to include only themselves —
locking the real owner and all other members out of a vault's shared
expenses, or granting themselves continued access after being removed from
`memberIds` by the owner. The app's own UI never exposes a way to do this
(there is no "invite member" or "transfer ownership" screen), which is
exactly the scenario the task's instructions call out: authorization must be
enforced server-side, not by the absence of a button in the UI. The current
app code (`hooks/useVaults.ts` `updateVault`, `hooks/useSplits.ts`
`updateSplit`) is generic and forwards whatever `Partial<SharedVault>` /
`Partial<Split>` it's given straight to `updateDoc`, so the enforcement had
to live in the rules, not the client.

**Fix applied:** Added `keepsOwnershipStable()` / `keepsParticipantsStable()`
helper functions to `firestore.rules`. `ownerId` (vaults) and `createdBy`
(splits) are now immutable on update for everyone. `memberIds` /
`participantIds` can now only be changed by the vault owner / split creator
respectively — any other member can still update the fields the UI actually
uses (name, budget, description, participant `paid` status, `settled`, etc.)
but can no longer touch who owns or belongs to the record. This required no
app code changes, since no current UI flow relies on non-owners changing
membership.

---

### 1.2 [FIXED — High confidence] Privacy-lock PIN and duress PIN were stored in plaintext

**Where:** [providers/SettingsProvider.tsx](../../providers/SettingsProvider.tsx),
[components/PrivacyLock.tsx](../../components/PrivacyLock.tsx),
[app/(app)/settings.tsx](../../app/(app)/settings.tsx).

**What the issue was:** The app's "Privacy Lock" feature (a 4-digit PIN gate
in front of the whole app, with a separate duress/decoy PIN — see the
duress-mode feature described in
[Phase 1's architecture audit](PHASE_1_ARCHITECTURE_AUDIT.md)) stored both
the real PIN and the duress PIN as plain, unhashed strings in the
`privacyPin` and `fakePin` fields of the `users/{uid}` Firestore document,
written via `setDoc(..., { merge: true })` in `SettingsProvider.updateSettings`.
Unlocking compared the user's typed input directly against these plaintext
values (`pinInput === settings.privacyPin`). Because this document is
Firestore-synced and also cached locally (SQLite persistent cache on native,
per Phase 1's architecture notes), both PINs existed in plaintext in at least
three places: the live Firestore database, the on-device Firestore cache, and
in transit between them.

**Why it matters / failure scenario:** These two PINs are credentials — one
gates access to the real app data, the other is the decoy the whole
duress-mode design depends on being indistinguishable and protected. Storing
either in plaintext in a synced, network-readable database means anyone who
can read that one Firestore document — a future Firestore rules mistake, a
support engineer or admin looking at the Firebase console, a compromised
service-account credential, or extraction of the local on-device cache (see
1.3 below on Android backup) — recovers both the real unlock PIN and the
duress PIN outright, with no cracking required. This is exactly the case the
task's instructions call out explicitly: sensitive tokens/credentials must
use secure storage or hashing, not be kept as plain values.

**Fix applied:** Added [lib/pinSecurity.ts](../../lib/pinSecurity.ts), which
hashes PINs with SHA-256 using `expo-crypto` (already a project dependency,
used elsewhere in `hooks/usePaymentRequests.ts`) before they are ever written
to Firestore, and compares hashes on unlock instead of raw strings.
`SettingsProvider.setPrivacyPin` / `setFakePin` now hash the PIN before
calling `updateSettings`. `PrivacyLock.tsx`'s unlock check and
`settings.tsx`'s "duress PIN must differ from the real PIN" check both now
use the new `pinMatches()` helper. `pinMatches()` also accepts a legacy
plaintext 4-digit value on the stored side (detected by length/format, since
a SHA-256 hex digest is always 64 characters and a PIN is always 4 digits) so
that PINs set before this change keep working exactly as before, without
forcing every existing user to re-set their PIN — the next time a user
changes their PIN, it's hashed going forward. No UI or business behavior
changed: it is still a 4-digit PIN with the same enable/disable/duress flow.

**Tests added:** [lib/pinSecurity.test.ts](../../lib/pinSecurity.test.ts) —
6 tests covering deterministic hashing, different PINs producing different
hashes, correct/incorrect matches against a hash, the legacy-plaintext
fallback path, and the empty/unset case.

---

### 1.3 [FIXED — High confidence] Android app data was eligible for Auto Backup / `adb backup` extraction

**Where:** [app.json](../../app.json), `expo.android`.

**What the issue was:** The Android configuration did not set `allowBackup`,
which defaults to `true`. With this default, Android's Auto Backup (and, on
older/less-restricted configurations, `adb backup`) can copy the app's
private data directory off the device without root access — this includes
AsyncStorage's underlying storage, and the Firestore/Firebase Auth SQLite
persistent caches described in
[Phase 1's architecture audit](PHASE_1_ARCHITECTURE_AUDIT.md) (Firebase Auth
on native persists its session via AsyncStorage, and Firestore keeps an
on-device SQLite cache of the user's synced documents, which — before fix
1.2 above — included the plaintext privacy-lock PINs).

**Why it matters / failure scenario:** Someone with brief physical/USB access
to a device (for example, a phone left unlocked at a repair shop, or a
device connected to a compromised computer) could pull the app's entire
private data directory via backup tooling without needing root, recovering
cached Firestore documents and the locally persisted Firebase Auth session,
without ever touching the app's own PIN/biometric lock screen.

**Fix applied:** Added `"allowBackup": false` under `expo.android` in
`app.json`. This is a standard, non-breaking Android hardening setting — it
does not change any app functionality, it only stops the OS from including
this app's private storage in device backups. Since this app uses the
managed Expo workflow (no committed `android/` folder), this is the correct
place to set it; it takes effect the next time the Android project is
generated (`expo prebuild`) or a new build is produced via EAS/the existing
release scripts.

---

## 2. Issues Found but NOT Fixed (Remaining Risks)

These were identified as real concerns but were judged too broad, too
uncertain to verify without a physical device, or requiring changes outside
this repository's scope to fix safely within a security-only task. They are
carried forward for a future phase.

- **Google Sign-In redirect uses a custom URL scheme
  (`expensetrackermobile://google-auth`), not a verified Android App Link.**
  See [lib/googleAuthBridge.ts](../../lib/googleAuthBridge.ts) and
  [shared/config/linking.ts](../../shared/config/linking.ts). The OAuth
  ID-token-in-URL redirect used by the web-bridge Google sign-in flow relies
  on a custom URI scheme, which Android does not guarantee is exclusive to
  this app — another app could in principle register the same scheme and
  attempt to intercept the redirect. `WebBrowser.openAuthSessionAsync` (the
  API actually used here) mitigates this to a meaningful degree versus a bare
  deep link, but closing this fully would mean moving to a verified Android
  App Link (`https://vault.kesava.dev/...`, which the app's own
  `linking.ts` shows is already an available domain) or a PKCE-based OAuth
  flow, both of which require coordinated changes to the Netlify-hosted web
  bridge (outside this repository) and to the Google Cloud OAuth client
  configuration. Not fixed here because it cannot be safely implemented and
  verified without access to and testing of that external web app.

- **25 npm dependency vulnerabilities (9 moderate, 16 high), all inside the
  Expo CLI/build-tooling dependency chain** (`@expo/cli`, `@expo/config`,
  `@expo/config-plugins`, `metro`, `xcode`, transitively via `uuid`). Run via
  `npm audit --omit=dev`. None of these are runtime dependencies that ship
  inside the built app — they're part of the local/CI build toolchain
  (`expo prebuild`, Metro bundling, Xcode project generation). `npm audit fix`
  offers no non-breaking resolution; the only fix path (`npm audit fix
  --force`) would downgrade `expo-splash-screen` and force a major Expo SDK
  version change, which is far outside a security-only task's blast radius
  and could not be verified without a full rebuild and device test. Flagged
  for a dedicated dependency-upgrade phase instead.

- **ESLint is still not configured** (confirmed unchanged from
  [Phase 1](PHASE_1_ARCHITECTURE_AUDIT.md)). The task asked to run ESLint
  after fixes; there is nothing to run. Introducing an ESLint setup was out
  of scope for a security-only task (it's a code-quality/tooling addition,
  not a security fix), so this was left as-is and only reconfirmed.

- **`system_settings/global` and `system_settings/latest_release` are read
  by the app** (`AuthProvider.tsx`'s signup-disable check,
  `hooks/useAppUpdate.ts`'s update-check flow) **but have no matching rule in
  `firestore.rules`**, meaning the committed rules file's catch-all "deny
  everything else" would block these reads if it were the rules actually
  deployed. This is the safe direction to be wrong in (denying by default
  rather than over-permitting), so it was not touched as part of a security
  hardening pass — but it reinforces [Phase 1's finding](PHASE_1_ARCHITECTURE_AUDIT.md)
  that the deployed Firestore rules may not match what's committed here,
  since the app evidently works in production today.

- **Firebase Auth's session (refresh token) is persisted via AsyncStorage on
  native** (`lib/createAuth.native.ts`, using `getReactNativePersistence`) —
  this is Firebase's own officially recommended pattern for React Native and
  was not changed, since replacing it with a custom SecureStore-backed
  persistence layer is a substantial, hard-to-verify-without-a-device change
  to how sign-in works app-wide. The Android backup fix in 1.3 above removes
  the main practical avenue (device backup extraction) an attacker would have
  to get at this data without the device being rooted; noted here so a future
  phase can weigh a stronger fix deliberately rather than by omission.

---

## 3. Files Changed

| File | Change |
|---|---|
| [firestore.rules](../../firestore.rules) | Vaults/splits: `update` now requires ownership/membership fields to stay stable unless the caller is the owner/creator |
| [app.json](../../app.json) | Added `android.allowBackup: false` |
| [lib/pinSecurity.ts](../../lib/pinSecurity.ts) | **New.** SHA-256 PIN hashing + hash/legacy-plaintext-aware comparison |
| [lib/pinSecurity.test.ts](../../lib/pinSecurity.test.ts) | **New.** 6 unit tests for the above |
| [providers/SettingsProvider.tsx](../../providers/SettingsProvider.tsx) | `setPrivacyPin`/`setFakePin` now hash the PIN before writing to Firestore |
| [components/PrivacyLock.tsx](../../components/PrivacyLock.tsx) | Unlock check now compares hashes via `pinMatches()` instead of raw strings |
| [app/(app)/settings.tsx](../../app/(app)/settings.tsx) | "Duress PIN must differ from real PIN" check now uses `pinMatches()` instead of a raw string comparison |

No other files were touched. No UI was redesigned, no unrelated code was
refactored, and no business functionality changed beyond what fixing 1.2
required (PINs are hashed at rest — the feature behaves identically from the
user's point of view).

---

## 4. Tests Run

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc -p tsconfig.json --noEmit` | **Passed.** No type errors. |
| ESLint | *(no lint config exists — see remaining risks)* | **Not run — nothing configured.** |
| Full test suite | `npx vitest run` | **Passed.** 84 test files, 560 tests (up from 83 files / 554 tests in Phase 1 — the 1 new file / 6 new tests are `lib/pinSecurity.test.ts`). |

---

## 5. Remaining Security Risks (Summary)

Carried forward to a future phase, in priority order:

1. Custom-URL-scheme-based Google Sign-In redirect (potential interception on
   Android) — needs coordinated web-bridge + Google Cloud console changes.
2. 25 npm vulnerabilities in the Expo build-tooling chain — needs a dedicated
   Expo SDK upgrade phase, not a quick patch.
3. No ESLint configured — carried from Phase 1, out of scope for a
   security-only task.
4. Possible drift between committed and deployed Firestore rules (missing
   `system_settings/*` rule suggests the live rules differ from this file) —
   carried from Phase 1.
5. Firebase Auth session persisted via (now backup-protected, but still
   unencrypted-at-rest) AsyncStorage on native — acceptable given Firebase's
   own guidance and the Android backup fix, but worth a deliberate decision
   in a future phase rather than leaving it as a byproduct of this one.
