# SPENDLY-609: Contributions, reductions, corrections and audit history

Part of SPENDLY-606. Tracker: `docs/SPENDLY-606-save-goals.md`. Design: `docs/features/save-goals/IMPLEMENTATION_PLAN.md`.

The rules for `goalEvents`, the summary-to-event link and corrections/reversals shipped in 608, together with the first writer. This story adds the user-facing amount flows, the history timeline, the history index and the Supabase read-model contract.

## What changed

### Amounts (FRD FR-03)
`components/goals/GoalAmountSheet.tsx`, opened from "Add money" / "Take out" on the goal page:
- **Quick add** of ₹100, ₹500 or ₹1,000 saves in one tap. You can also type a custom amount.
- **Reason chips** (Salary, Savings, Bonus, Gift, Other) and an optional note.
- The per-goal minimum contribution is shown and enforced.
- A reduction can't take the saved amount below zero. This is checked in the builder and in the rules.
- **Duplicate protection:**
  - The button is disabled while saving, and a ref guard catches taps that land before the re-render.
  - **One idempotency key per submit**, kept for a retry of the same submit. The event id is the key and events are create-only, so a retry of a write that already landed fails instead of applying twice.
- Copy states plainly that accounts and transactions don't change. Feedback (`acked`, `queued` or `unsafe`) comes from `writeSavedMessage`.

### Corrections (FRD FR-04)
`components/goals/GoalCorrectionSheet.tsx` is opened by "Fix" on a timeline entry.
- **Correct the amount:** a linked `correction` event records the difference.
- **Reverse it:** a linked `reversal` event uses the derived id `${original}__rev`, so an entry can be reversed only once.
- Before building the correction, `services/goals/goalStore.loadGoalCorrections` reads the entry's existing corrections fresh (`where correctionOf ==`, limit 50). The correction is then based on the entry's effective amount, even when earlier corrections sit on an unloaded page.
- The original entry never changes. A reason is optional, as is a note.

### History timeline
- **`hooks/useGoalHistory.ts`:**
  - A realtime listener on the goal's newest 25 events (`where goalId ==`, `orderBy createdAtMs desc`).
  - `loadMore` fetches older pages by cursor, and per-event pending state comes from `hasPendingWrites`.
  - It is mounted only by the goal page's History section; the list and dashboard never read history.
  - It reuses `mergeEventPages`, `pushedOutRows` and `pageMayHaveMore` from the ledger audit trail.
- **`components/goals/GoalHistorySection.tsx`:** each entry shows its title, signed amount (ghost-mode aware), reason/note or what changed, date, and "waiting to sync". "Fix" is offered on uncorrected amount entries of open goals.
- **`shared/utils/goalHistory.ts`:** how each of the 12 event types reads, correction eligibility, stable newest-first sorting, quick amounts and reason labels.
- **Hook actions:** `useFinancialGoals.recordAmountChange` and `correctEvent`. Both take the caller's idempotency key.

### Index
`firestore.indexes.json` gains `goalEvents (goalId ASC, createdAtMs DESC)`. **This is a production deploy and needs a diff against live first.**

### Supabase read model (user requirement; READ_MODEL_RULES R2.1)
- **Migration** `supabase-readmodel/supabase/migrations/20261029000000_readmodel_goals.sql`:
  - New tables `financial_goals` and `goal_events`: contract columns, primary key `(uid, doc_id)`, typed columns only where SQL filters or sorts, and indexes `(uid, status)`, `(uid, created_at desc, doc_id desc)` and `(uid, goal_id, created_at desc, doc_id desc)`.
  - RLS on, client grants revoked, an owner-only SELECT policy, and `grant select` to `authenticated`.
  - `create or replace` of `readmodel_sync_table_ok`, `readmodel_purge_user` (R5.1), `readmodel_live_counts` and `v_data_quality`, each restated with the two tables added.
- **Mapping:** `TableSpec`s in `shared/utils/readModel/mapping.ts`. `PUSHABLE_COLLECTIONS` follows automatically, so goal writes reach the per-write push. `current_amount` is for parity only; screens read the saved amount from Firestore (R4).
- **Tests updated:**
  - SQL table lists and counts in `tests/assert_security.sql`, `rls_behaviour.sql` and `purge.sql`.
  - `scripts/readmodelMigrations.test.ts` now checks every RLS loop, not just the first.
  - `readmodelSyncCore.test.ts`, `readmodelVerify.test.ts`, `pushRefs.test.ts` and `readmodel-identity-check.ts`.
  - Goal and event mapping tests (legacy goal, unmapped amount).
- **Perf:** synthetic goal data (20K events, 5K on one goal) and three goal queries in `tests/perf/`.
- **Nothing reads from the read model yet.** The `goals` screen key and read path come in SPENDLY-611.

## Acceptance criteria → evidence
| AC | Evidence |
|---|---|
| Contributions never create or modify transactions, balances, expenses, incomes or transfers | `saveGoals.qa.test.ts` (no such collection names in goal code); `goalWrites.test.ts` (every op path is a goal collection) |
| Duplicate retries never double-apply | Rules test "rejects replaying the same batch". Create-only events, one key per submit. Outbox ack check for goal batches (608) |
| Failed writes can't leave summary and history inconsistent | One batch per write. Rules require the linked event's delta to equal the summary change, and a non-zero event to be the goal's linked one. `goalWrites.test.ts` reconciles after every step |
| Completed goals reject contributions | Builder plus rules ("rejects contributions to a completed goal"). The UI hides Add/Take out on closed goals |
| History uses cursor pagination and never rewrites past events | `useGoalHistory` (limit 25 + `startAfter`). Events are create-only (rules test "never lets an event be edited or deleted"). Corrections are new linked events |

## Tests run
| Check | Result |
|---|---|
| `npx vitest run` | see the Jira comment for this commit |
| `npm run test:rules` | see the Jira comment |
| `firestore/saveGoals.rules.test.ts` + `personalData.rules.test.ts` | 237 passed; adds owner-only history and correction queries |
| `npx tsc -p tsconfig.json --noEmit`, `npm run typecheck:shared` | see the Jira comment |
| Read-model SQL suite on a throwaway local Postgres 18 cluster (CI uses 17): bootstrap roles + all 9 migrations, then `assert_security`, `rls_behaviour`, `sync_functions`, `purge`, `verify`, `views`, `golden`, `push`, `assert_security` | **all passed** |
| `tests/perf/run_perf.sh` (same throwaway cluster) | **passed**: goal history page p95 0.35 ms (`goal_events_uid_goal_created_idx`), quarter chunk 0.83 ms (`goal_events_uid_created_idx`), no sequential scans |
| Read-model drills (`supabase-readmodel/drills/run_drills.sh`) | **Not run**: they need a PostgREST binary, which isn't installed here. The migration is additive; run the drills before the production migration |

## Production steps (after merge, each with approval)
1. Diff the indexes against live, then deploy the `goalEvents` index.
2. Apply the read-model migration `20261029000000` to Supabase. **This must happen before** the sync/push code that knows the new tables runs (the nightly sync and `readmodel-push`); otherwise `readmodel_upsert` rejects the unknown table.
3. Run a dry-run full sync, report, then apply.

## Known limitations
- A correction needs a connection: it reads the entry's existing corrections first. A plain contribution or reduction works offline through the outbox.
- Milestone crossing events are recorded by the builders, but there is no celebration or milestone UI yet (SPENDLY-610).
- The timeline shows entries, not a running balance per row (no `resultingAmount`; see plan §2.4).
