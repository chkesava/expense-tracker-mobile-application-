# SPENDLY-608: Goal creation, lifecycle and Goals/Dashboard UI

Part of SPENDLY-606. Tracker: `docs/SPENDLY-606-save-goals.md`. Design: `docs/features/save-goals/IMPLEMENTATION_PLAN.md`.

## What changed

### Trusted boundary: `firestore.rules`
Firestore rules are the trusted write boundary for goals. This story adds the following, under the "SPENDLY-606 Save Goals (SPENDLY-608)" block.

**`financialGoals`**
- Two write shapes are accepted:
  - the legacy shape, only on goals that were never upgraded, so installed builds keep working;
  - the strict v2 shape (`hasOnly`/`hasAll`, bounds, enums).
- **v2 create** needs:
  - `version 1` and `openingAmount 0`;
  - a new `created` event whose delta equals the saved amount;
  - the goal's own name lock.
- **Versioned update** (amount, target, status, name or milestones) needs:
  - `version == old + 1`;
  - a **new** linked event (`lastEventId`) that explains the change.
  - Amount changes must use an amount event whose delta matches the post-write change. They are allowed only from active or paused.
  - Target changes need a `target_changed` event with before/after values. They are allowed only from active or paused.
  - Status changes must follow the transition table. Complete requires saved ≥ target, archive records `statusBeforeArchive`, and unarchive returns to it.
- **Settings-only updates** (pin, order, reminders, lock, image) leave `version` unchanged.
- **Legacy upgrade:** `openingAmount` must equal the stored amount.
- **Delete:** denied once `schemaVersion == 2`.

**`goalEvents`**
- Create-only; update and delete are denied.
- `hasOnly`/`hasAll`, `actorUid == auth.uid`, and the goal must be v2 after the batch.
- A non-zero delta is valid only on the event its goal links to.
- A correction or reversal must point at an amount event of the same goal.
- A reversal id must be `${original}__rev`, so each event can be reversed once.

**`goalNames`**
- Create-only lock. A goal can only claim a key its own `nameKey` names.
- The lock can be deleted only once the goal has moved to another key.

**Model change from 607:** the summary stores `nameKey`, because rules can't recompute NFKC normalization and percent-encoding.

### Writes
- `services/goals/goalStore.ts`: `commitGoalWrite` sends one outbox batch per builder result. `newGoalId` and `newGoalEventId` mint ids, and the event id is the idempotency key.
- `lib/commitMutations.ts`: batches that create `goalEvents` or `goalNames` are flagged non-idempotent, so replay checks the ack first. Without this, a replay of a batch that already landed would fail on the create-only rule and show a false "not saved" toast.
- `hooks/useFinancialGoals.ts` adds `createGoal`, `editGoal`, `changeTarget`, `changeStatus` and `updateSettings`.
  - The old `addGoal`, `addGoalContribution` and `deleteGoal` stay as wrappers.
  - **`deleteGoal` now archives.** There is no hard delete any more.

### Screens (behind the `enableSaveGoals` flag)
- **`app/(app)/goals/index.tsx`:**
  - Active / Completed / Archived tabs with counts, and Paused / Cancelled status chips.
  - Sorting by my order, created, progress, remaining, name or target. Pinned goals always come first.
  - A Reorder mode with accessible up/down buttons.
  - Empty state with an example and a Create goal action, plus an offline note.
- **`app/(app)/goals/[id].tsx`:**
  - Progress, remaining, and any surplus shown separately with a "Raise target" offer.
  - A "Target reached: mark completed?" prompt.
  - Details, a confirmed target change, pin/unpin, and lifecycle actions with confirmation for complete, cancel and archive.
  - No delete.
- **`components/goals/`:**
  - `GoalCard`
  - `GoalFormSheet`: name, target, starting amount, icon grid, description, start/target dates, minimum contribution.
  - `GoalTargetSheet`: two-step confirm that states the surplus.
  - `GoalIcon`
- **Dashboard widget:** shows only in-progress goals, pinned first, with "All goals" and tap-to-open.
- **Money section:** the manager lists in-progress goals. Its delete button became Archive, it has an "Open Goals" link, and double submits are guarded.

### Flag
- `system_settings/global.enableSaveGoals` comes from `hooks/useSaveGoalsEnabled.ts` and `shared/utils/saveGoalsFlag.ts`.
- It is **off by default**, always on in `__DEV__`, and seeded on in the emulator (`scripts/seed-emulator.js`).
- The flag gates screens only. Writes always use the audited model.

### Consumers
- **Optimizer (`snapshotGoals`):** only active and paused goals.
- **Calendar (`goalEvents`):** archived and cancelled goals drop out; completed goals still show as reached.

### Routes
- `goals/index` and `goals/[id]` in `app/(app)/_layout.tsx`.
- `/goals` in `SUB_SCREEN_ROUTES`.
- `/goals` in `RESTORABLE_ROUTES`. `/goals/` was already listed.
- Tests updated.

## Acceptance criteria → evidence
| AC | Evidence |
|---|---|
| Matches the Spendly theme and components; works on Android sizes and font scaling | Reuses `PageShell`/`PageHeader`/`Section`/`Chip`/`Modal`/`SheetActions`/`Input`/`DateField`/`FinancialAmount`/`ProgressIndicator`. Rows wrap, and touch targets are ≥ 44 dp. **Visual review is pending (user, local Expo web).** |
| Unique names enforced; races handled at the write boundary | `firestore/saveGoals.rules.test.ts`: duplicate name under a different spelling, create without a lock, hijacking a lock, releasing a held lock |
| Archived, cancelled and completed goals are never treated as active | `goalModel.test.ts` (`goalTab`, `dashboardGoals`), `goalList.test.ts`, `goalLegacyCompat.test.ts` (optimizer and calendar) |
| Existing optimizer route and existing goal data keep working | Legacy write shape still accepted, upgrade on first write (rules tests). Optimizer and calendar regression tests. Route registered beside `goals/optimizer` |
| No goal history fetched for list or dashboard | List, detail and widget read only the existing summary listener. No `goalEvents` read exists yet |

Covered in 608 because financial integrity can't wait for later stories: the event rules, forged-amount, negative-balance, replay and concurrency tests, and corrections/reversals at the rules level.

## Tests run
- `npx vitest run`: 464 files, 6426 tests passed.
- `npm run test:rules`: 30 files, 588 tests passed. This includes the new `firestore/saveGoals.rules.test.ts`, whose 30 tests use the real builders against the real rules.
- New unit tests:
  - `goalModel.rules.contract.test.ts` (TS ↔ rules lists, transitions, allowed fields)
  - `goalList.test.ts`, `goalForm.test.ts`
  - `saveGoals.qa.test.ts` (no account or ledger collection names; writes only through `goalStore`)
  - an outbox replay test
  - navigation and restoration tests
- `npx tsc -p tsconfig.json --noEmit` and `npm run typecheck:shared`: see the commit's Jira comment.

## Release order (after merge to main)
1. **Deploy `firestore.rules` first.** The new app writes `goalEvents` and `goalNames`, which the current production rules deny, so a release before the rules deploy would fail every goal save.
2. Then the app release.
3. Then set `system_settings/global.enableSaveGoals = true` for the staged rollout (SPENDLY-615).

## Known limitations
- The contribution and history UI arrives in 609. Until then, saved amounts change only through creation, legacy writes, or the old `addGoalContribution` (no UI caller).
- Drag-and-drop ordering uses accessible up/down buttons instead of a gesture. No drag library is installed, and adding one isn't justified for this.
- Images and the biometric lock come in 614.
