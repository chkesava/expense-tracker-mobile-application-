# SPENDLY-613: Offline sync, idempotency and cross-device conflict handling

Part of SPENDLY-606. Tracker: `docs/SPENDLY-606-save-goals.md`. Design: `docs/features/save-goals/IMPLEMENTATION_PLAN.md` §2.4.

The guarantees were built in 607–609, where every goal write is one outbox batch that rules check write by write. This story makes the sync state visible, makes failures recoverable, writes down the conflict policy, and tests offline/online transitions, duplicate delivery, simultaneous devices and partial failures.

## What is guaranteed (and what isn't)
| Situation | Behaviour | Where |
|---|---|---|
| Offline save on **native** | Durable. Firestore's native cache is memory-only, so the batch is first journalled in the AsyncStorage outbox (`lib/commitMutations.ts`, **cap 100 entries**) and replayed on the next sign-in. Past the cap, saving is refused with a clear error, never dropped silently | 608 (existing outbox) |
| Offline save on **web** | Durable in IndexedDB (Firestore persistent cache) | existing |
| Process restart | The outbox replays. For goal batches (`goalEvents`/`goalNames` are create-only), replay first checks the ack doc, so a batch that already landed isn't re-sent | 608 |
| Duplicate delivery or a retry of the same submit | The event id is the idempotency key and events are create-only, so a second delivery is refused as a whole and the money counts once | rules (608), tests below |
| Two devices add or take out money at once | Both apply. `increment()`, with rules checking the value after the write, so no delta is lost | 609, tests below |
| Two devices edit target, name, status or milestones | The second, stale edit is **refused** (literal expected version) and shown as a conflict, never a silent overwrite | 608, tests below |
| Ordering, pin, reminders, lock | Last writer wins (preferences) | 608 |
| A reduction made stale by another device's reduction | Refused if it would go below zero, never clamped | rules, test below |
| A batch with one bad part | Nothing lands: summary, events and name lock are atomic | test below |
| A write that fails after being reported "queued" | Never silent: an error toast **plus** a retryable entry (see below) | this story |
| Sync with the read model | Goal writes produce goal rows only. No account or ledger activity | 609, `saveGoals.qa.test.ts` |

## What changed
- **Pending state:**
  - The shared goals listener now includes metadata changes and exposes `pendingGoalIds` (`ExpenseReferenceDataProvider` → `useFinancialGoals`).
  - Goal cards show "Waiting to sync", and so does the goal page (polite live region).
  - Timeline entries already showed it (609).
- **Recoverable failures:**
  - **`lib/goalSyncIssues.ts`** + `hooks/useGoalSyncIssues.ts`: an in-memory store of goal writes that failed after being shown as saved or queued, one entry per submit.
  - **`components/goals/GoalSyncIssuesBanner.tsx`**, on the Goals list and each goal page, says what wasn't saved and why, with **Retry** or **Dismiss**. It is announced as an alert.
  - Retry re-runs the same intent **with the same idempotency key**, built against the **latest** goal.
- **`hooks/useFinancialGoals.ts`:**
  - Every action now builds from the latest snapshot (`fresh(goal)`), so a retry or a late build never uses a stale goal.
  - It passes `onLateFailure` through `services/goals/goalStore.commitGoalWrite` → `commitMutations`, which still removes the outbox entry first.
  - Immediate refusals use the conflict-aware wording.
- **`shared/utils/goalWriteFailure.ts`** turns a refusal into words:
  - *conflict* (a stale versioned edit): "changed on another device… Retry applies it to the latest version";
  - *refused* (an amount change): below zero or closed elsewhere;
  - *unavailable* (network);
  - *other* (`friendlyErrorMessage`).

## Acceptance criteria → evidence
| AC | Evidence |
|---|---|
| Restart or network loss never silently drops a mutation the app said was queued | Outbox journal + replay (existing tests). Late failures become a toast plus a `goalSyncIssues` entry (`lib/goalSyncIssues.test.ts`). Cap overflow refuses up front |
| Duplicate delivery is safe | Rules: "duplicate delivery of a queued write is refused as a whole and counted once", "rejects replaying the same batch". Outbox ack check (608) |
| Concurrent contribution deltas aren't lost; conflicting edits are resolved or surfaced | Rules: "simultaneous devices: deltas merge, stale edits are refused, settings are last-writer-wins" (two clients). Conflict wording: `goalWriteFailure.test.ts` |
| Sync produces no account or ledger activity | `saveGoals.qa.test.ts`, `goalWrites.test.ts` (goal paths only) |
| Tests cover offline/online transitions, retries, simultaneous devices and partial failures | Rules: partial-failure atomicity, two devices, duplicate delivery, a stale reduction refused. Unit: retry store, failure classifier |

## Tests run
See the Jira comment for this commit.

## Limitations (stated, not hidden)
- **Retry entries last for the session only.** A late failure during an outbox **replay after a restart** shows the outbox's existing "not saved after all" toast, without a Retry button, because the intent isn't serialised.
- **The emulator tests use separate clients online**, not real airplane-mode transitions. Device QA with Spendly Test (airplane mode, force-stop) is still pending.
- **Offline corrections:** a correction needs a connection (it reads the entry's corrections first, 609).
