# Ganesh Seva — Feature Specification 08
## Collection Sessions, Cash Handover & Reconciliation

**Document:** 08-collection-sessions-cash-handover-and-reconciliation.md  
**Status:** Product / Implementation Specification  
**Stack:** Expo React Native + Firebase Auth + Firestore + Supabase Storage

---

# 1. Purpose

This feature manages what happens **after volunteers go out and collect Chanda**.

The collection system already records individual household collections. This feature adds operational accountability around those collections:

```text
Volunteer
   ↓
Collection Session
   ↓
Individual Collections
   ↓
Cash / UPI / Bank Received
   ↓
Handover
   ↓
Pandal Fund
   ↓
Reconciliation
```

The goal is to answer:

- Who collected the money?
- During which session?
- How much did they collect?
- How much was Cash?
- How much was UPI?
- How much was Bank?
- How much was handed over?
- Who received the handover?
- Was the amount reconciled?
- Is there a difference?
- Why is there a difference?

This provides accountability without making volunteers perform complicated accounting.

---

# 2. Core Concept

A **Collection Session** is a logical period during which one or more volunteers collect Chanda.

Example:

```text
Morning Collection

Date:
25 Aug 2026

Collectors:
Ravi
Suresh
```

Collections recorded during that session:

```text
House #12     ₹500
House #15     ₹300
House #22     ₹1,000
...
```

At the end:

```text
Expected:
₹8,500

Handed Over:
₹8,500

Status:
RECONCILED
```

---

# 3. Session vs Collection

These are different concepts.

### Collection

A single household/donor transaction:

```text
Ramesh
₹500
House #12
```

### Session

A group of collections performed during a period:

```text
Morning Collection
Ravi + Suresh
₹8,500
```

A session aggregates collections; it does not replace them.

---

# 4. Session Data Model

Conceptually:

```text
pandals/{pandalId}/festivals/{festivalId}/collectionSessions/{sessionId}
```

Suggested fields:

```text
sessionId
pandalId
festivalId
name
date
startedAt
endedAt
collectorIds
status
expectedCash
expectedUpi
expectedBank
expectedTotal
handedOverCash
handedOverUpi
handedOverBank
handedOverTotal
reconciliationStatus
createdBy
createdAt
updatedBy
updatedAt
```

Use the existing project's naming conventions.

---

# 5. Session Status

Recommended:

```text
OPEN
CLOSED
RECONCILED
CANCELLED
```

Lifecycle:

```text
OPEN
  ↓
CLOSED
  ↓
RECONCILED
```

A session should not be considered reconciled merely because it was closed.

---

# 6. Starting a Session

An authorized collector can start a session.

Example:

```text
Start Collection

Session Name:
Morning Collection

Collectors:
Ravi
Suresh

Date:
25 Aug 2026

[ Start Session ]
```

The session should automatically associate with the active Festival.

---

# 7. Current Session

The collection screen can show:

```text
Morning Collection
OPEN

Ravi
Suresh

Collected:
₹8,500

Cash:
₹5,000

UPI:
₹3,500

[ Add Collection ]
[ View Session ]
[ Close Session ]
```

This allows volunteers to see progress without leaving the collection workflow.

---

# 8. Multiple Collectors

A session may have:

```text
1 collector
```

or:

```text
multiple collectors
```

Example:

```text
Morning Collection

Ravi
Suresh
Kiran
```

Each individual collection must still identify the actual collector/recorder.

Do not attribute every collection to the session creator.

---

# 9. Collector Attribution

Each collection should retain:

```text
collectorId
createdBy
```

These may be the same or different.

Example:

```text
Collected By:
Ravi

Entered By:
Suresh
```

This is valid.

---

# 10. Adding Collections to a Session

When a session is active:

```text
Add Collection
```

should automatically associate the collection with:

```text
sessionId
festivalId
pandalId
```

The user should not have to manually enter the session ID.

---

# 11. Collection Session Summary

Show:

```text
Morning Collection

Collections:
27

Total:
₹12,500

Cash:
₹7,500

UPI:
₹5,000

Bank:
₹0
```

Optional:

```text
Collectors:
3

Houses Visited:
31

Successful Collections:
27
```

---

# 12. Payment Method Breakdown

The session must separate:

```text
Cash
UPI
Bank
```

Example:

```text
Total ₹12,500

Cash ₹7,500
UPI ₹5,000
Bank ₹0
```

Do not treat all collections as physical cash.

This is especially important for reconciliation.

---

# 13. Expected vs Actual

The system should distinguish:

```text
Expected
```

from:

```text
Actual
```

Example:

```text
Expected:
₹12,500

Actual:
₹12,300

Difference:
-₹200
```

The difference should be investigated during reconciliation.

---

# 14. Why Session Totals Should Be Calculated

Do not allow volunteers to manually type:

```text
Session Total:
₹12,500
```

The total should be derived from actual linked collection records.

Conceptually:

```text
Session
   ↓
Collections
   ↓
Calculated Total
```

A cached aggregate can be used for performance, but it must not become an independently editable value.

---

# 15. Session Collection Query

When calculating a session:

```text
festivalId
+
sessionId
+
active collection status
```

should determine which collections are included.

Voided collections must not contribute to the active total.

---

# 16. Closing a Session

At the end of collection:

```text
[ Close Session ]
```

Show:

```text
Session Summary

Collections:
27

Cash:
₹7,500

UPI:
₹5,000

Bank:
₹0

Total:
₹12,500
```

Ask for confirmation:

```text
Are you sure you want to close this session?
```

After closing, normal collection additions should be restricted.

---

# 17. Session Closure Protection

Once:

```text
CLOSED
```

the session should not silently accept new collections.

If a late collection belongs to the same volunteer activity:

- Create a new session, or
- Use an authorized reopen mechanism.

Do not silently attach new financial transactions to a closed session.

---

# 18. Cash Handover

Cash handover records the physical transfer of collected cash from the collector to an authorized Pandal representative.

Example:

```text
Cash Handover

Collected:
₹7,500

Handed Over:
₹7,500

From:
Ravi

Received By:
Treasurer

Date:
25 Aug 2026
```

---

# 19. Handover Data Model

Conceptually:

```text
pandals/{pandalId}/festivals/{festivalId}/cashHandovers/{handoverId}
```

Suggested fields:

```text
handoverId
pandalId
festivalId
sessionId
fromUserId
receivedByUserId
expectedAmount
actualAmount
difference
paymentMethod
handoverDate
notes
status
createdBy
createdAt
```

For physical cash, payment method should normally be:

```text
CASH
```

UPI transactions generally do not require physical handover.

---

# 20. Handover Status

Recommended:

```text
PENDING
COMPLETED
DISPUTED
CANCELLED
```

Example:

```text
Expected:
₹7,500

Actual:
₹7,200

Difference:
-₹300

Status:
DISPUTED
```

---

# 21. Handover by Payment Method

Do not require a physical cash handover for UPI.

Example:

```text
Session:

Cash:
₹7,500

UPI:
₹5,000
```

Physical handover:

```text
Cash:
₹7,500
```

UPI:

```text
Already received digitally
```

The system should make this distinction obvious.

---

# 22. Handover Confirmation

The receiving person should confirm:

```text
Amount Received:
₹7,500

[ Confirm Handover ]
```

After confirmation:

```text
COMPLETED
```

Store:

```text
receivedBy
receivedAt
```

---

# 23. Handover Difference

If:

```text
Expected:
₹7,500

Actual:
₹7,200
```

show:

```text
Difference:
-₹300
```

Require a reason before completing reconciliation.

Example:

```text
Reason:
₹300 collection entered incorrectly
```

or:

```text
Reason:
Cash discrepancy
```

Do not allow a discrepancy to disappear silently.

---

# 24. Positive Difference

If:

```text
Expected:
₹7,500

Actual:
₹7,700
```

show:

```text
Difference:
+₹200
```

Require an explanation.

Example:

```text
Reason:
Additional collection not yet entered
```

The application should not silently increase the session total.

---

# 25. Reconciliation Concept

Reconciliation compares:

```text
System Expected
vs
Actual Physical/Confirmed Amount
```

Example:

```text
System:
₹12,500

Actual:
₹12,500

Difference:
₹0

✓ Reconciled
```

---

# 26. Reconciliation Data Model

Conceptually:

```text
pandals/{pandalId}/festivals/{festivalId}/reconciliations/{reconciliationId}
```

Suggested:

```text
reconciliationId
pandalId
festivalId
sessionId
expectedAmount
actualAmount
difference
reason
status
performedBy
performedAt
notes
```

---

# 27. Reconciliation Status

Recommended:

```text
PENDING
MATCHED
VARIANCE
RESOLVED
```

Example:

```text
₹0 Difference
→ MATCHED
```

Example:

```text
₹300 Difference
→ VARIANCE
```

After Admin resolves it:

```text
→ RESOLVED
```

---

# 28. Reconciliation by Payment Method

Where applicable:

```text
Cash Expected:
₹7,500

Cash Actual:
₹7,500

Difference:
₹0
```

For UPI:

```text
UPI System Total:
₹5,000

UPI Confirmed:
₹5,000
```

This prevents cash and digital money from being incorrectly reconciled together.

---

# 29. Daily Collection Reconciliation

Admin/Treasurer can view:

```text
Today

Sessions:
3

Collections:
₹35,000

Cash:
₹20,000

UPI:
₹15,000

Cash Handed Over:
₹20,000

Unreconciled:
₹0
```

This should be a useful end-of-day screen.

---

# 30. Reconciliation Dashboard

Suggested:

```text
Reconciliation

Today
₹35,000 Collected

Cash Pending Handover
₹5,000

Reconciled
₹30,000

Variances
1
```

The most important actions:

```text
[ View Pending Handover ]
[ View Variances ]
```

---

# 31. Pending Handover

Show:

```text
Pending Cash Handover

Ravi
₹7,500
Morning Collection

Suresh
₹4,000
Evening Collection
```

This gives the Treasurer immediate visibility.

---

# 32. Collection Session History

Show:

```text
Collection Sessions

25 Aug
Morning Collection
₹12,500
✓ Reconciled

25 Aug
Evening Collection
₹8,500
⚠ Variance

24 Aug
Morning Collection
₹10,000
✓ Reconciled
```

---

# 33. Session Detail

Example:

```text
Morning Collection

25 Aug 2026

Collectors:
Ravi
Suresh

Collections:
27

Total:
₹12,500

Cash:
₹7,500
UPI:
₹5,000

Handover:
₹7,500

Reconciliation:
MATCHED
```

---

# 34. Collector Session History

A volunteer can view their own sessions:

```text
My Collections

Today
₹8,500

Yesterday
₹12,000

Total
₹20,500
```

Admin can view all collectors if authorized.

---

# 35. Session Search

Search by:

```text
Session Name
Collector
Date
Status
```

---

# 36. Session Filters

Useful:

```text
Open
Closed
Reconciled
Variance
Collector
Date
```

---

# 37. Session Permissions

Suggested permissions:

```text
sessions.view
sessions.create
sessions.update
sessions.close
sessions.reopen

handover.view
handover.create
handover.confirm
handover.update

reconciliation.view
reconciliation.perform
reconciliation.resolve
```

Use the existing dynamic RBAC system.

---

# 38. Who Can Confirm Handover?

The person receiving money should have an appropriate permission.

Recommended:

```text
handover.confirm
```

Do not allow any volunteer to mark their own handover as received if separation of duties is desired.

For a small Pandal, Admin can configure how strict this workflow is.

---

# 39. Separation of Duties

For better accountability:

```text
Collector
    ↓
Hands Over
    ↓
Treasurer/Admin
    ↓
Confirms
```

The collector should not be able to silently confirm their own handover where stronger controls are enabled.

---

# 40. Flexible POC Mode

Because this is a small Pandal POC, avoid excessive bureaucracy.

Provide a simple mode:

```text
Collector:
Ravi

Received By:
Suresh

Amount:
₹7,500

[ Confirm ]
```

The goal is accountability without slowing down volunteers.

---

# 41. Collection Session and Household Coverage

A session can optionally show:

```text
Houses Visited:
30

Collected:
25

Pending:
5
```

This connects the operational collection activity with the Household/Collection feature.

Do not force a household visit record for every simple collection if that makes entry too slow.

---

# 42. Session Notes

Allow optional notes:

```text
Collected near Main Road.
Two houses requested follow-up.
```

Do not use notes as a replacement for structured financial fields.

---

# 43. Late Entry

If a volunteer forgot to record a collection during the session:

Do not modify the session totals manually.

Instead:

- Add the collection to the correct session if still open, or
- Use an authorized correction workflow after closure.

Any post-closure modification must be audited.

---

# 44. Voided Collection

If a collection is voided:

```text
Collection:
VOIDED
```

it must automatically stop contributing to:

```text
Session Total
Cash Expected
Festival Collection Total
```

Do not leave stale totals.

---

# 45. Reconciliation After Correction

If a collection is changed after reconciliation:

```text
Original:
₹500

Updated:
₹700
```

the affected session should become:

```text
REQUIRES_RECONCILIATION
```

or equivalent.

Do not leave the session marked:

```text
MATCHED
```

when its underlying financial data has changed.

---

# 46. Handover and Festival Fund

Once physical cash is confirmed:

```text
Cash Handover
₹7,500
```

the system should not create a second fake income transaction.

The collection already represents the financial receipt.

The handover is an operational movement/confirmation of the same money.

This is extremely important to prevent double-counting.

---

# 47. No Double Counting

Example:

```text
Collection:
₹7,500
```

then:

```text
Handover:
₹7,500
```

Festival cash must remain:

```text
₹7,500
```

not:

```text
₹15,000
```

Handover is not a new contribution.

---

# 48. Cash Location

If the financial architecture tracks physical location:

```text
Collector Cash
      ↓
Pandal Cash
```

A handover can move the cash between locations.

It must remain the same underlying money.

---

# 49. Atomic Handover

When a handover changes a financial/location state:

Use:

```text
Firestore transaction
```

or another safe atomic strategy.

Do not allow:

```text
Handover marked complete
```

while the corresponding financial/location update fails.

---

# 50. Concurrent Users

Example:

```text
Ravi closes session
Suresh records a collection
Treasurer confirms handover
```

These operations may happen at nearly the same time.

Use safe status validation and transactional operations.

Do not assume the client screen always contains the latest state.

---

# 51. State Transition Validation

Recommended:

```text
OPEN
 ↓
CLOSED
 ↓
RECONCILED
```

Do not allow:

```text
RECONCILED → add collection
```

without an explicit authorized correction/reopen process.

Similarly:

```text
CANCELLED
```

should not become:

```text
OPEN
```

without an authorized action.

---

# 52. Offline Behavior

Volunteers may lose connectivity.

Collection creation should use the existing Firestore offline strategy where safe.

However:

```text
Cash Handover
Reconciliation
Session Closure
```

are more sensitive.

The app should clearly show:

```text
Pending Sync
```

and avoid claiming final reconciliation until the server-confirmed state is available.

---

# 53. Duplicate Submission Protection

Protect against:

```text
Double tap
Network retry
App retry
```

for:

```text
Collection
Handover
Reconciliation
```

Use appropriate idempotency/client operation identifiers where needed.

---

# 54. Real-Time Updates

Admin should see:

```text
Ravi started session
Ravi collected ₹500
Suresh collected ₹1,000
Ravi closed session
Treasurer confirmed handover
```

where real-time updates are useful.

Avoid creating excessive Firestore listeners.

---

# 55. Audit Trail

Record:

```text
Session Created
Session Updated
Collector Added/Removed
Collection Linked
Session Closed
Session Reopened
Handover Created
Handover Confirmed
Handover Disputed
Reconciliation Started
Reconciliation Matched
Variance Recorded
Variance Resolved
```

Include:

```text
performedBy
performedAt
pandalId
festivalId
sessionId
```

---

# 56. Variance Resolution

If:

```text
Expected:
₹10,000

Actual:
₹9,700

Difference:
-₹300
```

Admin must record:

```text
Reason
```

Possible:

```text
Collection not entered
Cash counting error
Incorrect collection amount
Other
```

If the variance results from a missing collection, correct the underlying transaction rather than simply changing the reconciliation number.

---

# 57. Reconciliation Rules

Do not allow:

```text
Actual Amount = manually adjusted until zero
```

without explanation.

The reconciliation record must reflect the actual comparison.

If a correction is required:

```text
Correct underlying transaction
        ↓
Recalculate expected
        ↓
Reconcile again
```

---

# 58. Session Reports

A session report should include:

```text
Session
Date
Collectors

Number of Collections
Total

Cash
UPI
Bank

Handover
Reconciliation
Variance
```

---

# 59. Admin Dashboard Integration

Admin Dashboard can show:

```text
Collection Operations

Open Sessions:
2

Pending Handover:
₹7,500

Unreconciled:
1

Today's Collection:
₹35,000
```

This makes the operational status visible without opening multiple screens.

---

# 60. Treasurer View

If the Pandal has a Treasurer role:

```text
Treasurer Dashboard

Pending Handover
₹12,500

Today's Collections
₹35,000

Unreconciled Sessions
1

Recent Handovers
...
```

Use RBAC so this view is available only to authorized users.

---

# 61. UX Requirements

The workflow should be:

```text
Start Session
      ↓
Collect
      ↓
Close Session
      ↓
Handover
      ↓
Reconcile
```

Do not make volunteers navigate through multiple complicated accounting screens.

---

# 62. Acceptance Criteria

## Sessions

- [ ] Authorized user can create a session.
- [ ] Session belongs to correct Festival.
- [ ] Multiple collectors are supported.
- [ ] Each collection retains actual collector.
- [ ] Session totals are calculated from collections.
- [ ] Payment methods are separated.
- [ ] Session can be closed.
- [ ] Closed sessions reject normal new collections.
- [ ] Session history is preserved.

## Handover

- [ ] Cash handover can be created.
- [ ] Collector is identified.
- [ ] Receiver is identified.
- [ ] Expected amount is shown.
- [ ] Actual amount is recorded.
- [ ] Difference is calculated.
- [ ] Receiver can confirm.
- [ ] Handover does not double-count income.

## Reconciliation

- [ ] Expected vs actual is compared.
- [ ] Zero difference can be marked matched.
- [ ] Variance requires explanation.
- [ ] Variance can be resolved.
- [ ] Corrections recalculate expected values.
- [ ] Reconciled data cannot silently change.

## Collaboration

- [ ] Multiple collectors can work simultaneously.
- [ ] Real-time updates work where intended.
- [ ] Concurrent writes are safe.
- [ ] Duplicate submissions are prevented.

## Offline

- [ ] Collection entry handles unstable connectivity.
- [ ] Sync state is visible.
- [ ] Critical handover/reconciliation operations are safely synchronized.
- [ ] The app does not falsely claim reconciliation before confirmation.

## Security

- [ ] Session permissions use RBAC.
- [ ] Handover confirmation uses RBAC.
- [ ] Reconciliation uses RBAC.
- [ ] Cross-Pandal access is blocked.
- [ ] Cross-Festival access is blocked.

---

# 63. Recommended Implementation Order

```text
1. Collection Session model
2. Start Session
3. Link collections to sessions
4. Session totals
5. Payment-method breakdown
6. Close Session
7. Cash Handover
8. Handover confirmation
9. Reconciliation
10. Variance handling
11. Admin reconciliation dashboard
12. Collector history
13. Audit events
14. Offline handling
15. Reports/export
```

---

# 64. Implementation Guidance for Cursor/Claude

Before modifying code:

1. Inspect the existing Collection model.
2. Inspect Household/Collection Coverage implementation.
3. Inspect Festival financial architecture.
4. Inspect Cash/UPI/Bank handling.
5. Inspect existing RBAC.
6. Inspect Firestore Security Rules.
7. Inspect offline Firestore configuration.
8. Inspect audit logging.
9. Reuse existing collection screens and components.
10. Avoid creating duplicate financial transactions for handovers.
11. Use transactions/atomic operations for critical state changes.
12. Add tests for session totals, handover, reconciliation, and variance.
13. Do not rewrite unrelated modules.

---

# 65. Critical Test Scenarios

### Scenario A — Normal Session

```text
Collections:
₹5,000

Cash:
₹3,000

UPI:
₹2,000
```

Expected:

```text
Session Total:
₹5,000
```

---

### Scenario B — Cash Handover

```text
Session Cash:
₹3,000

Actual Handover:
₹3,000
```

Expected:

```text
Difference:
₹0

Status:
MATCHED
```

---

### Scenario C — Cash Variance

```text
Expected:
₹3,000

Actual:
₹2,800
```

Expected:

```text
Difference:
-₹200

Status:
VARIANCE
```

Reason required.

---

### Scenario D — UPI

```text
Session:
₹5,000

Cash:
₹3,000

UPI:
₹2,000
```

Only:

```text
₹3,000
```

requires physical cash handover.

---

### Scenario E — Voided Collection

```text
Session:
₹5,000

Collection:
₹500 VOIDED
```

Expected:

```text
Session:
₹4,500
```

The voided collection must not remain in the expected amount.

---

### Scenario F — No Double Counting

```text
Collection:
₹5,000

Handover:
₹5,000
```

Expected Festival financial effect:

```text
₹5,000
```

not:

```text
₹10,000
```

---

### Scenario G — Post-Reconciliation Correction

```text
Expected:
₹5,000

Actual:
₹5,000

Matched
```

Then collection changed:

```text
₹500 → ₹700
```

Expected:

```text
Session requires reconciliation again.
```

---

# 66. Golden Rules

### Rule 1

> A Collection is a financial receipt; a Collection Session groups collections operationally.

### Rule 2

> Handover is not new income.

### Rule 3

> Never double-count a collection when it is handed over.

### Rule 4

> Cash, UPI and Bank must remain distinguishable.

### Rule 5

> A session total should be derived from actual collection records.

### Rule 6

> A closed session should not silently accept new collections.

### Rule 7

> A reconciliation variance must have an explanation.

### Rule 8

> Fix the underlying transaction instead of manually hiding a variance.

### Rule 9

> A reconciled session must become unreconciled if its underlying financial data changes.

### Rule 10

> Collector and receiver should be separately identifiable.

### Rule 11

> Critical handover/reconciliation operations must be safe under concurrent writes.

### Rule 12

> Offline operation must never create an ambiguous final financial state.

---

# 67. Final Mental Model

```text
                  COLLECTION SESSION
                         |
             +-----------+-----------+
             |           |           |
           Ravi        Suresh      Kiran
             |           |           |
          Collections / Collections / Collections
             |           |           |
             +-----------+-----------+
                         |
                  Session Total
                         |
             +-----------+-----------+
             |                       |
           Cash                     UPI
             |                       |
        Cash Handover          Already Digital
             |
          Receiver
             |
       Reconciliation
             |
       +-----+-----+
       |           |
     MATCHED    VARIANCE
                   |
                Reason
                   |
                Resolve
```

The system should always make it possible to answer:

> **Who collected the money, during which session, how much was collected, how much was physically handed over, who received it, and whether the numbers were reconciled?**
