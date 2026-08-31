# Ganesh Seva — Feature Specification 12
## Festival Budget & Planning

**Document:** `12-festival-budget-and-planning.md`  
**Status:** Product / Implementation Specification  
**Stack:** Expo React Native + Firebase Auth + Firestore + Supabase Storage

---

# 1. Purpose

Festival Budget & Planning gives the committee a way to decide:

> **How much do we expect to receive, how much do we plan to spend, and how are we performing against that plan?**

This feature is planning data, not the financial ledger.

The actual financial truth must continue to come from:

```text
Collections
Contributions
Sponsors
Expenses
Reimbursements
Transfers
```

The budget only compares:

```text
PLANNED
vs
ACTUAL
```

---

# 2. Core Concept

Example:

```text
2026 Festival

Expected Receipts:
₹1,20,000

Planned Expenses:
₹1,00,000

Expected Surplus:
₹20,000
```

During the Festival:

```text
Actual Receipts:
₹1,15,000

Actual Expenses:
₹95,000

Actual Balance:
₹20,000
```

The app should clearly distinguish:

```text
Budget
```

from:

```text
Actual
```

---

# 3. Budget Data Model

Conceptually:

```text
pandals/{pandalId}/festivals/{festivalId}/budget
```

Suggested fields:

```text
budgetId
pandalId
festivalId
name
status
expectedReceipts
plannedExpenses
plannedSurplus
notes
createdBy
createdAt
updatedBy
updatedAt
```

Avoid storing calculated values if they can safely be derived.

---

# 4. Budget Status

Recommended:

```text
DRAFT
ACTIVE
LOCKED
ARCHIVED
```

Lifecycle:

```text
DRAFT
  ↓
ACTIVE
  ↓
LOCKED
```

A budget can remain editable while planning.

Once the Festival begins, the Admin may lock the original plan to preserve the baseline.

---

# 5. Why Lock the Budget?

Suppose:

```text
Original decoration budget:
₹20,000
```

Actual:

```text
₹25,000
```

If someone changes the budget to:

```text
₹25,000
```

after spending the money, the system would falsely appear to have stayed within budget.

Therefore:

> **The original approved budget should remain preserved.**

If changes are needed, maintain a budget revision rather than silently overwriting the original.

---

# 6. Budget Categories

Suggested expense categories:

```text
Idol
Decoration
Lighting
Sound
Pooja
Prasadam
Immersion
Transport
Cleaning
Electrical
Printing
Permissions
Security
Miscellaneous
```

Reuse existing Expense categories where possible.

Do not create duplicate category systems.

---

# 7. Planned Expense

Example:

```text
Decoration

Planned:
₹20,000
```

Optional:

```text
Notes:
Stage + flowers + backdrop
```

---

# 8. Planned Receipt Categories

Suggested:

```text
Household Chanda
Committee Contributions
Sponsors
Other Cash Contributions
Permanent Fund Opening
Other Receipts
```

Be careful:

```text
Permanent Fund Opening
```

is funding, not new Festival income.

The UI must label it correctly.

---

# 9. Budget vs Financial Ledger

The relationship is:

```text
Budget
  ↓
Planning

Financial Ledger
  ↓
Actual
```

Never create a financial transaction merely because a budget line was created.

Example:

```text
Planned Expense:
₹20,000
```

must not create:

```text
Expense:
₹20,000
```

---

# 10. Creating a Budget

Admin flow:

```text
Festival
  ↓
Budget
  ↓
Create Budget
```

Example:

```text
Festival Budget

Expected Chanda:
₹80,000

Committee Contribution:
₹20,000

Sponsors:
₹10,000

Other:
₹10,000

Expected Receipts:
₹1,20,000
```

---

# 11. Planned Expense Entry

Example:

```text
Add Planned Expense

Category:
Decoration

Description:
Stage decoration

Planned Amount:
₹20,000

[ Save ]
```

Keep the form simple.

---

# 12. Budget Summary

Show:

```text
2026 Budget

Expected Receipts
₹1,20,000

Planned Expenses
₹1,00,000

Planned Surplus
₹20,000
```

---

# 13. Planned Surplus

Calculate:

```text
Expected Receipts
-
Planned Expenses
=
Planned Surplus
```

Example:

```text
₹1,20,000
-
₹1,00,000
=
₹20,000
```

Do not manually enter planned surplus.

---

# 14. Actual vs Budget

This is the most important report.

Example:

```text
Decoration

Budget:
₹20,000

Actual:
₹18,500

Remaining:
₹1,500
```

If actual exceeds budget:

```text
Budget:
₹20,000

Actual:
₹24,000

Over Budget:
₹4,000
```

---

# 15. Variance

For expense categories:

```text
Variance =
Actual - Budget
```

Example:

```text
₹24,000 - ₹20,000 = +₹4,000
```

Positive means:

```text
Over Budget
```

Negative means:

```text
Under Budget
```

Use clear UI labels rather than relying only on plus/minus signs.

---

# 16. Receipt Variance

For receipts:

```text
Budget:
₹80,000

Actual:
₹75,000

Shortfall:
₹5,000
```

For receipt categories:

```text
Actual - Expected
```

Positive:

```text
Above Target
```

Negative:

```text
Below Target
```

---

# 17. Budget Progress

Example:

```text
Expenses

Planned:
₹1,00,000

Actual:
₹72,000

72% used
```

Use progress indicators.

---

# 18. Budget Alerts

Useful warnings:

```text
⚠ Decoration is 95% of budget

⚠ Sound is over budget

⚠ Expected Chanda is 20% below target
```

These are informational alerts.

Do not block expenses merely because a category is over budget unless a future approval feature explicitly requires it.

---

# 19. Budget Thresholds

Allow optional thresholds:

```text
80%
90%
100%
```

Example:

```text
Decoration:
₹16,500 / ₹20,000

82.5%

Warning
```

Avoid too many notifications.

---

# 20. Expense Integration

Actual expense totals should come directly from the existing Expense module.

Example:

```text
Budget:
Decoration ₹20,000

Expenses:
₹8,000
₹5,500
₹5,000

Actual:
₹18,500
```

Do not manually enter actual spending into Budget.

---

# 21. Category Mapping

An Expense must map to a budget category where applicable.

Example:

```text
Expense:
₹5,000

Category:
Decoration
```

Then:

```text
Decoration Actual:
+₹5,000
```

If an expense has no matching budget category:

```text
Unbudgeted Expense
```

show it separately.

---

# 22. Unbudgeted Expenses

Example:

```text
Expense:
₹4,000

Category:
Unexpected Repair
```

If no budget exists:

```text
Unbudgeted:
₹4,000
```

This is important because otherwise actual expenses can disappear from budget reporting.

---

# 23. Optional Budget Category Creation

Admin may add:

```text
Other
```

or a custom category.

Custom categories should remain Festival-specific unless the existing category system supports reusable categories.

---

# 24. Budget by Expense Category

Example:

```text
Budget vs Actual

Idol
₹15,000 → ₹15,500

Decoration
₹20,000 → ₹18,500

Sound
₹15,000 → ₹17,000

Prasadam
₹25,000 → ₹23,000

Immersion
₹10,000 → ₹9,500
```

---

# 25. Budget by Receipt Category

Example:

```text
Expected vs Actual

Chanda
₹80,000 → ₹75,000

Committee
₹20,000 → ₹20,000

Sponsors
₹10,000 → ₹12,000

Other
₹10,000 → ₹8,000
```

---

# 26. Budget Dashboard

Recommended:

```text
Festival Budget

Expected Receipts
₹1,20,000

Actual Receipts
₹1,15,000

Planned Expenses
₹1,00,000

Actual Expenses
₹95,000

Projected/Current Balance
₹20,000
```

Also:

```text
⚠ Receipts are ₹5,000 below plan
⚠ 2 categories are over budget
```

---

# 27. Current Position

Show:

```text
Budget Position

Receipts
96% of target

Expenses
95% of budget

Current Balance
₹20,000
```

Do not call this the final Festival result until the Festival is settled.

---

# 28. Forecast

Optional but useful.

Example:

```text
Planned Expenses Remaining:
₹28,000

Expected Remaining Receipts:
₹15,000

Forecast:
Potential ₹13,000 shortfall
```

Forecast must be clearly labeled as an estimate.

Do not alter actual financial balances.

---

# 29. Conservative Forecast

A future version can use:

```text
Confirmed Receipts
+
Promised Contributions
+
Expected Remaining Collections
```

But promised money should be separately identified.

Example:

```text
Confirmed:
₹75,000

Promised:
₹5,000

Total Confirmed + Promised:
₹80,000
```

Do not treat promised money as received.

---

# 30. Budget Revision

If planning changes:

```text
Decoration:
₹20,000
```

may become:

```text
₹25,000
```

Create a revision:

```text
Budget Revision #2

Decoration:
₹25,000

Reason:
Additional decoration requested
```

Do not overwrite the original value if the budget is already active/locked.

---

# 31. Revision History

Example:

```text
Budget History

Version 1
₹1,00,000
Created Aug 10

Version 2
₹1,10,000
Changed Aug 20

Reason:
Sound system upgrade
```

---

# 32. Who Can Revise?

Use RBAC.

Suggested:

```text
budget.view
budget.create
budget.update
budget.lock
budget.revise
```

Only authorized Admin/Treasurer users should revise/lock budgets.

---

# 33. Budget Approval

For the POC, a full multi-level approval workflow is unnecessary.

Simple:

```text
Admin creates
      ↓
Admin reviews
      ↓
Budget becomes ACTIVE
```

Optional future:

```text
Prepared
Approved
Locked
```

---

# 34. Budget Lock

Once locked:

```text
Original Budget
```

becomes read-only.

Actual expenses continue changing normally.

If a legitimate revision is required:

```text
Create Revision
```

with:

```text
Reason
User
Timestamp
```

---

# 35. Budget and Personal Money

The existing:

```text
God Fund vs Personal Money
```

concept must remain intact.

Budget should primarily compare:

```text
God Fund Planned Expense
vs
God Fund Actual Expense
```

Personal money used by a committee member can optionally be tracked separately.

---

# 36. Personal Expense Example

Suppose:

```text
Decoration Expense:
₹10,000

God Fund:
₹7,000

Personal Money:
₹3,000
```

Budget actual expense is:

```text
₹10,000
```

not:

```text
₹7,000
```

The budget measures the cost incurred.

The funding source remains separately visible.

---

# 37. In-Kind Contributions

Do not automatically include estimated in-kind value as cash.

Example:

```text
Donated Flowers
Estimated Value:
₹5,000
```

Budget should show:

```text
In-Kind:
₹5,000 estimated
```

separately from:

```text
Cash Receipts
```

---

# 38. Sponsor Integration

Sponsor commitments can be compared with actual sponsor receipts.

Example:

```text
Expected Sponsors:
₹10,000

Confirmed:
₹8,000

Received:
₹6,000
```

Keep:

```text
Promised
Confirmed
Received
```

distinct according to the existing Sponsor model.

---

# 39. Committee Contribution Integration

Budget target:

```text
Committee:
₹20,000
```

Actual:

```text
Received:
₹17,000
```

Show:

```text
Shortfall:
₹3,000
```

Do not automatically mark unpaid contribution as an expense.

---

# 40. Household Chanda Integration

Budget:

```text
Chanda:
₹80,000
```

Actual:

```text
₹72,000
```

Show:

```text
90% achieved
₹8,000 remaining to target
```

Do not convert the target into a receivable unless the product explicitly supports receivables.

---

# 41. Budget vs Permanent Fund

Permanent Fund should not be confused with Festival budget income.

If:

```text
Permanent Fund → Festival
₹20,000
```

show it as:

```text
Opening Funding
₹20,000
```

not:

```text
Chanda
₹20,000
```

---

# 42. Budget Settlement Integration

At Festival settlement:

```text
Budget
vs
Actual
```

should be available as part of the settlement review.

Example:

```text
Planned Expenses:
₹1,00,000

Actual Expenses:
₹95,000

Under Budget:
₹5,000
```

---

# 43. Budget and Settlement Difference

Budget is planning.

Settlement is final financial closing.

Therefore:

```text
Budget:
Expected/Planned

Settlement:
Final Actual
```

Never use the budget as the source of final Festival balance.

---

# 44. Year-over-Year Budget Comparison

Integrate with Feature 09.

Example:

```text
Decoration Budget

2025:
₹15,000

2026:
₹20,000
```

Actual:

```text
2025:
₹14,000

2026:
₹18,500
```

This helps improve next year's planning.

---

# 45. Recommended Historical Metrics

For each Festival:

```text
Planned Receipts
Actual Receipts

Planned Expenses
Actual Expenses

Planned Surplus
Actual Closing

Budget Variance
```

---

# 46. Budget Planning from Previous Year

Future convenience:

```text
2026 Final Actual
       ↓
Create 2027 Budget
       ↓
Suggested starting values
```

Example:

```text
2026 Decoration:
₹18,500

Suggested 2027:
₹20,000
```

This should be a suggestion only.

Admin must confirm the new budget.

---

# 47. Budget Copy

Allow:

```text
Copy Previous Festival Budget
```

Then Admin reviews every category before activation.

Do not automatically activate the copied budget.

---

# 48. Budget Notes

Allow overall notes:

```text
Budget Notes:

Expected higher prasadam cost this year.
```

Notes are informational.

---

# 49. Budget Notifications

Avoid excessive notifications.

Useful:

```text
Category crossed 100%
Budget revision created
Budget significantly behind expected receipts
```

Do not notify every time an expense is entered.

---

# 50. Offline Behavior

Budget creation/editing can use normal Firestore offline behavior where appropriate.

Budget locking/revision should preferably require confirmed synchronization.

Do not show a budget as permanently locked if the lock operation has not reached the server.

---

# 51. Real-Time Updates

Current Festival budget progress can update in real time where useful.

For example:

```text
Expense ₹5,000 added
```

Budget screen updates:

```text
Decoration
₹10,000 → ₹15,000
```

Avoid creating separate listeners for every expense category.

Use existing financial aggregates where available.

---

# 52. Performance

Do not calculate the entire Festival's budget by downloading every historical transaction on every screen.

Prefer:

```text
Current Festival
+
Budget summary
+
Financial aggregates
```

Load detailed transactions only when needed.

---

# 53. Firestore Read Optimization

Use:

- Festival-scoped queries
- Budget summary documents where appropriate
- Existing financial aggregates
- Limits/pagination for detail lists
- Minimal real-time listeners

Do not subscribe to all historical Festivals.

---

# 54. Security

Every budget operation must verify:

```text
Authenticated User
+
Active Pandal Membership
+
Correct Festival
+
Required Permission
```

Do not trust client-provided:

```text
pandalId
festivalId
budgetId
```

without proper validation.

---

# 55. Financial Integrity

Budget values must never modify:

```text
Festival balance
God Fund
Personal Money
Permanent Fund
Collection totals
Expense totals
```

Budget is an analytical/planning layer.

Actual financial records remain the source of truth.

---

# 56. Audit Trail

Record:

```text
Budget Created
Budget Updated
Budget Activated
Budget Locked
Budget Revised
Budget Archived
```

Include:

```text
performedBy
performedAt
festivalId
pandalId
revisionId
reason
```

---

# 57. Acceptance Criteria

## Budget

- [ ] Admin can create a Festival budget.
- [ ] Budget is Festival-specific.
- [ ] Planned receipts can be entered.
- [ ] Planned expenses can be entered.
- [ ] Planned surplus is calculated.
- [ ] Budget status is supported.
- [ ] Budget can be locked.
- [ ] Locked budget preserves baseline values.
- [ ] Revisions preserve history.

## Actual Integration

- [ ] Actual expenses come from existing Expense records.
- [ ] Actual receipts come from existing financial records.
- [ ] Budget never creates financial transactions.
- [ ] Unbudgeted expenses are visible.
- [ ] Expense category mapping works.
- [ ] In-kind value remains separate from cash.
- [ ] Personal funding remains separately visible.

## Reporting

- [ ] Budget vs actual is available.
- [ ] Expense variance is available.
- [ ] Receipt variance is available.
- [ ] Budget progress is visible.
- [ ] Over-budget categories are identifiable.
- [ ] Historical budget comparisons work.

## Security

- [ ] RBAC is enforced.
- [ ] Cross-Pandal access is blocked.
- [ ] Cross-Festival access is blocked.
- [ ] Budget locking/revision is restricted.
- [ ] Changes are audited.

---

# 58. Recommended Implementation Order

```text
1. Budget model
2. Budget summary screen
3. Planned receipt categories
4. Planned expense categories
5. Budget calculations
6. Existing Expense integration
7. Existing Collection/Contribution integration
8. Budget vs Actual
9. Variance indicators
10. Unbudgeted expense reporting
11. Budget locking
12. Budget revisions
13. Historical comparison
14. Previous-year budget copy
15. Notifications/alerts
16. Audit logging
```

---

# 59. Implementation Guidance for Cursor/Claude

Before modifying code:

1. Inspect existing Festival architecture.
2. Inspect existing Expense categories.
3. Inspect Collection/Contribution models.
4. Inspect Sponsor and In-Kind Contribution models.
5. Inspect God Fund vs Personal Money logic.
6. Inspect Permanent Fund and Transfer logic.
7. Inspect Festival Settlement.
8. Inspect existing RBAC permissions.
9. Inspect Firestore Security Rules.
10. Identify existing financial aggregates.
11. Reuse existing category definitions.
12. Do not create a second financial ledger.
13. Budget records must never directly mutate actual financial balances.
14. Use transactions where budget locking/revision changes shared state.
15. Add tests for budget calculations and variance.
16. Do not rewrite unrelated modules.

---

# 60. Critical Test Scenarios

## Scenario A — Basic Budget

```text
Expected Receipts:
₹1,20,000

Planned Expenses:
₹1,00,000
```

Expected:

```text
Planned Surplus:
₹20,000
```

---

## Scenario B — Under Budget

```text
Decoration Budget:
₹20,000

Actual:
₹18,000
```

Expected:

```text
Under Budget:
₹2,000
```

---

## Scenario C — Over Budget

```text
Decoration Budget:
₹20,000

Actual:
₹24,000
```

Expected:

```text
Over Budget:
₹4,000
```

---

## Scenario D — Receipt Shortfall

```text
Chanda Target:
₹80,000

Actual:
₹70,000
```

Expected:

```text
Shortfall:
₹10,000
```

---

## Scenario E — Unbudgeted Expense

```text
Budget:
No Repair category

Actual Repair:
₹4,000
```

Expected:

```text
Unbudgeted Expense:
₹4,000
```

---

## Scenario F — Personal Money

```text
Expense:
₹10,000

God Fund:
₹7,000

Personal:
₹3,000
```

Expected:

```text
Actual Expense:
₹10,000

Funding:
God Fund ₹7,000
Personal ₹3,000
```

Budget actual remains:

```text
₹10,000
```

---

## Scenario G — In-Kind

```text
Donated Decoration
Estimated Value:
₹5,000
```

Expected:

```text
In-Kind Value:
₹5,000

Cash Received:
unchanged
```

---

## Scenario H — Locked Budget

```text
Original:
Decoration ₹20,000

Lock

Actual:
₹24,000
```

Expected:

```text
Budget remains ₹20,000
Actual remains ₹24,000
Over Budget ₹4,000
```

---

## Scenario I — Budget Revision

```text
Original:
₹20,000

Revision:
₹25,000
```

Expected:

```text
Original revision preserved
New revision recorded
Reason recorded
```

---

# 61. Golden Rules

### Rule 1

> Budget is planning data, not financial truth.

### Rule 2

> Creating a budget must never create an Expense or Contribution.

### Rule 3

> Actual values always come from the existing financial ledger.

### Rule 4

> Budget changes must not rewrite historical actuals.

### Rule 5

> A locked budget preserves the original planning baseline.

### Rule 6

> Budget revisions must preserve revision history.

### Rule 7

> In-kind contributions are not cash.

### Rule 8

> Personal Money and God Fund remain separate funding sources.

### Rule 9

> Permanent Fund transfers are not new income.

### Rule 10

> Unbudgeted expenses must remain visible.

### Rule 11

> Promised contributions are not received money.

### Rule 12

> Budget variance should inform the committee, not silently alter financial records.

---

# 62. Final Mental Model

```text
                         FESTIVAL
                            |
                          BUDGET
                            |
             +--------------+--------------+
             |                             |
       EXPECTED RECEIPTS             PLANNED EXPENSES
             |                             |
          ₹1,20,000                    ₹1,00,000
             |                             |
             +--------------+--------------+
                            |
                     PLANNED SURPLUS
                         ₹20,000
                            |
                            ↓
                       FESTIVAL RUNS
                            |
                  +---------+---------+
                  |                   |
              ACTUAL RECEIPTS    ACTUAL EXPENSES
                ₹1,15,000          ₹95,000
                  |                   |
                  +---------+---------+
                            |
                      BUDGET vs ACTUAL
                            |
                  +---------+---------+
                  |                   |
               ON BUDGET          VARIANCE
```

The system should always make it possible to answer:

> **What did we plan to collect, what did we plan to spend, what actually happened, where are we over or under budget, and how can this year's actuals help us plan the next Festival?**
