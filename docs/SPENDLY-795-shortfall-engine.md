# SPENDLY-795: Low-balance alerts — shortfall engine

**Epic:** SPENDLY-793. **Story:** S2 of 6.

**State:** built on `feature/SPENDLY-795-shortfall-engine`. It is a pure module with no callers yet: the server job (SPENDLY-796) and the push source (SPENDLY-797) will call it. The app never runs it (epic 735 rule).

## What it does
`computeAutoDebitShortfall(input)` in `shared/utils/autoDebitShortfall.ts`.

**Input**
- today (the user's day);
- subscriptions, accounts and account type names;
- credit-card bills;
- group funds;
- the default lead days.

**Debits counted, from today through today + 15 days (the maximum lead days)**
- **Recurring items:** only items the server job will actually post (`autoPostState === "posts"`). Paused, completed, SMS-tracked and account-less items are out.
  - Dates come from `upcomingPaymentDates`.
  - Dates before `startMonth` are dropped, and so are occurrences already posted (the same `lastProcessed` / `lastProcessedDate` test the dues push uses).
  - The EMI end term is respected.
- **Card autopay:** a card linked to a paying account (`cardAutopay`, SPENDLY-794). Each open bill (not PAID or CANCELLED) due between today and the horizon counts, for one of two amounts:
  - `total`: the remaining amount.
  - `minimum`: `minimumDueAmount − amountPaid`, capped at the remaining amount. A bill whose minimum is already met contributes nothing.

**Per paying account**
- Only bank-like accounts count. A charge to a card uses credit, and an unknown account can't be checked.
- `available = currentBalance − Σ heldByAccount[account]` over all group funds.
- If `storedBalanceTrusted` is false, then `available` and each `shortBy` are null and `trusted` is false. The account is still listed so the UI can say "balance needs reconciliation", but `hasShortfall` ignores it, so no push is sent.
- Debits are sorted by date. `cumulative` is everything due on or before that item's date; debits on the same day all count at that day. `shortBy = max(0, cumulative − available)`.
- `alerting` is true from `dueDate − leadDays` through the due date. Debits outside their window still count toward later ones.

**Output**
- `accounts`: only accounts with an alerting item that is short, or with an untrusted balance. Sorted by largest shortfall.
- `hasShortfall`.
- `alertingShortfalls(result)` returns the push/banner items.

## Deliberately not counted
- **Money coming in** (salary, recurring transfers *into* the account). An inflow that doesn't arrive would hide a real shortfall.
- **Debits before today.** A missed occurrence isn't a coming debit.

## Tests
`shared/utils/autoDebitShortfall.test.ts`, 22 tests:
- covered vs short;
- the lead window;
- the cumulative and same-day totals;
- an earlier debit outside its window counting toward a later one;
- held funds;
- an untrusted balance;
- paused, completed, SMS, no-account, zero-amount and half-set transfers;
- an occurrence already posted;
- the EMI end term and `startMonth`;
- due today;
- every-N-days;
- a card or unknown paying account;
- card total vs minimum, including part payments and the cap;
- a bill that is paid, cancelled, past due or settled;
- an autopay link that is missing or points at the card itself;
- the card's own lead days;
- a card and an EMI on the same account;
- ordering.
