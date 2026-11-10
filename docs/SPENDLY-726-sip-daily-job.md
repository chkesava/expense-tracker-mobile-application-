# SPENDLY-726 — 682-B: daily server SIP job

Sub-task of SPENDLY-682 ([plan](SPENDLY-682-plan.md), [tracker](SPENDLY-682-legacy-crons.md)). Branch `feature/SPENDLY-726-sip-daily-job`. Builds on SPENDLY-725.

## Why
The app runs SIPs only when the user taps the SIP dashboard's button. The legacy site's `sip-execute` cron is the only daily executor today, and it writes `virtualPortfolio` (not `virtualPositions`), random ids and absolute plan totals. This job replaces it, using the app's own rules.

## What it does
`scripts/sip-daily.ts` (CLI) → `scripts/lib/sipDailyCore.ts` (pure) → `applyJobWrites` (SPENDLY-725).

1. **Find:** `collectionGroup(sipPlans)` with `status == active` and `nextExecutionDate <= now`, paged. The existing collection-group index covers it.
2. **Per plan, in the user's timezone:**
   - **Zone:** read from `users/{uid}.timezone`, default Asia/Kolkata as the legacy cron.
   - **Due check:** `isSipDue` re-checks in that zone, so a New York user isn't run early.
   - **Existing row:** reads the transaction row `{sipId}_{scheduledKey}`.
   - **Price:** fetched only if the day isn't done or skipped.
   - **Decide:** the app's `decideSipRun` runs with that `timeZone`.
3. **Write one atomic batch**, in the app's document shapes:
   - **execute:**
     - the transaction row is *created* (refused if it exists). A retry of a failed day *updates* it only if unchanged since read;
     - `virtualPositions/{quoteKey}` is created, or updated only if unchanged since read;
     - plan totals use `increment`; `lastExecutionDate` and `nextExecutionDate` are set;
     - the `sip_executed` notification is written.
   - **fail** (no price): the app's `failed` row plus a `sip_failed` notification, **once**. Later failed retries of the same day write nothing (no daily nagging).
   - **skip** and **complete:** as the app.
   - **Conflict:** any refused precondition writes nothing, and the next run decides again.
4. **Read model:** the written paths are pushed (SPENDLY-680), with `readModelPushed` in the summary. Without read-model env, the nightly sync copies them.

**Prices** come from this repo's own `stock` / `mutual-funds` / `crypto` functions, called in-process (`scripts/lib/sipQuote.ts`). It reads the same fields as the app's `fetchMarketQuote`: stock `price`, MF `nav`, crypto `quotes[coinId].price`. There's no HTTP hop and no Netlify cost. Anything unusable → `undefined` → a failed day, never an invented price.

## Safety
| Risk | How it's handled |
|---|---|
| Rerun the same day | The plan has moved on, so it isn't due (tested; verified on the emulator) |
| The app's button ran today | The row exists → `decideSipRun` returns nothing |
| The button lands between the job's read and write | The row `create` is refused → the whole batch conflicts → no double units (tested) |
| Two writers on one position | Update only if unchanged since read → conflict (tested) |
| Wrong day for non-IST users | User zone (SPENDLY-725); a New York plan isn't run on IST's day (tested) |
| Duress / erased | Duress skipped (tested); erased trees have no plans |
| Read cost | Per-run budget `SIP_MAX_READS_PER_RUN` (default 3000). Real run: 4 reads per due plan, 1 for a rerun |

## Turning it on
- **Workflow:** `.github/workflows/sip-daily.yml`. Manual dispatch only, **dry run by default**.
- **Gating:** a `trigger=cron` dispatch (the Cloudflare Worker, SPENDLY-729) runs only when `SIP_DAILY_ENABLED` is `true`.
- **Nothing runs on its own** until 729.
- **Do not turn off the legacy cron before this job runs in production.**

## Guards
`netlify/functions/readmodelServerPush.test.ts`:
- `sipDailyCore.ts` is allowed as a writer that writes via `applyJobWrites`;
- **every `scripts/*-daily.ts` must call `createServerPush(serverPushPorts(…))`**;
- `dailyJobCore` pushes exactly what it committed.

## Verification
- **Unit tests:** `scripts/sipDailyCore.test.ts` (12), `scripts/sipQuote.test.ts` (3).
- **Emulator end to end** (Firebase emulator, demo user, one MF plan due today in IST):
  - dry run: 4 planned writes, a live NAV, 4 reads;
  - real run: executed at NAV ₹114.07, 8.77 units for ₹1,000, the plan moved to 8 Dec IST, stamps present, no `virtualPortfolio`;
  - rerun: 1 read, 0 writes;
  - the test docs were deleted afterwards.
- **Typecheck:** the scripts are excluded from `tsconfig.json`, so they were typechecked with a temporary config extending it: clean.
