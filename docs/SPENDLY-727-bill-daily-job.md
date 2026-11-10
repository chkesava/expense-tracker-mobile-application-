# SPENDLY-727 — 682-C: daily server credit-card bill job

Sub-task of SPENDLY-682 ([plan](SPENDLY-682-plan.md), [tracker](SPENDLY-682-legacy-crons.md)). Branch `feature/SPENDLY-727-bill-daily-job`. Builds on SPENDLY-725.

> **Widened by SPENDLY-734 (epic SPENDLY-735):** besides closing cards, the job settles every card whose bill work the Supabase read model shows (found with no Firestore reads, then read and written from Firestore). The app no longer runs a bill pass. See [SPENDLY-734](SPENDLY-734-bills-server-only.md).

## Why
The legacy site's `credit-card-bills` cron:
- sums raw expenses only (no cashback, refunds or transfers);
- **rewrites open auto bills' amounts every morning**;
- creates **random-id** bills (the SPENDLY-676 duplicates);
- reads every user's full expense history daily.

This job replaces it with the app's own bill pass.

## What it does
`scripts/bill-daily.ts` (CLI) → `scripts/lib/billDailyCore.ts` (pure) → `applyJobWrites` (SPENDLY-725).

1. **Find closing cards:** one `collectionGroup(accounts)` read. A cheap bill-day filter, then the user's account types (credit cards only) and settings. Cards whose latest closed cycle ended **today or yesterday** in the user's zone get the pass (`cardClosedRecently`), the legacy cron's two mornings per close. Everyone else costs nothing.
2. **The app's pass for that card** (`planCardBills`), with the same pure functions in the same order as `CreditCardBillsProvider`:
   - drafts at `${accountId}_${statementDate}`;
   - refresh patches (auto bills only);
   - **allocation** (payments and cashback);
   - duplicate resolution (one canonical bill per cycle, the rest CANCELLED, never deleted).
   - New statements are included before allocation, so the job reaches in one run the end state the app reaches in two. **A statement settled by cashback is born PAID** (SPENDLY-719).
3. **Write only the difference** from what's stored, in one atomic batch per card:
   - new statements are **created** (refused if the app made one first);
   - changed bills are **updated only if unchanged since read** (SPENDLY-497);
   - a refusal writes nothing.
   - The comparison is against the *raw stored* fields, not the app's parser, which recomputes status. A stale stored status (the 719 shape) is therefore seen and fixed.
4. **Notice:** the "Credit card statement created" inbox notice (`credit_card_statement`, id `n_ccstmt_{billId}`) is written for a statement that closed today or yesterday.
5. **Read model:** the written paths are pushed (SPENDLY-680).

**Inputs per closing card:** its expenses (`accountId ==`, active rows only), payments in (`toAccountId ==`) and bills (`accountId ==`). These are single-field equality queries, so no new index. The CLI's `--now=<ISO>` previews another day (QA only).

## Safety
| Risk | How it's handled |
|---|---|
| Rerun / the app's pass on the same data | Converges, so nothing to write (tested; verified on the emulator) |
| The app wrote between the job's read and write | Update refused by `lastUpdateTime` → conflict, nothing written (tested) |
| The app made the statement first | `create` refused → conflict; the next run settles it via update (tested: the 719 shape → PAID) |
| Legacy random-id twins | Duplicate resolution marks them CANCELLED, never deleted (tested) |
| Read cost | Only closing cards' inputs; budget `BILL_MAX_READS_PER_RUN` (default 5000). Emulator: 14 reads for the whole run |
| Duress / erased | Duress skipped (tested); erased trees have no accounts |

## Turning it on
- **Workflow:** `.github/workflows/bill-daily.yml`. Manual dispatch, dry run by default.
- **Gating:** a `trigger=cron` dispatch needs `BILL_DAILY_ENABLED`; SPENDLY-729 adds the Cloudflare trigger.
- **Legacy cron:** keep it until this job has run in production (729).

## Guards
`netlify/functions/readmodelServerPush.test.ts`:
- `billDailyCore.ts` is allowed as a writer via `applyJobWrites`;
- `bill-daily.ts` must `createServerPush(serverPushPorts(…))`, like every `scripts/*-daily.ts`.

## Verification
- **Unit tests:** `scripts/billDailyCore.test.ts` (7): born PAID with cashback, rerun, 719-shape update + stale conflict, non-closing card has no reads, legacy twin cancelled, duress, dry run.
- **Emulator:**
  - dry run on the demo user (as of 6 Nov, a card closing on the 5th): 1 card closing, already up to date, 23 reads, no writes;
  - throwaway user `qa727` (the Roar shape): run 1 created `roar_2026-11-01` with ₹505 billed, ₹505 paid (cashback + HDFC), ₹0 left, **PAID**, plus the notice (2 writes, 14 reads); run 2 found nothing to change;
  - the QA docs were deleted.
- **Typecheck:** the scripts (excluded from `tsconfig.json`) were checked with a temporary extending config: clean. `typecheck:shared` is clean.
