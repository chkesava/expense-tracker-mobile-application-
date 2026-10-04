# SPENDLY-220: Saved funding plans and optimizer scenario lifecycle

**Ticket:** [SPENDLY-220](https://kesavach.atlassian.net/browse/SPENDLY-220) (Story)
**Epic:** [SPENDLY-213](https://kesavach.atlassian.net/browse/SPENDLY-213). See the [epic record](SPENDLY-213-goal-funding-optimizer.md).
**Branch:** `feature/SPENDLY-220-goal-funding-plans`, cut from the epic branch after 218 and merged back with approval.
**Depends on:** 218. **New data and rules:** `users/{uid}/goalFundingPlans`.

---

## 1. What users see
**On `/goals/optimizer`:**
- **A plan banner** at the top shows "Unsaved plan" or "Plan: *name*". An open plan also says *"Results are recalculated from your goals as they are today."*
- **Changes since saving:** if goals changed after the plan was saved, the banner lists them, for example *"Trip: target changed, amount saved changed"*, *"new goal since this plan was saved"*, *"goal deleted since this plan was saved"*.
- **Save plan / Update plan / Save as new:** each asks for a name, up to 80 characters, with the problem explained if it's invalid.
- **Saved plans** (the folder icon in the header) shows each plan's name, mode, goal count and saved date, flagged **Open** or **Archived** as relevant. If a plan was made with an older calculation, it says so, which is how the engine version stays traceable.
- **Actions on each plan:** Open, Rename, Duplicate, Archive or Unarchive, and Delete. Delete asks first, and the dialog says *"Only this plan is deleted. Your goals and transactions stay exactly as they are."*

**Opening a plan restores everything the plan stored:**
- the mode;
- your own monthly amount;
- the over-allocation what-if;
- every goal's plan settings.

## 2. Data (`shared/utils/goalFundingPlans.ts`)
`users/{uid}/goalFundingPlans/{id}` stores:
- `name`, `mode`;
- `plannedMonthly?`, `allowOverAllocation`;
- `inputs[]` (plan settings);
- `goalSnapshot[]` (goal values when saved);
- `engineVersion`, `archived`;
- `createdAtMs`, `updatedAtMs`.

**What `goalFundingPlanDoc` writes:**
- Only set fields, never `undefined`.
- It drops inputs for goals that have been deleted, and drops empty inputs.
- It keeps `createdAtMs` and `archived` when updating.

**Duplicates are independent:** `duplicatePlanDoc` makes a deep copy with fresh timestamps.

**Reproducibility:**
- Reopening a plan with the same goals gives the same result (tested).
- If goals have changed, the result is recalculated from today's goals, and `goalsChangedSince` says exactly what changed.

**Rule (`goalFundingPlanWellFormed`):**
- owner and duress twin only;
- `hasOnly` plus required keys, with **no ledger-shaped fields** (`amount`, `date`, `accountId`, goal amounts at the top level);
- name 1–80 characters;
- closed modes;
- bounded `plannedMonthly`;
- lists of at most 50;
- `engineVersion` an integer of at least 1;
- `createdAtMs` pinned.

**Writes** (`services/goals/goalFundingPlanStore.ts`) go through `commitMutations`, the offline outbox, so a change made offline is queued and the toast says so.

**Every write touches the plan document only.** No goal, transaction or account is ever written.

## 3. Acceptance criteria
| Criterion | How |
|---|---|
| Plans persist securely per user | Owner-only rule; emulator tests including a stranger and signed-out access |
| Editing changes only the plan | The store writes only `goalFundingPlans/{id}` |
| Deleting a plan never deletes goals or transactions | Delete removes the plan document only; the dialog says so |
| Duplicates are independent | Deep copy (tested) |
| Assumptions and version traceable | Plan settings stored; `engineVersion` stored and shown when older |
| Offline and error states handled | Outbox; toast for queued, friendly error toast on failure |
| Firebase rules prevent cross-user access | `firestore/goalFundingPlans.rules.test.ts` (5) |
| Reopening a plan gives reproducible results | Tested; goal changes listed |

**Tests:**
- `goalFundingPlans.test.ts`: 7
- `goalFundingPlan.rules.contract.test.ts`: 3
- emulator: 5

## 4. Rollout
Deploy the Firestore rules (**rules only, no indexes**) before the app. Without them, saving a plan fails with a permission error and the screen still works unsaved.

## 5. Manual testing guide
1. Set up a scenario, then **Save plan** as "Main". The banner shows "Plan: Main".
2. Change the mode, then **Update plan**; reopen it from **Saved plans** and check the mode stuck.
3. Edit a goal's target in Settings and reopen the plan. The banner lists the change.
4. Duplicate, rename, archive and delete plans. Check your goals in Settings are unchanged after each.
5. In airplane mode, save a plan. The toast says it will sync.
