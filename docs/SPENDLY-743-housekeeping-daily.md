# SPENDLY-743 — Small background passes on the server

Story in epic **SPENDLY-735**, audit items A3, A6 and A12. Branch `feature/SPENDLY-735-remaining`.

## Moved to the server: `housekeeping-daily`
`scripts/housekeeping-daily.ts` + `scripts/lib/housekeepingDailyCore.ts`. It runs at 08:30 IST through the Worker, gated by `HOUSEKEEPING_DAILY_ENABLED`, with one atomic batch per user.

- **A3, accidental account baseline (SPENDLY-597/603):** a `balanceAsOfDate` of today or later (`isAccidentalBalanceBaseline`, in the user's zone) is cleared. The update applies only if the account is unchanged since read. Before, `FinanceDataProvider` checked on every accounts snapshot and wrote from the phone.
- **A6, logging streak (`stats/summary`):** the app's `buildLoggingStreakUpdate`, written only when it changed. Before, `useGamification` wrote it from the dashboard on every expense change.
  - The current streak counts back to the first gap, so the job reads recent expenses (`date >=`, 31 days) and doubles the window until it holds that gap, up to 372 days. The result is the same number without the whole ledger.
  - The longest streak keeps the stored maximum.
  - The widget still shows the streak live.

## Stays in the app: A12, onboarding stamps
`SetupProgressProvider` writes `users.onboarding.*` (auto-dismiss for a user with data, milestone and visited-screen stamps).
- These are UI state written in response to what the user sees or does, not a background calculation over data.
- Moving them would change onboarding behaviour, which needs the owner's UI review.
- Left unchanged; this is recorded here and in the audit.

## Guards
- **providerSwitch:** "the app writes no baseline repair or logging streak". It replaces the SPENDLY-597 copy-confirmation check, and is stricter.
- **The server-push allowlist:** `housekeepingDailyCore.ts`.
- **The Worker's daily list:** `housekeeping-daily` is added.

## Tests
`scripts/housekeepingDailyCore.test.ts` (4) covers:
- clearing a baseline, with the compare-and-set precondition;
- the streak written only when it changed;
- the window widening to count an 80-day streak exactly, while a short streak needs one read;
- a batch per user, a dry run, and duress.

## Owner steps (after the epic reaches `main`)
1. Run *Housekeeping daily* as a dry run.
2. Set `HOUSEKEEPING_DAILY_ENABLED=true` and redeploy the Worker.
