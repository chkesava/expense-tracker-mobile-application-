# SPENDLY-684: Group Funds S2, persistence, rules and account integration

**Epic:** SPENDLY-678 (`docs/SPENDLY-678-group-funds.md`).

**Branch:** `feature/SPENDLY-684-group-funds-persistence`, cut from the epic branch.

## What was built

### Store (`services/groupFunds/groupFundStore.ts`)
- `newGroupFundId` and `newGroupFundKey` mint the fund id and the purpose/member keys.
- `newGroupFundEventId` mints the event id once per submit. That id is the idempotency key.
- `loadGroupFund` reads the fund cache first, then from the server. It always reads Firestore, never the copy (R4.3a).
- `loadReversalContext` finds earlier reversals of an event and, for a transfer, its other half. It uses two bounded single-field queries.
- `commitGroupFundWrite`:
  - writes the fund's total increments, the events, the `accountEntries` rows and the `journalBalanceOps` for each leg;
  - sends them as **one** `commitMutations` batch;
  - refuses a credit card or a missing account (`account_unsupported`) before anything is written.

### Idempotency
`lib/commitMutations.ts` adds `/groupFundEvents/` to `CREATE_ONLY_SEGMENTS`. A queued batch that already landed is dropped through its ack instead of failing as a misleading "not saved".

### `firestore.rules`
- **`groupFunds`:**
  - Strict shape, with `version` moving by exactly one on every write.
  - Totals must satisfy `held = opening + contributions + transfersIn − payouts − transfersOut` and stay ≥ 0.
  - A money write must link a **new** event whose kind and amount explain the change to `held`. The linked event's purpose must stay ≥ 0.
  - No money events on an archived fund.
  - A fund can be deleted only before any money was recorded.
- **`groupFundEvents`:**
  - Create-only, with a strict shape.
  - An event can only be written in a batch that moves its fund.
  - A reversal's id must be `rev_<target>`, so each event can be reversed at most once, even from two devices.
- **`accountEntries`:**
  - A `group_fund_*` entry can be created only together with the new event that lists it in `accountEntryIds`.
  - Group-fund entries can never be updated or deleted; a reversal undoes them.
  - Ordinary manual entries behave as before.

### Account screens (`shared/utils/`)
- `isGroupFundEntrySource` identifies the new sources.
- `AccountActivity.isGroupFund` marks those rows. They count as **transfers** (`isTransferLike`), carry the label "Group fund", and are not manual adjustments, so they can't be deleted from the account screen.
- The month income and expense totals ignore them.

### Index
`groupFundEvents (fundId ASC, createdAtMs DESC)` for the history page (S3 and S5).

### Builder change
`moneyPlan` now links (`lastEventId`) the event that takes money out of a purpose, so the rules check the purpose being drawn down. For example, a transfer links its source half.

## Tests
- **`services/groupFunds/groupFundStore.test.ts`:**
  - one batch containing the fund, event, entry and account;
  - no account touched when no money moves through one;
  - a card or missing account is refused;
  - an invalid write throws;
  - a retry produces the same batch;
  - the reversal context is loaded.
- **`shared/utils/groupFundAccountActivity.test.ts`:** the balance moves exactly once; the row is flagged as a group fund, not manual; it counts as a transfer; month income and expenses stay at 0.
- **`shared/utils/groupFundModel.rules.contract.test.ts`:** the rules and the builders agree on field allowlists, kinds, statuses, entry sources, limits and the reversal id.
- **`firestore/groupFunds.rules.test.ts`** (emulator, 17 tests): the app's batches pass, including the real balance ops. Each of these is refused:
  - a replay;
  - a forged total;
  - a standalone event or entry;
  - an over-payout or over-transfer from a stale device;
  - money on an archived fund;
  - a duplicate or mis-named reversal;
  - an edit or delete of an event or entry.
- **`lib/commitMutations.test.ts`:** `groupFundEvents` batches check the ack before replaying.

## Deploy needed (production change; needs approval)
`firestore.rules`, and the new composite index. Diff the indexes against live before deploying them.
