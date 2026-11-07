# SPENDLY-222: Spendly push notifications (epic tracker)

**Epic:** [SPENDLY-222](https://kesavach.atlassian.net/browse/SPENDLY-222)
**Branch:** `feature/SPENDLY-222-push-notifications`, in worktree `C:\dev\worktrees\spendly-222`. Cut from `origin/main` 73db1556 on 2026-11-06.
**Plan:** [SPENDLY-222-plan.md](SPENDLY-222-plan.md)
**Scope:** Spendly (Expense) only, since 2026-11-06. Ganesh story 228 and SMS story 232 have been removed from the epic.

## Stories (in working order)

| Story | Title | Blocked by | State |
|---|---|---|---|
| [691](https://kesavach.atlassian.net/browse/SPENDLY-691) | Clear local reminders on sign-out / account switch | — | Merged to epic 9de24cb0 ([doc](SPENDLY-691-signout-clear-reminders.md)) |
| [223](https://kesavach.atlassian.net/browse/SPENDLY-223) | Push credentials (Expense app) | — | Merged to epic (owner FCM key upload pending) ([doc](SPENDLY-223-push-credentials.md)) |
| [224](https://kesavach.atlassian.net/browse/SPENDLY-224) | Device registration | 223 | Merged to epic (deploys pending) ([doc](SPENDLY-224-device-registration.md)) |
| [226](https://kesavach.atlassian.net/browse/SPENDLY-226) | Preferences + one delivery window | — | Merged to epic ([doc](SPENDLY-226-push-preferences.md)) |
| [227](https://kesavach.atlassian.net/browse/SPENDLY-227) | Push sender (transport) | 224, 226 | Merged to epic ([doc](SPENDLY-227-push-sender.md)) |
| [692](https://kesavach.atlassian.net/browse/SPENDLY-692) | Reminder engine (send-time re-check, ledger) | 227 | Merged to epic ([doc](SPENDLY-692-reminder-engine.md)) |
| [230](https://kesavach.atlassian.net/browse/SPENDLY-230) | Tap routing + unified inbox | — | Merged to epic ([doc](SPENDLY-230-tap-routing-inbox.md)) |
| [231](https://kesavach.atlassian.net/browse/SPENDLY-231) | Credit card bill reminders via push | 692 | Merged to epic ([doc](SPENDLY-231-bill-push.md)) |
| [693](https://kesavach.atlassian.net/browse/SPENDLY-693) | Local → push handover (no duplicates or stale reminders) | 692, 231 | Merged to epic ([doc](SPENDLY-693-local-push-handover.md)) |
| [694](https://kesavach.atlassian.net/browse/SPENDLY-694) | Financial calendar reminders via push | 692 | Merged to epic ([doc](SPENDLY-694-calendar-push.md)) |
| [695](https://kesavach.atlassian.net/browse/SPENDLY-695) | Dues via push (borrowings, receivables, subscriptions, EMIs) | 692 | Merged to epic ([doc](SPENDLY-695-dues-push.md)) |
| [696](https://kesavach.atlassian.net/browse/SPENDLY-696) | Save goal reminders via push | 692 | Merged to epic ([doc](SPENDLY-696-goal-push.md)) |
| [229](https://kesavach.atlassian.net/browse/SPENDLY-229) | SIP + EPF events | 227 | Merged to epic ([doc](SPENDLY-229-sip-epf-push.md)) |
| [697](https://kesavach.atlassian.net/browse/SPENDLY-697) | Shared splits and vaults activity | 227 | Merged to epic ([doc](SPENDLY-697-shared-push.md)) |
| [698](https://kesavach.atlassian.net/browse/SPENDLY-698) | Price alert push | 227, SPENDLY-625 | Blocked by 625. Switch hidden (`PRICE_ALERT_PUSH_AVAILABLE = false`), merged to epic |
| [225](https://kesavach.atlassian.net/browse/SPENDLY-225) | Contextual permission prompt + recovery | — | Merged to epic ([doc](SPENDLY-225-permission-prompt.md)) |
| [233](https://kesavach.atlassian.net/browse/SPENDLY-233) | QA, monitoring, rollout | all | In Progress: built (staged rollout, report, runbook, QA matrix), awaiting review and merge; the device QA is the owner's ([doc](SPENDLY-233-qa-rollout.md)) |

## Decisions

- **2026-11-06:** The epic branch and worktree were created.
- **2026-11-06:** The user rescoped the epic to Spendly only, covering every reminder and important event, each of which must stop once its reason is gone.
  - New stories 691 to 698 were created.
  - 228 (Ganesh) and 232 (SMS, removed in SPENDLY-486) were taken out of the epic.
  - Their stale Blocks links to 227, 230 and 233 need removing by hand in Jira.
- **2026-11-06:** D2 decided by the user: `devices` is dual-written to Supabase (full read-model treatment), not exempt.
- **2026-11-06:** Correction: the Firebase project is on **Spark**, so Cloud Functions can't run (`functions/` was never deployed). **D3 decided by the user: GitHub Actions cron.**
- **2026-11-06 (692):** the sender's idempotency claim (`pushSendLogs/{uid}:{slotId}`) is the delivery ledger. There is no separate `pushDeliveries` collection.
- **2026-11-06 (230):** the user decided the inbox rows (`notifications`) are dual-written to Supabase (migration 20261108).
- **2026-11-07 (694):** D8 applied: a calendar reminder's own time is honoured inside the delivery window.
- **2026-11-07:** the user chose to hide the "Price alerts" switch until SPENDLY-625 and 698 ship.
- **2026-11-07 (233):** D6 resolved: the audit doc was never committed, so its criterion is dropped. The plan and story docs record each problem and fix.
- Open decisions D1, D4, D5, D7, D9 are listed in the plan, §6.

## Pending deploys

**Every step to make push work, in order:** [SPENDLY-222-go-live-checklist.md](SPENDLY-222-go-live-checklist.md). The list below is the per-story record.

All are production changes and need approval.
- **From 224:**
  - `firestore.rules` (`devices`);
  - `firestore.indexes.json` (`devices` collection-group overrides; diff against live first);
  - Supabase migration `20261107000000_readmodel_devices.sql`.
  - Rules must be live before any build containing 224 ships.
- **From 227:**
  - `firestore.rules` (`pushConfig` and `pushSendLogs` denied to clients);
  - `firestore.indexes.json` (the `devices.token` collection-group index and the `pushSendLogs.expireAt` TTL).
- **From 692:** before setting `PUSH_REMINDERS_ENABLED=true`, run a manual dry run of `push-reminders.yml`. Secrets: `FIREBASE_SERVICE_ACCOUNT` (exists); optional `EXPO_ACCESS_TOKEN`.
- **Merge note:** Group Funds (SPENDLY-678) migration `20261106000000` restates the same SQL lists. Whichever epic reaches main second must restate them with both sets of tables.
