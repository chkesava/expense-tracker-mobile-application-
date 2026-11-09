# SPENDLY-734 — Bills: the app computes no bill pass; `bill-daily` settles every card with work

Story in epic **SPENDLY-735**, "Server-side calculations: the app only delivers". The plan is in [the audit](SPENDLY-735-server-calculations-audit.md), item A0.
- Branch `feature/SPENDLY-734-server-bill-reconciler`, cut from the epic branch (main 8cca6639 + the audit).
- PR #287 targets the epic branch.
- Builds on SPENDLY-725 (`dailyJobCore`) and SPENDLY-727 (`bill-daily`).

## Why
The credit card bill pass runs these steps:
- statement creation;
- refresh;
- payment and cashback allocation;
- duplicate merge.

The pass ran in two places:
- **In the app:** on launch, **every app focus**, every new bill id, and after money actions. On large ledgers it read every card's expenses from Firestore (~600 reads on the owner account, SPENDLY-732).
- **On the server (`bill-daily`, SPENDLY-727):** only for cards whose cycle **closed today or yesterday**. A payment or cashback recorded later was never settled by the server. The reported Roar statement closed on 1 Nov, and its cashback settled it on 8 Nov.

The owner decided on 2026-11-09 that no calculation runs inside the app.

A first build (PR #287 v1, kept as local branch `backup/SPENDLY-734-v1`) added a separate `bill-reconciler` job. PR #288 (SPENDLY-682) then landed `dailyJobCore` and `bill-daily`. A second job would be a second writer of the same bills, so this version widens `bill-daily` instead.

## What changed
### The app (`providers/CreditCardBillsProvider.tsx`)
**Removed:**
- the automatic pass (`generateAutoBills`) and all of its triggers;
- its Firestore readers and the read-mode hooks;
- the payments listener only the pass used.

**Deleted, no callers left:**
- `lib/readModelLocal/billPass.ts` (the in-app plan, throttle and fingerprint);
- `services/creditCardBills/autoBill.ts` (the in-app statement writer).

The bills listener parses with the shared `parseStoredBill`.

**Kept:**
- the bills listener (shows stored bills);
- the user's own bill actions: create, edit, pay, mark paid, snooze, recalculate preview;
- local reminder scheduling, which the audit's later stories handle;
- `requestBillPass()`: every money action still calls it. It's a no-op now, and SPENDLY-737 makes it ask the server to run.

### The server (`scripts/lib/billDailyCore.ts`, `scripts/bill-daily.ts`)
- **`findBillWorkOnReadModel`** (pure):
  - Runs `bill-daily`'s own `planCardBills` on the Supabase read model's copy of every credit card.
  - Costs 0 Firestore reads.
  - Returns uid → card ids whose bills would change.
  - Skips duress accounts; a failing user is counted, never named.
  - Port: `scripts/lib/billReadModelSource.ts` (service role, `source_deleted = false` rows, equality filters on `account_id` / `to_account_id`).
- **`runBillDaily`:** a named card joins the closing cards. It is then read from Firestore (`cardInputs`) and planned again. It is written through `applyJobWrites`: create / `lastUpdateTime` preconditions, atomic, read-model push. **Nothing is written from the copy** (R4.3a).
- **When the copy lags:** if Firestore has nothing to change for a named card, nothing is written and `readModelDisagreed` is counted.
- **Summary:** counts only (`readModelUsers`, `readModelCards`, `cardsFromReadModel`, `readModelDisagreed`, `readModelFailures`).
- **`storedBillFromDoc`:** moved into the core so Firestore and the copy parse bills the same raw way.
- **Turning it off:**
  - without `READMODEL_SUPABASE_URL` / `READMODEL_SUPABASE_SERVICE_ROLE_KEY`, or with `BILL_READMODEL_FINDER=off`, the job settles closing cards only, as before;
  - a finder failure logs its error name and falls back the same way.
- **Schedule:** unchanged. The Worker's 03:00 UTC cron dispatches `bill-daily`, gated by `BILL_DAILY_ENABLED` (SPENDLY-729).

### Guards
Stricter, never weaker:
- `lib/readModelLocal/providerSwitch.test.ts`: the provider contains no bill pass (no `generateAutoBills`, drafts, refresh, allocation, duplicate or statement-writer calls).
- `lib/creditCardBillSettleUp.contract.test.ts`: every money action still signals `requestBillPass()`, and the app computes no pass.

`docs/READ_MODEL_RULES.md` R4.3a: the bill-pass example now names `bill-daily`.

## Read cost (owner account: 902 expenses, 531 on cards)
| | Before | After |
|---|---|---|
| App open / every focus | ~600 Firestore reads + pass CPU | 0, no pass |
| App: payments listener for the pass | 1 listener | none |
| `bill-daily`, card with nothing to do | 0 (non-closing) | 0 (copy finds nothing) |
| `bill-daily`, card with work (Roar) | not settled unless closing | that card only (~10 reads) |

## No new data
- No new collection, field, index, rule or migration.
- Supabase is only read.
- `bill-daily` already pushes what it writes (SPENDLY-680 guard).

## Tests
`scripts/billDailyCore.test.ts` (16 tests; 8 new for SPENDLY-734) covers:
- Roar found on the copy and settled to PAID, with only that card read from Firestore;
- without the copy the job is unchanged;
- a settled copy names nothing;
- a lagging copy writes nothing (`readModelDisagreed`);
- the compare-and-set conflict;
- a dry run;
- duress skipped, and a failing user isn't named;
- the row, settings and bill mapping.

Guards that still pass:
- `readmodelServerPush`;
- `readModelWriteHooks`;
- `providerSwitch`;
- `listenersOff`;
- `mapping`;
- `readmodelCrossUserIndexes`;
- `readmodelSecrets`;
- `dailyJobCore`;
- `autoCreditCardBills`, `creditCardLedger`, `creditCardBillDerived`.

## Until SPENDLY-737 (historical)
> **Done in SPENDLY-737:** `requestBillPass()` was removed. The save itself queues the server run through the read model ([SPENDLY-737](SPENDLY-737-server-run-after-save.md)).

A payment's own stamp (`increment` + `arrayUnion`, inside the payment save) still updates the bill at once. Cashback allocation, new statements and refreshes wait for the next `bill-daily` run (08:30 IST). The epic doesn't reach `main` before SPENDLY-737, so no release has that gap.

## Owner steps (after the epic reaches `main`)
1. **The SPENDLY-682 rollout:** `docs/LEGACY_CRONS_RETIREMENT_RUNBOOK.md` (reports, dry runs, Worker redeploy, `BILL_DAILY_ENABLED`, legacy crons off).
2. **A `bill-daily` dry run:** Actions → *Bill daily*. The summary should show `cardsFromReadModel ≥ 1` for the owner, and the Roar plan.
3. **After the first live run:** a read-only `scripts/reconcile-credit-card.ts` for Roar should show 505 / PAID.
4. **The Expense release and the web deploy.**
