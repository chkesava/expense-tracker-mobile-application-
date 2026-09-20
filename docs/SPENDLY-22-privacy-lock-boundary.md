# SPENDLY-22 — what the privacy lock is, and what it is not

[SPENDLY-22](https://kesavach.atlassian.net/browse/SPENDLY-22) · Bug ·
Medium / Security + Privacy · epic
[SPENDLY-2](https://kesavach.atlassian.net/browse/SPENDLY-2)

Audit row **AUTH-04** in
[`SPENDLY_FIREBASE_AUDIT_2026-09-12.md`](SPENDLY_FIREBASE_AUDIT_2026-09-12.md).

---

## The honest description

The privacy lock is **anti-shoulder-surfing and anti-casual-coercion UX. It is
not data isolation.**

`PrivacyLock` renders an opaque overlay on top of the app and sets
`pointerEvents="none"` on the content beneath. It does **not** unmount
anything. While the keypad is showing, every data provider below it is mounted,
every Firestore listener is live, and the on-disk cache is fully populated.
Anyone with accessibility tooling, a debugger, a rooted device or the
filesystem can read it.

This was a deliberate decision, not an oversight. Unmounting the providers on
lock was considered and rejected: it would cost a full re-hydration on every
unlock, churn every listener, and — the deciding argument — it still would not
protect the Firestore cache already written to disk. That buys the *appearance*
of a boundary without the substance, which is worse than being clear about what
the feature does.

**What the duress tree does guarantee** is narrower and real: `{uid}_duress` is
a separate document tree, enforced in `firestore.rules` and pinned by
`lib/duressPath.contract.test.ts`. Data written under duress cannot reach the
real tree.

## The PIN

### Threat model, stated plainly

A 4-digit PIN is a 10,000-element space. At 50,000 PBKDF2 iterations,
enumerating it is on the order of 10⁹ operations — minutes on a GPU. **The KDF
is a speed bump, not a wall**, and no iteration count changes that.

What actually protects the PIN:

1. **Where it lives.** SecureStore, backed by the Android Keystore and the iOS
   Keychain. The blob is not readable without compromising the device. This is
   what moving off Firestore bought — not the hashing.
2. **`lib/privacyLockout.ts`**, which makes online guessing expensive and
   survives a force-stop.

### What was wrong

`lib/pinSecurity.ts` hashed the PIN with a single unsalted SHA-256 and
`SettingsProvider` stored it on `users/{uid}.privacyPin`. That value synced to
every device, sat in every device's Firestore cache, and was readable by anyone
who could read the user document — a console session, an export, a backup. Ten
thousand candidates against a precomputed table is not a hash; it is an
encoding. The same file also accepted a **plaintext** PIN whenever the stored
value did not look like a hash: a migration shim with no expiry.

That module is deleted. Deleting it, rather than leaving it exported, is what
retires the plaintext path for good.

### What replaced it

`lib/pinVault.ts` — PBKDF2-SHA256 via `@noble/hashes`, a fresh 128-bit salt per
entry, `{algo, salt, iterations, hash}` stored per entry so the real and duress
PINs upgrade independently and the cost can be retuned without invalidating
anyone.

Two decisions worth keeping:

- **`verifyPin` evaluates both entries with no short-circuit.** Returning as
  soon as the real PIN matches would make the duress entry's *existence*
  observable by timing — and "nobody can tell a duress PIN is configured" is the
  entire proposition of duress mode.
- **Iteration count is `50_000`, and it lives in the envelope.** Measured at
  ~350k iterations/sec warm on desktop Node; Hermes on a mid-range Android is
  several times slower, and this runs on *every* unlock. If a device measures
  much past ~600 ms, **lower it** — per the threat model above, the iteration
  count is not what is holding the line. Entries below the current count are
  re-derived on the next successful unlock.

### Web has no keychain

`expo-secure-store` has no web implementation, which is why
`hooks/useBiometrics.ts` already gates itself off there. The web build uses
`localStorage` (`lib/secureKeyValue.web.ts`), which is **not hardware-backed**
and is readable by any script on the origin.

Keeping the lock on web is still a strict improvement — the hash no longer sits
in Firestore where anyone with database access could read it — but it is not a
secret store, and the module says so. A lock that silently vanished on web
would have been a worse answer than one that is frank about its limits.

## Migration

Nobody is locked out and nobody is asked to re-enrol.

| Legacy value | What happens |
|---|---|
| Plaintext (e.g. `1234`) | We know the PIN, so it becomes a full PBKDF2 entry immediately. The weak form dies at migration. |
| 64-hex SHA-256 | We do *not* know the PIN, so it is carried across as a `legacy-sha256-unsalted` entry, keeps working unchanged, and is silently upgraded on the first successful unlock. |

`lib/privacyPinMigration.ts` is a pure planner so the decision is testable
without React or Firestore. It reads the **raw** document, including
`settings.privacyPin` / `settings.fakePin` — an older web build nested them,
and missing that would leave a hash in Firestore forever.

Order matters: the vault is written **first** (local, cannot fail offline), and
only then are the Firestore fields cleared with `deleteField()`. If the process
dies in between, the next launch finds the vault populated and re-issues only
the clear. Offline, the SDK queues the delete and the local cache reflects it
at once, so the migration does not spin.

### The cost, which is real

**A PIN that used to sync is now device-local.**

- A second device still on the **old** build reads an empty PIN once the clear
  lands, and its lock silently turns off until it upgrades. Nobody is locked
  out and no data is lost, but the lock is absent in that window. This was
  accepted deliberately: getting the hash out of the database is the entire
  point of AUTH-04, and a partial fix that leaves it there for a release is not
  worth the review cost.
- **A new device has no PIN until one is set on it.** If device B upgrades
  first, it mints its own salt and clears the document; device A then finds
  neither a Firestore value nor a vault entry and starts with no PIN.
- "Forgot PIN? Sign Out" is the only recovery — and that is now honest, where
  before the synced hash made recovery look possible.

The Settings screen carries a permanent explainer, and a one-shot notice after
migration tells the user the PIN is device-local now.

## Lockout

The attempt counter was a `Map` in `lib/privacySession.ts`, so five failed
guesses cost an attacker one force-stop. It now lives in
`lib/privacyLockout.ts`, on disk, per-uid.

| Cumulative failures | Lockout |
|---|---|
| 1–4 | none |
| 5 | 30 s *(the previous behaviour, preserved)* |
| 6 | 2 min |
| 7 | 10 min |
| 8 | 1 h |
| 9+ | 24 h (cap) |

Three details that make it work:

- **`privacySession.clearAll()` no longer touches it.** That path is reachable
  from the lock screen's own "Forgot PIN? Sign Out" button, so clearing there
  would make five failures cost one tap to undo.
- **An expired lockout keeps its attempt count.** Only a successful unlock
  resets it. The old `clearLockout()` zeroed the count, which is precisely why
  backoff was impossible.
- **The clock cannot be wound back out of a lockout.** `lockedAt` is persisted;
  if the device clock reads earlier than it on launch, the full duration
  restarts from now.

Per-uid, so one account's failures cannot lock another out on a shared device,
and signing in as someone else is not a reset.

## Duress mode

The ticket said duress mode "leaks its own existence in Settings". It was worse
than that.

**`createDuressUser` used `Object.create(real)` and overrode only `uid`**, so
`displayName`, `email` and `photoURL` were inherited straight from the real
user. They were rendered on the Spendly profile and side drawer, in the app bar
avatar, on **Nutrition's** profile screen — and stamped onto split and
payment-request documents *created inside the duress tree*. A duress vault that
shows the victim's name and email defeats the feature entirely.

Fixed once, at the source: own-property getters shadow the identity fields.
`Object.create` is kept deliberately — consumers call `User` prototype methods
such as `getIdToken`, and a plain object would break them at a distance.

**A coercer could also destroy the victim's real configuration.**
`PrivacySection`'s remove-PIN handler and `ProfileSection`'s save both wrote to
the real uid unconditionally. Both now return early under duress, and the
controls are gone from the duress rendering. The guards stay regardless of the
UI, because the UI is the thing most likely to be re-arranged later.

### The Privacy section is a decoy, not a hole

Under duress it renders **exactly as it would for an account that never set a
PIN** — rather than being hidden.

Hiding it would be its own tell: a coercer who has seen the app before notices
a missing "Privacy & security" row in the Settings hub, and that absence is the
signal duress mode exists. The empty state is indistinguishable from a genuine
unconfigured account and, incidentally, already hides the entire "Duress (fake)
PIN" block — the literal AUTH-04 finding. Typing a new PIN into the decoy form
reports success and writes nothing.

### `UserDocProvider` still reads the real document

Deliberately. Settings, theme, currency and budget all read from it in all
three products, and re-keying that listener is exactly how Ganesh Seva and
Nutrition would break. A derived `maskedData` strips the identity fields
instead, and only `ProfileSection` consumes it.

## Files

| File | Change |
|---|---|
| `lib/pinVault.ts` *(new)* | PBKDF2, salts, verification, legacy import |
| `lib/secureKeyValue.ts` / `.web.ts` *(new)* | Storage adapters; web is frank about lacking a keychain |
| `lib/privacyLockout.ts` *(new)* | Durable per-uid lockout with backoff |
| `lib/privacyPinMigration.ts` *(new)* | Pure migration planner |
| `providers/PrivacyPinProvider.tsx` *(new)* | State + migration; mounted once in `app/_layout.tsx` for all three products |
| `lib/pinSecurity.ts` *(deleted)* | Unsalted hash + plaintext fallback |
| `lib/privacySession.ts` | Lockout delegated out; `clearAll` no longer resets it |
| `lib/authHelpers.ts` | Duress proxy masks identity |
| `components/PrivacyLock.tsx` | Reads the vault; `ready` gate |
| `components/settings/sections/PrivacySection.tsx` | Decoy under duress; explainer copy |
| `components/settings/sections/ProfileSection.tsx` | Masked data; write guarded |
| `providers/UserDocProvider.tsx` | Derived `maskedData` |
| `providers/SettingsProvider.tsx` | PIN setters removed |
| `shared/types/settings.ts` | Legacy fields `@deprecated` |

## Tests

| File | |
|---|---|
| `lib/pinVault.test.ts` *(new)* | 29 — salting, verification, legacy import and in-place upgrade, per-uid isolation, failing closed on a corrupt blob |
| `lib/privacyLockout.test.ts` *(new)* | 23 — the backoff table, **attempts surviving a simulated restart**, expiry keeping the count, `clearAll` not resetting it, clock tampering |
| `lib/privacyPinMigration.test.ts` *(new)* | 14 — plaintext vs hash, nested fields, idempotent re-run, never overwriting a local PIN |
| `lib/authHelpers.test.ts` | Identity masking; prototype methods still reachable |
| `lib/privacySession.test.ts` | Rewritten for the new lockout contract |

Full suite **2934 unit**, both typechecks clean.

**Not automatically testable**, and manual for the same reason as always — there
is no emulator harness for SecureStore or the Keystore in this repo:

1. SecureStore round-trip on a real device.
2. **PBKDF2 unlock latency on a mid-range Android.** If it is much past 600 ms,
   lower `PBKDF2_ITERATIONS`.
3. Upgrade from the previous build with an existing hashed PIN; then again with
   a legacy plaintext PIN.
4. Two-device migration, in **both** orders.
5. Airplane-mode migration, then reconnect — confirm the fields are cleared.
6. The lockout surviving a force-stop, and the backoff escalating.
7. Biometric unlock still works.
8. App-switch and inactivity locks in **all three** products.
9. Duress unlock in all three, with Settings inspected: no real email or name
   anywhere, Privacy section reads as unconfigured, profile is not editable.
10. Normal (non-duress) mode in Ganesh Seva and Nutrition must be unchanged.

## Known limitations

1. **The overlay is an overlay.** See the top of this document.
2. **Biometric unlock can never enter duress** — a coerced fingerprint opens the
   real vault. A design question, not a bug; follow-up ticket.
3. **Duress mode can still change non-account settings** (appearance, ghost
   mode). Making account-level settings read-only under duress touches all
   three products; follow-up ticket.
4. **The legacy fields still exist** in `UserSettings` because the migration
   reads them. Removing them, and denying them in `firestore.rules`, is a
   follow-up once the migration has rolled out.
5. **Web storage is not hardware-backed.**
6. **A corrupted vault reads as "no PIN"** rather than throwing. The app starts
   rather than bricking; the cost is that the lock is silently off until the
   user notices.
