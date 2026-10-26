# SPENDLY-615: QA, performance validation and staged rollout

Part of SPENDLY-606. Tracker: `docs/SPENDLY-606-save-goals.md`. Rollout runbook: `docs/features/save-goals/ROLLOUT.md`.

## What changed
- **Staged rollout:**
  - `system_settings/global.enableSaveGoalsFor` (a uid allowlist, admin-only) for stages 1–2, then `enableSaveGoals` for everyone.
  - Implemented in `shared/utils/saveGoalsFlag.ts` and `hooks/useSaveGoalsEnabled.ts`, with tests including rollback.
- **Telemetry:** `perfEvent("goal_write", { scope, outcome, events })` on every saved goal write. It carries no amounts, notes or names. Failures already go through `logError` (608/613).
- **Read-only legacy report:**
  - `scripts/save-goals-legacy-report.ts` over a pure core, `shared/utils/goalAudit.ts`.
  - It reports legacy vs upgraded goals, duplicate names (whose upgrade will ask for a rename), amounts the v2 rules would refuse, and, with `--with-history`, reconciliation of upgraded goals against their events.
  - It prints hashed uids and goal ids only, never names, amounts or notes. A static test proves it never writes.
  - **Run on the emulator seed:** 1 user, 2 legacy goals, 0 duplicates, 0 invalid amounts.
- **Runbook:** `docs/features/save-goals/ROLLOUT.md`, covering the production order (rules before release; migration before sync), staged rollout, monitoring signals, read-cost table and how to measure it, the device QA checklist, rollback levels and limitations.

## Acceptance criteria → evidence
| AC | Evidence |
|---|---|
| Existing goals and the Goal Funding Optimizer keep working | `goalLegacyCompat.test.ts` (optimizer snapshot and calendar identical for legacy and v2; closed goals leave both). The optimizer's own QA suite still passes. Legacy writes are still accepted by rules on un-upgraded goals |
| No account balance or transaction regressions | `saveGoals.qa.test.ts` (no ledger or account collection names, writes only via `goalStore`); `goalWrites.test.ts` (goal paths only); the full suite, including every balance and ledger test, passes |
| Read counts measured; dashboard and list don't read complete histories | Read-cost table (ROLLOUT §4), per-query `feature: "goals"` attribution, static tests that dashboard/list/Money never import history hooks, and the read-model perf budget (609). **Live measurement is a stage-1 task (needs a device or production).** |
| No critical security, duplicate-write, offline-sync or accessibility defects remain | 41 Save Goals rules tests (isolation, forged amounts, immutable events, replays, two devices, partial failure, images, lock), the a11y static check and audit (614). **Device a11y and offline QA are pending** (ROLLOUT §5) |
| Rollback procedure tested; implementation docs updated | Flag rollback test (`saveGoalsFlag.test.ts`); compatibility of v2 docs with every pre-existing reader (`goalLegacyCompat.test.ts`); rollback levels documented. Docs: plan, tracker, a doc per story, runbook |

## Tests run
See the Jira comment for this commit.

## Not done (needs the user, a device or production)
- Device QA (ROLLOUT §5): TalkBack/VoiceOver, airplane mode and force-stop, two physical devices, camera, lock, notifications.
- Live read measurement (stage 1).
- **Production steps**, each with approval: rules, indexes, read-model migration and drills, sync dry run, Edge Function, release, flag stages.
- **New ticket needed:** account deletion doesn't remove `spendly-files` objects.
