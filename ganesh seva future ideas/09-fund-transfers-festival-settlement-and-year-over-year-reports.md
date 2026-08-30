# Ganesh Seva — Feature Specification 09
## Fund Transfers, Festival Settlement & Year-over-Year Reports

**Document:** 09-fund-transfers-festival-settlement-and-year-over-year-reports.md  
**Status:** Product / Implementation Specification  
**Stack:** Expo React Native + Firebase Auth + Firestore + Supabase Storage

---

# 1. Purpose

This feature manages the Pandal's money across Festival years.

The most important concept is the separation between:

```text
Permanent Pandal Fund
```

and:

```text
Festival Fund
```

The Permanent Fund carries forward across years.

Example:

```text
2026 Festival closes

Money remaining:
₹20,000

Transfer to Permanent Fund:
₹20,000
```

Next year:

```text
2027 Festival

Opening Fund:
₹20,000
```

This allows the Pandal to preserve leftover money instead of starting from zero every year.

---

# 2. Core Financial Layers

The recommended model is:

```text
PANDAL
   |
   +-- PERMANENT FUND
   |
   +-- FESTIVALS
          |
          +-- 2026
          +-- 2027
          +-- 2028
```

The Permanent Fund is Pandal-level.

Each Festival has its own financial records.

---

# 3. Permanent Fund

The Permanent Fund is money retained by the Pandal for future Festivals.

Example:

```text
Permanent Fund
₹20,000
```

It is not tied permanently to:

```text
2026
```

It can be carried forward into:

```text
2027
2028
2029
```

---

# 4. Permanent Fund Data Model

Conceptually:

```text
pandals/{pandalId}/funds/permanent
```

Suggested fields:

```text
fundId
pandalId
balance
currency
createdAt
updatedAt
```

Do not allow arbitrary client-side balance overwrites.

The balance should be derived from or safely updated by financial transactions.

---

# 5. Festival Opening Fund

When creating a new Festival, allow:

```text
Opening Fund
```

Example:

```text
2027 Festival

Opening Fund:
₹20,000
```

This money can come from:

```text
Permanent Fund
```

or another explicitly documented source.

---

# 6. Festival Opening Balance

The Festival should show:

```text
Opening Balance
₹20,000
```

This is the starting point for that Festival.

Do not treat it as:

```text
New Donation
```

It is a transfer/opening balance.

---

# 7. Fund Transfer Concept

A Fund Transfer moves money between internal funds.

Examples:

```text
Permanent Fund
        ↓
2027 Festival Fund
```

or:

```text
2026 Festival Fund
        ↓
Permanent Fund
```

A transfer is not:

```text
Expense
```

and not:

```text
Contribution
```

---

# 8. Transfer Data Model

Conceptually:

```text
pandals/{pandalId}/fundTransfers/{transferId}
```

Suggested:

```text
transferId
pandalId
festivalId
fromFund
toFund
amount
transferDate
reason
status
createdBy
createdAt
confirmedBy
confirmedAt
```

Adapt to the existing financial model.

---

# 9. Supported Fund Types

At minimum:

```text
PERMANENT
FESTIVAL
```

Future fund types can be introduced later.

Do not create many fund types for the MVP.

---

# 10. Transfer Direction

Examples:

### Permanent → Festival

```text
Permanent:
₹20,000

Transfer:
₹10,000

Festival Opening:
₹10,000

Permanent Remaining:
₹10,000
```

### Festival → Permanent

```text
Festival Closing:
₹20,000

Transfer:
₹15,000

Permanent:
+₹15,000
```

---

# 11. Transfer Validation

Before creating a transfer:

```text
amount > 0
```

For a transfer from a fund:

```text
availableBalance >= transferAmount
```

Do not allow:

```text
Permanent Fund:
₹10,000

Transfer:
₹15,000
```

unless the business model explicitly allows a negative balance.

For this POC:

> Do not allow negative fund balances.

---

# 12. Atomic Transfer

A transfer changes two balances:

```text
Source ↓
Destination ↑
```

Both changes must succeed together.

Use:

```text
Firestore transaction
```

or an equivalent atomic strategy.

Never do:

```text
Source update
   ↓
Destination update
```

as two independent unsafe operations.

---

# 13. Transfer Audit

Every transfer must record:

```text
Created By
Created At
From Fund
To Fund
Amount
Reason
```

For sensitive transfers:

```text
Confirmed By
Confirmed At
```

may also be stored.

---

# 14. Transfer Reason

Allow a simple reason.

Examples:

```text
Opening fund for 2027
Festival surplus
Emergency reserve
Carry forward
```

Do not require lengthy explanations.

---

# 15. Festival Settlement

At the end of a Festival, the Admin should run:

```text
Festival Settlement
```

This is the formal closing process.

It should summarize:

```text
Opening Fund
+
Cash Contributions
+
Other Receipts
-
Expenses
-
Reimbursements
+
/- Transfers
=
Closing Balance
```

---

# 16. Settlement Example

```text
2026 FESTIVAL SETTLEMENT

Opening Fund
₹10,000

Chanda
₹80,000

Committee Contributions
₹20,000

Other Cash Contributions
₹10,000

Sponsor Cash
₹5,000
----------------
Total Available
₹1,25,000

Expenses
₹90,000

Reimbursements
₹5,000
----------------
Closing Balance
₹30,000
```

Then Admin decides:

```text
Transfer to Permanent Fund:
₹20,000

Retain for Pending Items:
₹10,000
```

---

# 17. Settlement Must Not Automatically Transfer Everything

Do not automatically move the entire closing balance.

The Admin should explicitly choose:

```text
Transfer to Permanent Fund
```

and:

```text
Amount
```

Example:

```text
Closing Balance:
₹30,000

Transfer:
₹20,000

Remaining:
₹10,000
```

This provides flexibility for pending Festival obligations.

---

# 18. Pending Obligations

Before final settlement, show:

```text
Pending Reimbursements
₹5,000

Pending Vendor Payments
₹3,000

Other Pending Items
₹2,000
```

The Admin should see these before transferring surplus.

Do not silently move money that is already required for known obligations.

---

# 19. Settlement Status

Recommended:

```text
OPEN
READY_TO_SETTLE
SETTLED
REOPENED
```

Example:

```text
2026 Festival
SETTLED
```

A settled Festival should be treated as historical financial data.

---

# 20. Settlement Data Model

Conceptually:

```text
pandals/{pandalId}/festivals/{festivalId}/settlement
```

Suggested:

```text
settlementId
pandalId
festivalId
openingBalance
totalCashReceived
totalExpenses
totalReimbursements
closingBalance
transferToPermanent
remainingFestivalBalance
status
settledBy
settledAt
notes
```

Do not store values that can easily become stale unless they are snapshots required for historical settlement.

---

# 21. Settlement Snapshot

Once a Festival is formally settled, store a snapshot of important totals.

Example:

```text
Opening:
₹10,000

Cash Received:
₹1,15,000

Expenses:
₹90,000

Reimbursements:
₹5,000

Closing:
₹30,000
```

This provides a historical record even if reporting logic evolves later.

---

# 22. Reopening a Festival

A settled Festival should not normally be edited.

If a correction is required:

```text
Admin
   ↓
Reopen Festival
   ↓
Reason Required
   ↓
Correct Record
   ↓
Reconcile
   ↓
Resettle
```

The reopen action must be audited.

---

# 23. Settlement Permissions

Suggested:

```text
settlement.view
settlement.prepare
settlement.execute
settlement.reopen
```

Only authorized Admin/Treasurer users should settle or reopen a Festival.

---

# 24. Permanent Fund Dashboard

Pandal-level screen:

```text
Permanent Fund

Current Balance
₹20,000

Last Transfer
₹15,000

Used For
Future Festivals
```

Actions:

```text
Transfer to Festival
View History
```

---

# 25. Fund Transfer History

Example:

```text
Fund Transfers

2026 → Permanent
₹20,000
Festival Surplus

Permanent → 2027
₹15,000
Opening Fund

Permanent → 2028
₹10,000
Opening Fund
```

Every transfer should show:

```text
Date
Amount
Direction
Reason
Performed By
```

---

# 26. Year-over-Year Concept

Because Festivals repeat every year, provide historical comparison.

Example:

```text
Festival History

2024
Income ₹90,000
Expenses ₹70,000
Closing ₹20,000

2025
Income ₹1,05,000
Expenses ₹82,000
Closing ₹23,000

2026
Income ₹1,25,000
Expenses ₹95,000
Closing ₹30,000
```

---

# 27. Year-over-Year Metrics

Useful metrics:

```text
Total Cash Received
Total Expenses
Net Festival Balance
Chanda
Committee Contributions
Sponsor Cash
In-Kind Value
Personal Expenses
Reimbursements
Permanent Fund Transfer
```

Do not combine cash and estimated in-kind values incorrectly.

---

# 28. Festival Comparison

Example:

```text
2025 vs 2026

Cash Received
₹1,05,000 → ₹1,25,000

Expenses
₹82,000 → ₹95,000

Closing Balance
₹23,000 → ₹30,000
```

Show percentage change where useful.

Example:

```text
Cash Received
+19.0%
```

Avoid making comparisons that imply financial performance beyond what the data supports.

---

# 29. Expense Comparison

Example:

```text
Decoration

2025:
₹15,000

2026:
₹20,000

Change:
+₹5,000
```

Useful category comparisons:

```text
Decoration
Sound
Lighting
Prasadam
Idol
Immersion
```

---

# 30. Collection Comparison

Show:

```text
Chanda

2025:
₹70,000

2026:
₹80,000
```

Optional:

```text
Households Contributed
2025:
120

2026:
145
```

This should reuse existing Collection/Household data.

---

# 31. Committee Contribution Comparison

Example:

```text
Committee Contributions

2025:
₹18,000

2026:
₹20,000
```

Do not count the target as received money.

Use actual received values.

---

# 32. Sponsor Comparison

Example:

```text
Sponsor Cash

2025:
₹5,000

2026:
₹8,000
```

Separately:

```text
Sponsor In-Kind Value

2025:
₹10,000

2026:
₹15,000
```

---

# 33. In-Kind Comparison

Example:

```text
In-Kind Support

2025:
₹18,000 estimated

2026:
₹25,000 estimated
```

Clearly label as:

```text
Estimated Non-Cash Value
```

---

# 34. Permanent Fund History

Show how the reserve changed:

```text
Permanent Fund

2024:
₹8,000

2025:
₹15,000

2026:
₹20,000
```

Also show:

```text
Added
Used for Festival
Closing
```

---

# 35. Opening vs Closing

Each Festival should show:

```text
Opening Balance
+
Cash Received
-
Cash Spent
+
/- Transfers
=
Closing Balance
```

The exact calculation must follow the application's centralized financial ledger.

Do not create a second independent balance algorithm.

---

# 36. Financial Reconciliation

Settlement should verify:

```text
Opening Balance
+
Receipts
-
Expenses
-
Reimbursements
+
Incoming Transfers
-
Outgoing Transfers
=
Closing Balance
```

If there is a mismatch:

```text
Settlement cannot be finalized.
```

Show the discrepancy clearly.

---

# 37. Settlement Variance

Example:

```text
Calculated Closing:
₹30,000

Recorded Cash:
₹29,500

Variance:
-₹500
```

Require investigation.

Do not allow Admin to simply overwrite:

```text
Closing Balance = ₹30,000
```

to hide the difference.

---

# 38. Fund Transfer vs Expense

Example:

```text
Festival → Permanent
₹20,000
```

This is:

```text
TRANSFER
```

not:

```text
EXPENSE
```

The Pandal still owns the money.

It has only moved between internal funds.

---

# 39. Fund Transfer vs Contribution

Example:

```text
Permanent → 2027 Festival
₹10,000
```

This is:

```text
TRANSFER
```

not:

```text
DONATION
```

Do not count it again as income.

---

# 40. No Double Counting

If:

```text
2026 Festival → Permanent
₹20,000
```

then:

```text
Permanent → 2027 Festival
₹20,000
```

the ₹20,000 should not be counted as:

```text
New Donation
```

in 2027.

It is carried-forward Pandal money.

---

# 41. Festival Opening Fund Label

Use a clear label:

```text
Opening Fund
₹20,000

Source:
Permanent Fund
```

Avoid:

```text
Donation
```

or:

```text
Chanda
```

---

# 42. Transfer Confirmation

For a transfer:

```text
Transfer ₹20,000?

From:
2026 Festival

To:
Permanent Fund

Reason:
Festival Surplus
```

Require confirmation.

For large transfers, optionally require an additional Admin confirmation.

---

# 43. Settlement UX

Recommended flow:

```text
Festival Dashboard
        ↓
Settlement
        ↓
Review Summary
        ↓
Review Pending Obligations
        ↓
Choose Permanent Fund Transfer
        ↓
Confirm
        ↓
Settle Festival
```

Keep this flow simple and transparent.

---

# 44. Settlement Review Screen

Example:

```text
2026 Settlement

Opening Fund       ₹10,000
Cash Received      ₹1,15,000
Expenses           ₹90,000
Reimbursements      ₹5,000
Transfers           ₹0
---------------------------
Closing Balance     ₹30,000

Pending Obligations ₹10,000

Transfer to Permanent
[ ₹20,000 ]

Remaining
₹10,000

[ Settle Festival ]
```

---

# 45. Festival Closing Balance

The closing balance is:

```text
money remaining under that Festival
```

after all applicable transactions.

If the Admin transfers ₹20,000 to Permanent Fund:

```text
Festival Remaining:
₹10,000
```

Do not automatically force it to zero.

---

# 46. Pending Festival Balance

A Festival may retain money after settlement for legitimate reasons.

Example:

```text
₹5,000
```

reserved for:

```text
Pending vendor payment
```

The app should support a remaining balance rather than assuming everything must be transferred.

---

# 47. Future Festival Creation

When creating:

```text
2027 Festival
```

show:

```text
Permanent Fund Available:
₹20,000
```

Admin can choose:

```text
Opening Fund:
₹15,000
```

Remaining Permanent Fund:

```text
₹5,000
```

---

# 48. Multiple Transfers

Allow multiple transfers where appropriate.

Example:

```text
Permanent → 2027
₹10,000

Permanent → 2027
₹5,000
```

Total opening funding:

```text
₹15,000
```

Keep each transfer auditable.

---

# 49. Transfer Cancellation

Do not hard-delete a completed transfer.

If a transfer must be reversed:

Create a controlled reverse transfer.

Example:

```text
Original:
Permanent → Festival
₹5,000

Reverse:
Festival → Permanent
₹5,000
```

Record:

```text
reason
performedBy
performedAt
```

This preserves history.

---

# 50. Reports

Useful reports:

```text
Festival Summary
Income/Receipt Summary
Expense Summary
Fund Movement
Permanent Fund History
Year-over-Year Comparison
Contribution Summary
Sponsor Summary
In-Kind Summary
```

---

# 51. Export

Optional for MVP, but useful:

```text
CSV
PDF
```

Possible exports:

```text
Festival Settlement
Expense Report
Collection Report
Contribution Report
Fund Transfer Report
```

Do not build a complex reporting engine initially.

Start with the most useful summaries.

---

# 52. Dashboard Cards

Pandal Dashboard:

```text
Permanent Fund
₹20,000

Current Festival
2026

Opening Fund
₹10,000

Received
₹1,15,000

Spent
₹95,000

Closing
₹30,000
```

---

# 53. Historical Festival List

Example:

```text
Festivals

2026
Settled
Closing ₹30,000

2025
Settled
Closing ₹23,000

2024
Settled
Closing ₹20,000
```

Tap a year to view its complete historical financial summary.

---

# 54. Performance and Firestore Reads

Do not load every transaction from every historical Festival whenever the Dashboard opens.

Prefer:

```text
Festival summary
Permanent fund summary
Cached aggregates
```

and load detailed transactions only when requested.

Use appropriate Firestore queries and indexes.

---

# 55. Real-Time Updates

Current Festival financial summaries can update in real time where useful.

Historical year-over-year reports generally do not need constant listeners.

Avoid:

```text
Listener for every Festival
+
every Expense
+
every Contribution
```

simultaneously.

---

# 56. Offline Considerations

Transfers and settlement are financially sensitive.

If offline:

```text
Do not claim transfer completed
```

until the server-confirmed operation is available.

For the POC:

```text
Collection/Expense entry
→ existing offline behavior

Fund Transfer/Settlement
→ preferably require confirmed connectivity
```

This reduces financial ambiguity.

---

# 57. Concurrency

Potential scenario:

```text
Admin A transfers ₹10,000
Admin B transfers ₹15,000
```

Both must not spend the same available balance.

Use Firestore transactions/atomic operations.

Example:

```text
Permanent:
₹20,000

A:
₹10,000

B:
₹15,000
```

The second operation must fail or require updated balance because only ₹10,000 remains.

---

# 58. Settlement Concurrency

Two Admins must not settle the same Festival simultaneously.

Use server-side state validation/transaction logic.

Only one successful settlement should be committed.

---

# 59. Security

All fund operations must verify:

```text
Authenticated User
+
Active Pandal Membership
+
Required Permission
+
Correct Pandal
+
Correct Festival
```

Do not trust client-supplied:

```text
pandalId
festivalId
fromFund
toFund
amount
```

without server-side/Firestore validation.

---

# 60. Permissions

Suggested:

```text
funds.view
funds.transfer

settlement.view
settlement.prepare
settlement.execute
settlement.reopen

reports.view
reports.export
```

Use the existing dynamic RBAC architecture.

---

# 61. Audit Trail

Record:

```text
Fund Created
Fund Transfer Created
Fund Transfer Reversed
Festival Settlement Started
Festival Settled
Festival Reopened
Settlement Updated
```

Include:

```text
performedBy
performedAt
pandalId
festivalId
amount where applicable
reason
```

---

# 62. Financial Integrity Rules

The application must enforce:

```text
Transfer Amount > 0
```

```text
Source Balance >= Transfer Amount
```

```text
Festival Closing >= 0
```

```text
Permanent Fund >= 0
```

```text
Transfer is not Income
```

```text
Transfer is not Expense
```

```text
Opening Fund is not New Donation
```

```text
In-Kind Value is not Cash
```

---

# 63. Acceptance Criteria

## Permanent Fund

- [ ] Permanent Fund exists at Pandal level.
- [ ] Balance carries across Festivals.
- [ ] Balance cannot be negative.
- [ ] History is retained.
- [ ] Admin can view balance.
- [ ] Authorized users can transfer funds.

## Festival Opening

- [ ] New Festival can receive an opening fund.
- [ ] Opening fund can come from Permanent Fund.
- [ ] Opening fund is clearly labeled as a transfer/opening balance.
- [ ] Opening fund is not counted as new income.

## Transfers

- [ ] Permanent → Festival works.
- [ ] Festival → Permanent works.
- [ ] Transfer amount is validated.
- [ ] Insufficient balance is rejected.
- [ ] Source and destination update atomically.
- [ ] Transfers are auditable.
- [ ] Reversal uses a controlled reverse transaction.
- [ ] Transfers are not double-counted as income/expense.

## Settlement

- [ ] Settlement summarizes Festival finances.
- [ ] Pending obligations are visible.
- [ ] Closing balance is calculated.
- [ ] Admin can choose transfer amount.
- [ ] Not all closing money is automatically transferred.
- [ ] Settlement requires appropriate permission.
- [ ] Settled Festival is protected from casual edits.
- [ ] Reopening requires authorization and reason.
- [ ] Settlement mismatch blocks finalization.

## Year-over-Year

- [ ] Historical Festivals can be viewed.
- [ ] Cash received can be compared.
- [ ] Expenses can be compared.
- [ ] Closing balances can be compared.
- [ ] Contribution sources can be compared.
- [ ] In-kind values remain separate from cash.
- [ ] Permanent Fund history is visible.

## Security

- [ ] RBAC is enforced.
- [ ] Cross-Pandal access is blocked.
- [ ] Critical financial operations use safe transactions.
- [ ] Concurrent transfers cannot corrupt balances.

---

# 64. Recommended Implementation Order

```text
1. Permanent Fund model
2. Fund balance/history
3. Festival opening balance
4. Fund Transfer model
5. Permanent → Festival transfer
6. Festival → Permanent transfer
7. Transfer history
8. Settlement calculation
9. Settlement review screen
10. Pending obligations integration
11. Settlement execution
12. Settlement reopening
13. Historical Festival summaries
14. Year-over-Year reports
15. Export
16. Audit
17. Concurrency tests
```

---

# 65. Implementation Guidance for Cursor/Claude

Before modifying code:

1. Inspect the existing Festival model.
2. Inspect current God Fund/available balance logic.
3. Inspect Permanent Fund implementation if already present.
4. Inspect Expense calculations.
5. Inspect Collection/Contribution calculations.
6. Inspect Reimbursement calculations.
7. Inspect Collection Session and Reconciliation logic.
8. Inspect RBAC permissions.
9. Inspect Firestore Security Rules.
10. Identify every place where balances are calculated.
11. Create one centralized financial calculation/ledger layer where practical.
12. Do not introduce a second competing balance calculation.
13. Use Firestore transactions for fund transfers and settlement operations.
14. Add comprehensive financial tests.
15. Do not rewrite unrelated modules.

---

# 66. Critical Test Scenarios

### Scenario A — Permanent Fund to Festival

```text
Permanent:
₹20,000

Transfer:
₹15,000

Expected:
Permanent ₹5,000
Festival Opening ₹15,000
```

---

### Scenario B — Festival Surplus

```text
Festival Closing:
₹30,000

Transfer:
₹20,000

Expected:
Permanent +₹20,000
Festival Remaining ₹10,000
```

---

### Scenario C — Insufficient Funds

```text
Permanent:
₹10,000

Transfer:
₹15,000
```

Expected:

```text
Transfer rejected
Permanent unchanged
```

---

### Scenario D — No Double Counting

```text
2026 → Permanent:
₹20,000

2027 Opening:
₹20,000
```

Expected:

```text
2027 income does not increase by ₹20,000 as a new contribution.
```

---

### Scenario E — Settlement

```text
Opening:
₹10,000

Received:
₹1,15,000

Expenses:
₹90,000

Reimbursements:
₹5,000
```

Expected:

```text
Closing:
₹30,000
```

---

### Scenario F — Concurrent Transfers

```text
Permanent:
₹20,000

Admin A:
₹15,000

Admin B:
₹10,000
```

Expected:

```text
Only one transfer can consume the overlapping unavailable balance.
No negative balance.
```

---

### Scenario G — Reversal

```text
Permanent → Festival:
₹5,000
```

Reverse:

```text
Festival → Permanent:
₹5,000
```

Expected:

```text
Net Permanent change:
₹0
```

History must retain both transactions.

---

### Scenario H — Settlement Mismatch

```text
Calculated Closing:
₹30,000

Recorded/confirmed:
₹29,500
```

Expected:

```text
Settlement blocked
Variance shown
```

---

# 67. Golden Rules

### Rule 1

> Permanent Fund is Pandal-level and survives across Festival years.

### Rule 2

> Festival Fund is Festival-specific.

### Rule 3

> A Fund Transfer is not an Expense.

### Rule 4

> A Fund Transfer is not a Contribution.

### Rule 5

> Festival opening money from the Permanent Fund is not new income.

### Rule 6

> Festival surplus should not automatically transfer 100% to the Permanent Fund.

### Rule 7

> Pending obligations must be visible before settlement.

### Rule 8

> A completed transfer must never be silently deleted.

### Rule 9

> A transfer must update both source and destination atomically.

### Rule 10

> Settled Festivals should be treated as historical records.

### Rule 11

> Reopening a settlement requires authorization and audit history.

### Rule 12

> Cash and estimated in-kind value must remain separate.

### Rule 13

> Year-over-year reports must not double-count carried-forward funds.

### Rule 14

> Never allow concurrent users to corrupt fund balances.

---

# 68. Final Mental Model

```text
                         PANDAL
                           |
                  ┌────────+────────┐
                  |                 |
           PERMANENT FUND        FESTIVALS
                  |                 |
              ₹20,000       ┌───────┼────────┐
                            |       |        |
                           2025    2026     2027
                            |       |        |
                         Closed   Closed    Open
                                    |
                              Settlement
                                    |
                           Closing ₹30,000
                                    |
                          ┌─────────┴─────────┐
                          |                   |
                   Permanent             Retained
                    ₹20,000              ₹10,000
                          |
                          ↓
                       2027
                   Opening Fund
```

The system should always make it possible to answer:

> **How much money does the Pandal have permanently, how much belongs to the current Festival, how did money move between years, what was the final Festival balance, and how much was carried forward?**
