# SPENDLY-606: Save Goals (epic tracker)

**Epic branch:** `feature/SPENDLY-606-save-goals`, cut from `main` at `f16f2be2`.
**FRD:** `docs/Spendly_Save_Goals_FRD_v1.0(1).md`
**Plan and architecture:** `docs/features/save-goals/IMPLEMENTATION_PLAN.md`

| Story | Scope | Branch | State |
|---|---|---|---|
| SPENDLY-607 | Architecture + backward-compatible data model | `feature/SPENDLY-607-goal-data-model` | Merged to epic (9b5c439e) |
| SPENDLY-608 | Create/edit, lifecycle, Goals + Dashboard UI, goal/event/name rules | `feature/SPENDLY-608-goal-management-ui` | Merged to epic (b54bd78a) |
| SPENDLY-609 | Contributions, reductions, corrections, audit history, read-model tables | `feature/SPENDLY-609-contributions-history` | Built, awaiting merge approval |
| SPENDLY-610 | Milestones, completion, achievements | — | Not started |
| SPENDLY-611 | Analytics, charts, filters, CSV/PDF export (read path) | — | Not started |
| SPENDLY-612 | Reminders, estimated completion | — | Not started |
| SPENDLY-613 | Offline sync, idempotency, conflicts | — | Not started |
| SPENDLY-614 | Security, images, biometric lock, accessibility | — | Not started |
| SPENDLY-615 | QA, performance, staged rollout | — | Not started |

## Decisions
- **Extend, don't replace.** `financialGoals` stays the summary and every new field is optional. The audit log is `users/{uid}/goalEvents`, and unique names are enforced by `users/{uid}/goalNames`.
- **Firestore rules are the trusted boundary.** Cloud Functions aren't available on the Spark plan.
  - Amount changes are `increment()` + `version: increment(1)` + a linked event, checked against the post-write value.
  - Target, status and name edits use a literal expected version, so stale edits are rejected rather than merged.
- **Idempotency:** event ids are client keys minted once per submit. Events are create-only, and derived events use derived ids.
- **Legacy goals:** lazy upgrade on first write (`openingAmount = currentAmount`, plus a `migrated` event). No bulk backfill.
- **Statuses:**
  - Paused goals accept contributions.
  - Completed, archived and cancelled goals reject all amount changes.
  - Reopening is the way to fix a completed goal.
- **No delete** for upgraded goals.
- **Milestones:** reached state is derived, never stored. Crossings are recorded with deterministic ids.
- **No `resultingAmount` on events** (deviation from FRD §6; see the plan, §2.4).
- **Read model:** goals and goal events sync to Supabase (user requirement, 2026-10-26). Tables arrive in 609, read-path screens in 611, and current-state money stays on Firestore.
- **"Push" reminders** means local notifications. Remote push depends on SPENDLY-222.

- **Rules land with the first writer (608).** The `goalEvents`/`goalNames` rules and the summary↔event link moved into 608, because 608's create/edit writes already produce events. 609 adds the contribution UI, the timeline, the index and the read-model tables.
- **`nameKey` on the summary.** Rules can't recompute NFKC + URI encoding, so the goal stores its lock key and rules check that the lock points back at it. Choosing a non-canonical key only weakens the user's own name uniqueness; it isn't a security issue.
- **Screen flag:** `system_settings/global.enableSaveGoals`, off by default and on in `__DEV__` and the emulator. It gates screens only; writes always use the audited model.
- **Ordering:** accessible up/down "Reorder" mode instead of drag-and-drop (no gesture library is installed; not worth adding).

## Production steps pending (each needs approval, after merge to main)
- [ ] **Firestore rules deploy BEFORE the next app release.** From 608 on, the app writes `goalEvents`/`goalNames`, which current production rules deny (608, 609, 614).
- [ ] Firestore index `goalEvents (goalId, createdAtMs desc)`. Diff against live first (609).
- [ ] **Read-model migration `20261029000000` before** any sync/push run that knows the goal tables, then a dry-run full sync (609)
- [ ] Read-model drills (need PostgREST) before the production migration (609)
- [ ] `spendly-files` Edge Function deploy (614)
- [ ] Release build, then enable the `enableSaveGoals` flag in stages (615)
