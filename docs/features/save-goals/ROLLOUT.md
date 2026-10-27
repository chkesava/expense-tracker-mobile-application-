# Save Goals: rollout, monitoring and rollback (SPENDLY-615)

Epic SPENDLY-606. Design: `IMPLEMENTATION_PLAN.md`. Tracker: `docs/SPENDLY-606-save-goals.md`.

Every step below that touches production needs the user's explicit approval first (`docs/AGENT_WORKFLOW.md` §7). There is no staging: one Firebase project serves dev and prod.

## 1. Production order (after the epic reaches main)
The order matters. Each step has to land before anything that depends on it.

| # | Step | Why this order | Command / where |
|---|---|---|---|
| 1 | **Firestore rules deploy** | From 608 on, the app writes `goalEvents`/`goalNames`, which current production rules deny. **This must land before any app release or web deploy** | `firebase deploy --only firestore:rules` (runs `test:rules` as its predeploy step) |
| 2 | **Firestore indexes**: `goalEvents (goalId ↑, createdAtMs ↓)` and `goalEvents (goalId ↑, type ↑, createdAtMs ↓)` | History, estimate and achievement queries | **Diff `firestore.indexes.json` against live first** (the file is a subset of live), then deploy only these |
| 3 | **Read-model migration `20261029000000_readmodel_goals.sql`** | Must exist before any sync or push run that knows the goal tables, otherwise `readmodel_upsert` rejects them | Supabase SQL (read-model project), runbook `docs/READMODEL_RUNBOOK.md` |
| 4 | **Read-model drills** | Not run in 609 (no PostgREST here) | `supabase-readmodel/drills/run_drills.sh` |
| 5 | **Dry-run full sync, then report, then apply** | Backfills `financial_goals`/`goal_events` | Runbook. Dry run first, with approval |
| 6 | **`spendly-files` Edge Function deploy** | Accepts goal image paths (614). **Coordinate with SPENDLY-616**, which moves this function to the read-model project and touches the same files | `npm run supabase:deploy:spendly-files` |
| 7 | **Legacy report (read-only)** | Shows legacy goals, duplicate names that will ask for a rename, and invalid amounts | `FIREBASE_SERVICE_ACCOUNT=… npx tsx scripts/save-goals-legacy-report.ts --with-history` |
| 8 | **App release + web deploy** | Ships the screens, still behind the flag | Existing release workflow, `docs/AFTER_MERGE_CHECKLIST.md` |

## 2. Staged rollout (`system_settings/global`, admin-only)
| Stage | Setting | Who sees Save Goals | Exit criteria |
|---|---|---|---|
| 0: internal QA | none (dev builds and Spendly Test always on; the emulator seed sets `enableSaveGoals`) | developers | Device QA checklist (§5) passes |
| 1: internal | `enableSaveGoalsFor: [<owner uid>]` | the owner's real account | One week of use. No `financialGoals.*` errors in logs. Legacy report clean |
| 2: staged | `enableSaveGoalsFor: [ …more uids ]` | chosen users | Same, plus read counts within budget (§4) |
| 3: everyone | `enableSaveGoals: true` | all | — |

Read model: the `goals` screen key stays `firestore`. It flips only through the runbook: 14-day parity gate, then 7 days in shadow, then `supabase` with approval (READ_MODEL_RULES R3.9).

## 3. Monitoring
Everything goes through existing channels (`lib/errors.ts` logging, `lib/perf.ts` events, `lib/firestoreReadDebug.ts` read attribution). Nothing logs notes, names or amounts.

| Signal | Where |
|---|---|
| Write failures (immediate and late) | `logError("financialGoals.<scope>")`, `financialGoals.<scope>.late` |
| Write outcomes (acked, queued or unsafe; event count) | `perfEvent("goal_write", { scope, outcome, events })` |
| Duplicate prevention | Refused replays surface as `financialGoals.*.late` with `already-exists`/`permission-denied`; `goalSyncIssues` entries |
| Reads | `logQuerySnapshot`/`logDirectRead` with `feature: "goals"` and a query shape (history window, older page, estimate window, analytics range page, corrections) |
| Read-model fallbacks | `readModel.fallback.goals`, `readModel.shadow.goals` |
| Export failures | `goalAnalytics.export` |
| Reminders | `goalNotifications.schedule`/`.reconcile`/`.cancel` warnings |
| Images | `goalImage.upload`/`.cleanupNew`/`.cleanupOld`/`.remove`/`.url` |

## 4. Read cost (estimated from the queries; measure in stage 1)
| Surface | Reads |
|---|---|
| Goals list, Dashboard widget, Money section, optimizer, calendar, reminders sync, inbox | **One shared summary listener**: N goals on attach, then 1 per changed goal. **No history reads** (`saveGoals.qa.test.ts`) |
| Goal page | Summary (shared) + **25** history events (live window) + **≤ 200** events for the estimate (90 days, read once and on change) |
| Older history | 25 per page (read model when flipped) |
| Fix an entry | ≤ 50 (that entry's corrections) |
| Analytics / export | The range's events in pages of 500, **capped at 5,000** (shown when hit). Read once per range change, no listener. Read model when flipped |
| A contribution | Writes: 1 summary + 1 event + 0–N milestone events + outbox ack. Rules `getAfter`: 1–2 billed reads |

How to measure in stage 1: enable read attribution (`lib/firestoreReadDebug`), then open the list, a goal, older history and analytics, and compare the `feature: "goals"` counts with this table.

## 5. Device QA checklist (Spendly Test on the emulator, `docs/LOCAL_TEST_MODE.md`)
Record and restore `wm size`, `wm density`, nav mode and theme (memory: never `reset`).

- [ ] Create, edit, rename to a duplicate (refused), add, take out, fix and reverse; history and totals agree
- [ ] Airplane mode: add money → "Waiting to sync" → reconnect → synced. Force-stop while queued → relaunch → replayed once
- [ ] Two devices: contribute on both (both count). Change the target on one, then the other (conflict banner, Retry)
- [ ] Reach the target → prompt → complete → celebration; reduced motion on → still card and announcement
- [ ] Reminders: weekly at a time; deny permission → inbox fallback and settings link; pause the goal → reminders stop
- [ ] Photo: library and camera, replace, remove, retry with no network
- [ ] Lock: lock, background the app, unlock with fingerprint and with passcode; cancel keeps it hidden; the app stays usable
- [ ] Analytics: each range, status filters, compare; export CSV and PDF with and without notes
- [ ] TalkBack/VoiceOver pass over list, goal, sheets and analytics; largest font size; small phone width
- [ ] Legacy goal (seeded): first contribution upgrades it, the opening amount is kept, and the "History started" entry appears
- [ ] Regression: Goal Funding Optimizer plan, calendar goal deadlines, decision links to goals, dashboard, account balances unchanged

## 6. Rollback
| Level | Action | Effect |
|---|---|---|
| Screens | Clear `enableSaveGoals` and `enableSaveGoalsFor` | Goals list, page and analytics redirect to Money. Widget and Money section keep working on the same documents (`goalLegacyCompat.test.ts`, `saveGoalsFlag.test.ts`) |
| Read model | Set `readModel.goals` to `firestore` (the default) | Goal reads go back to Firestore at once |
| Reminders | Turning off the flag cancels `goal:` notifications on the next sync | — |
| Rules | **Don't roll back** while v2 goals exist: old rules would allow unaudited writes to them | Keep the 608+ rules. They also accept legacy-shape writes from old builds on un-upgraded goals |
| Data | Nothing to roll back. No backfill ran, and every v2 field is additive and readable by old builds | — |

## 7. Known limitations (carried into release notes)
- Notifications are local, per device (no remote push until SPENDLY-222).
- A correction needs a connection. Retry entries for late failures last for the session only.
- **`delete-account` has no storage phase.** Account documents and goal photos outlive account deletion. This is pre-existing and needs its own ticket.
- Old installed builds can't edit a goal once a new build has upgraded it.
- Milestone crossings under concurrent offline writes from two devices may be recorded slightly early or late; the current reached state is always exact.
