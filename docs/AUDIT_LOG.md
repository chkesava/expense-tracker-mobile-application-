# Audit Log

Master index of audit passes over this codebase. Every phase gets its own report
under `docs/` and a row here, so findings stay traceable across phases instead of
being siloed in one report (or lost in a chat transcript).

| Date | Phase / scope | Report | Outcome |
| --- | --- | --- | --- |
| 2026-08-15 | Navigation (redirects, back stack, deep links, restoration) | [NAVIGATION_AUDIT_2026-08-15.md](NAVIGATION_AUDIT_2026-08-15.md) | 2×P0, 4×P1, 2×P2 found; all fixed. 27 new tests. 6 remaining concerns listed. |
| 2026-08-15 | Network reliability & offline behaviour | [NETWORK_OFFLINE_AUDIT_2026-08-15.md](NETWORK_OFFLINE_AUDIT_2026-08-15.md) | 4×P0, 5×P1, 1×P2, 1×P3 found; all P0/P1/P2 fixed in the same pass. 6 remaining concerns listed. |
| 2026-08-15 | Error handling & resilience (landed on `main` in parallel) | [ERROR_HANDLING_AUDIT_2026-08-15.md](ERROR_HANDLING_AUDIT_2026-08-15.md) | Established `lib/errors.ts` as the required path for user-facing messages and redacted logging, plus `snapshotErrorHandler` / `LoadFailure` for listener failures. |
| 2026-09-03 | Ganesh Seva God Fund locations (Cash/UPI/Bank buckets vs. available balance) | [GANESH_GOD_FUND_LOCATION_AUDIT_2026-09-03.md](GANESH_GOD_FUND_LOCATION_AUDIT_2026-09-03.md) | 2×P0, 2×P1, 2×P2, 1×P3 found; all fixed. 5 new tests. Root cause: location buckets shipped without a backfill, blocking every God Fund spend on festivals funded earlier. |
| 2026-09-03 | Ganesh Seva full feature audit (all 56 write paths + backlog re-triage) | [GANESH_SEVA_AUDIT_2026-09-03.md](GANESH_SEVA_AUDIT_2026-09-03.md) | 7 new findings (4×P1, 2×P2, 1 context); 6 backlog tickets confirmed still open, 5 found already fixed. Headline: 4 CRITICAL firestore.rules fixes written but never deployed. 10 fixed in a follow-up pass (4 atomicity bugs + GS-020/021/023/029/033/039). 2 findings retracted as author error. Needs a firestore.rules deploy. |
| — | Credit card bill reminders (feature-scoped) | [CREDIT_CARD_BILL_REMINDERS_AUDIT.md](CREDIT_CARD_BILL_REMINDERS_AUDIT.md) | Pre-dates this index. |

## Conventions

- One markdown report per audit phase, named `<SCOPE>_AUDIT_<date>.md` or
  `PHASE_N_<topic>.md`, added as a row above.
- Each finding is logged in full: what it is, why it matters, and a concrete
  failure scenario — never a one-line label.
- Findings are ranked **P0** (data integrity / total blockage) · **P1**
  (materially broken UX or correctness) · **P2** (wasteful or degraded) · **P3**
  (hygiene).
- Audit phases are diagnostic by default. A phase only applies fixes when its
  brief says so; when it does, the report lists files changed, tests run, and
  remaining concerns.
- Each phase is committed on its own — code plus its report together — so the
  diff is reviewable in isolation.
