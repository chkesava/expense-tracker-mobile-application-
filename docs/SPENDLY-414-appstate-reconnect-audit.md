# SPENDLY-414: App Resume, Background and Reconnect Read Amplification Audit

## Objective

Find repeated Firestore reads caused by AppState transitions, auth changes, reconnects, retries and listener re-subscription. Part of the SPENDLY-406 Firestore Read Optimization epic.

## Scope decision

This story's audit found **no unbounded Firestore read amplification** from AppState/reconnect/auth transitions in the current codebase — the baseline inventory's "P2 root cause (~5% of volume)" has already been addressed incidentally by SPENDLY-409–412's other changes. Confirmed with the user: this story closes as **audit-only** (one defensive comment, full findings documented here), with no further code changes. No "duplicate background work" item found rises to a level worth the risk of touching tested billing/reminder logic for a non-read, CPU-only saving (see P3 below).

## Method

Every `AppState.addEventListener` call site in the app was located and classified by whether it triggers a Firestore read, and whether that read (if any) is bounded/throttled. Firebase Auth's `onAuthStateChanged` wiring and every provider's listener-effect dependency array were checked for auth-object-identity-driven resubscription. The `NetInfo` reconnect handler and TanStack Query's network/focus bindings were checked for redundant Firestore work layered on top of the SDK's own automatic resync.

## Findings

### P3 — `lib/queryNetworkBinding.ts`'s focus binding fires on every AppState change, not just "active" (addressed — comment added)
- `focusManager.setEventListener` subscribes to all `AppState` `"change"` events and calls `handleFocus(status === "active")` on each one. This is standard TanStack Query usage (only the `true`/active edge triggers refetch-on-focus) and is currently inert for Firestore: the only `useQuery` consumer in the app is `hooks/useMarketQuotes.ts` (external market-data API, its own `staleTime`/`enabled` gating), not a Firestore-backed query.
- **Risk**: none today. **Action taken**: added a code comment flagging that a future Firestore-backed `useQuery` added without `staleTime`/`enabled` guards would refetch on every foreground transition for free. No behavior change.

### P4 (informational, no action) — `CreditCardBillsProvider`'s two AppState handlers re-run local recompute on every foreground
- `scheduleReconcile` → `refreshReminderSchedules` (bill-reminder notification scheduling) and `scheduleAutoGenerate` → `generateAutoBills` (auto-statement generation) both run their full body on every single `"active"` transition, coalesced only by a 400ms timer, not a staleness guard.
- **Neither triggers a Firestore read.** `refreshReminderSchedules` only touches `expo-notifications` local scheduling APIs and in-memory state; a Firestore write (`addDoc` reminder log) fires only on a scheduling failure. `generateAutoBills` recomputes a fingerprint from in-memory `bills`/`expenses`/`payments` and returns early with **zero Firestore calls** when the fingerprint is unchanged from the last run (`lastAutoBillFingerprintRef`) — writes only happen when something genuinely changed.
- **Confirmed with user as out of scope**: this is real, duplicate CPU/battery work on frequent app-switching, but it is not a read-amplification problem (SPENDLY-414's actual objective), and applying the SPENDLY-412-style 5-minute staleness guard here would touch tested auto-billing/reminder logic for a non-read saving. Left alone. If the team later wants to bound CPU/battery cost of frequent app-switching specifically, this is the place to apply that pattern.

### No finding — auth token refresh does not cause listener resubscription
- `providers/AuthProvider.tsx`'s `onAuthStateChanged` callback uses `shouldIgnoreAuthUidChange` (`lib/authHelpers.ts`) — a plain `observedUid === nextUid` check — to skip `setRealUser(currentUser)` when Firebase's silent ~55-minute token refresh fires the callback with the same uid. The `User` object held in React state therefore never changes identity on a token refresh.
- Every provider's Firestore listener effect is keyed on `uid` (a primitive string), never on the whole `user` object reference — confirmed across `FinanceDataProvider`, `BorrowingsReceivablesProvider`, `ExpenseReferenceDataProvider`, `GaneshDataProvider`, `UserDocProvider`, `PrivacyPinProvider`, `GaneshSessionProvider`. One exception (`FinanceDataProvider.tsx`) depends on `[user]` but only to mirror it into a ref for later callback use — no listener attach/teardown there.
- **Conclusion**: auth-token-refresh-driven listener churn, a plausible root cause, does not occur in this codebase. Already correctly engineered around.

### No finding — reconnect does not cause redundant reads
- `providers/NetworkProvider.tsx` subscribes to both `NetInfo` (connectivity) and `AppState` (to probe `NetInfo.refresh()` on `background/inactive → active`). Both paths only update local connectivity state (`isOnline`, `connectionType`, `wasOffline`, `lastOnlineAt`) — neither calls any Firestore API. Firestore's own SDK resyncs existing `onSnapshot` listeners automatically on reconnect; nothing in the app layers a manual teardown/`getDocs` on top of that.

### No finding — no AppState handler tears down and recreates an `onSnapshot` listener
- Full list of `AppState.addEventListener` call sites and their Firestore cost:

| Location | Fires on | Firestore cost | Bounded? |
|---|---|---|---|
| `providers/ExpenseReferenceDataProvider.tsx` (SPENDLY-412) | `"active"` only | `getDocs` (spaces/categorizationRules) | Yes — 5-minute staleness guard |
| `providers/CreditCardBillsProvider.tsx` ×2 | `"active"` only | None (writes only, fingerprint-deduped) | N/A — no reads |
| `providers/NetworkProvider.tsx` | `background/inactive → active` | None | N/A |
| `providers/GaneshUploadQueueProvider.tsx` | `"active"` only | Writes only, for genuinely-pending queue jobs | Yes — job-state-driven |
| `providers/SmsReceiverProvider.tsx` | `"active"` only | None (AsyncStorage + native permission re-check) | N/A |
| `components/PrivacyLock.tsx` | both directions | None (local lock/timer state) | N/A |
| `hooks/useAppUpdate.ts` | `"active"` only | None (resets a local dismissal flag; its separate `onSnapshot` is a standing listener, not resubscribed here) | N/A |
| `lib/queryNetworkBinding.ts` | every `"change"` | None today (see P3 above) | N/A |

## Verification

- `npm test`, `npm run typecheck:shared`, `npx tsc -p tsconfig.json --noEmit` — run to confirm the one comment-only change introduces no regression.
- No manual/emulator verification needed — no behavior changed.

## Conclusion

SPENDLY-414's acceptance criteria — *"repeated resume/reconnect cycles have predictable bounded read behavior and no duplicate background work remains"* — is already met for Firestore reads specifically. The one genuine "duplicate background work" item found (P4, CreditCardBillsProvider's CPU-only recompute) is a different kind of cost than the ticket's read-amplification objective and was confirmed with the user as out of scope for this story.
