# Ganesh Seva — Feature Specification 05
## Expenses, God Fund vs Personal Money & Reimbursements

**Document:** 05-expenses-god-fund-personal-money-reimbursements.md  
**Status:** Product / Implementation Specification  
**Stack:** Expo React Native + Firebase Auth + Firestore + Supabase Storage

---

# 1. Purpose

This feature defines the complete Festival expense system.

The most important concept is:

> **God Fund vs Personal Money must be a first-class financial concept.**

A committee member may purchase something for Ganesh Seva using:

1. Pandal/Festival money — **God Fund**
2. Their own personal money — **Personal**
3. A combination of both — **Split**

The application must clearly track the difference.

---

# 2. Core Expense Model

Every expense belongs to:

```text
Pandal
   |
Festival
   |
Expense
```

An expense should identify:

```text
What was purchased?
How much?
Which category?
Who paid?
Which money was used?
How was it paid?
When?
Who recorded it?
Receipt/bill?
```

---

# 3. Funding Source

Every expense must have:

```text
GOD_FUND
PERSONAL
SPLIT
```

## GOD_FUND

Example:

```text
Decoration
₹5,000

Funding:
God Fund
```

The Festival's available God Fund decreases by ₹5,000.

---

## PERSONAL

Example:

```text
Decoration
₹5,000

Funding:
Personal

Paid By:
Ravi
```

The Festival's God Fund does NOT decrease at the time of purchase.

Instead, Ravi receives a:

```text
₹5,000 Pending Reimbursement
```

obligation.

---

## SPLIT

Example:

```text
Total Expense:
₹5,000

God Fund:
₹3,000

Personal:
₹2,000

Paid By:
Ravi
```

Result:

```text
God Fund decreases:
₹3,000

Ravi reimbursement:
₹2,000
```

---

# 4. Payment Method

Payment method and funding source are separate.

Payment method:

```text
CASH
UPI
BANK
OTHER
```

Example:

```text
Funding:
PERSONAL

Paid By:
Ravi

Payment:
UPI
```

This means Ravi used his own UPI account.

It does NOT mean Festival UPI balance decreased.

---

# 5. Expense Data Model

Conceptually:

```text
pandals/{pandalId}/festivals/{festivalId}/expenses/{expenseId}
```

Suggested fields:

```text
expenseId
pandalId
festivalId
title
description
categoryId
amount
fundingSource
godFundAmount
personalAmount
paidBy
paymentMethod
vendorId
assetId
receiptFilePath
expenseDate
createdBy
createdAt
updatedBy
updatedAt
status
```

Do not blindly copy this structure if the existing application already has a better compatible model.

---

# 6. Amount Rules

For a normal expense:

```text
amount > 0
```

Reject:

```text
0
negative amount
NaN
Infinity
invalid numeric values
```

For split expenses:

```text
godFundAmount + personalAmount = totalAmount
```

This equality must always hold.

---

# 7. Personal Expense Accounting

Example:

```text
Ravi buys decoration material.

Total:
₹3,000

Funding:
PERSONAL

Paid By:
Ravi
```

Create:

```text
Expense:
₹3,000

Reimbursement Obligation:
Ravi → ₹3,000
```

Do NOT:

```text
reduce God Fund by ₹3,000
```

until the reimbursement is actually paid from the Festival/Pandal Fund.

---

# 8. Personal Contribution vs Reimbursement

These are different.

### Personal Expense

Ravi spends his money for a Festival purchase.

```text
Ravi → ₹5,000 spent
Pandal owes Ravi → ₹5,000
```

### Personal Contribution

Ravi intentionally contributes ₹5,000 and does not expect reimbursement.

```text
Ravi → ₹5,000 contribution
Pandal owes Ravi → ₹0
```

The application must never automatically treat every personal payment as a committee contribution.

The user must explicitly choose the intended financial treatment.

---

# 9. Personal Expense That Is Not Reimbursed

The user may choose:

```text
Personal
No Reimbursement
```

Example:

```text
Expense:
₹2,000

Paid By:
Ravi

Treatment:
Personal Contribution
```

This should be recorded appropriately as an in-kind/personal contribution to the Festival according to the existing financial model.

Do not create a reimbursement obligation.

---

# 10. Reimbursement Requirement

For a personal expense:

```text
Reimbursement:
REQUIRED
```

The system should create a pending reimbursement.

Example:

```text
Ravi

Pending Reimbursement
₹4,500
```

---

# 11. Reimbursement Status

Recommended:

```text
PENDING
PARTIALLY_PAID
PAID
CANCELLED
```

Example:

```text
Ravi
Expense: ₹5,000

Paid:
₹3,000

Remaining:
₹2,000

Status:
PARTIALLY_PAID
```

---

# 12. Reimbursement Record

Conceptually:

```text
pandals/{pandalId}/festivals/{festivalId}/reimbursements/{reimbursementId}
```

Suggested fields:

```text
reimbursementId
pandalId
festivalId
expenseId
memberId
amount
paidAmount
remainingAmount
status
paymentMethod
paidBy
createdAt
paidAt
createdBy
updatedBy
```

---

# 13. Reimbursement Payment

When the Pandal reimburses Ravi:

```text
Pending:
₹5,000

Reimbursement Paid:
₹5,000

Remaining:
₹0
```

The Festival God Fund decreases by ₹5,000.

The reimbursement becomes:

```text
PAID
```

This must be a safe financial transaction.

---

# 14. Partial Reimbursement

Allow:

```text
Expense:
₹10,000

Personal:
₹10,000

Reimbursement:
₹4,000
```

Then:

```text
Paid:
₹4,000

Remaining:
₹6,000
```

Status:

```text
PARTIALLY_PAID
```

The God Fund only decreases by the amount actually reimbursed.

---

# 15. Split Expense Example

```text
Expense:
₹10,000

God Fund:
₹6,000

Personal:
₹4,000

Paid By:
Ravi
```

Immediately:

```text
God Fund:
-₹6,000

Pending Ravi reimbursement:
₹4,000
```

If Ravi is reimbursed:

```text
God Fund:
-₹4,000
```

Total economic impact:

```text
God Fund:
₹10,000
```

across the initial payment + reimbursement.

---

# 16. Expense Categories

Provide useful categories.

Suggested defaults:

```text
Ganesh Idol
Decoration
Pooja Materials
Prasadam
Sound System
Lighting
Electricity
Tent
Stage
Transportation
Immersion
Cleaning
Security
Printing
Water
Food
Miscellaneous
```

The Admin can manage categories if the existing RBAC supports it.

Do not make categories unnecessarily complicated.

---

# 17. Custom Categories

Allow authorized Admin users to create categories.

Example:

```text
New Category:
Cultural Program
```

Category should have:

```text
categoryId
name
active
createdBy
createdAt
```

Do not delete categories that are already used by historical expenses.

Prefer:

```text
INACTIVE
```

---

# 18. Expense Entry UX

Adding an expense should be quick.

Suggested first screen:

```text
Add Expense

What did you buy?
Decoration Material

Amount
₹2,500

Category
Decoration

Funding
[ God Fund ]
[ Personal ]
[ Split ]

[ Save Expense ]
```

Show additional fields progressively.

Avoid a huge accounting form.

---

# 19. God Fund Expense

Example:

```text
Add Expense

Decoration
₹5,000

Funding:
God Fund

Payment:
Cash
```

On save:

```text
God Fund
₹50,000
   ↓
₹45,000
```

---

# 20. Personal Expense UX

Example:

```text
Add Expense

Decoration
₹5,000

Funding:
Personal

Paid By:
Ravi

Reimbursement:
[ Required ]

[ Save Expense ]
```

If the logged-in user is the payer, preselect them where safe.

Allow selecting another authorized member when appropriate.

---

# 21. Split Expense UX

When:

```text
Funding:
Split
```

show:

```text
Total
₹5,000

God Fund
₹3,000

Personal
₹2,000

Paid By
Ravi
```

Validate:

```text
₹3,000 + ₹2,000 = ₹5,000
```

Do not allow save until the split balances.

---

# 22. Expense Receipt

Allow attaching a receipt/bill.

Example:

```text
Receipt
📷 decoration_bill.jpg
```

Use the existing Supabase Storage abstraction.

Recommended path:

```text
pandals/{pandalId}/festivals/{festivalId}/expenses/{expenseId}/receipt.jpg
```

The exact bucket/path can follow the existing StorageService implementation.

---

# 23. Image Limits

For receipt images:

```text
Maximum:
5 MB

Allowed:
JPEG
PNG
WEBP
```

Before upload:

```text
Camera/Gallery
      ↓
Resize
      ↓
Compress
      ↓
Upload
```

Aim for approximately:

```text
300 KB – 1.5 MB
```

where readability remains good.

---

# 24. Storage Security

Do not expose a Supabase service-role key in the Expo app.

The client should use the project's controlled StorageService.

Do not use Storage as the authorization source.

Financial ownership and permissions remain in Firebase/Firestore.

---

# 25. Vendor Link

If the application has Vendor Management:

```text
Expense
   ↓
Vendor
```

Example:

```text
₹15,000
Decoration

Vendor:
Sri Decorations
```

This allows vendor spending reports.

Vendor functionality is documented separately.

---

# 26. Asset Link

If an expense creates a reusable asset:

```text
Expense
   ↓
Asset
```

Example:

```text
20 Chairs
₹15,000
```

The expense remains part of the Festival's historical financial records.

The resulting chairs become Pandal-level Assets.

Do not make next year's use of the chairs a new expense.

---

# 27. Expense List

Suggested UI:

```text
Expenses

₹74,500
32 Expenses

[ Search ]
[ Filter ]

Decoration
₹5,000
God Fund
Today

Sound System
₹8,000
Personal · Ravi
Yesterday

Chairs
₹15,000
God Fund
Aug 20
```

Use clear funding indicators.

---

# 28. Expense Detail

Show:

```text
Decoration Material

₹5,000

Category
Decoration

Funding
God Fund

Payment
Cash

Paid By
Pandal Fund

Date
25 Aug 2026

Recorded By
Ravi

Receipt
View Receipt
```

For personal:

```text
Funding
Personal

Paid By
Ravi

Reimbursement
₹5,000 Pending
```

---

# 29. Expense Search

Support:

```text
Title
Description
Category
Vendor
Paid By
Receipt Number
```

Avoid loading the entire database just to perform a client-side search.

Use appropriate Firestore query patterns.

---

# 30. Expense Filters

Useful filters:

```text
Category
Funding Source
Payment Method
Paid By
Date
Status
Vendor
```

Quick filters:

```text
All
God Fund
Personal
Split
Pending Reimbursement
```

---

# 31. Expense Statistics

Show:

```text
Total Expenses
God Fund Expenses
Personal Expenses
Pending Reimbursements
```

Optional:

```text
Expenses by Category
Expenses by Payment Method
Expenses by Member
```

---

# 32. Expense Budget vs Actual

If budgets are implemented:

```text
Decoration

Budget:
₹20,000

Actual:
₹17,500

Remaining:
₹2,500
```

Budget is optional.

Do not prevent an expense because no budget exists.

---

# 33. Expense Editing

Authorized users can edit expenses according to RBAC.

However, financial changes must be auditable.

Example:

```text
Original:
₹5,000

Updated:
₹5,500
```

Record:

```text
Changed By
Changed At
Old Value
New Value
Reason if required
```

Do not silently overwrite financial history.

---

# 34. Changing Funding Source

Changing:

```text
GOD_FUND
```

to:

```text
PERSONAL
```

is a financial event.

Example:

```text
Original:
God Fund ₹5,000

Changed:
Personal ₹5,000
Paid By Ravi
```

The system must reverse the original financial effect and create the correct reimbursement obligation atomically.

Do not simply update a string field.

---

# 35. Changing Split Amounts

Example:

```text
Original:
God Fund ₹3,000
Personal ₹2,000
```

Changed:

```text
God Fund ₹4,000
Personal ₹1,000
```

The financial balances and reimbursement obligation must be adjusted correctly.

All changes must be auditable.

---

# 36. Expense Voiding

Avoid hard deletion.

Use:

```text
VOIDED
```

with:

```text
voidedBy
voidedAt
voidReason
```

A voided expense should no longer affect Festival balances.

Any linked pending reimbursement must also be handled safely.

---

# 37. Reimbursement When Expense Is Voided

If:

```text
Expense:
₹5,000 Personal

Reimbursement:
₹5,000 Pending
```

and the expense is voided:

```text
Expense:
VOIDED

Reimbursement:
CANCELLED
```

Do not leave an orphaned ₹5,000 reimbursement obligation.

If part of the reimbursement has already been paid, require controlled handling rather than silently changing history.

---

# 38. Reimbursement Dashboard

Provide:

```text
Pending Reimbursements

₹7,500

Ravi
₹5,000

Suresh
₹2,500
```

Tap a member:

```text
Ravi

Total Pending
₹5,000

Expenses:
Decoration ₹3,000
Sound ₹2,000
```

---

# 39. Reimbursement Permissions

Suggested:

```text
reimbursements.view
reimbursements.create
reimbursements.pay
reimbursements.update
reimbursements.cancel
```

Use dynamic RBAC.

Not every committee member should be allowed to mark reimbursements as paid.

---

# 40. Financial Permissions

Suggested expense permissions:

```text
expenses.view
expenses.create
expenses.update
expenses.void
expenses.viewPersonal
expenses.manageCategories
```

Sensitive reimbursement permissions should be separate.

---

# 41. God Fund Balance Integration

For every expense:

### God Fund

```text
God Fund -= godFundAmount
```

### Personal

```text
God Fund unchanged
Reimbursement += personalAmount
```

### Split

```text
God Fund -= godFundAmount
Reimbursement += personalAmount
```

The dashboard must use the same centralized financial logic.

---

# 42. Reimbursement Integration

When reimbursement is paid:

```text
God Fund -= paidAmount
Reimbursement Remaining -= paidAmount
```

Do not reduce God Fund when the reimbursement is merely created.

---

# 43. Concurrent Writes

Two users may create expenses at the same time.

Example:

```text
Ravi:
God Fund expense ₹5,000

Suresh:
God Fund expense ₹3,000
```

Both must be reflected.

Avoid unsafe:

```text
Read balance
Calculate
Overwrite balance
```

Use Firestore transactions or atomic operations where appropriate.

---

# 44. Duplicate Submission Protection

Protect against:

```text
Double tap Save
Network retry
App retry
```

Do not create duplicate expenses.

Use an appropriate idempotency/client operation identifier where necessary.

---

# 45. Offline Expense Entry

If the existing Firestore architecture supports offline writes:

```text
Offline
   ↓
Create Expense
   ↓
Pending Sync
   ↓
Online
   ↓
Sync
```

The UI should show synchronization status.

Critical balance calculations must remain consistent after synchronization.

---

# 46. Real-Time Updates

If Ravi records:

```text
₹5,000 Decoration
```

other authorized users should see the new expense and updated dashboard where real-time updates are intended.

Avoid excessive listeners.

---

# 47. Personal Money Summary

Provide a member-level summary:

```text
Personal Money

Ravi

Spent Personally
₹8,500

Reimbursed
₹5,000

Pending
₹3,500
```

This is one of the strongest transparency features of the application.

---

# 48. Committee Contribution Interaction

If Ravi decides:

> "I don't want this ₹5,000 back."

the system should support converting the financial treatment appropriately rather than leaving a false reimbursement obligation.

Example:

```text
Personal Expense
₹5,000

Convert to:
Committee Contribution

Reimbursement:
₹0
```

This action must be audited.

---

# 49. Expense Funding Summary

Festival dashboard:

```text
Expense Funding

God Fund
₹70,000

Personal
₹12,500

Split
₹7,500
```

Be careful not to double-count split expenses.

For reporting, distinguish:

```text
Total Expense
```

from:

```text
God Fund Portion
Personal Portion
```

---

# 50. Expense Categories Report

Example:

```text
Expenses by Category

Decoration
₹18,500

Pooja
₹7,200

Prasadam
₹9,500

Sound
₹8,000

Idol
₹15,000
```

Optional breakdown:

```text
God Fund
₹13,000

Personal
₹5,500
```

---

# 51. Receipt Vault Integration

An expense can have:

```text
Receipt Attached ✓
```

or:

```text
No Receipt
```

The application should not necessarily require a receipt for every expense unless the Admin configures that policy.

---

# 52. Expense Notes

Allow notes such as:

```text
Bought from local market.
Vendor gave committee discount.
```

Keep notes optional.

Do not place important financial information only in free-text notes.

---

# 53. Expense Date vs Created Date

Store both where useful:

```text
expenseDate
createdAt
```

Example:

```text
Purchase:
Aug 20

Entered into app:
Aug 22
```

Reports should normally use the actual expense date.

Audit should use the creation/update timestamp.

---

# 54. Paid By vs Recorded By

These are different.

Example:

```text
Paid By:
Ravi

Recorded By:
Suresh
```

This is valid.

The app must not automatically assume the user entering the expense is the person who paid.

---

# 55. Expense Source Attribution

Every expense should answer:

```text
Who paid?
What fund was used?
Who recorded it?
When?
```

This supports accountability.

---

# 56. Security Rules

Firestore Security Rules must ensure:

```text
Authenticated
+
Active Pandal Membership
+
Required Permission
+
Correct Pandal
+
Correct Festival
```

For financial modifications, verify authorization server-side through Firestore Rules and the application's secure data model.

Do not trust:

```text
fundingSource
paidBy
festivalId
pandalId
```

merely because they came from the client.

---

# 57. Firestore Data Integrity

Important invariants:

```text
totalAmount > 0

godFundAmount >= 0

personalAmount >= 0

godFundAmount + personalAmount = totalAmount

reimbursementRemaining =
personalAmount - reimbursedAmount
```

For a non-reimbursable personal contribution:

```text
reimbursementRemaining = 0
```

These rules should be validated consistently.

---

# 58. Currency Precision

Use the same precise INR representation established by Feature 03.

Do not introduce a second money representation.

Avoid JavaScript floating-point calculations for financial logic.

---

# 59. Audit Trail

Record:

```text
Expense Created
Expense Updated
Expense Voided
Funding Source Changed
Split Changed
Reimbursement Created
Reimbursement Paid
Reimbursement Partially Paid
Reimbursement Cancelled
Personal Expense Converted to Contribution
```

Include:

```text
performedBy
performedAt
pandalId
festivalId
expenseId
```

---

# 60. UX Requirements

The experience should be understandable to someone with no accounting knowledge.

Use human-friendly labels:

```text
God Fund
My Own Money
Split Payment
Pending Reimbursement
Reimbursed
```

Avoid exposing internal terms such as:

```text
ledger debit
liability
journal entry
```

unless required in reports.

---

# 61. Expense Entry Example

### God Fund

```text
Decoration
₹5,000

Paid From:
God Fund

Payment:
Cash

[ Save ]
```

### Personal

```text
Decoration
₹5,000

Paid By:
Ravi

Paid From:
My Own Money

Reimbursement:
Required

[ Save ]
```

### Split

```text
Decoration
₹5,000

God Fund:
₹3,000

My Own Money:
₹2,000

Paid By:
Ravi

[ Save ]
```

---

# 62. Acceptance Criteria

## Expense Creation

- [ ] User can create a Festival expense.
- [ ] Expense belongs to correct Pandal.
- [ ] Expense belongs to correct Festival.
- [ ] Amount validation works.
- [ ] Category is stored.
- [ ] Payment method is stored.
- [ ] Paid By is stored.
- [ ] Recorded By is stored.
- [ ] Expense date is stored.
- [ ] Funding source is explicit.

## God Fund

- [ ] God Fund expense reduces available God Fund.
- [ ] Correct payment method balance is updated.
- [ ] Concurrent expenses do not overwrite each other.

## Personal

- [ ] Personal expense does not immediately reduce God Fund.
- [ ] Reimbursement obligation is created when required.
- [ ] Paid By is recorded.
- [ ] Non-reimbursable personal contribution does not create false reimbursement.

## Split

- [ ] God Fund amount is stored.
- [ ] Personal amount is stored.
- [ ] Amounts sum exactly to total.
- [ ] God Fund is reduced only by God Fund portion.
- [ ] Reimbursement is created only for personal portion.

## Reimbursement

- [ ] Pending reimbursement is visible.
- [ ] Partial reimbursement works.
- [ ] Full reimbursement works.
- [ ] Reimbursement reduces God Fund only when paid.
- [ ] Voiding an unpaid expense cancels its reimbursement.
- [ ] Paid history is retained.

## Receipts

- [ ] Receipt can be attached.
- [ ] Images are compressed before upload where appropriate.
- [ ] Storage path is scoped by Pandal/Festival/Expense.
- [ ] Supabase service-role key is never exposed.

## Security

- [ ] Only authorized users can create expenses.
- [ ] Only authorized users can modify expenses.
- [ ] Only authorized users can pay reimbursements.
- [ ] Users cannot alter Pandal/Festival ownership to bypass access.
- [ ] Firestore Rules enforce authorization.

## Audit

- [ ] Financial changes are audited.
- [ ] Voids are audited.
- [ ] Funding-source changes are audited.
- [ ] Reimbursement actions are audited.

---

# 63. Recommended Implementation Order

```text
1. Expense model
2. Expense categories
3. Add Expense UI
4. God Fund expenses
5. Personal expenses
6. Split expenses
7. Reimbursement model
8. Reimbursement dashboard
9. Partial/full reimbursement
10. Receipt attachment
11. Expense search/filter
12. Expense editing/audit
13. Expense voiding
14. Personal contribution conversion
15. Reports/statistics
16. Offline improvements
```

---

# 64. Implementation Guidance for Cursor/Claude

Before modifying code:

1. Inspect the existing expense implementation.
2. Inspect Feature 03 financial calculations.
3. Inspect current God Fund logic.
4. Inspect Permanent Fund logic.
5. Inspect reimbursement logic if already present.
6. Inspect RBAC permissions.
7. Inspect Firestore Security Rules.
8. Inspect Supabase Storage integration.
9. Inspect receipt/image handling.
10. Find duplicate financial calculations.
11. Centralize critical financial operations.
12. Add tests for God Fund, Personal, Split, and Reimbursement cases.
13. Do not rewrite unrelated Expense Tracker functionality.

---

# 65. Critical Test Scenarios

### Scenario A — God Fund

```text
Starting God Fund:
₹20,000

Expense:
₹5,000 God Fund

Expected:
₹15,000
```

### Scenario B — Personal

```text
Starting God Fund:
₹20,000

Personal Expense:
₹5,000

Expected God Fund:
₹20,000

Ravi Pending:
₹5,000
```

### Scenario C — Reimbursement

```text
God Fund:
₹20,000

Ravi Pending:
₹5,000

Reimburse:
₹5,000

Expected God Fund:
₹15,000

Ravi Pending:
₹0
```

### Scenario D — Split

```text
Starting:
₹20,000

Expense:
₹10,000

God Fund:
₹6,000

Personal:
₹4,000

Expected God Fund:
₹14,000

Ravi Pending:
₹4,000
```

### Scenario E — Partial Reimbursement

```text
God Fund:
₹14,000

Ravi Pending:
₹4,000

Pay:
₹2,000

Expected:
God Fund ₹12,000
Ravi Pending ₹2,000
```

### Scenario F — Personal Contribution

```text
Expense:
₹5,000

Paid By:
Ravi

Treatment:
Personal Contribution

Expected:
God Fund unchanged
Reimbursement ₹0
Contribution value recorded
```

---

# 66. Golden Rules

### Rule 1

> God Fund and Personal Money are never the same thing.

### Rule 2

> A personal expense does not reduce God Fund until the Pandal actually reimburses the person.

### Rule 3

> Split expenses must explicitly identify both portions.

### Rule 4

> Payment method is different from funding source.

### Rule 5

> Paid By is different from Recorded By.

### Rule 6

> Personal contribution and reimbursement are different financial outcomes.

### Rule 7

> Reimbursement is an obligation when created, not cash expenditure until paid.

### Rule 8

> Financial edits must be auditable.

### Rule 9

> Financial records should be voided rather than silently deleted.

### Rule 10

> Concurrent users must never cause one expense or reimbursement to overwrite another.

### Rule 11

> The dashboard must not double-count split expenses.

### Rule 12

> The user interface should make the funding source obvious before saving an expense.

---

# 67. Final Mental Model

```text
                    EXPENSE
                       |
              +--------+--------+
              |        |        |
           GOD FUND PERSONAL   SPLIT
              |        |        |
              |        |     +--+--+
              |        |     |     |
              |        |   God   Personal
              |        |   Fund    Money
              |        |     |       |
              |        |     |    Reimbursement
              |        |     |       |
              v        v     v       v
          Fund ↓    No Fund ↓      Obligation
                     ↓
                 Reimburse
                     ↓
                  Fund ↓
```

The application should always make it possible to answer:

> **How much did the Festival spend, how much came from the God Fund, how much was personally paid by committee members, and how much does the Pandal still owe them?**
