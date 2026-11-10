# SPENDLY-682 — Run the legacy SIP and credit-card-bill crons from this repo

Story, standalone. Integration branch `feature/SPENDLY-682-legacy-crons-in-repo`. The proposed sub-stories each get their own branch cut from it.

## Why
Two daily crons still run on the old site (`kesavaexpensetracker.netlify.app`, repo `chkesava/expense-tracker`, `0 3 * * *` = 08:30 IST) and write production Firestore. The user decided on 2026-11-05 to retire them and run the same daily outcomes from this repo.

## What the explorations found (2026-11-08)

### SIP
- **The app has no automatic SIP run.** `services/sip/executeSips.ts` runs only from the SIP dashboard's button (`useSips.triggerManualExecute`). Today **the legacy cron is the only thing executing SIPs daily**, so it can't be switched off before the replacement runs.
- **The app's planner is already pure and tested.** `shared/features/sip/utils/sipExecution.ts` provides `decideSipRun`, the id helpers `sipTransactionId` = `${sipId}_${YYYY-MM-DD}` and `sipNotificationId`, `applyExecuteToVirtualPosition`, `chunkSipOps`, and next-date math.
  - Catch: every date helper uses the process's **local** timezone. On a UTC server the keys would shift a day for IST users.
- **How the legacy cron differs:**
  - it writes `virtualPortfolio`, not `virtualPositions`;
  - it uses random ids, and judges idempotency by the run date rather than the scheduled date;
  - it writes absolute plan totals;
  - it writes a date-only `nextExecutionDate`, where the app writes ISO;
  - it writes no failed rows, and no `updatedAt`.
  - The two models have drifted.
- **One more risk:** the app's execute op raises the plan totals with `increment()`. A replay that races the transaction check would double-count.
- **Read model:** all four collections are mapped (`sip_plans`, `sip_transactions`, `virtual_positions`, `notifications`), and the push engine already turns `sip_*` notifications into pushes (SPENDLY-229).

### Credit-card bills
- **The legacy cron is harmful, not just redundant:**
  - it sums **raw expenses only**, with no cashback, refunds or transfers;
  - it **rewrites `statementAmount` on open auto bills every morning**, which fights the app's ledger (SPENDLY-719 showed how much depends on the stored bill);
  - it creates **random-id** bills, which become the duplicates of SPENDLY-676 (the cancelled twins next to every Roar bill);
  - it reads **every user's full `expenses`** daily;
  - it skips `_duress` but not erased accounts;
  - it does no read-model push.
- **The app's bill pass is pure except for writes:**
  - pure: `autoCreditCardBillDocId` = `${accountId}_${statementDate}`, drafts, refresh patches, `collectCreditBillAllocationPatches`, `collectCreditBillDuplicateResolutions`, and `billPassHasWork`;
  - not yet extracted: `refreshDerivedFields`, which is pure but local to the provider;
  - client-SDK only: the writes (`commitWrite`, `runTransaction`, `createAutoCreditCardBill`).
- **Bill reminders are already server-side** (SPENDLY-231 `billSource`), and they read the stored bill.

### Infrastructure to reuse
- **Server writer pattern:** `scripts/push-reminders.ts` + `scripts/lib/pushRunCore.ts`. It provides admin init, `readBudget` / `meteredFirestore` (per-run and per-day caps), `--dry-run`, a JSON run summary and a GitHub Actions workflow gated by a repo variable.
- **Scheduler:** the Cloudflare Worker trigger, `cloudflare/push-trigger` (SPENDLY-716), because GitHub's own cron runs hours late.
- **Read-model push:** `createServerPush(serverPushPorts(db))` + `trackServerBatch` (SPENDLY-680). The guard `netlify/functions/readmodelServerPush.test.ts` scans `scripts/` and `netlify/functions/`, so any new writer of `users/${uid}/<synced>` must push.
- **Indexes:** `sipPlans` already has the collection-group index `status + nextExecutionDate`. A per-card `expenses where accountId ==` is a single-field equality (automatic). **No new index is needed.**

## Invariants (must hold for every sub-story)
1. **One source of money math.** The server jobs call the same pure planners as the app: SIP `decideSipRun`, and the bill drafts / refresh / allocation / duplicates. No second calculation.
2. **Deterministic ids, safe replays.**
   - SIP: `${sipId}_${scheduledKey}`. Each plan is written **in a transaction that refuses if the transaction row already exists**, so a rerun or the in-app button can never double-increment the totals.
   - Bills: `${accountId}_${statementDate}`, with the same compare-and-set as the app (SPENDLY-497).
3. **The server reads Firestore only (R4.3a)**, within a per-run and per-day read budget, with no all-user full-expense scans.
4. **Every write** stamps `createdAt`/`updatedAt` (R1.2), goes through `trackServerBatch` (or transaction paths noted), and is flushed by `createServerPush` with `readModelPushed` in the summary (SPENDLY-680). Duress uids and erased accounts are skipped.
5. **The user's timezone decides "today"** and the SIP scheduled key (settings `timezone`, default Asia/Kolkata), never the runner's.
6. **Nothing turns on by itself.** Each job ships disabled (repo variable) and dry-run first. The legacy crons are switched off only after the new job has run correctly in production.
7. **No data repair without a dry-run report and the user's approval.** This covers `virtualPortfolio` vs `virtualPositions`, and the legacy duplicate bills.

## Proposed sub-stories (one at a time, approval before each merge)
| # | Story | Main files | Notes |
|---|---|---|---|
| 682-A (SPENDLY-725) | **Server foundations.** Timezone-aware SIP date keys, `refreshDerivedFields` moved to `shared/`, and an admin-SDK run core (budget, dry run, summary, duress/erased skip) shared by both jobs. | `shared/features/sip/utils/sipExecution.ts` (+ tests), `shared/utils/creditCardBillDerived.ts` (new), `providers/CreditCardBillsProvider.tsx` (import only), `scripts/lib/dailyJobCore.ts` (new; reuses `pushRunCore` budget) | Refactor with behaviour unchanged; app tests stay green |
| 682-B (SPENDLY-726) | **Server SIP job.** `collectionGroup(sipPlans)` with `status == active` and `nextExecutionDate <= now`, then per plan: quote, `decideSipRun`, then one transaction writing the tx row, `virtualPositions`, the plan update and the notification. | `scripts/sip-daily.ts`, `scripts/lib/sipDailyCore.ts` (+ tests with `fakeAdminDb`), market quote helper reused from `netlify/functions` (SPENDLY-522), `.github/workflows/sip-daily.yml` | Gated by `SIP_DAILY_ENABLED`; a failed quote writes the app's `failed` row and retries the next day |
| 682-C (SPENDLY-727) | **Server bill job.** Find cards whose cycle closed today or yesterday (`collectionGroup(accounts)`, a few hundred reads). For those cards only: their expenses, payments and bills. Then the app's drafts, refresh, allocation and duplicates, written with deterministic ids and compare-and-set. Optional deterministic "statement created" inbox row. | `scripts/bill-daily.ts`, `scripts/lib/billDailyCore.ts` (+ tests), `.github/workflows/bill-daily.yml` | Gated by `BILL_DAILY_ENABLED`; allocation means a cashback-settled bill is born PAID (no false reminder, cf. 719) |
| 682-D (SPENDLY-728) | **Read-only reports:** `virtualPortfolio` vs `virtualPositions` drift per user and quote key; legacy duplicate bills classified as random-id / claimed / cancelled (extends `detect-duplicate-credit-card-bills.js`). | `scripts/report-sip-drift.ts`, `scripts/report-duplicate-bills.ts` | Run on production with the read-only service account; the user reviews; repairs become a separate ticket |
| 682-E (SPENDLY-729) | **Cut-over and runbook.** Cloudflare Worker daily cron dispatches both workflows. Then: deploy disabled, run one production dry run, the user switches off the two schedules in `chkesava/expense-tracker`'s `netlify.toml`, enable, verify a day, write the runbook. | `cloudflare/push-trigger/*`, `docs/LEGACY_CRONS_RETIREMENT_RUNBOOK.md` | The other repo's change is the user's, or done with explicit approval |

## Guards and tests
- New pure cores, unit-tested with `shared/utils/push/testing/fakeAdminDb.ts`:
  - idempotent rerun;
  - in-app manual run racing the job (transaction refuses);
  - timezone keys;
  - duress and erased skipped;
  - budget stop;
  - dry run writes nothing.
- `readmodelServerPush.test.ts` must detect both new writers.
- Bill job parity: the same inputs through the job and through `billPassHasWork` → no work left.

## Decisions (the user, 2026-11-08)
1. **Scheduler:** a daily cron on the existing Cloudflare Worker (`cloudflare/push-trigger`) dispatches both workflows. GitHub's own cron runs late.
2. **"Statement created" inbox notification:** kept, with a deterministic id so it never repeats.
3. **SIP prices:** fetched directly by the job. If a quote fails, the app's rule applies: a `failed` transaction row, retried the next day. Not routed through Netlify (credits).
4. **Jira:** 682-A…E are sub-tasks of SPENDLY-682, done one at a time, with approval before each merge into the 682 branch.

## Not in scope
- Turning off the legacy **site**: it still serves prices to pre-2026-10-12 APKs (SPENDLY-522).
- Any repair of existing data. That needs the report and approval first.
