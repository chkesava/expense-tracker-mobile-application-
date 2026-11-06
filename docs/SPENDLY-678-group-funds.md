# SPENDLY-678: Group Funds (Dokra collections, payouts, money held for others)

**Epic branch:** `feature/SPENDLY-678-group-funds`, cut from `main` at `b76e16a1`.

**Worktree:** `C:\dev\worktrees\spendly-678`.

## The problem
The user collects money from a group. For example, a Dokra pool has 10 members who each pay ₹6,000 a month toward the Appu loan and ₹100 toward Podupu. The money arrives in the user's bank account or cash, and the user later pays it out to the centre.

Recorded as ordinary account entries, this money:
- raised personal net worth;
- showed up as "other" activity on the account.

It is **custodial money**: it belongs to the group, not the user.

## Stories

| Story | Scope | State |
|---|---|---|
| SPENDLY-683 (S1) | Accounting model (this doc), types, pure logic and write plans | Merged to the epic branch (`60808c94`) |
| SPENDLY-684 (S2) | Store, Firestore rules, `CREATE_ONLY_SEGMENTS`, how entries show on account screens, index | Merged to the epic branch (`f949d596`); rules + index deploy pending |
| SPENDLY-685 (S3) | Supabase read model: mapping, migration, RLS, allowlist, purge, indexes, read switch, history read path | Merged to the epic branch (`2185769d`); Supabase migration pending |
| SPENDLY-686 (S4) | "Group funds held" liability in net worth and runway | Built on `feature/SPENDLY-686-group-funds-net-worth`; awaiting merge approval |
| SPENDLY-687 (S5) | Money hub section, screens and sheets | To do |
| SPENDLY-688 (S6) | Member pending amounts, reconciliation view, QA suite, read instrumentation | To do |

## Accounting model

### Where the money is recorded
Group money lives in the user's real accounts, so the real balance must move. It moves through the **existing** account machinery. There is no new ledger and no second balance.

| Event | Fund totals | Real account | Income, expense, budgets, journal, dashboard |
|---|---|---|---|
| `contribution` | `contributions` +a, `held` +a | 1 `accountEntries` **credit** (`group_fund_contribution`, id `gf_<eventId>`) | none |
| `payout` | `payouts` +a, `held` −a | 1 `accountEntries` **debit** (`group_fund_payout`, id `gf_<eventId>`) | none |
| `opening` | `opening` +a, `held` +a | none (the money is already in the balance) | none |
| `transfer_out` / `transfer_in` (a pair between two purposes) | `transfersOut` / `transfersIn` +a; fund `held` unchanged | none | none |
| `account_move` (e.g. cash deposited into the bank) | unchanged; only `heldByAccount` moves | 1 debit and 1 credit (`group_fund_move`), sharing `transferId` | none |
| `reversal` | the exact opposite of the undone event | the opposite entry/entries (`group_fund_reversal`, id `gf_rev_…`, `reversalOf` = original entry) | none |

- Each account entry is written in the **same `commitMutations` batch** as its event, the fund total increments and the account balance ops (`journalBalanceOps`). That makes the balance move exactly once.
- `ledgerRowAccountDeltas`, `computeBankBalance` and the rebuild already count `accountEntries`, so a full rebuild agrees with the stored balance.
- Analytics read only `expenses` and `incomes`, the dashboard summary and budgets read `expenses`, and the journal reads expenses and incomes. None of them see these rows.

### Fund balance (AC7)
`held = opening + contributions + transfersIn − payouts − transfersOut`

- **Stored on the fund:** `totals`, plus `byPurpose[purposeId]` and `heldByAccount[accountId]`.
- **Net of reversals:** a reversed contribution lowers `contributions`. The reversal event stays in the history, so the audit trail is explicit.
- **Rebuild check:** `rebuildGroupFundTotals(events)` and `reconcileGroupFund(fund, events)` prove the stored totals equal the history. Screens show stored totals and never add events up.

### Net worth (S4)
- Account balances stay **exact**: the bank really holds the money.
- `composeNetWorth` gains a `groupFundHeld` input, which becomes a new `groupFundLiabilities` line, part of `totalLiabilities`. It is fed from the sum of the stored `totals.held` (`totalGroupFundsHeld`).
- The effect is that personal net worth = personal assets − personal liabilities − money held for others.
- The same amount is removed from runway, because money held for others isn't spendable.
- Collect-split pots have the same gap today. They stay **out of scope**, by the user's decision.

### Idempotency (AC10)
- The client mints the event id **once per submit** and reuses it on retry.
- Every other id is derived from it: `gf_<id>`, `<id>__in`, `rev_<id>`, `gf_rev_<…>`.
- Events are **create-only** (rules, S2), and `groupFundEvents` goes in `CREATE_ONLY_SEGMENTS`. So a replayed batch fails as a whole, and its ack check drops it.
- The reversal id is fixed (`rev_<target>`), so the same event can't be reversed twice, even from two devices.

### Concurrency
- **Money events** write `increment()` for every total and `version: increment(1)`. Two devices' contributions therefore both apply.
- **Config edits** (name, notes, purposes, members, status) write a literal `version: base + 1`. A stale edit is rejected instead of overwriting.
- **Two offline devices paying out the same money:** the builders refuse an over-payout as the device sees the fund. The rules (S2) also reject any write that leaves `totals.held`, or the linked event's purpose, below zero. The linked event is the one that takes money out (`moneyPlan`).

### Guards in the builders
- A payout or purpose transfer can't exceed what the purpose holds.
- An account move can't exceed what that account holds for the fund.
- A reversal is refused if it would leave a purpose or account holding less than zero, e.g. undoing a contribution that was already paid out.
- Archived funds take no money events.
- Archived purposes and members take no new contributions.
- Purposes and members are archived, never removed.

### Not changed
- No historical data is changed (AC14). Group money the user already recorded as plain account entries stays as it is; reclassifying it is out of scope.
- The new `AccountEntrySource` values and the `linkedGroupFund*` fields are additive. Existing rows are untouched.

## Data model
- `users/{uid}/groupFunds/{fundId}` holds:
  - `name`, `notes`, `status` (`active` / `archived`);
  - `purposes[]`: `{id, name, cadence: monthly | adhoc, expectedPerMember?, target?, archived?}`;
  - `members[]`: `{id, name, archived?}`, embedded so a fund loads in one read;
  - `totals`, `byPurpose`, `heldByAccount`;
  - `schemaVersion`, `version`, `lastEventId`, `createdAtMs`, `createdAt` / `updatedAt`.
- `users/{uid}/groupFundEvents/{eventId}` holds:
  - `fundId`, `kind`, `amount` (always positive), `purposeId`, `date`, `period`;
  - `memberId?`, `accountId?`, `toAccountId?`, `accountEntryIds?`;
  - `recipient?`, `reference?`, `note?`, `transferPairId?`, `reversalOf?`, `reversedKind?`;
  - `actorUid`, `createdAtMs`, `createdAt` / `updatedAt`.
  - A reversal copies the undone event's purpose, member, period and accounts, so totals and member status can be rebuilt from that row alone.
- `accountEntries` (existing) gains:
  - the sources `group_fund_contribution`, `group_fund_payout`, `group_fund_move` and `group_fund_reversal`;
  - the fields `linkedGroupFundId` and `linkedGroupFundEventId`.
- Ids used as map keys (`purposeId`, `accountId`) must match `[A-Za-z0-9_-]{1,64}`, because they appear in field paths.

## Data flow
1. A sheet submits.
2. The store mints the event id and runs a builder in `shared/utils/groupFundWrites.ts`, which validates the action against the fund.
3. `groupFundWritePlanToOps` produces the fund update, events and account entries; `journalBalanceOps(plan.balanceLegs)` produces the account balance ops.
4. One `commitMutations` batch writes everything (outbox + ack).
5. The read-model hooks enqueue `rm_client_apply`, and the server push copies to Supabase (S3).

## Decisions
- **2026-11-05 (user):**
  - Use new collections plus `AccountEntry` legs, not an extension of collect-splits.
  - Use a liability line in net worth.
  - Place the feature in the Money hub.
  - Run 678 as an epic with stories. The Jira issue type was changed from Feature to Epic so stories can be its children.
- **S1:**
  - Opening balance is an event, not a stored field, so every number comes from the history.
  - Transfers between funds are out of the first version; only transfers between purposes of one fund are supported.
  - A payout may come from any account (no per-account check). Reconciliation (S6) shows where held money sits against each balance.
- **S2:**
  - Group-fund account entries can't be edited or deleted; only a reversal undoes them.
  - Contributions and payouts must use cash or a bank account. A credit card or a missing account is refused.
  - Account screens show these rows as transfers labelled "Group fund".
- **S3:**
  - The fund's totals stay in Supabase `doc` with no typed money column. SQL never filters or sums them, and the mapper copies only top-level fields.
  - The fund list reads through the `groupFunds` collection switch. History pages read through a separate `groupFundHistory` screen switch, so each can be flipped on its own.
  - Writers never build from the list hook: they load the fund from Firestore (R4.3a).
- **S4:**
  - If the funds can't be loaded, net worth is flagged as unknown and that day's history point is blocked, rather than counting the held money as 0.
  - The funds load with the accounts on the dashboard.
  - Runway subtracts the held money as one locked, negative line, except money sitting in accounts runway doesn't count.
  - The dashboard card "Held for others" has no route until S5.

## Deploys pending
- **S2 (SPENDLY-684):** `firestore.rules` and the `groupFundEvents (fundId, createdAtMs desc)` index. Both are production changes and need approval. Diff the indexes against live first.
- **S3 (SPENDLY-685):**
  - The Supabase migration `20261106000000_readmodel_group_funds.sql`, as a dry run first, then applied only with approval.
  - The six cross-user field overrides (`groupFunds` and `groupFundEvents` × `createdAt`, `updatedAt`, `createdAtMs`), deployed with the S2 index.
  - **Order:** apply the migration before any app build that writes group funds (S5 adds the first writer). Until it is applied, `rm_client_apply` refuses the unknown tables, and the client outbox drops that whole batch. That includes the same write's `account_entries` and `accounts` rows, so their Supabase copy waits for the per-write server push or the nightly sync. Firestore is unaffected either way.
- S3: the Supabase migration, run as a dry run first and applied only with approval.
