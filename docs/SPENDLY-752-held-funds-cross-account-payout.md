# SPENDLY-752: held-for-others stays on an account after the fund is paid out from another

**Type:** Bug (Group Funds, epic SPENDLY-678) · **Branch:** `fix/SPENDLY-752-held-funds-cross-account-payout` (from `main`)

## The report

A group fund collected ₹500 into Hand cash and ₹500 into SBI. The user then paid ₹1,000 out from SBI.

- Hand cash still showed **Held for others ₹500** and Yours = balance − 500.
- The fund itself held ₹0.
- Balances were right.

## Root cause

This was a gap in the write path that splits held money across accounts. It was not stale data and not a display bug.

| Step | Code | What happened |
|---|---|---|
| Payout check | `buildPayout`, `shared/utils/groupFundWrites.ts` | It checks the amount only against what the **purpose** holds (`exceeds_held`). It never checks what the paying account holds, by design: S1 says "a payout may come from any account". |
| Payout effect | `groupFundEventEffect`, `shared/utils/groupFundMath.ts` | `accountDeltas[accountId] = -amount` applies to the paying account only. |
| Stored figure | fund doc `heldByAccount`, written with `increment()` | It ended as `{ cash: +500, sbi: −500 }` while `totals.held` was 0. |
| Account card | `app/(app)/accounts/[id].tsx` → `summarizeGroupFundsHeld(...).heldByAccount[id]` → `splitAccountBalance` (`max(0, …)`) | Hand cash showed +500. SBI's −500 was hidden. |
| Fund screen | `GroupFundAccountsSection` (`reconcileHeldByAccount`) | It listed SBI at −₹500. |

**Figures that were already right:**
- Net worth, runway and the dashboard use `totals.held`, which was correct.
- Account balances, entries and the Money → Accounts list (which shows only `currentBalance`) were correct.

## Allocation rule

A payout may still come from **any** account.

**Which held money it takes:**
1. It takes held money from the **paying account first**, down to zero.
2. Any excess comes from the fund's **other accounts**, largest holding first, with ties broken by account id so every device agrees.
3. Anything still left was held in no account (an opening balance saved without one), so no account gives it up.

**Why:** when you pay more from SBI than SBI held for the fund, you fronted your own money. The same amount sitting in Hand cash for the fund is now yours.

**How it is recorded:** the split is stored on the payout event as `heldDraw` (account → amount). The fund's increments, the history rebuild and an undo all use that same split. An undo gives back exactly `heldDraw`, and the rules enforce this. An undo of a payout saved before 752 gives everything back to its own account, as before.

**What never changes:**
- No account's held amount goes below zero.
- The sum of the per-account amounts never exceeds `totals.held`.
- Balances, entries and event amounts are untouched.
- An ordinary expense never settles held money.

## Changes

- **`shared/types/groupFund.ts`:** adds `GroupFundEvent.heldDraw` and `GROUP_FUND_LIMITS.maxHeldDrawAccounts` (20).
- **`shared/utils/groupFundMath.ts`:**
  - Adds `allocatePayoutDraw`.
  - The effect uses `heldDraw` when it is present.
  - `rebuildGroupFundTotals` replays pre-752 payouts with the allocator. An old undo gives back that replayed split.
- **`shared/utils/groupFundWrites.ts`:**
  - `buildPayout` and `buildPastPayout` store `heldDraw`. It is always stored when there is an account, even empty, because a missing draw means a pre-752 payout.
  - The reversal copies it.
- **`firestore.rules`:**
  - `heldDraw` is allowed only on a payout or a payout's reversal, as a map of at most 20 entries.
  - A reversal must carry its target's `heldDraw` when the target has one.
  - **Needs a rules deploy (production) before the release that ships this.** An app without the fix keeps working: it never sends `heldDraw`.
- **`components/groupFunds/GroupFundAccountsSection.tsx`:** the "Not in a tracked account" detail now reads "Opening money recorded without an account".
- **Read model:** no change. `group_fund_events` and `group_funds` keep the whole document in `doc` (R4.1), so `heldDraw` and the corrected `heldByAccount` are copied as they are. No new column, migration or allowlist entry is needed.
- **Repair:**
  - `scripts/lib/groupFundHeldRepairCore.ts` (pure) and `scripts/repair-group-fund-held.ts` (CLI).
  - Dry run by default; writes only with `--apply`.
  - Pushes to the read model through `createServerPush`.

## Historical repair

`npx tsx scripts/repair-group-fund-held.ts [--uid=<uid>] [--out=report.md]` (add `--apply` only after approval).

**Steps:**
1. For each fund, it reads the fund and all its events, then replays them in creation order with the 752 rule.
2. It classifies the fund:
   - **ok:** stored already equals the history.
   - **repair:** every total and per-purpose figure matches the history and only `heldByAccount` differs. The proposed map is the replayed one.
   - **manual:** the stored totals don't match the history (or the replay still has an account below zero). Left unchanged and reported.
3. With `--apply`, it writes only `heldByAccount` and `updatedAt`, in a transaction that first checks the fund's `version` is unchanged. A money event in between bumps the version, and that fund is skipped.

**Safety:**
- The values are absolute, so a rerun reports "already correct".
- Events, account entries and balances are never written.
- The report shows owners as a hash and never prints a uid.

### Emulator rehearsal (2026-11-11, project `demo-spendly-752`)

Seeded the ticket's case as stored before 752, plus a fund whose totals don't match its history:

| Run | Result |
|---|---|
| Dry run | Dokra: Hand cash 500 → 0, SBI −500 → 0. The held total is unchanged. "Broken" is left for manual review. |
| `--apply` | Dokra repaired. "Broken" untouched. |
| Rerun | already correct: 1, to repair: 0, manual: 1 |

### Production dry run

**Not run yet.** It needs the owner's go-ahead (read-only, service-account credentials). Paste the report here and into Jira.

`--apply` against production needs that reviewed report **and** explicit approval.

## Tests

- **`shared/utils/groupFundMath.test.ts`:** the allocator in each case:
  - same account;
  - the ticket's cross-account case;
  - partial;
  - paid from an account holding nothing or less;
  - more than the accounts hold;
  - stored draw and its undo;
  - legacy replay and legacy undo;
  - reconcile flags the old split.
  
  One existing expectation changed: `{ hdfc: -1000, cash: 100 }` is now `{ hdfc: 0, cash: 0 }`.
- **`shared/utils/groupFundWrites.test.ts`:**
  - cross-account, same-account and partial payouts;
  - overpayment still `exceeds_held`;
  - an account holding nothing;
  - money in no account;
  - past payout;
  - exact undo;
  - pre-752 undo;
  - retry gives an identical plan and ids.
- **`shared/utils/groupFundModel.rules.contract.test.ts`:** a payout's undo is covered, and the 20-entry limit is checked against the rules.
- **`firestore/groupFunds.rules.test.ts`:**
  - cross-account payout accepted, and the fund reconciles;
  - an undo with a forged draw is refused, the exact undo is accepted;
  - `heldDraw` on a contribution is refused.
- **`scripts/lib/groupFundHeldRepairCore.test.ts`:**
  - repair of the ticket's case;
  - rerun-safe;
  - manual review;
  - an old undo needs no repair;
  - new payouts are untouched;
  - replay order;
  - the report never prints a uid.

## Leftovers / rollout

1. Deploy the rules (`firestore.rules`) before the release that ships this.
2. Run the production dry run and review it, then `--apply` with approval, then the nightly sync or `createServerPush` copies the change to Supabase.
3. Ship in the next Expense release (and web deploy, the owner's call).
4. **Known limit:** two devices paying out at once from stale copies of a fund can each draw the same other-account money. The rules can't check per-account draws. The repair script lists such a fund (an account below zero) for manual review instead of guessing.
