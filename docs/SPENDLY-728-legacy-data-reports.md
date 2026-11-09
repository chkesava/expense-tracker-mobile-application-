# SPENDLY-728 — 682-D: read-only reports on legacy cron data

Sub-task of SPENDLY-682 ([plan](SPENDLY-682-plan.md), [tracker](SPENDLY-682-legacy-crons.md)). Branch `feature/SPENDLY-728-legacy-data-reports`.

Both scripts are **read-only**: there is no `--apply` and nothing is written. They show users as hashes (`u#…`, the read model's `hashUid`), so a report can be pasted into Jira or docs. Any repair is a separate ticket with a dry run and the owner's approval.

## SIP drift — `scripts/report-sip-drift.ts`
```
GOOGLE_APPLICATION_CREDENTIALS=<read-only SA json> npx tsx scripts/report-sip-drift.ts [--uid=<uid>] [--out=sip-drift.md]
```
- **Source of truth:** the executed `sipTransactions` rows. For every user with SIP data the report checks three things against them.
- **Funds:** executed units and ₹ vs the app's `virtualPositions` vs the legacy `virtualPortfolio`. The legacy id is the quote key with non `[A-Za-z0-9_-]` characters replaced by `_`.
- **Plans:** stored `totalUnits` / `totalInvested` / `executionCount` vs the plan's own executed rows. The legacy cron wrote the *fund's* totals onto the plan, which is wrong when two plans share a fund.
- **Double executions:** one plan and date with more than one executed row, e.g. a legacy random-id row plus an app `{sipId}_{date}` row.
- **Row counts:** executed rows with app ids vs legacy random ids, plus failed and skipped.

Rules: `scripts/lib/sipDriftReport.ts`.

## Duplicate bills — `scripts/report-duplicate-bills.ts`
```
GOOGLE_APPLICATION_CREDENTIALS=<read-only SA json> npx tsx scripts/report-duplicate-bills.ts [--uid=<uid>] [--out=duplicate-bills.md]
```
- **Groups:** bills by card and statement date.
- **Classification:** each bill is the app's deterministic id `${accountId}_${statementDate}` or a legacy random id, and its status.
- **The app's verdict:** what `collectCreditBillDuplicateResolutions` (the rule both the bill pass and the server bill job apply) would **keep** or **cancel**.
- **Legacy-only bills:** open random-id bills with no app twin.
- **Supersedes:** the plain listing in `scripts/detect-duplicate-credit-card-bills.js`.

Rules: `scripts/lib/duplicateBillsReport.ts`.

## Guard note
The push guard (`readmodelServerPush.test.ts`) treats any file with `.set(` near a `users/${uid}/…` path as a Firestore writer. The CLIs group docs with `groupInto` (in the pure library) instead of `Map.set`, so they aren't false positives. No allowlist entry was needed.

## Verification
- **Unit tests:** `scripts/legacyDataReports.test.ts` (4) covers:
  - legacy ids and app ids;
  - drift in funds, plans and double runs with the counts;
  - a clean user;
  - duplicate classification and verdicts (the report heading is the user tag);
  - the uid guarantee: `hashUid` gives a `u#` tag without the uid, and both CLIs pass only `hashUid(u)` to the report.
- **Emulator:** both CLIs ran end to end on the emulator. Duplicate bills: 1 user, 4 bills, 0 legacy ids. SIP drift: 0 users with SIP data. Both match the demo data.
- **Typecheck:** temporary config extending `tsconfig.json`, clean.
- **Production run: NOT done by the agent.** The session's permission settings blocked production reads. The owner runs both commands above with the read-only service account and reviews them; this is the acceptance step of the ticket.
