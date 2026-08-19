# Network Reliability & Offline Behaviour Audit — 2026-08-15

**Scope:** network reliability and offline behaviour only. No feature work, no UI
redesign, no new networking library. Firestore (with its persistent local cache)
and TanStack Query remain the only data-transport layers.

**Branch:** `claude/network-offline-audit-7a0792`
**Verification:** `npm run typecheck` ✅ · `npm run typecheck:shared` ✅ ·
`npm test` — 85 files / 569 tests ✅ · ESLint — **not configured in this repo**
(no config file, no dependency, not part of `pr-checks.yml`; see P3-01).

---

## Architecture as found

| Layer | Mechanism |
| --- | --- |
| Reads | `onSnapshot` listeners in providers/hooks, served by Firestore's SQLite (native) / IndexedDB (web) persistent cache |
| Writes | `addDoc` / `setDoc` / `updateDoc` / `deleteDoc` / `writeBatch`, awaited directly at ~125 call sites across 28 files |
| HTTP | `fetch` in `marketDataService` (had timeout) and `openFoodFactsService` (had none), plus TanStack Query in `useMarketQuotes` |
| Connectivity | `NetworkProvider` (NetInfo) → `OfflineBanner`, pending-write count via `lib/syncStatusStore` |
| Auth | Firebase Auth, AsyncStorage-persisted, `onAuthStateChanged` |

The offline *storage* foundation was already sound: persistent cache is enabled
on both platforms, pending writes are counted, and the banner reports them. Every
problem below sits in the layer above it — how the app **waits on** and **reports**
those writes.

---

## Findings

Severity: **P0** data-integrity or total-blockage · **P1** materially broken UX or
correctness · **P2** wasteful/degraded · **P3** hygiene.

### P0-01 — Every write awaited a server acknowledgement that never arrives offline

**Files (before fix):** `services/ledger/createLedgerTransaction.ts`,
`components/ExpenseForm.tsx`, `components/ExpenseList.tsx`,
`providers/FinanceDataProvider.tsx`, `providers/CreditCardBillsProvider.tsx`,
`hooks/useReceivables.ts`, `useBorrowings.ts`, `useSplits.ts`, `useVaults.ts`,
`useVaultExpenses.ts`, `useInvestments.ts`, `useSubscriptions.ts`,
`useFinancialGoals.ts`, `useCategoryBudgets.ts`, `usePaymentRequests.ts`,
`useTrips.ts`, `useSpaces.ts`.

**What it is.** A Firestore write promise resolves only when the **server**
acknowledges the mutation. With persistent cache enabled, the write is applied to
the local cache and durably queued the instant it is called — but the promise
stays pending, indefinitely, while the device is offline. Every write path in the
app did `await addDoc(...)` and only then closed its sheet and raised its toast.

**Why it matters.** This is the difference between "offline-capable" and
"offline-hostile". The data was never actually lost — it sat safely in the local
queue — but nothing in the UI ever said so.

**Failure scenario.** User is on the metro with no signal. They enter a ₹450
expense and tap **Save Expense**. `await createExpense(...)` never resolves:
the button spinner runs forever, no toast appears, `onSuccess()` never fires so
the modal never closes. The user concludes the save failed, force-closes the
sheet, and re-enters the expense. Firestore now holds **two** queued writes with
different document ids. When signal returns, both sync: **a duplicated
transaction, created by an app that gave the user no way to know the first one
had worked.** The same shape applied to bill payments, transfers, account
entries, receivable repayments, borrowing repayments and every other money write.

**Fix.** New `lib/firestoreWrite.ts`:

- `commitWrite(run, opts)` races the write promise against a 1.5s ack grace
  window and returns `"acked"` or `"queued"`. Failures that land *inside* the
  window still reject, so every existing `try/catch` keeps working unchanged;
  failures that land *after* it are routed to `onLateFailure` (default: log +
  "could not be synced" toast) instead of becoming unhandled rejections.
- `writeSavedMessage(outcome, message)` appends `— offline, will sync` so the
  user is told the truth: the money is recorded, the sync is pending.

Applied to every money-write call site listed above. Sheets now close, spinners
stop, and the OfflineBanner's pending count carries the sync state from there.

### P0-02 — Document ids were taken from a promise that never resolves offline

**Files:** `createLedgerTransaction.ts`, `CreditCardBillsProvider.tsx`,
`useReceivables.ts`, `useBorrowings.ts`, `useSplits.ts`, `useVaults.ts`,
`useVaultExpenses.ts`, `useInvestments.ts`, `useSubscriptions.ts`, `useTrips.ts`,
`useSpaces.ts`, `usePaymentRequests.ts`.

**What it is.** Callers needing the new document id read it from `addDoc`'s
resolved `DocumentReference`. That reference is available only on server ack.

**Failure scenario.** SMS auto-add commits a parsed transaction through
`commitSmsWritePayload`, which needs the returned id for the recurring-transaction
sync that follows. Offline, `createExpense` never returns, so the entire
`processIncomingSmsMessages` promise hangs — the inbound-status record is never
patched and no notification fires, even though the expense itself is safely
queued. The user sees an SMS-detected expense that the app appears to have
ignored.

**Fix.** Ids are now generated client-side with `doc(collection(...))` and the
write issued as `setDoc(ref, …)`. The id exists synchronously, offline included.
`createExpense` / `createIncome` now return `{ id, outcome }`.

### P0-03 — Dependent writes were not atomic, so an interruption could split a transaction

**Files:** `useReceivables.ts` (`addRepayment`, `deleteRepayment`,
`updateReceivable`), `useBorrowings.ts` (same three), `useSplits.ts`
(`createSplit`).

**What it is.** These paths issued two sequential awaited writes: the child
record, then the recomputed denormalized totals on its parent (or, for splits,
the shared split then the creator's personal expense).

**Why it matters.** Two sequential writes have no shared fate. This is not only
an offline problem — a connection dropping *between* the two, or the app being
killed at that moment, leaves the ledger internally inconsistent.

**Failure scenario.** User records a ₹5,000 repayment against ₹20,000 they lent
out. The repayment document commits; the connection drops before the parent
update. The receivable still reads `outstandingAmount: 20000` while a ₹5,000
repayment exists against it. Every summary, the net-worth roll-up and the
"settled" badge are now wrong, and nothing will ever reconcile them.

**Fix.** Each pair is now a single `writeBatch` commit — one atomic unit, queued
atomically offline and replayed atomically on reconnect. `updateReceivable`'s
two updates to the same document are merged into one payload.

### P0-04 — Cascading deletes trusted a cache-served query

**Files:** `providers/FinanceDataProvider.tsx` (`deleteAccount`),
`useReceivables.ts` (`deleteReceivable`), `useBorrowings.ts`
(`deleteBorrowing`), `useTrips.ts` (`deleteTrip`), `useSpaces.ts`
(`deleteSpace`).

**What it is.** These operations run `getDocs` to find linked records — either to
refuse the delete (accounts) or to cascade unlink/delete (receivables,
borrowings, trips, spaces). Offline, `getDocs` answers from the local cache,
which is a *partial* view: it holds only what this device has already listened
to.

**Failure scenario.** A user signs in on a new phone, opens Accounts before the
full expense history has streamed down, and goes offline. The linked-records
query returns `0`, `canDeleteAccount(0)` passes, and the account is deleted. On
reconnect the delete replays against a server that holds 300 expenses pointing at
that account id — all now orphaned, silently excluded from account balances, with
no way for the app to tell the user which ones.

**Fix.** Each of these paths now checks `snapshot.metadata.fromCache` and refuses
with "Can't verify linked … while offline. Try again when connected." Destructive
cascades require an authoritative answer; a wrong one is unrecoverable.

### P1-01 — TanStack Query believed it was permanently online

**File:** `app/_layout.tsx` (+ new `lib/queryNetworkBinding.ts`).

**What it is.** Query's `onlineManager` listens for browser `online`/`offline`
events, which never fire in React Native, and its `focusManager` listens for
`window.focus`. Neither was bound. TanStack's RN guidance is to wire both to
NetInfo and AppState; the app had NetInfo as a dependency already but only used
it for the banner.

**Failure scenario.** A portfolio screen with `refetchInterval: 60_000` per
symbol goes offline. Query keeps firing every poll into a dead radio; each one
fails, burns its retry immediately, and logs. With ten holdings that is twenty
guaranteed-failing requests a minute, draining battery, for as long as the screen
stays mounted — and with no "back online" signal, none of it refreshes promptly
when connectivity returns either. Backgrounding the app did not stop the polls.

**Fix.** `bindQueryClientToNetwork()` binds `onlineManager` → NetInfo and
`focusManager` → AppState, called before any query mounts. Query now pauses polls
while offline or backgrounded and refetches on reconnect/resume.

### P1-02 — Retries had no backoff

**File:** `app/_layout.tsx`.

**What it is.** `retry: 1` with the default delay meant a failure was retried
almost immediately — the worst possible moment on a flapping connection.
Mutations had no explicit retry policy at all.

**Fix.** `retryDelay: attempt => Math.min(1000 * 2 ** attempt, 15_000)`,
`refetchIntervalInBackground: false`, and `mutations: { retry: 0 }` — financial
mutations must never be retried automatically, since a retry of a write whose
response was merely lost is exactly how duplicates are created.

### P1-03 — Listener errors were invisible, including "your session is gone"

**Files:** `providers/FinanceDataProvider.tsx` (8 listeners) + new
`lib/firestoreErrors.ts`.

**What it is.** Every `onSnapshot` error callback did `console.error` and set
`loading = false`. `permission-denied` / `unauthenticated` — the codes Firestore
raises when a session is revoked or rules deny the read — were treated exactly
like a transient offline blip.

**Failure scenario.** The user's refresh token is revoked (password changed on
another device, admin action). The listeners detach with `permission-denied`. The
app keeps rendering the last cached ledger indefinitely: totals look normal, the
OfflineBanner shows nothing because NetInfo reports a healthy connection, and any
expense entered from here is written against a session the backend will reject.

**Fix.** `handleSnapshotError(label, error)` classifies the failure:
`unavailable` / `deadline-exceeded` / `cancelled` stay silent (offline is
expected and the cache is still correct); auth codes log and raise **one**
throttled "Your session expired. Sign in again to keep syncing." toast across all
listeners; anything else is logged.

### P1-04 — An unbounded `fetch` to a third-party API

**File:** `services/openFoodFactsService.ts` (+ new `lib/fetchWithTimeout.ts`).

**What it is.** `fetchFoodByBarcode` called bare `fetch` against
`world.openfoodfacts.org` with no timeout and no abort. React Native's fetch has
no default timeout.

**Failure scenario.** The user scans a barcode on a captive-portal Wi-Fi that
accepts the connection but never responds. The promise hangs for minutes; the
scanner modal sits on its spinner with no cancel path and no error.

**Fix.** Shared `lib/fetchWithTimeout.ts` (8s default, abort-on-timeout, honours
an upstream `AbortSignal`) now backs both this service and `marketDataService`,
which had its own private copy of the same helper.

### P1-05 — In-flight quote requests were never cancelled

**Files:** `hooks/useMarketQuotes.ts`, `services/marketDataService.ts`.

**What it is.** The query function ignored the `signal` TanStack Query provides,
so unmounting a screen or superseding a poll left the request running to
completion.

**Fix.** `signal` is threaded from `queryFn` through `fetchMarketQuote` into
`fetchWithTimeout`. `isAbortError` re-throws aborts rather than swallowing them
into `null`, so Query records a cancellation instead of caching an empty quote.

### P2-01 — Reminder-log writes blocked the reminder pipeline

**File:** `providers/CreditCardBillsProvider.tsx` (`writeReminderLog`).

**What it is.** A best-effort diagnostic log was awaited like a real write, so
offline it stalled `reconcileBillReminders`, which runs on every bill change and
on every foreground.

**Fix.** Committed with `graceMs: 0` and a no-op late-failure handler — fire, log
locally, never block.

### P3-01 — ESLint is not configured in this repo

`package.json` has no `lint` script, no ESLint dependency, and there is no
`eslint.config.*` / `.eslintrc*`. `.github/workflows/pr-checks.yml` runs Vitest
and two typecheck passes only. **ESLint could not be run for this audit.** Out of
scope to add here (it is not a network/offline problem), but it means unused
imports and similar are caught only by `tsc`.

---

## Behaviour verified against the requested scenarios

| Scenario | Before | After |
| --- | --- | --- |
| No internet | Save hangs forever, no feedback | Save completes locally, "— offline, will sync", banner shows pending count |
| Slow internet | Same hang; unbounded third-party fetch | 1.5s ack grace then queued; 8s HTTP timeout |
| API timeout | OpenFoodFacts could hang indefinitely | Aborted at 8s, `null` returned, caller shows its error state |
| API failure | Handled (`null` returns, toasts) | Unchanged, plus aborts distinguished from failures |
| Network interruption mid-write | Could split a two-write transaction | Atomic `writeBatch` for every dependent pair |
| Auth expiration | Silent; stale data forever | One throttled "session expired" toast; listener errors classified |
| Backgrounded during request | Polls kept firing | `focusManager` pauses polls; writes stay queued and durable |
| Duplicate requests | Stuck spinner invited re-submission | Root cause removed; SMS dedupe keys already persisted pre-write |
| Failed transaction | Late failures could be unhandled rejections | Routed to `onLateFailure` → log + toast |
| Retry behaviour | Near-instant retry, mutations retryable | Exponential backoff capped at 15s; mutations never auto-retried |
| Request cancellation | None | `AbortSignal` threaded through quotes; abort on unmount/supersede |
| Stale data | Cache served silently on auth failure | Auth failures surfaced; offline stays silent by design |
| Synchronization | Firestore queue + pending count (already sound) | Unchanged; now correctly surfaced by writes that return |

---

## Files changed

**New**
- `lib/firestoreWrite.ts` — `commitWrite`, `writeSavedMessage`
- `lib/firestoreWrite.test.ts` — 8 tests
- `lib/firestoreErrors.ts` — `handleSnapshotError` and classifiers
- `lib/firestoreErrors.test.ts` — 5 tests
- `lib/fetchWithTimeout.ts` — shared HTTP timeout/abort
- `lib/queryNetworkBinding.ts` — NetInfo/AppState → TanStack Query

**Modified**
`app/_layout.tsx` · `components/ExpenseForm.tsx` · `components/ExpenseList.tsx` ·
`providers/FinanceDataProvider.tsx` · `providers/CreditCardBillsProvider.tsx` ·
`services/ledger/createLedgerTransaction.ts` · `services/sms/smsExpenseWriter.ts` ·
`services/marketDataService.ts` · `services/openFoodFactsService.ts` ·
`hooks/useMarketQuotes.ts` · `useReceivables.ts` · `useBorrowings.ts` ·
`useSplits.ts` · `useVaults.ts` · `useVaultExpenses.ts` · `useInvestments.ts` ·
`useSubscriptions.ts` · `useFinancialGoals.ts` · `useCategoryBudgets.ts` ·
`usePaymentRequests.ts` · `useTrips.ts` · `useSpaces.ts`

---

## Remaining concerns

1. **Non-money write paths still await the server ack (P1, follow-up).** The
   `commitWrite` sweep deliberately covered every collection that holds money.
   These files still `await` writes directly and will hang their own UI offline:
   `hooks/useCategories.ts` (10 sites), `hooks/useNutrition.ts` (6),
   `hooks/useSips.ts` (7), `hooks/usePortfolio.ts` (17 — mock-trading and
   watchlist), `hooks/useCategorizationRules.ts` (2), `hooks/useFocusMode.ts` (2),
   `lib/ensureCategoryHierarchy.ts` (4), `providers/SettingsProvider.tsx` (1),
   `components/onboarding/SetupWizardModal.tsx` (3), `app/(app)/settings.tsx` (1),
   `services/sms/smsRecurringSync.ts` (1). The fix is mechanical and identical.
   `usePortfolio` is the one to do first — it is money-adjacent, and its
   `executeMockBuy`/`executeMockSell` paths carry the same non-atomic
   multi-write shape as P0-03.

2. **`PayCreditBillModal` writes across two subsystems.** It calls
   `addPayment` (an `AccountPayment`) and then `onPaid` → `applyPaymentToBill`
   (the bill's `amountPaid`). Both are now individually queued and non-blocking,
   but they are separate commits: an interruption between them records the
   payment without advancing the bill. Making this atomic means a batch that
   spans `FinanceDataProvider` and `CreditCardBillsProvider`, which is a
   refactor beyond this audit's scope.

3. **Late write failures are reported, not repaired.** If a queued write is
   rejected by the server after the app has already told the user it was saved
   (rules change, quota), the user gets a toast — there is no reconciliation
   view listing writes that failed to sync. A "pending / failed changes" screen
   backed by the existing `syncStatusStore` would close this.

4. **The 1.5s ack grace is a heuristic.** On a very slow but working connection a
   write may be reported as "offline, will sync" and then ack a second later. The
   message is never *wrong* (it did sync), just pessimistic. Tunable via
   `SERVER_ACK_GRACE_MS`.

5. **`OfflineBanner` counts only the seven `FinanceDataProvider` collections.**
   Queued writes to receivables, borrowings, splits, vaults, trips and spaces are
   durable but invisible in the pending count, so the banner can read "All
   Synced" while those are still in flight.

6. **No automated offline test coverage.** The new units are tested, but nothing
   exercises a real Firestore emulator with the network toggled. Verification of
   the scenarios above is manual (see below).

---

## Manual testing guide

**Commands needed:** none beyond a normal run — every change is JS and hot-reloads.

```bash
npx expo start
```

Re-running the checks:

```bash
npm run typecheck && npm run typecheck:shared && npm test
```

### 1. Offline write completes and is labelled (P0-01)
1. Open the app signed in, let the ledger load.
2. Enable **Airplane mode**. The red "No Internet Connection" pill appears.
3. Add an expense (₹450, any category) → **Save Expense**.
4. **Expect:** the sheet closes within ~1.5s, toast reads
   *"Expense logged — offline, will sync"*, the expense appears in the list, and
   the banner badge shows a pending count of 1.
5. Turn Airplane mode off. **Expect:** amber "Syncing 1 change…", then green
   "Back Online — All Synced!".
6. Check Firestore console: **exactly one** expense document.

### 2. No duplicate on impatient re-entry (P0-01)
1. Airplane mode on. Add an expense and save.
2. Immediately add the *same* expense again and save.
3. Go online. **Expect:** two documents — because you deliberately entered two.
   The point of the test is step 1's toast: you were told the first save worked,
   so the accidental double-entry that used to be inevitable is now a choice.

### 3. Atomic repayment (P0-03)
1. Create a "money lent" record of ₹20,000.
2. Airplane mode on. Record a ₹5,000 repayment.
3. **Expect:** toast *"Repayment recorded — offline, will sync"*, and the
   receivable card immediately shows ₹15,000 outstanding (the batch applies to
   the local cache as one unit).
4. Go online. **Expect:** server state matches — repayment present *and*
   `outstandingAmount: 15000`.

### 4. Offline cascade delete is refused (P0-04)
1. Airplane mode on.
2. Try to delete an account that has expenses against it.
3. **Expect:** *"Can't verify linked transactions while offline. Try again when
   connected."* and the account is **not** deleted.
4. Go online, retry. **Expect:** the normal "N linked records exist" refusal, or
   a successful delete if genuinely unlinked.

### 5. Polling stops when offline / backgrounded (P1-01)
1. Open a portfolio/investments screen with live quotes, watch the Metro logs.
2. Airplane mode on. **Expect:** quote requests stop within one poll interval —
   no repeating failure logs.
3. Airplane mode off. **Expect:** a refetch fires promptly on reconnect.
4. Online again, background the app for a minute. **Expect:** no polls in the
   logs while backgrounded; a refetch on resume.

### 6. Third-party timeout (P1-04)
1. Nutrition → barcode scanner, on a very slow/captive network (or throttle to
   "offline" in a web build's devtools).
2. Scan any barcode. **Expect:** the request gives up after ~8s and the screen
   shows its not-found/error state instead of spinning indefinitely.

### 7. Session expiry (P1-03)
1. Signed in on the device, change the account password from another device (or
   revoke the session in the Firebase console).
2. Return to the app and pull a screen that has live listeners.
3. **Expect:** one toast *"Your session expired. Sign in again to keep syncing."*
   — once, not once per collection.

### 8. Backgrounded mid-write (durability)
1. Airplane mode on. Save an expense.
2. Force-kill the app from the recents switcher.
3. Reopen it, still offline. **Expect:** the expense is present (Firestore's
   SQLite queue survived the kill) and still counted as pending.
4. Go online. **Expect:** it syncs, exactly once.
