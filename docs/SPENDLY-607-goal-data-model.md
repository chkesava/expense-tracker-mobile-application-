# SPENDLY-607: Goal architecture and backward-compatible data model

Part of SPENDLY-606 (tracker: `docs/SPENDLY-606-save-goals.md`).

## What this story delivers
- **Architecture record:** `docs/features/save-goals/IMPLEMENTATION_PLAN.md`. It covers:
  - the consumer map;
  - the data contract;
  - the integrity rules the Firestore rules will mirror;
  - the legacy-upgrade and rollback plan;
  - the read-model plan;
  - the FRD map, story order, cost estimate and risks.
- **Types:** `shared/types/goal.ts` adds statuses, event types, reasons, icons, limits, milestone, reminder and image shapes, and `GoalEvent`. `FinancialGoal` in `shared/types/expense.ts` now extends the optional `GoalV2Fields`.
- **Pure logic** (no Firebase or React):
  - `shared/utils/goalModel.ts`:
    - name cleaning, normalization and the lock key;
    - amount validation and parsing;
    - status defaults and the legacy check;
    - progress and surplus;
    - sorting with pinning, and tabs.
  - `shared/utils/goalLifecycle.ts`: the transition table and available actions. There is no delete.
  - `shared/utils/goalMilestones.ts`: defaults, validation, derived reached state, and deterministic crossing events.
  - `shared/utils/goalReconcile.ts`: the `openingAmount + Σ amountDelta == currentAmount` check and correction helpers.
  - `shared/utils/goalWrites.ts`:
    - one builder per user action (create, edit, contribution/reduction, correction/reversal, target, status, milestones, settings), each with the legacy upgrade folded in;
    - `goalWritePlanToOps`, which builds one outbox batch with injected sentinels and stamps `createdAt`/`updatedAt`.

## Acceptance criteria → evidence
| AC | Evidence |
|---|---|
| Architecture note lists current consumers and the data contract | Plan §1–§2, §6 |
| Existing goals stay readable during rollout | `goalLegacyCompat.test.ts`: optimizer snapshot and calendar output are identical for legacy and v2 docs. Legacy docs read as active with `openingAmount = currentAmount` |
| No full-history scans for summaries; history paginated | The summary carries everything the list needs (plan §7). History only via cursor pages (609) |
| No changes to account balances or ledger | `goalWrites.test.ts` "only ever touches goal collections" covers every builder's ops |
| Migration and rollback tested on representative legacy documents | `goalWrites.test.ts` "legacy upgrade on first write" (amount unchanged, reconciles before and after, settings-only upgrade, legacy rename) and an in-memory multi-step sequence that stays reconciled after every write. Rollback = flag off; pinned by the compat test |

## Not in this story
- No runtime behaviour changes. Nothing calls the new builders yet; that starts in 608.
- No rules, indexes or read-model migration yet (608/609).
- The read-only legacy dry-run report script moves to 615, because it needs production read credentials. The upgrade itself needs no backfill.

## Tests
- `npx vitest run shared/utils/goal{Model,Lifecycle,Milestones,Reconcile,Writes,LegacyCompat}.test.ts`: 74 tests.
- Full `npm test`, `npm run typecheck:shared` and `npx tsc -p tsconfig.json --noEmit`: results are in the commit's Jira comment.
