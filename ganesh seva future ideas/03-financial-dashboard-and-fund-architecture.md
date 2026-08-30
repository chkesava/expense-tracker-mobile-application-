# Ganesh Seva — Feature Specification 03
## Financial Dashboard & Fund Architecture

**Document:** 03-financial-dashboard-and-fund-architecture.md  
**Status:** Product / Implementation Specification  
**Stack:** Expo React Native + Firebase Auth + Firestore + Supabase Storage

---

# 1. Purpose

This feature defines the financial foundation of Ganesh Seva.

The application must make it immediately understandable:

- How much money the Pandal has
- How much belongs to the current Festival
- How much is in the Permanent Pandal Fund
- Where the money is held
- How much came in
- How much was spent
- How much is pending as reimbursement
- How much was contributed by committee members
- How much is available for God/Festival activities

The most important accounting concept is:

```text
God Fund vs Personal Money
```

This must be a first-class concept throughout the application.

---

# 2. Core Financial Architecture

The financial model should distinguish:

```text
Pandal
 |
 +-- Permanent Pandal Fund
 |
 +-- Festival
       |
       +-- Opening Fund
       +-- Money In
       +-- God Fund
       +-- Personal Money
       +-- Expenses
       +-- Reimbursements
       +-- Closing Balance
```

The Permanent Fund is Pandal-level.

Festival financial activity is Festival-level.

---

# 3. Financial Sources

Money entering the Festival can come from:

```text
Opening Fund
Chanda / House Collections
Committee Contributions
Cash Sponsorships
Other Cash Contributions
Permanent Fund Transfer
```

Not every contribution is cash.

The application must distinguish:

```text
Cash Contribution
In-Kind Contribution
Promised Contribution
Received Contribution
```

In-kind value must never automatically increase the cash balance.

Promised money must never count as available cash until actually received.

---

# 4. God Fund vs Personal Money

Every expense must identify its funding source.

Supported values:

```text
GOD_FUND
PERSONAL
SPLIT
```

### God Fund

Money already available to the Pandal/Festival.

Example:

```text
Decoration
₹5,000
Funding: God Fund
```

This reduces the God/Festival Fund.

### Personal

A committee member paid using their own money.

Example:

```text
Decoration
₹5,000
Funding: Personal
Paid By: Ravi
```

This should create a reimbursement obligation.

### Split

Example:

```text
Total: ₹5,000

God Fund: ₹3,000
Personal: ₹2,000
```

The God Fund decreases by ₹3,000.

Ravi has a ₹2,000 reimbursement claim.

---

# 5. Personal Contribution Accounting

If a committee member spends their own money for God:

```text
Ravi pays ₹5,000
```

Ravi's personal contribution/reimbursement position becomes:

```text
Pending Reimbursement
₹5,000
```

This is not the same as saying the Festival received ₹5,000 cash.

The application must not incorrectly increase Festival cash by ₹5,000.

If the committee later reimburses Ravi:

```text
Reimbursement
₹5,000
```

the God/Festival cash decreases by ₹5,000.

---

# 6. Financial Dashboard

The main Festival dashboard should provide a concise financial overview.

Suggested layout:

```text
GANESH UTSAV 2026

Available God Fund

₹45,500

Cash       ₹18,000
UPI        ₹17,500
Bank       ₹10,000

--------------------------------

Money In
₹1,20,000

Expenses
₹74,500

Pending Reimbursements
₹2,500
```

The exact UI should follow the polished Expense Tracker design language.

Do not create a dashboard consisting of dozens of unrelated cards.

---

# 7. Permanent Fund

The Permanent Pandal Fund is separate from the current Festival.

Example:

```text
Permanent Pandal Fund

₹20,000

Cash       ₹12,000
UPI         ₹5,000
Bank        ₹3,000
```

It can be used as:

```text
Opening source for a Festival
```

or receive money after Festival settlement.

It survives across years.

---

# 8. Current Festival Fund

The current Festival should have its own available balance.

Conceptually:

```text
Festival God Fund
=
Opening Festival Funds
+
Received Cash Contributions
+
Received Chanda
+
Received Committee Contributions
+
Received Cash Sponsorships
+
Permanent Fund Transfers In
-
God Fund Expenses
-
Reimbursements
-
Transfers Out
```

Do not count:

```text
Promised Contributions
In-Kind Contributions
Estimated Asset Values
Personal Expense Amounts
```

as available cash.

---

# 9. Available Cash vs Accounting Totals

Do not confuse:

```text
Total Money Received
```

with:

```text
Current Available Money
```

Example:

```text
Total Received
₹1,20,000

Total Spent
₹74,500

Available
₹45,500
```

Pending personal reimbursements must be displayed separately when they represent future cash obligations.

---

# 10. Cash / UPI / Bank

Track money by actual holding location.

Minimum supported methods:

```text
CASH
UPI
BANK
```

Optional:

```text
OTHER
```

Example:

```text
Available God Fund
₹45,500

Cash
₹18,000

UPI
₹17,500

Bank
₹10,000
```

Where applicable:

```text
Cash + UPI + Bank = Available God Fund
```

The application must not show contradictory totals.

---

# 11. Payment Method vs Funding Source

These are different concepts.

Example:

```text
Expense:
₹5,000

Funding Source:
PERSONAL

Paid By:
Ravi

Payment Method:
UPI
```

The fact that the payment used UPI does not mean the money came from the God Fund.

Similarly:

```text
Funding:
GOD_FUND

Payment Method:
CASH
```

means Pandal cash was used.

Do not merge these fields.

---

# 12. Opening Funds

Allow Admin/authorized users to enter existing Festival opening money.

Example:

```text
Opening Fund

Cash ₹10,000
UPI ₹5,000
Bank ₹5,000

Total ₹20,000
```

Opening money should be clearly identified as:

```text
OPENING_FUND
```

It must not appear as:

```text
CHANDA
COMMITTEE_CONTRIBUTION
SPONSORSHIP
```

unless it actually originated from one of those transactions.

---

# 13. Opening Fund Source

Where possible, record where opening money came from.

Examples:

```text
Permanent Fund Transfer
Previous Retained Balance
Existing Pandal Cash
Other
```

This improves auditability.

---

# 14. Financial Transaction Model

Every money-affecting record should have a clear classification.

Recommended transaction types:

```text
OPENING_FUND
COLLECTION
COMMITTEE_CONTRIBUTION
CASH_SPONSORSHIP
OTHER_INCOME
EXPENSE
REIMBURSEMENT
TRANSFER
```

Do not use vague records such as:

```text
balanceAdjustment
```

for normal operations.

Adjustments should be explicit and audited.

---

# 15. Transaction Direction

Every financial transaction should have a clear direction:

```text
MONEY_IN
MONEY_OUT
TRANSFER
```

Examples:

```text
Collection → MONEY_IN
Expense → MONEY_OUT
Reimbursement → MONEY_OUT
Permanent Fund Transfer → TRANSFER
```

This makes reporting more reliable.

---

# 16. Transaction Amount Rules

For every monetary transaction:

```text
amount > 0
```

The application must reject:

```text
0
negative numbers
NaN
Infinity
invalid numeric strings
```

Currency should be handled consistently.

For INR, store amounts using a safe representation appropriate to the existing architecture rather than relying on floating-point arithmetic for financial calculations.

---

# 17. Atomic Financial Operations

Financial operations must be safe when multiple volunteers use the application simultaneously.

Avoid:

```text
Read balance
Calculate new balance
Write balance
```

as an unsafe sequence.

Prefer:

```text
Firestore transaction
```

or appropriate atomic operations.

Examples:

- Adding opening fund
- Recording expense
- Recording reimbursement
- Recording transfer
- Generating receipt numbers
- Updating reconciliation
- Settlement

---

# 18. Ledger vs Cached Balance

The application should have a reliable source of truth.

Prefer transaction records as the accounting source of truth.

A cached balance can be maintained for performance, but it must not become an independently editable number.

Example:

```text
Transactions
     |
     v
Calculated / Verified Balance
```

Avoid:

```text
Balance = manually editable ₹50,000
```

without corresponding transactions.

---

# 19. Double-Entry-Like Thinking

A full accounting system is not required for the MVP.

However, every operation should conceptually answer:

```text
Where did the money come from?
Where did the money go?
Which Fund changed?
Which Payment Method changed?
Who performed the action?
When did it happen?
```

For a transfer:

```text
Permanent Fund
       ↓
Festival Fund
```

both sides must be represented.

---

# 20. Dashboard Money-In Breakdown

Show useful categories:

```text
Money In

Chanda                 ₹80,000
Committee Contributions ₹15,000
Sponsors                ₹8,000
Opening Fund            ₹10,000
Other                    ₹2,000
```

Do not include promised contributions.

Do not include estimated in-kind value in cash totals.

---

# 21. Dashboard Money-Out Breakdown

Show:

```text
Money Out

God Fund Expenses       ₹70,000
Reimbursements            ₹4,500
Other                     ₹1,000
```

Personal expenses that are still pending reimbursement should be shown as obligations, not immediately treated as God Fund cash expenditure.

---

# 22. Pending Reimbursement

Dashboard should show:

```text
Pending Reimbursements

₹4,500
```

Optionally:

```text
Ravi       ₹2,500
Suresh     ₹1,000
Kiran      ₹1,000
```

This helps the committee understand future obligations.

---

# 23. Committee Contribution Target

The financial dashboard can show:

```text
Committee Contribution

Target
₹20,000

Received
₹15,000

Pending
₹5,000
```

Pending target money must not increase available cash.

---

# 24. Collection Summary

Show:

```text
Chanda

Collected
₹80,000

Donors
142

Pending Houses
38
```

Do not count a promised/expected collection as actual money received.

---

# 25. Sponsor Summary

Show cash sponsorship separately where useful:

```text
Sponsors

Received
₹8,000

Promised
₹4,000
```

Only received cash sponsorship should increase available cash.

In-kind sponsorship should not.

---

# 26. In-Kind Contribution Treatment

Example:

```text
Ganesh Idol
Estimated Value: ₹15,000
Status: RECEIVED
Type: IN_KIND
```

The dashboard should show:

```text
In-Kind Contributions
₹15,000 estimated value
```

but:

```text
Available Cash
```

must remain unchanged.

This distinction is critical.

---

# 27. Financial Health Section

Optionally show:

```text
Financial Health

Collected
82%

Expenses
62%

Pending Reimbursements
₹4,500

Committee Target
75%
```

Use simple visualizations.

Do not turn the dashboard into an analytics-heavy screen.

---

# 28. Budget vs Actual

A useful optional feature:

```text
Decoration

Budget
₹20,000

Actual
₹17,500

Remaining
₹2,500
```

Categories can have optional budgets.

Do not make budgets mandatory for every expense.

---

# 29. Expense Category Totals

Show:

```text
Expenses by Category

Decoration       ₹18,500
Pooja             ₹7,200
Prasadam          ₹9,500
Sound             ₹8,000
Idol             ₹15,000
Other             ₹6,300
```

Category totals must use only actual Festival expenses.

---

# 30. Financial Timeline

Provide a recent activity list:

```text
Today

₹500 Collection
Ramesh Kumar

₹2,500 Expense
Decoration

₹1,000 Committee Contribution
Suresh

₹3,000 Reimbursement
Ravi
```

Every activity should identify:

```text
Amount
Type
User
Date
Funding Source where relevant
```

---

# 31. Auditability

Every money-affecting operation should retain:

```text
createdBy
createdAt
updatedBy
updatedAt
pandalId
festivalId
transactionType
amount
```

Where relevant:

```text
fundingSource
paymentMethod
paidBy
category
sourceTransactionId
```

Do not allow users to edit historical attribution fields without authorization.

---

# 32. Editing Financial Transactions

Financial records should not be silently overwritten.

If an expense is edited:

```text
Original
₹5,000

Changed
₹5,500
```

the system should retain an audit trail.

For critical records, consider:

```text
VOID + RECREATE
```

instead of destructive edits.

Use the project's existing audit approach.

---

# 33. Deleting Financial Transactions

Avoid hard deletion of financial transactions.

Prefer:

```text
VOIDED
```

with:

```text
voidedBy
voidedAt
voidReason
```

The original transaction remains visible in audit/history.

---

# 34. Financial Permissions

Suggested permissions:

```text
finance.view
finance.create
finance.update
finance.void
finance.transfer
finance.reconcile
finance.settle
```

Use the existing dynamic RBAC system.

Do not assume every member can perform all financial actions.

---

# 35. Admin Dashboard Financial Controls

Admin dashboard should show:

```text
Financial Overview
```

and quick access to:

```text
Collections
Expenses
Contributions
Reimbursements
Permanent Fund
Transfers
Reconciliation
Settlement
Reports
```

Use permission checks for each action.

---

# 36. Permanent Fund Dashboard

The Permanent Fund should have its own summary:

```text
Permanent Pandal Fund

₹20,000

Cash      ₹12,000
UPI        ₹5,000
Bank       ₹3,000

2026 Transfer In
₹25,000

2026 Transfer Out
₹15,000
```

History should be retained across years.

---

# 37. Festival-to-Permanent Transfer

Example:

```text
2026 Closing Balance
₹30,000

Transfer to Permanent Fund
₹25,000

Retain in Festival
₹5,000
```

The transfer is not:

```text
Donation
Income
Expense
```

It is:

```text
TRANSFER
```

Both fund balances must update atomically.

---

# 38. Permanent-to-Festival Transfer

Example:

```text
Permanent Fund
₹20,000

Transfer to 2026 Festival
₹10,000
```

After:

```text
Permanent Fund
₹10,000

2026 Opening/Transferred Fund
₹10,000
```

Do not create fake collection records for this transfer.

---

# 39. Balance Integrity Rules

At all times, prevent:

```text
Negative God Fund
Negative Permanent Fund
Negative Cash
Negative UPI
Negative Bank
Negative reimbursement
Transfer > source balance
```

where the financial model requires strict balance enforcement.

---

# 40. Concurrent User Safety

Consider:

```text
Ravi records ₹5,000 expense
Suresh records ₹3,000 expense
```

at the same time.

The resulting balances must correctly reflect both operations.

Do not allow:

```text
last write wins
```

to silently discard one financial update.

---

# 41. Offline Financial Safety

Normal collection/expense creation may use Firestore offline support if the current architecture handles it safely.

However, operations where simultaneous writes could cause irreversible financial ambiguity should require safe synchronization.

Examples:

```text
Fund Transfer
Settlement
Cash Reconciliation
Closing Festival
```

Do not display a misleading "completed" state if the operation has not safely synchronized.

---

# 42. Currency Formatting

All money displayed in the app should consistently use INR.

Examples:

```text
₹500
₹1,500
₹20,000
₹1,20,000
```

Use Indian number grouping.

Avoid inconsistent formats such as:

```text
500 INR
Rs 500
₹500.00
```

unless required in a specific report.

---

# 43. Dashboard UX

The dashboard should follow the existing Expense Tracker's polished UI language.

Prioritize:

```text
Current Festival
Available God Fund
Money In
Money Out
Pending Reimbursements
Payment Method Breakdown
Recent Activity
Needs Attention
```

Do not overwhelm users with every metric.

---

# 44. Loading / Empty / Error States

Financial screens need:

### Loading

Skeleton/loading state.

### Empty

```text
No financial activity yet.

Start by adding a collection,
contribution, or expense.
```

### Error

```text
We couldn't load the financial summary.

[ Retry ]
```

Never show a blank dashboard.

---

# 45. Financial Dashboard Acceptance Criteria

- [ ] Dashboard shows current Festival.
- [ ] Available God Fund is correct.
- [ ] Permanent Fund is shown separately.
- [ ] Cash/UPI/Bank totals reconcile.
- [ ] Money-In totals exclude promises and in-kind value.
- [ ] Money-Out totals correctly include God Fund expenses.
- [ ] Personal expenses do not incorrectly reduce God Fund before reimbursement.
- [ ] Split expenses calculate correctly.
- [ ] Pending reimbursements are visible.
- [ ] Committee contribution targets distinguish target/received/pending.
- [ ] Sponsor cash and in-kind values are separated.
- [ ] Opening Fund is clearly classified.
- [ ] Transfers are not classified as income/expense.
- [ ] Closed Festival totals remain stable.
- [ ] Concurrent financial operations do not overwrite each other.
- [ ] Unauthorized users cannot modify financial data.

---

# 46. Implementation Checklist

Before implementing:

1. Inspect the existing Firestore financial schema.
2. Inspect all current balance calculations.
3. Inspect God Fund vs Personal Money implementation.
4. Inspect reimbursement calculations.
5. Inspect Permanent Fund calculations.
6. Inspect Cash/UPI/Bank implementation.
7. Inspect dashboard queries.
8. Inspect Firestore transactions.
9. Inspect Firestore Security Rules.
10. Inspect RBAC permissions.
11. Identify duplicated financial logic.
12. Centralize calculations where appropriate.
13. Add tests for critical money calculations.
14. Do not modify unrelated Expense Tracker behavior.

---

# 47. Recommended Financial Domain Services

Where appropriate, keep financial logic centralized.

Possible services:

```text
financialService
balanceService
fundService
reimbursementService
transferService
settlementService
```

Avoid calculating important financial totals independently in every screen.

Prefer:

```text
Firestore Data
      ↓
Financial Domain Logic
      ↓
Dashboard
Reports
Screens
```

---

# 48. Important Anti-Patterns

Avoid:

```text
❌ Manually editable balance
❌ Client-only authorization
❌ Floating-point financial calculations
❌ Read → calculate → overwrite without transaction
❌ Treating personal spending as God Fund spending
❌ Treating in-kind value as cash
❌ Treating promised money as received
❌ Treating transfers as income/expense
❌ Hard deleting financial history
❌ One giant Firestore financial document
❌ Duplicate balance calculation logic
```

---

# 49. Final Financial Mental Model

```text
                         PANDAL
                           |
                +----------+----------+
                |                     |
         PERMANENT FUND           FESTIVAL
                |                     |
                |                2026 Fund
                |                     |
                |        +------------+------------+
                |        |            |            |
                |     Money In     Expenses    Reimbursements
                |        |            |            |
                |        |       +----+----+       |
                |        |       |         |       |
                |        |    God Fund  Personal   |
                |        |       |         |        |
                |        |       |      Member      |
                |        |       |    obligation    |
                |        |       |                  |
                +--------+-------+------------------+
                         |
                    Settlement
                         |
                         v
                 Permanent Fund
```

---

# 50. Golden Financial Rules

### Rule 1

> God Fund and Personal Money are different.

### Rule 2

> In-kind contributions have value but do not create cash.

### Rule 3

> Promised money is not received money.

### Rule 4

> Transfers are not income or expenses.

### Rule 5

> Permanent Fund is Pandal-level and survives across Festival years.

### Rule 6

> Festival money belongs to its specific Festival.

### Rule 7

> Cash, UPI and Bank are holding locations, not funding sources.

### Rule 8

> Every financial operation must be attributable to a user.

### Rule 9

> Financial operations must be safe under concurrent writes.

### Rule 10

> The transaction history is the source of truth; balances should not be manually editable.

### Rule 11

> Financial history should be auditable and should not be silently deleted.

### Rule 12

> The UI must make financial state understandable without requiring accounting knowledge.
