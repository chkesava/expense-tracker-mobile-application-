# SPENDLY-700: Group Funds S7, manual backfill of previous months (no cron)

**Epic:** SPENDLY-678 (`docs/SPENDLY-678-group-funds.md`).

**Branch:** `feature/SPENDLY-700-group-funds-backfill`, cut from the epic branch.

## Manual only
- The user records past months in the app, from the fund's start month to now.
- There is no cron, no scheduled job and no script against production data.
- Existing manual account entries are never changed (AC14).

## The accounting choice on every row
1. **"Already in my balance"** (the default). The money already reached the bank or cash before Group Funds existed.
   - The event is a `contribution` with **`attributionOnly: true`**, and **no account entry**, so no balance moves again.
   - It still counts for the member and month and raises the fund's held total, so net worth correctly excludes it.
   - An optional account says where the money sits (`heldByAccount`) for reconciliation.
2. **"Not in my balance yet."** The money hasn't been added to any account.
   - It is a normal contribution: one account entry, and the balance rises **once**, dated today.

**Past payouts** (`buildPastPayout`) also write no account entry: the money already left the account. They lower the fund's held total and, if an account is given, what the fund holds there.

## Idempotency
- Each member's backfilled month has a **fixed id**, `bf_<fundId>_<period>_<purposeId>_<memberId>`.
- Events are create-only, so the same member's month can't be backfilled twice: not by a double tap, a retry or a second device.
- The sheet marks such rows "Already recorded".

## One write per member, not one per month (change from the ticket)
- The rules require every money write to move the fund's held total by exactly what **one** linked event explains, so a ten-member month can't be one batch.
- The sheet therefore saves each member as its own small batch, in order, and skips anything already recorded.
- If one fails, it stops and says how many were saved, so pressing Save again continues safely, thanks to the fixed ids.

## Rules
- `groupFundEvents` accepts `attributionOnly`. It must be `true`, and such an event **can't also list an account entry**.
- Covered by:
  - the contract test;
  - 4 new emulator tests:
    - already in balance: no balance change;
    - not yet in balance: credited once;
    - a second backfill of the same month refused;
    - a forged attribution-only event with an account entry refused.

## UI
- **Fund screen ⋯ menu:**
  - **Record past months:** a month stepper (from the fund's start), a purpose, "Where is this money now?", and every member who owed that month. The amount due is pre-filled, and each member can be ticked "Paid" or "Skip". The button reads "Record N · ₹X".
  - **Past payout:** the payout form with "Paid from" optional and no balance change.
- **History:** backfilled entries read "recorded later, balance unchanged".
- **The month view (S6)** shows backfilled months like any other.

## Tests
- `shared/utils/groupFundBackfill.test.ts`:
  - default with no entry and no leg;
  - not in balance credits once;
  - archived members allowed;
  - bad input refused;
  - the same document every time;
  - a past payout;
  - stored totals equal the history.
- Contract test, emulator rules tests (23 in the Group Funds file), and a wording test.
- **Full `npm test`:** 7,835 passed. The only failure is the known `lib/readModelLocal/store.test.ts`, which can't load because `fake-indexeddb` is missing.
- **All rules:** 645 passed.
- **`tsc`:** only the two known missing-package errors.
- **Local review:** the running Expo web bundle contains the screens.

## Read model
Nothing new: `attributionOnly` stays in `doc`, and the event and fund tables already sync (S3).
