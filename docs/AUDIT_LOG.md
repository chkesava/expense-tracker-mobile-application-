# Audit Log

Master index of audit passes over this codebase. Every phase gets its own report
under `docs/` and a row here, so findings stay traceable across phases instead of
being siloed in one report (or lost in a chat transcript).

| Date | Phase / scope | Report | Outcome |
| --- | --- | --- | --- |
| 2026-08-15 | Network reliability & offline behaviour | [NETWORK_OFFLINE_AUDIT_2026-08-15.md](NETWORK_OFFLINE_AUDIT_2026-08-15.md) | 4×P0, 5×P1, 1×P2, 1×P3 found; all P0/P1/P2 fixed in the same pass. 6 remaining concerns listed. |
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
