# Ganesh Seva — Feature Specification 15
## Audit Trail & Activity Timeline

**Document:** `15-audit-and-activity-timeline.md`  
**Status:** Product / Implementation Specification  
**Stack:** Expo React Native + Firebase Auth + Firestore + Supabase Storage

---

# 1. Purpose

The Ganesh Pandal is a shared environment where multiple committee members can create and modify records.

Because many people can write to the same data, the application needs a trustworthy history of important actions.

This feature answers:

> **Who changed what, when did they change it, and what was changed?**

The Audit Trail is especially important for:

```text
Expenses
Collections
Contributions
Committee Contributions
Sponsors
Fund Transfers
Reimbursements
Cash Handover
Reconciliation
RBAC
Tasks
Events
Announcements
Assets
Budget
Festival Settlement
```

The feature should provide accountability without turning the application into an unnecessarily complex enterprise audit platform.

---

# 2. Core Concept

There are two related but different views.

### Audit Log

A structured record of a significant data change.

Example:

```text
Ravi changed Expense EXP-123

Amount:
₹5,000 → ₹5,500

Reason:
Corrected vendor amount

28 Aug 2026, 7:30 PM
```

### Activity Timeline

A human-friendly chronological feed.

Example:

```text
Today

Ravi recorded ₹500 Chanda
2 min ago

Suresh added ₹2,000 expense
15 min ago

Admin assigned Ravi as Collector
1 hr ago
```

The Audit Log is the source of accountability.

The Activity Timeline is the UX representation.

---

# 3. What Should Be Audited?

Audit important state-changing actions.

Recommended:

```text
Authentication / Membership
Pandal
Festival
Users / Roles / Permissions

Collections
Contributions
Committee Contributions
In-Kind Contributions
Sponsors

Expenses
Reimbursements
Fund Transfers
Cash Handover
Reconciliation
Settlement

Assets
Budget
Tasks
Events
Checklist
Duties / Shifts
Announcements
```

Do not audit every harmless UI interaction.

---

# 4. What Should NOT Be Audited?

Avoid creating audit records for:

```text
Opening a screen
Scrolling
Searching
Refreshing
Viewing a dashboard
Typing into a form
Changing a local filter
```

These create noise and unnecessary Firestore writes.

---

# 5. Audit Event Model

Conceptually:

```text
pandals/{pandalId}/auditLogs/{auditId}
```

Suggested fields:

```text
auditId
pandalId
festivalId
entityType
entityId
action
performedBy
performedAt
summary
before
after
metadata
severity
```

Use the existing project naming conventions.

---

# 6. Audit Action Types

Recommended:

```text
CREATE
UPDATE
DELETE
ARCHIVE
RESTORE
VOID
APPROVE
REJECT
ASSIGN
REASSIGN
COMPLETE
CANCEL
LOCK
UNLOCK
TRANSFER
RECONCILE
ROLE_CHANGE
PERMISSION_CHANGE
MEMBER_CHANGE
```

Not every entity needs every action.

---

# 7. Entity Types

Examples:

```text
EXPENSE
COLLECTION
CONTRIBUTION
COMMITTEE_CONTRIBUTION
IN_KIND_CONTRIBUTION
SPONSOR
REIMBURSEMENT
FUND_TRANSFER
CASH_HANDOVER
RECONCILIATION
SETTLEMENT

HOUSEHOLD
ASSET
BUDGET

TASK
EVENT
CHECKLIST
DUTY
SHIFT
ANNOUNCEMENT

USER
ROLE
PERMISSION
MEMBERSHIP
FESTIVAL
PANDAL
```

---

# 8. Performed By

Every audit record must identify the user who performed the action.

Example:

```text
performedBy:
userId

performedAt:
server timestamp
```

Do not rely only on the display name.

Store the stable user identifier.

---

# 9. Display Name Snapshot

For usability, optionally store:

```text
performedByName
```

as a snapshot.

Example:

```text
performedBy:
uid123

performedByName:
Ravi Kumar
```

The stable ID remains authoritative.

---

# 10. Server Timestamp

Prefer Firestore server timestamps for important audit timestamps.

Avoid relying only on the user's device clock.

This matters when multiple volunteers use different phones with incorrect time settings.

---

# 11. Entity Reference

Every audit event should identify:

```text
entityType
entityId
```

Example:

```text
entityType:
EXPENSE

entityId:
EXP-123
```

This allows:

```text
Expense Detail
   ↓
View History
```

---

# 12. Summary

Store a short human-readable summary.

Example:

```text
Ravi recorded a ₹500 cash collection from House #24.
```

or:

```text
Suresh changed expense amount from ₹5,000 to ₹5,500.
```

Do not store huge generated text blobs.

---

# 13. Before and After

For important updates, preserve relevant values.

Example:

```text
before:
{
  amount: 5000,
  category: "Decoration"
}

after:
{
  amount: 5500,
  category: "Decoration"
}
```

Do not blindly store entire large Firestore documents if unnecessary.

Store only fields relevant to the change.

---

# 14. Sensitive Data

Avoid putting unnecessary sensitive information into audit records.

Do not duplicate:

```text
Passwords
Authentication tokens
Private credentials
Full payment credentials
Unnecessary personal information
```

Audit financial values and relevant business fields, not secrets.

---

# 15. Financial Audit Priority

Financial records should have high audit importance.

Examples:

```text
Expense Created
Expense Updated
Expense Voided

Collection Created
Collection Updated
Collection Voided

Fund Transfer Created
Cash Handover Created
Reconciliation Completed

Settlement Locked
```

These records should be difficult to silently alter.

---

# 16. Financial Corrections

Example:

```text
Original Expense:
₹5,000

Corrected:
₹5,500

Reason:
Vendor invoice corrected
```

Audit:

```text
Suresh updated Expense EXP-123

₹5,000 → ₹5,500

Reason:
Vendor invoice corrected
```

Do not simply overwrite the old value without history.

---

# 17. Expense Void

Example:

```text
Expense:
₹2,000

Action:
VOID
```

Audit:

```text
Ravi voided Expense EXP-456

Amount:
₹2,000

Reason:
Duplicate entry
```

The original record remains auditable.

---

# 18. Collection Void

Example:

```text
Collection:
₹500

Action:
VOID
```

Audit:

```text
Ravi voided Collection GNS26-000184

Reason:
Duplicate collection
```

Active financial totals must use the existing financial logic.

Audit records should not independently modify balances.

---

# 19. Fund Transfer Audit

Example:

```text
Permanent Fund
→
2027 Festival

₹20,000
```

Audit:

```text
Admin transferred ₹20,000

From:
Permanent Fund

To:
2027 Festival Opening Fund
```

Include:

```text
amount
source
destination
reason
performedBy
timestamp
```

---

# 20. Cash Handover Audit

Example:

```text
Ravi handed over:

₹8,500

To:
Treasurer Suresh
```

Audit:

```text
Cash Handover Created
₹8,500

From:
Ravi

To:
Suresh
```

---

# 21. Reconciliation Audit

Example:

```text
Expected:
₹18,500

Actual:
₹18,200

Difference:
-₹300
```

Audit:

```text
Cash reconciliation completed

Variance:
-₹300

Reason:
Pending entry
```

---

# 22. RBAC Audit

RBAC changes are highly important.

Examples:

```text
Admin promoted Ravi to Treasurer
Admin assigned Collector role to Suresh
Admin removed Expense Edit permission
Admin added user to Pandal
```

Audit example:

```text
Admin changed Ravi's role

Before:
Volunteer

After:
Treasurer
```

---

# 23. Membership Audit

Record:

```text
Invitation Sent
Invitation Accepted
Invitation Rejected
Member Added
Member Removed
Member Suspended
Member Restored
```

---

# 24. Pandal Admin Changes

When someone becomes Admin:

```text
Admin role granted
```

Audit:

```text
Admin promoted Ravi to Pandal Admin.
```

Because Admin has broad authority, this event should have high visibility.

---

# 25. Role Permission Changes

Example:

```text
Treasurer

Added:
expenses.void

Removed:
expenses.delete
```

Audit:

```text
Admin updated Treasurer permissions.
```

For detailed changes:

```text
Added:
expenses.void

Removed:
expenses.delete
```

---

# 26. User Activity

Admin may open:

```text
User Activity
```

Example:

```text
Ravi Kumar

Today:
3 Collections
1 Expense
2 Tasks Completed

Recent:
₹500 collection
₹2,000 expense
Task completed
```

This is useful for accountability.

Do not use it as a performance score.

---

# 27. Activity Timeline

Main Pandal activity feed:

```text
Recent Activity

Ravi
₹500 Chanda collected
2 min ago

Suresh
₹2,000 Expense recorded
10 min ago

Kiran
Task completed:
Arrange chairs
20 min ago

Admin
Ravi assigned Treasurer role
1 hr ago
```

---

# 28. Activity Filters

Allow:

```text
All
Finance
Collections
Expenses
Members
Tasks
Events
Admin
```

Optional:

```text
User
Date
Festival
Entity
Action
```

Keep the default filter simple.

---

# 29. Activity Search

Optional:

```text
Search:
Ravi
```

or:

```text
Search:
EXP-123
```

This can help locate a specific action.

---

# 30. Date Filters

Useful:

```text
Today
Yesterday
Last 7 Days
Festival
Custom Range
```

Do not load the entire historical audit collection by default.

---

# 31. Festival Filtering

Activity should be filterable by:

```text
2026 Festival
2025 Festival
```

Pandal-level actions such as:

```text
Role change
Member change
```

may not belong to a Festival.

---

# 32. Audit Detail Screen

Example:

```text
Expense Updated

Expense:
EXP-123

Changed By:
Suresh Kumar

Time:
28 Aug 2026, 7:30 PM

Changed Fields:

Amount
₹5,000 → ₹5,500

Reason:
Vendor invoice corrected
```

---

# 33. Entity History

From any supported record:

```text
Expense Detail
    ↓
History
```

Show:

```text
Created
Updated
Updated
Voided
```

Example:

```text
10:00 AM
Created by Ravi

11:30 AM
Amount changed by Suresh

12:00 PM
Category changed by Ravi
```

---

# 34. Immutable Audit Records

Once an audit event is created:

> **Normal users must not be able to edit or delete it.**

If an audit record is somehow removed through privileged maintenance, that operation should itself be auditable.

---

# 35. Audit Retention

For a small Pandal, retain audit history for the life of the Pandal unless there is a strong reason to delete it.

This is relatively low-volume compared with financial records.

Avoid automatic deletion during Festival rollover.

---

# 36. Activity vs Audit Storage

For the POC, one audit collection can power both:

```text
Audit Log
+
Activity Timeline
```

The UI decides how much detail to show.

This avoids maintaining two separate event systems.

---

# 37. Activity Severity

Optional:

```text
INFO
IMPORTANT
CRITICAL
```

Examples:

```text
Collection created → INFO
Expense changed → IMPORTANT
Admin role granted → CRITICAL
```

Use severity sparingly.

---

# 38. Critical Activity

Admin dashboard may highlight:

```text
Critical Activity

Admin role changed
₹20,000 fund transfer
₹5,000 expense voided
```

This makes high-impact changes easy to review.

---

# 39. Audit and Notifications

Do not automatically push-notify everyone for every audit event.

For critical actions, optionally notify Admin:

```text
Large fund transfer
Admin role change
Major reconciliation variance
```

Use Feature 10 notification infrastructure.

---

# 40. Large Financial Changes

Optional future setting:

```text
Notify Admin when transaction exceeds:
₹10,000
```

This threshold should be configurable.

Do not hard-code a value without product approval.

---

# 41. Audit and Offline Writes

If a financial action is created offline:

```text
Collection created locally
```

the audit event may also be pending synchronization.

Do not display it as server-confirmed until synchronization succeeds.

Where possible, use a shared operation identifier so the financial mutation and audit event can be correlated.

---

# 42. Atomicity

For critical financial operations:

```text
Financial Change
+
Audit Event
```

should be designed so they cannot easily become inconsistent.

Use Firestore transactions/batched writes where applicable.

Example:

```text
Create Expense
+
Create Audit Record
```

as one atomic write when the data model allows it.

---

# 43. Operation ID

For important actions, consider:

```text
operationId
```

Example:

```text
OP-8A73F
```

Use it to correlate:

```text
Expense
Audit
Retry
Offline synchronization
```

This is particularly useful for preventing duplicate writes.

---

# 44. Duplicate Audit Prevention

Network retries must not produce:

```text
Expense Created
Expense Created
Expense Created
```

Use the same idempotency/operation identifier where appropriate.

---

# 45. Audit Security Rules

Normal users should generally have:

```text
create:
controlled by trusted application flow

read:
only according to audit permission

update:
false

delete:
false
```

Do not rely only on the client UI to protect audit records.

---

# 46. Who Can View Audit?

Suggested permissions:

```text
audit.view
audit.finance
audit.admin
audit.export
```

A normal volunteer may see a limited activity feed.

Sensitive financial/admin history can be restricted.

---

# 47. Limited Activity for Normal Users

Normal users could see:

```text
Ravi collected ₹500
Suresh completed a task
New announcement published
```

But may not need:

```text
Full RBAC changes
Detailed financial correction history
Private member information
```

Use permissions to control detail.

---

# 48. Admin Audit View

Admin can see:

```text
All important Pandal activity
Financial changes
Member changes
RBAC changes
Settlement actions
```

with appropriate permissions.

---

# 49. Export

Future optional feature:

```text
Export Audit Log
```

Formats:

```text
CSV
PDF
```

For the POC, CSV is sufficient.

---

# 50. Audit Reports

Optional summaries:

```text
Financial Changes
25

Member Changes
4

RBAC Changes
3

Expenses Modified
8

Collections Voided
2
```

This is useful during Festival closing.

---

# 51. Activity Timeline UX

Recommended card:

```text
┌─────────────────────────────┐
│ ₹500 Chanda collected       │
│                             │
│ Ravi Kumar                  │
│ House #24 · Gandhi Street  │
│                             │
│ 2 minutes ago               │
└─────────────────────────────┘
```

Keep cards compact.

---

# 52. Avoid "AI Vibe" UI

The Audit/Activity UI should follow the Expense Tracker design language.

Reuse:

```text
Typography
Spacing
Cards
Icons
Status indicators
Bottom sheets
Filters
Empty states
```

Avoid:

```text
Excessive gradients
Huge decorative cards
Random colors
Unnecessary illustrations
Overly rounded components
```

The interface should look like a polished finance application.

---

# 53. Empty State

Example:

```text
No activity yet

Important Pandal activity will appear here.
```

---

# 54. Loading State

Use:

```text
Skeleton rows
```

or the project's existing loading component.

Avoid blank screens.

---

# 55. Error State

Example:

```text
Unable to load activity.

Check your connection and try again.
```

Do not expose raw Firestore errors to users.

---

# 56. Pagination

Audit logs can grow continuously.

Use:

```text
Newest first
Pagination
Cursor-based loading
```

Do not download the entire history.

---

# 57. Real-Time Activity

For the current Festival, Admin may see new activity in near real time.

Example:

```text
Ravi records ₹500
```

Activity feed updates.

Scope listener to:

```text
Current Pandal
+
Current Festival
```

where appropriate.

Avoid global real-time audit listeners.

---

# 58. Performance

Use:

```text
Limit
Pagination
Date filters
Festival filters
Indexes
```

Do not run expensive aggregation queries on every dashboard refresh.

---

# 59. Firestore Indexing

Depending on actual query patterns, indexes may be needed for:

```text
pandalId
festivalId
performedAt
entityType
action
performedBy
```

Create only required composite indexes.

---

# 60. Audit and Permanent Fund

Permanent Fund actions are important because they span Festivals.

Example:

```text
2026 Settlement
₹20,000
→ Permanent Fund
```

Audit:

```text
₹20,000 transferred to Permanent Fund.
```

This should remain accessible even after 2026 becomes historical.

---

# 61. Audit and Festival Settlement

Settlement actions should be high importance:

```text
Settlement Started
Settlement Reviewed
Settlement Locked
Permanent Fund Transfer
Pending Item Recorded
```

Never delete settlement history.

---

# 62. Audit and Asset Changes

Examples:

```text
20 Chairs added
2 Chairs marked damaged
1 Speaker donated
Asset quantity changed
```

Track meaningful inventory changes.

---

# 63. Audit and Sponsor Changes

Examples:

```text
Sponsor Created
Sponsor Confirmed
Sponsor Value Changed
Sponsor Received
Sponsor Cancelled
```

Keep:

```text
Promised
Confirmed
Received
```

history clear.

---

# 64. Audit and Contribution Changes

For contributions such as:

```text
Idol
Laddu
Flowers
Decoration
```

track:

```text
Created
Updated
Status changed
Received
Cancelled
```

Estimated value changes should be auditable.

---

# 65. Audit and Household Collection

Examples:

```text
Household created
Collection recorded
Promise created
Collection corrected
Collection voided
Follow-up updated
```

This is especially useful because many volunteers will be entering collection data.

---

# 66. User Activity Summary

Optional Admin report:

```text
Activity by User

Ravi
Collections: 35
Expenses: 4
Tasks: 8

Suresh
Collections: 20
Expenses: 6
Tasks: 4
```

Use this for accountability and operational visibility.

Do not use it as an employee-performance system.

---

# 67. Financial Integrity Rule

Audit records describe what happened.

They do not independently calculate:

```text
Balance
Income
Expense
Permanent Fund
```

The financial ledger remains the source of truth.

---

# 68. Acceptance Criteria

## Audit

- [ ] Important state-changing actions generate audit records.
- [ ] Audit records identify the actor.
- [ ] Server timestamps are used for important events.
- [ ] Entity type and ID are recorded.
- [ ] Important changes can preserve before/after values.
- [ ] Financial corrections are auditable.
- [ ] RBAC changes are auditable.
- [ ] Audit records cannot be edited by normal users.
- [ ] Audit records cannot be casually deleted.

## Activity Timeline

- [ ] Recent activity is visible.
- [ ] Activity is chronological.
- [ ] Finance/Admin filters exist where appropriate.
- [ ] Festival filtering works.
- [ ] Activity can open the related record.
- [ ] Real-time updates work when connected.
- [ ] Pagination works.

## Security

- [ ] Cross-Pandal audit access is blocked.
- [ ] Cross-Festival access is controlled.
- [ ] Sensitive audit data is permission-protected.
- [ ] Audit update/delete is denied for normal clients.

## Performance

- [ ] Audit history is paginated.
- [ ] No full-history read on app startup.
- [ ] Listeners are scoped.
- [ ] Required indexes exist.
- [ ] Duplicate audit events are prevented.

---

# 69. Recommended Implementation Order

```text
1. Audit event model
2. Central audit service
3. Financial audit integration
4. RBAC/member audit integration
5. Activity timeline
6. Entity history
7. Audit detail screen
8. Filters
9. Pagination
10. Real-time current-Festival activity
11. Critical activity indicators
12. Offline/idempotency handling
13. Audit security rules
14. Export
15. Advanced reports
```

---

# 70. Central Audit Service

Do not scatter audit creation logic throughout the UI.

Create one reusable service conceptually:

```text
auditService.log(...)
```

or equivalent.

It should accept:

```text
entityType
entityId
action
performedBy
festivalId
summary
before
after
metadata
```

Then all modules use the same mechanism.

---

# 71. Implementation Guidance for Cursor/Claude

Before modifying code:

1. Inspect the existing financial transaction architecture.
2. Inspect Expense, Collection, Contribution, Sponsor and Transfer models.
3. Inspect Cash Handover/Reconciliation.
4. Inspect RBAC and membership changes.
5. Inspect Tasks, Events, Checklist, Duties and Assets.
6. Inspect existing Firestore transaction/batch helpers.
7. Inspect notification infrastructure.
8. Inspect existing Expense Tracker UI components.
9. Build one reusable Audit Service.
10. Do not create separate audit implementations per module.
11. Do not duplicate financial calculations.
12. Use atomic/batched writes where appropriate.
13. Use idempotency for retry-sensitive operations.
14. Enforce audit immutability in Firestore Rules.
15. Add tests for financial corrections, voids and RBAC changes.
16. Do not audit harmless UI interactions.
17. Optimize historical queries with pagination.
18. Do not rewrite unrelated modules.

---

# 72. Critical Test Scenarios

## Scenario A — Expense Creation

```text
Ravi creates ₹5,000 expense.
```

Expected:

```text
Expense exists.
Audit record exists.
Actor = Ravi.
Action = CREATE.
```

---

## Scenario B — Expense Correction

```text
₹5,000 → ₹5,500
```

Expected:

```text
Audit contains before = ₹5,000
Audit contains after = ₹5,500
Reason recorded if required.
```

---

## Scenario C — Expense Void

Expected:

```text
Original expense retained.
Status = VOIDED.
Audit record created.
```

---

## Scenario D — Collection

```text
Ravi records ₹500.
```

Expected:

```text
Collection created.
Audit created.
Only one financial transaction.
```

---

## Scenario E — Fund Transfer

```text
₹20,000
Permanent Fund → Festival
```

Expected:

```text
Transfer recorded.
Audit created.
```

---

## Scenario F — RBAC Change

```text
Volunteer → Admin
```

Expected:

```text
Role updated.
Audit created.
```

---

## Scenario G — Unauthorized Audit Modification

Normal user attempts:

```text
Update audit record
```

Expected:

```text
Permission denied.
```

---

## Scenario H — Retry

Network retry occurs.

Expected:

```text
One business transaction.
One corresponding audit event.
```

not duplicates.

---

## Scenario I — Cross-Pandal Access

User from Pandal A attempts:

```text
Read Pandal B audit logs.
```

Expected:

```text
Permission denied.
```

---

## Scenario J — Historical Festival

```text
2026 audit
```

remains accessible when:

```text
2027
```

becomes active.

---

# 73. Golden Rules

### Rule 1

> The Audit Log records important changes; it is not a general activity tracker for every UI interaction.

### Rule 2

> Financial records must be auditable.

### Rule 3

> RBAC and membership changes must be auditable.

### Rule 4

> Audit records are immutable to normal users.

### Rule 5

> Audit records must identify who performed the action.

### Rule 6

> Important timestamps should use server time.

### Rule 7

> Before/after values should be recorded for meaningful corrections.

### Rule 8

> Audit events must not independently modify financial balances.

### Rule 9

> Use one centralized Audit Service.

### Rule 10

> Avoid duplicate audit events during network retries.

### Rule 11

> Do not expose unnecessary private information in the Activity Timeline.

### Rule 12

> Keep audit reads paginated and scoped.

### Rule 13

> Historical audit records must survive Festival rollover.

### Rule 14

> High-impact actions such as Admin role changes, fund transfers, voids and settlement locks should be especially visible.

---

# 74. Final Mental Model

```text
                    SHARED PANDAL
                         |
          +--------------+--------------+
          |              |              |
       Ravi           Suresh          Kiran
          |              |              |
          +--------------+--------------+
                         |
                  IMPORTANT ACTION
                         |
        +----------------+----------------+
        |                                 |
   BUSINESS RECORD                    AUDIT EVENT
        |                                 |
   Expense ₹5,000                 WHO: Ravi
                                  WHAT: Created
                                  WHEN: 10:30 AM
                                  ENTITY: EXP-123
                                        |
                                        ↓
                              ACTIVITY TIMELINE
                                        |
                              "Ravi added ₹5,000
                                  expense"
```

The system should always make it possible to answer:

> **Who changed the record, what changed, when it happened, and whether the change affected the Pandal's money, members, permissions, assets, or Festival operations?**
