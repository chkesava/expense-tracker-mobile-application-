# Phase 7 — Push/Local Notifications Audit (2026-08-15)

Scope: push/local notifications only. No unrelated UI redesign. Checked:
permission handling, Android notification channels, scheduling, duplicate
notifications, cancellation, recurring notifications, notification state,
background behavior, app-open behavior, notification-tap navigation,
expired/cancelled notifications, and sensitive information in previews —
with specific attention to whether financial reminders can duplicate for
the same outstanding bill.

**Headline finding**: the credit-card bill reminder system
(`services/creditCardBills/billReminderScheduler.ts`) is already excellent
on the exact point this task worried about most — it uses deterministic,
stable notification identifiers per bill+slot and always cancels-then-
reschedules, so duplicate reminders for the same outstanding bill are
already structurally impossible. The SMS transaction-notification system
did **not** follow that same pattern, and that gap — plus two real
notification-tap navigation gaps — are what this phase found and fixed.

---

## 1. Problems Found & Fixed

### 1.1 [FIXED] SMS transaction notifications had no stable identifier — real duplicate-notification risk

**Where:** `services/sms/smsNotifications.ts`, `services/sms/smsNotificationCopy.ts`.

**What the issue was:** Unlike `billReminderScheduler.ts` (which always
calls `scheduleNotificationAsync` with an explicit, deterministic
`identifier` built from the bill id and reminder slot), `presentSmsNotification()`
called `scheduleNotificationAsync` with **no identifier at all** for all
three SMS notification kinds ("Transaction detected", the auto-added
confirmation, and the recurring-payment-detected alert). Without an
explicit identifier, Expo auto-generates a random one per call, so the OS
has no way to recognize "this is the same notification as before" — every
call produces a brand-new, separate notification.

**Why it matters / failure scenario:** The SMS pipeline does have its own
upstream dedupe (`smsDedupeStore.ts`, checked before a message is ever
dispatched), so this wasn't creating duplicates under every normal
circumstance — but it meant there was no defense-in-depth at the
notification layer itself. If the same write-ready entry were ever
dispatched twice for any reason (a retry path, a race between two
overlapping `processIncomingSmsMessages` calls both reading the dedupe-key
set before either had persisted its results, or a platform-level redelivery
of the same BroadcastReceiver event), the user would see two separate
notifications for the same transaction with no way for the OS to collapse
them. This is exactly the class of bug the task's "duplicate notifications"
and "recurring notifications" checklist items are aimed at, even though the
most obviously-named case (credit card bills) was already safe.

**Fix applied:** Added a required `identifier` field to `SmsNotificationCopy`,
populated in all three builders with a stable key: `sms-detected:{smsId}`,
`sms-auto-added:{smsId}` (falling back to the message's dedupe fingerprint
if `smsId` is ever empty), and `sms-recurring:{pattern.key}` for the
recurring-detected alert. `presentSmsNotification()` now passes
`identifier: copy.identifier` through to `scheduleNotificationAsync`, so
re-presenting the same entry replaces the existing notification instead of
stacking a new one — matching the pattern already proven correct in the
bill-reminder scheduler. Added a regression test confirming the same entry
always produces the same identifier and that the two notification kinds
("detected" vs "auto-added") don't collide with each other.

---

### 1.2 [FIXED] Tapping a notification that cold-started the app never navigated anywhere

**Where:** `providers/SmsReceiverProvider.tsx`.

**What the issue was:** The only notification-tap handler in the app
registered via `Notifications.addNotificationResponseReceivedListener`
inside a `useEffect`. That listener only receives responses for
notifications tapped **while the JS runtime is already running** — if the
app was fully killed and the user tapped a notification (which is exactly
what launches/cold-starts the app), the tap event that caused the cold
start happened before this `useEffect` ever ran, so it was silently lost.
The user would end up on whatever the default entry screen is instead of
`/sms-inbox` (detected transaction) or the bill's reminder URL, with no
indication anything went wrong.

**Why it matters:** This is a very common real-world path — a user gets a
"Transaction detected" or bill-due notification while the app isn't
running, taps it directly from the lock screen or notification shade, and
expects to land on the relevant screen. Silently landing on the dashboard
instead defeats the whole purpose of the notification's deep link.

**Fix applied:** Added a one-time check of
`Notifications.getLastNotificationResponseAsync()` alongside the live
listener, both funneling into the same `handleResponse` function, with a
small `Set` of already-handled notification identifiers so a response
delivered through both paths (e.g. the app was already running, not a cold
start) isn't handled twice.

---

### 1.3 [FIXED] Notification-tap navigation didn't run on iOS at all — broken for bill reminders on that platform

**Where:** `providers/SmsReceiverProvider.tsx`.

**What the issue was:** The entire tap-navigation `useEffect` was gated by
`if (!supported) return;`, where `supported = Platform.OS === "android"`.
That gate makes sense for the SMS-specific effects in this same provider
(SMS reading is genuinely Android-only), but this particular effect isn't
SMS-specific — its `data?.source` check already handles both `"sms"` and
`"credit_card_bill"` sources, and credit-card bill reminders
(`billReminderScheduler.ts`) are scheduled on **every** platform, not just
Android. Because this was the only notification-response listener anywhere
in the codebase, the practical effect was: tapping a bill-reminder
notification on iOS never navigated anywhere, silently.

**Why it matters:** `app.json` configures iOS support (`ios: { supportsTablet: true }`)
and nothing about bill reminders is Android-specific, so this is a real
cross-platform gap for a core feature (bill payment reminders), not a
hypothetical.

**Fix applied:** Removed the `supported` gate from this one effect (the
other, genuinely-SMS-specific effects in the same file keep their Android
gate untouched) — folded into the same edit as §1.2 since both live in the
same `useEffect`.

---

### 1.4 [FIXED] A resolved "Transaction detected" notification stayed in the notification shade after being handled in-app

**Where:** `services/sms/smsReviewInboxStore.ts`.

**What the issue was:** When a user opens the app directly (not via tapping
the notification) and adds or ignores a detected transaction from the
in-app Review Inbox, `dismissSmsReviewItem()` removed the item from the
inbox list and persisted that — but never told the OS to clear the
originally-presented "Transaction detected" notification. That notification
would keep sitting in the Android notification shade looking exactly as
pending as it did before, even though the underlying item had already been
resolved.

**Why it matters:** This is precisely the "expired/cancelled notifications"
failure mode the task asked about — a stale notification that no longer
reflects reality, left for the user to notice and manually dismiss, or
worse, tap later and be confused when the item is no longer in the inbox.

**Fix applied:** `dismissSmsReviewItem()` now also calls
`Notifications.dismissNotificationAsync("sms-detected:{id}")` — reusing the
exact identifier scheme introduced in §1.1, since `reviewInboxItemId()`
already resolves to the same `smsId`/fingerprint used to build that
notification's identifier. Both `addSmsReviewItem()` and
`ignoreSmsReviewItem()` route through `dismissSmsReviewItem()`, so this
covers both actions. Implemented as fire-and-forget (not awaited) since
notification cleanup is a best-effort OS side effect that callers
shouldn't block on — this also keeps the existing unit tests for the
review-inbox flow (which don't touch `expo-notifications` at all) fast and
hang-free, since `expo-notifications` can't be loaded in vitest's node test
environment (it transitively pulls in React Native).

---

## 2. Areas Reviewed and Found Already Correct (No Changes Made)

- **Credit-card bill reminder duplicate prevention** — the specific case the
  task called out by name. `reconcileBillReminders()` always calls
  `cancelBillReminders(bill.id)` (cancelling every previously-scheduled
  reminder for that bill, matched by an `ccbill:{billId}:` identifier
  prefix) before rescheduling, and every reminder's identifier
  (`stableReminderNotificationId()`) is deterministic per bill+slot —
  `ccbill:{billId}:before:{daysBefore}`, `ccbill:{billId}:due`, or
  `ccbill:{billId}:overdue:{dateKey}`. Re-running reconciliation (which
  happens on every bill-data change and every app-foreground resume) is
  therefore fully idempotent: the same conceptual reminder always
  overwrites itself rather than stacking. Confirmed a bill that becomes
  ineligible (paid, cancelled, reminders disabled) has its stale reminders
  cancelled on the very next reconcile, since the cancel step runs
  unconditionally before the eligibility check.
- **Stale-job guard on scheduling** — `scheduleSlot()` re-checks the bill's
  status/remaining-amount/reminder-enabled flag immediately before actually
  scheduling, and skips if the computed fire time is more than 60 seconds in
  the past — protects against a reminder firing for data that changed
  between reconciliation starting and a given slot being scheduled.
- **Android notification channels** — two channels are configured
  (`credit-card-bills`, `sms-transactions`), both with `AndroidImportance.HIGH`
  and a distinct vibration pattern, set up lazily on first permission
  request via idempotent `channelReady`/`handlerReady` module-level flags
  (so repeated calls don't re-register). No conflicting channel
  configuration found.
- **Notification handler consistency** — `app/_layout.tsx` sets a global
  `Notifications.setNotificationHandler` at module load with the same
  `{shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true,
  shouldShowList: true}` config that both `billReminderScheduler.ts` and
  `smsNotifications.ts` separately (and redundantly, but harmlessly) set —
  no conflict since all three agree.
- **Permission request de-duplication** — both notification paths check
  `getPermissionsAsync()` first and only call `requestPermissionsAsync()` if
  not already granted; since Android's `POST_NOTIFICATIONS` permission is
  shared across the whole app, a user who granted it via one flow won't be
  re-prompted by the other.
- **Recurring-notification duplicate prevention** — `notifyCreated()` in
  `smsRecurringSync.ts` is only called with subscriptions that were just
  freshly created, after checking against existing local subscriptions, a
  freshly-reloaded remote list, a `dismissed` set, and an in-memory
  `inFlight` guard against concurrent processing of the same pattern key —
  already well-guarded before my identifier fix even applies.
- **Sensitive information in notification previews** — reviewed the actual
  title/body text for all notification kinds (bill reminders and SMS
  alerts). None include account numbers, reference numbers, OTPs, or raw
  SMS body text — only amount, merchant/category, and due-date information,
  consistent with what a legitimate banking app itself would show in a
  transaction alert. No change needed.
- **Background behavior** — `CreditCardBillsProvider` re-runs reminder
  reconciliation on every `AppState` transition to `"active"` (audited in
  [Phase 4](PHASE_4_MEMORY_POWER_AUDIT.md)), and `SmsReceiverProvider`
  re-asserts SMS listening + re-syncs permission on the same transition —
  both correctly re-establish state when the app resumes from background
  rather than assuming nothing changed while backgrounded.

## 3. Files Changed

| File | Change |
|---|---|
| `services/sms/smsNotificationCopy.ts` | Added a required `identifier` field to `SmsNotificationCopy`; populated with a stable per-transaction/per-pattern key in all three builders |
| `services/sms/smsNotifications.ts` | Passed `identifier: copy.identifier` through to `scheduleNotificationAsync` |
| `services/sms/smsNotificationCopy.test.ts` | Added a regression test for stable/distinct identifiers |
| `providers/SmsReceiverProvider.tsx` | Tap-navigation effect no longer gated to Android-only; added cold-start handling via `getLastNotificationResponseAsync()` with a dedupe guard against the live listener also firing for the same response |
| `services/sms/smsReviewInboxStore.ts` | `dismissSmsReviewItem()` now dismisses the corresponding OS notification (fire-and-forget) when an item is added or ignored |

No other files were touched. No UI was redesigned.

## 4. Verification

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc -p tsconfig.json --noEmit` | **Passed.** No type errors. |
| ESLint | *(still not configured — see [Phase 1](PHASE_1_ARCHITECTURE_AUDIT.md))* | **Not run — nothing configured.** |
| Full test suite | `npx vitest run` | **Passed.** 84 test files, 568 tests (up from 567 — the new identifier regression test). One test (`services/sms/smsReviewInbox.test.ts`) initially started timing out after the notification-dismissal fix, because it awaited a real `import("expo-notifications")` that hangs in vitest's node environment (the same class of issue as expo-crypto in [Phase 2](PHASE_2_SECURITY_AUDIT.md)); fixed by making the dismissal fire-and-forget rather than awaited, which is also the semantically-correct choice for a best-effort OS side effect. Re-verified the full suite passes clean afterward. |

## 5. Remaining Issues (Not Fixed, Logged for a Future Phase)

- **No device-level verification was possible in this environment.** Every
  finding and fix here was verified by reading the actual scheduling/
  cancellation/navigation code paths and by unit-testing the pure logic
  (identifier generation), not by triggering real Android notifications on
  a device. A future phase with device access should confirm: notifications
  actually get replaced (not duplicated) in the shade when an identifier
  collision occurs, the cold-start `getLastNotificationResponseAsync()`
  path actually fires correctly on a killed-then-tapped app, and the
  dismiss-on-resolve fix actually clears the notification visually.
- **The SMS dedupe race condition described in §1.1's "why it matters"
  section (two overlapping `processIncomingSmsMessages` calls both reading
  the dedupe-key set before either persists) was not independently
  confirmed to be reachable** — it's a plausible theoretical gap given the
  async/await structure, not a proven repro like the float-precision bug in
  [Phase 5](PHASE_5_FINANCIAL_INTEGRITY_AUDIT.md). The identifier fix in
  §1.1 closes it as defense-in-depth regardless of whether it's currently
  reachable, but a dedicated concurrency audit of the SMS pipeline's
  dedupe-key read/merge timing would be worth a future phase if duplicate
  SMS-detected notifications are ever reported in practice.
- **Notification permission is requested opportunistically wherever a
  reminder/alert is first about to be sent**, rather than through a single
  unified onboarding prompt — this is a product/UX question (should the app
  ask once during setup instead of on first bill/SMS event?), not a
  reliability bug, so it wasn't changed here.
