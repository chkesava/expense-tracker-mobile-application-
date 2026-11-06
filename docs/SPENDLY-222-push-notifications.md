# SPENDLY-222: Spendly push notifications (epic tracker)

**Epic:** [SPENDLY-222](https://kesavach.atlassian.net/browse/SPENDLY-222)
**Branch:** `feature/SPENDLY-222-push-notifications`, in worktree `C:\dev\worktrees\spendly-222`. Cut from `origin/main` 73db1556 on 2026-11-06.
**Plan:** [SPENDLY-222-plan.md](SPENDLY-222-plan.md)
**Scope:** Spendly (Expense) only, since 2026-11-06. Ganesh story 228 and SMS story 232 have been removed from the epic.

## Stories (in working order)

| Story | Title | Blocked by | State |
|---|---|---|---|
| [691](https://kesavach.atlassian.net/browse/SPENDLY-691) | Clear local reminders on sign-out / account switch | — | In Progress: built on `feature/SPENDLY-691-signout-clear-reminders`, awaiting review and merge ([doc](SPENDLY-691-signout-clear-reminders.md)) |
| [223](https://kesavach.atlassian.net/browse/SPENDLY-223) | Push credentials (Expense app) | — | To Do |
| [224](https://kesavach.atlassian.net/browse/SPENDLY-224) | Device registration | 223 | To Do |
| [226](https://kesavach.atlassian.net/browse/SPENDLY-226) | Preferences + one delivery window | — | To Do |
| [227](https://kesavach.atlassian.net/browse/SPENDLY-227) | Push sender (transport) | 224, 226 | To Do |
| [692](https://kesavach.atlassian.net/browse/SPENDLY-692) | Reminder engine (send-time re-check, ledger) | 227 | To Do |
| [230](https://kesavach.atlassian.net/browse/SPENDLY-230) | Tap routing + unified inbox | — | To Do |
| [231](https://kesavach.atlassian.net/browse/SPENDLY-231) | Credit card bill reminders via push | 692 | To Do |
| [693](https://kesavach.atlassian.net/browse/SPENDLY-693) | Local → push handover (no duplicates or stale reminders) | 692, 231 | To Do |
| [694](https://kesavach.atlassian.net/browse/SPENDLY-694) | Financial calendar reminders via push | 692 | To Do |
| [695](https://kesavach.atlassian.net/browse/SPENDLY-695) | Dues via push (borrowings, receivables, subscriptions, EMIs) | 692 | To Do |
| [696](https://kesavach.atlassian.net/browse/SPENDLY-696) | Save goal reminders via push | 692 | To Do |
| [229](https://kesavach.atlassian.net/browse/SPENDLY-229) | SIP + EPF events | 227 | To Do |
| [697](https://kesavach.atlassian.net/browse/SPENDLY-697) | Shared splits and vaults activity | 227 | To Do |
| [698](https://kesavach.atlassian.net/browse/SPENDLY-698) | Price alert push | 227, SPENDLY-625 | To Do |
| [225](https://kesavach.atlassian.net/browse/SPENDLY-225) | Contextual permission prompt + recovery | — | To Do |
| [233](https://kesavach.atlassian.net/browse/SPENDLY-233) | QA, monitoring, rollout | all | To Do |

## Decisions

- **2026-11-06:** The epic branch and worktree were created.
- **2026-11-06:** The user rescoped the epic to Spendly only, covering every reminder and important event, each of which must stop once its reason is gone.
  - New stories 691 to 698 were created.
  - 228 (Ganesh) and 232 (SMS, removed in SPENDLY-486) were taken out of the epic.
  - Their stale Blocks links to 227, 230 and 233 need removing by hand in Jira.
- Open decisions D1 to D9 are listed in the plan, §6.

## Pending deploys

None yet.
