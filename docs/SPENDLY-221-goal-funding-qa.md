# SPENDLY-221: Goal Funding Optimizer QA, financial correctness, performance and rollout

**Ticket:** [SPENDLY-221](https://kesavach.atlassian.net/browse/SPENDLY-221) (Story)
**Epic:** [SPENDLY-213](https://kesavach.atlassian.net/browse/SPENDLY-213). See the [epic record](SPENDLY-213-goal-funding-optimizer.md).
**Branch:** `feature/SPENDLY-221-goal-funding-qa`, cut from the epic branch after 220.

**Status:** partial by agreement (2026-10-03), like the other epics.
- The code-verifiable parts are done.
- **Device QA is open:** accessibility, Android performance, offline.
- The **What-If** cases depend on SPENDLY-195.
- **221 stays In Progress, and the epic is not Done.**

---

## 1. End-to-end suite (`shared/utils/goalFunding.qa.test.ts`, 13 tests)
| Ticket case | Covered by |
|---|---|
| One goal | Target-date requirement 10,000/month, on track |
| Multiple goals; equal and different target dates | Totals and per-goal requirements |
| No surplus, negative surplus, excess capacity | 0 allocated; `capacity_non_positive`; excess left unallocated |
| Priority constraints, minimums, several constraints at once | Priority + minimums + an unranked goal, never over the pool |
| Completed goals, past target dates | `funded`; `target_date_passed` with the full remaining amount |
| One-time and recurring (current) contributions | Top-up lowers the requirement; change vs current shown |
| Growth assumptions | Lower requirement; `growth_assumed` raised |
| Month and year boundaries | 31 Dec → 29 Feb 2028: 3 contributions |
| Financial Calendar commitments | A new EMI lowers the pool from 40,000 to 25,000, and the scenario follows |
| What-If scenarios | Hook only: an adjustment is `hypothetical` and the real figure is kept. **Real What-If waits for SPENDLY-195** |

**Per-story suites:**

| Story | Test file | Tests |
|---|---|---|
| 214 | `goalFundingModel.test.ts` | 5 |
| 215 | `goalFundingCapacity.test.ts` | 7 |
| 216 | `goalFundingMath.test.ts` | 12 |
| 217 | `goalFundingOptimizer.test.ts` | 15 |
| 218 | `goalFundingView.test.ts` | 7 |
| 219 | `goalFundingInputs.test.ts` | 7 |
| 220 | `goalFundingPlans.test.ts` | 7 |
| 220 | rules contract | 3 |
| 220 | emulator (`firestore/goalFundingPlans.rules.test.ts`) | 5 |

## 2. Isolation proof
- **Goal snapshots:** the engine and the plan documents work on `snapshotGoals` copies. A test proves the source goals are byte-identical afterwards, even when a plan's snapshot is edited.
- **Static check over all optimizer code** (`app/(app)/goals`, `components/goals`, `services/goals`, both hooks, and every `shared/utils/goalFunding*` module):
  - no reference to the goal, expense, income, account, investment, transfer or calendar-reminder collections;
  - no goal, expense or account mutation API;
  - **only `services/goals/goalFundingPlanStore.ts` may write**, and it writes only `goalFundingPlans`.
- **Rules:** the `goalFundingPlans` rule rejects ledger-shaped fields, so a plan can never carry money.

The optimizer therefore can't modify goals, create transactions, change account balances, change investments, or modify Financial Calendar records.

## 3. Performance
- **Data:** 20,000 expenses and 9 months of income go into the runway baseline, then capacity, then **20 recalculations** across all four modes with 20 goals.
- **Result:** well under 2.5s in Node.
- **Recalculation is in memory:** the screen recomputes from data that's already loaded, with no Firestore reads per input change. The optimizer is memoised on its inputs.

## 4. Security and privacy
| Collection | Protection |
|---|---|
| `users/{uid}/goalFundingPlans` | Owner and duress twin only; `hasOnly` plus required keys; no ledger fields; name and list bounds; integer engine version; `createdAtMs` pinned |

Everything else in the optimizer is read-only and computed on the device.

## 5. Observability
| `lib/errors` scope | What it covers |
|---|---|
| `snapshot.goalFundingPlans` | Plan listener. A spike in permission errors means the rules weren't deployed |
| `goals.fundingPlan` | Plan save, rename, duplicate, archive and delete failures |
| `firestoreWrite.lateFailure`, label `funding plan` | Outbox writes that failed after syncing |

There's no product-usage event pipeline in Spendly today; this is noted as a limitation, the same as the calendar.

## 6. Known limitations
1. **Goals have no contribution history.** The current contribution is whatever the user enters, and is unknown when blank.
2. **What-If integration waits for SPENDLY-195.** Only the hook point, `CapacityAdjustment`, exists.
3. **Growth is a simple compound assumption.** Tax, fees and volatility aren't modelled, and the screen says so.
4. **Contributions are modelled as one per month,** on the plan's start day.
5. **Capacity uses averages** from the last 6 months. With under 3 months of history the screen warns that the figure may move a lot.
6. **There's no native date picker.** Dates are typed, as elsewhere in the app.

## 7. Rollout and rollback
**Rollout:**
1. **Deploy the Firestore rules (rules only, no indexes)** for `goalFundingPlans`, plus the runway and calendar rules from #212 and #213.
2. **Merge in order:** runway **#212**, then calendar **#213**, then this epic. It's a stacked PR.
3. Release through the normal workflow. No native module was added.
4. After release, move the stories to Done.

**Rollback:**
- **App:** revert the merge and the route and entry link disappear.
- **Data:** saved plans are additive, so there's nothing to migrate; leftover documents are inert.
- **Rules:** harmless if left in place.

## 8. Device QA checklist (open)
Use **Spendly Test** against the emulator, never the real app. Record display size, density, navigation mode and theme first, and restore exactly those afterwards.

- [ ] Run the manual guides in the 218 and 220 docs, end to end.
- [ ] **TalkBack:** capacity card, mode chips, goal rows (read as full sentences), the Why sheet, the plan settings sheet, the saved plans sheet.
- [ ] **Large font scale and both themes:** no clipping in rows, sheets or totals.
- [ ] **Android performance:**
  - [ ] with about 20 goals and a large ledger, switching modes and editing plan settings stays smooth;
  - [ ] memory stays stable after repeated navigation.
- [ ] **Offline:** save, rename and delete plans in airplane mode; check the toasts, then that they sync.
- [ ] **Isolation spot-check:** after every action, goals in Settings, account balances and the ledger are unchanged.
- [ ] **Signed release build** smoke test, backing up and restoring signing around any prebuild.
- [ ] **Deferred:** What-If scenarios, once SPENDLY-195 lands.
