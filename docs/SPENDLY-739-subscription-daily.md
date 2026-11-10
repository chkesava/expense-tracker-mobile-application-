# SPENDLY-739 — Subscriptions, EMIs and recurring transfers post on the server

Story in epic **SPENDLY-735**, "Server-side calculations: the app only delivers". Audit item A1 ([audit](SPENDLY-735-server-calculations-audit.md)).
- Branch: `feature/SPENDLY-735-remaining`, one commit per story. The owner approved one branch for 739–747.
- Owner decision (2026-11-09): post **daily at 08:30 IST** (the Worker's 03:00 UTC run).

## Before
On launch, `ExpenseReferenceDataProvider` auto-posted due subscriptions, EMIs and recurring transfers (`processDueSubscriptions` → `services/subscriptions/duePost.ts`). It wrote:
- the charge (deterministic id);
- the subscription's processed stamp;
- the account balances (SPENDLY-523/603);
- the month's dashboard summary (SPENDLY-563);
- completion stamps.

It ran only when the app was opened. It also kept the subscriptions listener on metadata changes so it could wait for server data (SPENDLY-525).

## After
### The server job (`scripts/subscription-daily.ts`, `scripts/lib/subscriptionDailyCore.ts`)
- **The same rules:** `planDueSubscriptionPosts` / `evaluateSubscriptionDue` (shared), in the user's zone, with the same charge ids (`{subId}_{YYYY-MM}` or `_{YYYY-MM-DD}`).
- **One atomic batch per charge** through `dailyJobCore.applyJobWrites`, containing:
  - the charge, as a `create` (refused if it exists);
  - the balance ops, via `journalBalanceOpsWith`;
  - the dashboard ops, via `computeDashboardExpenseCreateOpsWith`;
  - the subscription stamp, as an update **only if the subscription is unchanged since read**.

  A refusal writes nothing, and the next run plans again on fresh data. This replaces the app's cache-first `docAlreadyWritten` check and its "server data only" wait.
- **An existing charge is never rewritten** (SPENDLY-525): only the stamp is written.
- **A charge with no account is skipped** (SPENDLY-40) and counted.
- **A finished subscription is marked completed.**
- **Finding the work:** on the Supabase read model (`findSubscriptionWorkOnReadModel`; 0 Firestore reads for users with nothing due). Named users are re-read from Firestore (R4.3a). Without the read model, or with `SUBSCRIPTION_READMODEL_FINDER=off`, every owner is checked through one collection-group read.
- **Logs:** counts only. Dry run supported.

### One copy of the accounting logic
The balance and dashboard op builders imported the client SDK's `increment`/`serverTimestamp`, so a server couldn't use them. The pure logic now lives in client-free cores that take the sentinels as a parameter:
- `shared/utils/firestoreSentinels.ts`;
- `balanceMutationsCore.ts` (`buildAccountBalanceOpsWith`);
- `dashboardMutationsCore.ts` (`buildDashboardSummaryOpsWith`, `computeDashboardExpenseCreateOpsWith`);
- `journalBalanceOpsCore.ts` (`journalBalanceOpsWith`, `accountInfoFromData`).

The app's existing functions (`buildAccountBalanceOps`, `buildDashboardSummaryOps`, `journalBalanceOps`, `accountInfoFromSnap`) bind the client sentinels and delegate, so the app's behaviour is unchanged. The server binds the Admin SDK's `FieldValue`.

### Schedule
- `.github/workflows/subscription-daily.yml`: manual runs are dry by default; cron runs need `SUBSCRIPTION_DAILY_ENABLED`.
- The Worker's daily list (`DAILY_WORKFLOWS`) is now `subscription-daily`, `sip-daily`, `bill-daily`. Subscriptions come first, so today's charges are in place before bills settle.
- The Worker change takes effect when it is redeployed.

### The app
- **Removed:** `processDueSubscriptions`, its idle trigger, the refs, toast and imports it used, and the `subscriptionsFromCache` state.
- **Deleted:** `services/subscriptions/duePost.ts` (+ test).
- **Removed:** the dead `canAutoPostSubscriptions` (+ test).
- **The subscriptions listener** no longer listens to metadata changes, which only auto-posting needed. That means fewer events.

## Guards
- `lib/readModelLocal/providerSwitch.test.ts`: "the app runs no subscription auto-post". It replaces the SPENDLY-598 check that the in-app post re-planned on Firestore, and is stricter.
- `netlify/functions/readmodelServerPush.test.ts`: `subscriptionDailyCore.ts` is allowed as a writer via `applyJobWrites`, and `subscription-daily.ts` creates the push.
- `scripts/subscriptionDailyCore.test.ts`: the server cores never import the client SDK.

## Tests
`scripts/subscriptionDailyCore.test.ts` (11) covers:
- a due charge with balance, dashboard and stamp in one batch;
- a rerun posts nothing;
- an existing charge is never rewritten or double-counted;
- a stale subscription refuses the whole batch;
- no account means skipped;
- a dry run;
- duress and an invalid zone;
- the read-model finder names only users with work;
- with the read model there's no owner scan;
- a copy disagreement means no write;
- no client SDK import.

The existing `balanceMutations`, `dashboardMutations`, `services/ledger` and `subscriptionProcessor` tests still pass.

## Owner steps (after the epic reaches `main`)
1. Run *Subscription daily* manually: a dry run on production.
2. Set `SUBSCRIPTION_DAILY_ENABLED=true`, and redeploy the Worker (`npx wrangler@4.158.0 deploy -c cloudflare/push-trigger/wrangler.toml`).
3. The first morning: check the summary (`posted`, `alreadyPosted`, `skippedNoAccount`).
