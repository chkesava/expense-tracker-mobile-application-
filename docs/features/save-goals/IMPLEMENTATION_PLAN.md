# Save Goals: implementation plan (SPENDLY-606)

This document is the SPENDLY-607 architecture record. It describes the existing implementation, the backward-compatible data contract, how the work is split into stories, and the risks.

- **Functional contract:** `docs/Spendly_Save_Goals_FRD_v1.0(1).md`.
- **Tracker:** `docs/SPENDLY-606-save-goals.md`.

Delivery follows `docs/AGENT_WORKFLOW.md`:
- Epic branch `feature/SPENDLY-606-save-goals`, with one story branch per subtask.
- After each story the agent stops and asks before merging.
- Production rules, index, migration and function deploys need explicit approval and are run only after merge.

---

## 1. Existing architecture (inspected 2026-10-26)

| Piece | Where | Notes |
|---|---|---|
| Type | `shared/types/expense.ts` `FinancialGoal` | Fields: `id, name, targetAmount, currentAmount, deadline ("" = none), createdAt` |
| Store | `users/{uid}/financialGoals/{id}` | Flat. No history, status, `updatedAt` or index |
| Listener | `providers/ExpenseReferenceDataProvider.tsx` | One ref-counted `onSnapshot`, `orderBy(createdAt)`, no limit. Mounted only while a subscriber needs goals |
| Hook | `hooks/useFinancialGoals.ts` | `addGoal` (addDoc), `addGoalContribution` (`increment`, **no UI caller**), `deleteGoal` (deleteDoc). All via `commitWrite`, not the outbox. No edit path |
| Create/delete UI | `components/settings/SettingsSubmenus.tsx` `FinancialGoalsManager`, on `/settings/money` (Money section) | Name, target, current amount, deadline. Delete button |
| Dashboard | `components/dashboard/FinancialGoalsWidget.tsx` | Read-only, first 2 goals. "Manage" goes to `/settings/money`; "Plan funding" goes to `/goals/optimizer` |
| Goal Funding Optimizer | `app/(app)/goals/optimizer.tsx`, `hooks/useGoalFunding.ts`, `shared/utils/goalFunding*.ts` | Reads `id, name, targetAmount, currentAmount, deadline` via `snapshotGoals`. **Never writes goals** (`goalFunding.qa.test.ts` bans the literal) |
| Calendar | `shared/utils/calendarSources.ts` `goalEvents` | A deadline becomes a neutral milestone, linking to `/settings/money` |
| Decision links | `shared/utils/decisionLinks.ts` | `{kind:"goal", refId}`. A deleted goal resolves as "missing" |
| What-If | `shared/utils/whatIfGoals.ts` | Only called from its own test. QA test bans writes to `financialGoals` |
| Rules | `firestore.rules` `goalWellFormed()` + `match /financialGoals/{id}` | Only bounds the two amounts (0 ≤ v < 1e9). No hasOnly. Owner read/write/delete. Not in the catch-all. A subcollection under it would be denied |
| Rules tests | `firestore/personalData.rules.test.ts` | Two goal tests. No TS↔rules contract test |
| Read model | `shared/utils/readModel/mapping.ts` `READ_MODEL_TABLES` | Goals **not** synced |
| Account deletion | `netlify/functions/delete-account.ts` | `listCollections()` + `recursiveDelete`, so any new user collection is covered automatically |
| Seeds | `scripts/seed-emulator.js` | 2 legacy-shape goals |

### Infrastructure reused

**Writes**
- `lib/commitMutations.ts`: the outbox.
  - One `writeBatch` per call.
  - Native AsyncStorage journal (cap 100) replayed on login.
  - The ack-doc check for non-idempotent batches.
- `lib/firestoreWrite.ts`: `writeSavedMessage` gives honest `acked/queued/unsafe` copy.
- **Native persistence is memory-only.** Durability on native comes from the outbox, not the SDK cache.
- Event + summary in one batch: `services/decisions/decisionStore.ts`.
- Append-only rules precedent: `decisionEvents`, `ledgerEvents`.

**Trusted boundary**
- Cloud Functions are not deployable (Spark plan).
- Netlify functions are the only server code and run with the Admin SDK.
- **Firestore rules are therefore the trusted write boundary** for every goal invariant.

**Notifications**
- `services/creditCardBills/billReminderScheduler.ts` and `services/calendar/calendarNotificationScheduler.ts` (local `expo-notifications`, stable ids, cap).
- The in-app inbox is `providers/RemindersInboxProvider.tsx`.
- **No remote push exists** (planned in SPENDLY-222).

**Other infrastructure**
- **Files:** user files go to Supabase Storage through the `spendly-files` Edge Function (signed URLs, checks ownership through Firestore). Firebase Storage is client-write-denied.
- **Biometrics:** `hooks/useBiometrics.ts`, used by `components/PrivacyLock.tsx`.
- **Export:** `services/export/fileDelivery.ts` (`deliverCsv`, `deliverPdf`) and `shared/utils/csv.ts`.
- **Charts:** `components/charts/*` (react-native-svg, `useMotionReduced`).
- **Feature flags:** the user setting plus the `system_settings/global` pattern (`hooks/useInvestmentsEnabled.ts`).
- **Formatting:** `shared/utils/formatCurrency.ts` and `<Amount>`.
- **Errors:** `lib/errors.ts`.

---

## 2. Data contract (SPENDLY-607): additive and backward-compatible

The code is in:
- `shared/types/goal.ts`
- `shared/types/expense.ts` (`FinancialGoal extends GoalV2Fields`)
- `shared/utils/goalModel.ts`, `goalLifecycle.ts`, `goalMilestones.ts`, `goalReconcile.ts`, `goalWrites.ts`

### 2.1 `users/{uid}/financialGoals/{goalId}`: the summary
The original fields keep their names and meaning.
- `deadline` is still the optional target date, and `""` still means none.
- Every new field is optional. A legacy document is a valid v2 document with defaults.

| Field | Meaning |
|---|---|
| `schemaVersion` | `2` once the goal has an audit log. Missing means legacy |
| `version` | +1 on every write that changes amount, target, status, name or milestones |
| `lastEventId` | The event that explains the latest versioned write. Rules check that it exists in the same batch |
| `normalizedName` | Uniqueness form of the name |
| `description`, `iconKey` | Optional details. `iconKey` is from `GOAL_ICON_KEYS` |
| `image` | `{path, mimeType, sizeBytes, width, height, uploadedAtMs}` (SPENDLY-614) |
| `status`, `statusBeforeArchive` | `active`, `paused`, `completed`, `archived` or `cancelled`. Missing means active |
| `startDate`, `minimumContribution`, `currency` | Optional. `currency` comes from the display currency at creation, for future multi-currency |
| `pinned`, `sortOrder` | Ordering (last writer wins) |
| `openingAmount` | Saved amount before the audit log. **Immutable once set** |
| `lastContributionAtMs`, `completedAtMs` | Reminders/inactivity and the completion summary |
| `milestones` | Custom milestone config. Empty or missing means the defaults, 25/50/75/100% of the current target |
| `reminders` | `{frequency, time, milestoneEnabled, inactivityEnabled, inactivityDays}`. Embedded so the list costs no extra reads |
| `locked` | Per-goal device-auth lock (SPENDLY-614) |
| `createdAtMs`, `updatedAt` | Pinned creation time; server `updatedAt` on every write (READ_MODEL_RULES R1.2) |

### 2.2 `users/{uid}/goalEvents/{eventId}`: the append-only audit log
It sits at the top level per user (like `decisionEvents`), so analytics and exports can query across goals with one index, and the read model can sync it as one table.

- **Types:**
  - Amount events: `created`, `contribution`, `reduction`, `correction`, `reversal`.
  - Other events: `migrated`, `target_changed`, `status_changed`, `edited`, `milestone_reached`, `milestone_lost`, `completed`.
- **Fields:**
  - `goalId, type, amountDelta (signed; 0 for non-amount)`
  - `reason (salary|savings|bonus|gift|other)`, `note (≤500)`
  - `correctionOf`
  - `targetBefore/After`, `statusBefore/After`
  - `milestoneId/Amount`, `changedFields` (names only)
  - `actorUid`, `createdAtMs`, `createdAt`, `updatedAt`
- **Ids are idempotency keys.**
  - The UI mints one id per user submit and reuses it on retry.
  - Derived events use derived ids: `__mig` for the legacy upgrade, `${original}__rev` for a reversal (so an event can be reversed only once, ever), and `__ms_${milestoneId}` for milestone crossings.
- **Events are create-only.** They are never updated or deleted. A correction is a new event that carries the difference.

### 2.3 `users/{uid}/goalNames/{nameKey}`: name lock
- Contents: `{goalId, createdAtMs}`.
- `nameKey = "n_" + encodeURIComponent(NFKC → trim → collapse whitespace → lowercase)`.
- It is created in the same batch as the goal or rename. A rename deletes the old key; a case-only rename keeps it.
- Rules make it create-only. A concurrent or offline duplicate fails at the server and is surfaced as a late failure.
- It is not synced to the read model.

### 2.4 Integrity rules (mirrored by firestore.rules, SPENDLY-608/609)
**Reconciliation:**
- `openingAmount + Σ goalEvents.amountDelta == currentAmount` (`reconcileGoal`).
- Money is compared to the paisa, because increments of two-decimal amounts can leave binary float dust.

**Amount writes:**
- An amount write is `currentAmount: increment(Δ)` plus `version: increment(1)` plus `lastEventId = e`.
- Rules require:
  - `getAfter(goalEvents/e).amountDelta ≈ new.currentAmount − old.currentAmount` (tolerance 0.001);
  - `new.version == old.version + 1`;
  - `currentAmount ≥ 0`;
  - stored status `active` or `paused`.
- Concurrent contributions from two devices both apply, and each is validated against the post-write value, so **deltas are never lost** and the balance can't go negative.

**Edits and status changes:**
- Target, status, name and milestone writes carry a **literal** `version = seen + 1`.
- If another device moved the goal first, the stale edit is rejected (a conflict the user sees) instead of silently overwriting.
- Status moves must follow `GOAL_TRANSITIONS` (below).

**Settings and deletes:**
- `pinned`, `sortOrder`, `reminders` and `locked` are last-writer-wins and leave `version` alone.
- Delete is denied once `schemaVersion` exists. Account deletion uses the Admin SDK and is unaffected.

**Event `resultingAmount` is deliberately not stored (deviation from FRD §6).**
- Under concurrent increments the client's idea of the result can be stale.
- Storing it would either be wrong or force a transaction, and transactions don't work offline.
- The timeline shows a running total computed from the events on the page plus the summary.

**Scope of goal writes:**
- A goal write touches only `financialGoals`, `goalEvents` and `goalNames` (pinned by a test).
- It never touches accounts, ledgers, expenses, incomes or transfers.

### 2.5 Lifecycle (`shared/utils/goalLifecycle.ts`)
```
active ⇄ paused
active | paused  → completed   (only when saved ≥ target)
completed        → active      (reopen; the only way to fix a completed goal's amount)
active | paused  → cancelled;  cancelled → active
any non-archived → archived;   archived → statusBeforeArchive
```
- Amount changes are allowed only for **active and paused** goals. Paused only silences reminders.
- Completed, archived and cancelled goals reject contributions, reductions and corrections.
- There is no delete and no duplication.

### 2.6 Milestones
- **Reached state is derived** from `currentAmount` and never stored, so it can't drift.
- Each crossing in a write adds a `milestone_reached` or `milestone_lost` event with a deterministic id.
- Re-reaching a milestone later is a new event; the earlier achievement stays in history.
- Celebrations fire once per event id, only on the device that wrote it (SPENDLY-610).

### 2.7 Legacy goals: lazy upgrade, no backfill
- There is no bulk migration, so nothing mutates production without approval.
- A legacy goal is upgraded by the **first Save Goals write that touches it**, in the same batch:
  - `schemaVersion: 2`
  - `openingAmount = currentAmount` (rules check that it equals the stored value)
  - `normalizedName` plus the `goalNames` claim
  - the default `status`
  - a `migrated` event with delta 0
  - version 1
- The saved amount never changes.
- **Repeatable:** a goal is either legacy or not. The upgrade can't run twice because the second attempt sees `schemaVersion`.
- **Duplicate legacy names:** the claim fails and the UI asks for a rename. No amount is affected.
- **Old installed builds:**
  - Rules keep accepting the old write shape while `schemaVersion` is missing, so old builds keep working until users update.
  - Once a goal is upgraded, an old build can no longer edit or delete it, because its writes don't satisfy the v2 rules. This is acceptable and noted in the release notes.
- **Rollback:**
  - Turn off the `enableSaveGoals` flag.
  - Every existing consumer still reads the same summary fields, which `goalLegacyCompat.test.ts` pins.
  - Upgraded documents stay valid for old readers.
- **Read-only dry-run report (SPENDLY-615):** counts legacy goals, duplicate normalized names and out-of-bounds amounts per user. It writes nothing.

---

## 3. Supabase read model (user requirement)
This section follows `docs/READ_MODEL_RULES.md`.

**What syncs:**
- `financialGoals` syncs to `financial_goals`.
- `goalEvents` syncs to `goal_events`.
- `goalNames` is not synced.

**Writes (R1):**
- Firestore only.
- Every goal and event op stamps `createdAt`/`updatedAt` (`goalWritePlanToOps`, tested).
- Writes go through `commitMutations`, so the per-write push (SPENDLY-583) sees them once the collections are in `READ_MODEL_TABLES`.

**Contract (R2.1), in SPENDLY-609, the story that creates `goalEvents`:**
- Additive migration with the contract columns, primary key `(uid, doc_id)`, RLS, an owner-only SELECT policy and a grant.
- Typed columns:
  - goals: `name, status, target_amount, current_amount, deadline, created_at_ms, pinned`
  - events: `goal_id, type, amount_delta, reason, created_at_ms, correction_of`
- Indexes `(uid, created_at_ms)` and `(uid, goal_id, created_at_ms desc)`.
- `TableSpec`s, purge coverage, security/RLS SQL lists, a sync-core test, perf queries and drills.

**Reads (R3), in SPENDLY-611:**
- Screen key `goals` in `READ_MODEL_SCREENS`, covering analytics, exports and older history pages.
- The default is `firestore`, with a bounded Firestore fallback, shadow comparison, badge, overlay and loopback.
- Totals are computed by TypeScript helpers over the returned rows.

**Stays on Firestore (R4):** the saved amount, progress, the list, the Dashboard widget and the first timeline page. The read-model `current_amount` is for parity only.

**Production order (after merge, each step with approval):**
1. Migration.
2. Sync/push code.
3. Dry-run full sync, then report, then apply.
4. Screen flip only after the 14-day parity gate → 7 days in shadow → approval (R3.9).

---

## 4. FRD → implementation map

| FRD | Story | Implementation |
|---|---|---|
| FR-01 create/edit, unique name, optional dates, minimum | 607 model, 608 UI and rules | `buildCreateGoal`/`buildEditGoal`; `goalNames` lock in rules |
| FR-02 tabs, sorting, pin and order, dashboard section, empty state | 608 | `goalTab`, `sortGoals`; `app/(app)/goals/index.tsx`; widget |
| FR-03 quick/custom amounts, reasons, note, minimum, reduce ≥ 0 | 607 model, 609 UI and rules | `buildAmountChange` |
| FR-04 audit log, corrections and reversals, cursor history | 607 model, 609 | `goalEvents`, `buildCorrection`, paginated timeline |
| FR-05 target changes, surplus, ask to complete | 607 model, 608/610 UI | `buildTargetChange`, `goalProgress.surplus` |
| FR-06 lifecycle, no delete, completed rejects contributions | 607 model, 608 rules | `goalLifecycle.ts`; rules deny delete for v2 goals |
| FR-07 milestones, re-achievement, no duplicates | 607 model, 610 | `goalMilestones.ts`, deterministic ids |
| FR-08 completion experience, reduced motion | 610 | Completion summary; celebration gated on `useMotionReduced` |
| FR-09 analytics | 611 | `goalAnalytics.ts` through the read path |
| FR-10 CSV/PDF export | 611 | `goalExport.ts` + `fileDelivery` |
| FR-11 reminders, inactivity, estimates | 612 | Local notifications + inbox. **Remote push deferred to SPENDLY-222** |
| FR-12 images | 614 | `spendly-files` extended to goal paths (**Edge Function deploy**) |
| FR-13 offline and cross-device | 607 design, 613 | Outbox, increments, literal-version conflicts, pending state |
| FR-14 security, biometric lock | 608/609 rules, 614 | Owner-only strict rules, adversarial tests, `useBiometrics` |
| FR-15 accessibility | each UI story, 614 audit | Labels, live regions, 44dp targets, chart text |
| FR-16 rollout and observability | 615 | `enableSaveGoals` flag, `perfEvent`/`logQuerySnapshot`, rollback doc |

## 5. Stories and order

| # | Story | Depends on | Notes |
|---|---|---|---|
| 1 | **607** model + this doc | — | Pure `shared/` code and tests. No runtime change |
| 2 | **608** create/edit, lifecycle, Goals screens, widget, flag, rules for summary + names | 607 | Adds `/goalEvents/` to the outbox's non-idempotent paths (replay safety for create batches) |
| 3 | **609** contributions, corrections, timeline, `goalEvents` rules, index, read-model tables | 608 | Index and migration deploys come after merge |
| 4 | **610** milestones and completion | 609 | |
| 5 | **611** analytics and exports via the read path | 609 | |
| 6 | **612** reminders and estimates | 609 | Remote push → SPENDLY-222 |
| 7 | **613** offline status, conflicts, sync tests | 609 | |
| 8 | **614** images, biometric lock, a11y, adversarial rules | 608/609 | Edge Function deploy |
| 9 | **615** QA, read measurement, dry-run report, rollout | all | |

The rules and offline foundations ship *with* the stories that first write the data (608/609), because financial integrity cannot wait for 613/614. Those later stories then add the visible sync state, adversarial suites, images and the lock.

## 6. Consumer changes planned for later stories
These are behaviour changes made deliberately in 608, not in 607:
- **Optimizer:** `snapshotGoals` should skip completed, archived and cancelled goals, so closed goals don't get funded.
- **Calendar:** `goalEvents` should skip archived and cancelled goals, and link to `/goals/{id}`.
- **Dashboard widget:** active and paused goals only, pinned first.
- **`useFinancialGoals.deleteGoal`:** becomes archive. `addGoalContribution` routes through `buildAmountChange`.
- **Decision links:** goals are no longer deleted, so links stop resolving as "missing".

## 7. Performance and Firestore cost
**Reads:**
- The list, dashboard, optimizer and calendar keep using the **single existing summary listener**. It costs one read per goal on attach and one per changed goal, with no extra reads per goal.
- History is read only on the goal detail screen: 25 events per page, by cursor.
- Analytics and exports run a bounded date-range query in chunks of 500, or read from the read model once flipped.
- The completion estimate needs one bounded query, 90 days of the goal's events, only on the detail screen.

**Writes:**
- A contribution costs 1 summary update + 1 event + 0–N milestone events + the outbox ack doc. That's 3–4 writes, in one batch.
- `getAfter` lookups in rules are billed as reads: 1 per amount write, plus 1 when a name is claimed.

**Indexes:**
- `goalEvents (goalId ASC, createdAtMs DESC)`.
- Single-field `createdAtMs` is automatic.
- Diff `firestore.indexes.json` against live before deploying.

## 8. Risks and open items
1. **Old builds after upgrade** (above). Release the new build before encouraging use of the new screens.
2. **Duplicate legacy names** block that goal's upgrade until it is renamed. The UI must explain this (608).
3. **Milestone crossings are computed from this device's view.** Under concurrent offline writes from two devices a crossing can be recorded slightly early or late. The current reached state is still exact because it is derived. Documented, not hidden.
4. **Offline durability on native** is the outbox: 100 entries in AsyncStorage. Past that, saves are refused with a clear error. The SDK cache is memory-only.
5. **Remote push does not exist.** "Push" in FR-11 is local scheduled notifications. Cross-device milestone alerts wait for SPENDLY-222.
6. **Biometric lock is a device privacy feature.** The data is still readable by the owner through Firestore, as all of their data is.
7. **Production steps requiring approval:** the rules deploy, the index deploy, the read-model migration and sync deploy, and the `spendly-files` Edge Function deploy.
8. **Drift:** `.claude/spendly_epic_execution_roadmap.md` is not present in this checkout, and the FRD is in `docs/` rather than `docs/features/` as the task prompt said.
