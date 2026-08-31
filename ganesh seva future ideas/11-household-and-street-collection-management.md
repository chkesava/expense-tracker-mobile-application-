# Ganesh Seva — Feature 11
## Household & Street Collection Management

**Document:** `11-household-and-street-collection-management.md`  
**Purpose:** Fast, shared, real-time house-to-house Chanda tracking for the current Festival while preserving household history across years.

---

## 1. Objective

The Pandal volunteers will visit houses in the street and collect Chanda. This module should make it immediately clear:

- Which streets are being covered
- Which households exist
- Who lives at each household
- Whether a house has been visited
- Whether it contributed
- How much was collected
- Who collected it
- Whether the household promised money later
- Which houses require follow-up
- What the household contributed in previous Festivals

The primary UX principle is:

> **A volunteer should be able to record a normal collection in a few seconds.**

---

# 2. Core Data Model

Keep the following concepts separate:

```text
Pandal
  ↓
Street
  ↓
Household
  ↓
Festival Collection
  ↓
Collection Session
```

### Household

Persistent Pandal-level information:

```text
House #24
Gandhi Street
Ramesh Kumar
98XXXXXXXX
```

### Collection

Festival-specific financial transaction:

```text
Festival: 2026
Amount: ₹500
Payment: Cash
Collector: Ravi
```

Do not create a new household every Festival.

---

# 3. Street

Conceptually:

```text
pandals/{pandalId}/streets/{streetId}
```

Suggested fields:

```text
streetId
pandalId
name
description
sortOrder
status
createdBy
createdAt
updatedBy
updatedAt
```

Street status:

```text
ACTIVE
ARCHIVED
```

---

# 4. Household

Conceptually:

```text
pandals/{pandalId}/households/{householdId}
```

Suggested fields:

```text
householdId
pandalId
streetId
houseNumber
address
primaryContactName
mobile
alternateMobile
notes
status
createdBy
createdAt
updatedBy
updatedAt
```

Keep household information minimal and relevant.

---

# 5. House Number

House numbers must be strings because real addresses may be:

```text
24
24-A
24/1
24-B
12/3A
```

Do not force the field to be numeric.

---

# 6. Household Status

Recommended:

```text
ACTIVE
MOVED
INACTIVE
DO_NOT_VISIT
```

Do not delete households with financial history.

Archive/change status instead.

---

# 7. Primary Contact

Support:

```text
Name
Mobile
```

Mobile is optional.

Do not require a phone number for every household.

---

# 8. Household History

A household persists across Festival years.

Example:

```text
House #24
Ramesh Kumar

2026
₹800

2025
₹500

2024
₹400
```

The historical records must remain intact.

---

# 9. Festival-Specific Collection Status

For each Festival, show:

```text
NOT_VISITED
VISITED
COLLECTED
PROMISED
NOT_INTERESTED
FOLLOW_UP
```

Example:

```text
House #24

2025 → COLLECTED
2026 → FOLLOW_UP
```

The status must not overwrite previous Festival status.

---

# 10. Visit vs Collection

A visit is not automatically a financial transaction.

Example:

```text
House #24
Visited: Yes
Amount: ₹0
Status: FOLLOW_UP
```

This allows volunteers to record:

- Visited but no collection
- Promised later
- Not interested
- Follow-up required

without creating fake financial income.

---

# 11. Collection Integration

Reuse the existing Collection model.

A Collection should reference:

```text
householdId
festivalId
collectorId
collectionSessionId
amount
paymentMethod
status
collectedAt
createdBy
createdAt
```

Do **not** create a second financial ledger specifically for households.

---

# 12. Payment Methods

Use the existing financial model's payment methods, preferably:

```text
CASH
UPI
BANK
OTHER
```

Cash, UPI and Bank must remain distinguishable.

---

# 13. Multiple Contributions

A household may contribute more than once in a Festival.

Example:

```text
House #24

20 Aug
₹500

25 Aug
₹300

Festival Total
₹800
```

Never overwrite the first contribution.

Maintain individual transactions.

---

# 14. Household Festival Total

Calculate the active Festival total from valid Collection records.

Example:

```text
2026 Total
₹800
```

Voided collections must not be included.

---

# 15. Quick Collection Entry

This is the most important screen.

Example:

```text
House #24

Ramesh Kumar

Amount
[ ₹500 ]

Payment
[ Cash ]

[ Save Collection ]
```

After saving:

```text
✓ ₹500 collected
```

Then:

```text
[ Next House ]
```

The volunteer should not need to navigate back through several screens.

---

# 16. Quick Amount Buttons

Optional quick buttons:

```text
₹100
₹200
₹500
₹1,000
₹2,000
```

Also provide:

```text
Custom Amount
```

The quick buttons should speed up entry without restricting custom amounts.

---

# 17. Street Collection Screen

A collector should be able to open a street and see:

```text
Gandhi Street

#1    ✓ ₹500
#2    ✓ ₹300
#3    ○ Not Visited
#4    ↻ Follow-up
#5    ✓ ₹1,000
```

Default sorting:

```text
House Number
```

This matches the physical collection route.

---

# 18. Street Progress

Example:

```text
Gandhi Street

50 Households

Visited
35 / 50

Collected
30

Promised
3

Follow-up
2

Total
₹12,500
```

Progress must be based on the current Festival.

---

# 19. Festival Collection Progress

Admin can see:

```text
Collection Progress

Households
150

Visited
120

Collected
105

Promised
8

Pending
30

Collected Amount
₹55,000
```

---

# 20. Search

Search households by:

```text
House Number
Name
Mobile
Street
```

Example:

```text
Search: Ramesh
```

Result:

```text
House #24
Gandhi Street
Ramesh Kumar
```

Search should work quickly during field collection.

---

# 21. Filters

Provide:

```text
Not Visited
Visited
Collected
Promised
Follow-up
Not Interested
```

Also allow filtering by:

```text
Street
Collector
```

where applicable.

---

# 22. Street Assignment

Admin can assign collection areas:

```text
Gandhi Street
→ Ravi

Main Road
→ Suresh

Temple Road
→ Unassigned
```

Assignments are Festival-specific.

Suggested permission:

```text
collection.assign
```

---

# 23. Multiple Collectors

A street may have multiple collectors:

```text
Gandhi Street
Ravi
Suresh
```

However, avoid assigning the same household to multiple collectors without warning.

---

# 24. Collection Session Integration

Integrate with Feature 08.

Example:

```text
Session:
Morning Collection

House:
#24

Amount:
₹500

Collector:
Ravi
```

The Collection Session must aggregate the Collection.

It must not create another financial transaction.

---

# 25. Collector Attribution

Every Collection should record:

```text
collectorId
createdBy
```

Example:

```text
Collected By:
Ravi

Entered By:
Suresh
```

This supports accountability when one volunteer collects and another enters data.

---

# 26. Duplicate Collection Warning

If a household was recently collected:

```text
House #24
Already collected ₹500 today.

Collected by:
Ravi

Continue?
```

Do not automatically block another contribution because a household may legitimately contribute again.

---

# 27. Duplicate Visit Warning

If another collector recently visited:

```text
House #24
Visited 10 minutes ago by Ravi.
```

Show a warning.

Do not silently overwrite the previous visit.

---

# 28. Promised Contribution

If a person says:

> "I'll give tomorrow."

record:

```text
Status:
PROMISED

Expected:
₹1,000

Follow-up:
Tomorrow
```

The promised amount must **not** increase the financial balance.

---

# 29. Follow-Up

A follow-up may contain:

```text
Follow-up Date
Assigned Collector
Note
```

Example:

```text
House #24

Promised:
₹1,000

Follow-up:
30 Aug

Assigned:
Ravi
```

---

# 30. Promise Conversion

When money is actually received:

```text
PROMISED
   ↓
COLLECTED
```

Record the real Collection transaction.

Do not count the promised amount and received amount separately.

---

# 31. Not Interested

Allow:

```text
NOT_INTERESTED
```

Optionally record a short note.

Do not create fake ₹0 financial records unless needed for visit analytics.

---

# 32. Do Not Visit

Support:

```text
DO_NOT_VISIT
```

Do not expose unnecessary reasons to all volunteers.

---

# 33. Add Household During Collection

If a volunteer reaches an unknown house:

```text
[ Add Household ]
```

Minimal form:

```text
House Number
Name
Mobile (optional)
```

After saving, immediately show:

```text
Add Collection
```

Avoid forcing the volunteer to restart their collection flow.

---

# 34. Household Editing

Authorized users may update:

```text
Name
Mobile
Address
Notes
Status
Street
```

Editing household information must not modify historical financial transactions.

Financial corrections belong to the Collection correction workflow.

---

# 35. Household Movement

If a household moves:

```text
Status:
MOVED
```

Preserve its historical records.

Do not casually transfer its financial history to another household.

---

# 36. Household History Screen

Example:

```text
Ramesh Kumar
House #24

2026
₹800
2 collections

2025
₹500
1 collection

2024
₹400
1 collection

Last Collection:
₹300

Last Collected:
25 Aug 2026
```

---

# 37. Year-over-Year Household Comparison

Example:

```text
2025
₹500

2026
₹800

Difference
+₹300
```

This is historical information only.

Never imply that a household is expected to increase its contribution.

---

# 38. Collector Summary

Admin may see:

```text
Ravi

Households Visited:
35

Collections:
30

Amount:
₹12,500
```

This is for operational accountability, not volunteer competition.

---

# 39. Street Summary

Example:

```text
Gandhi Street

Households:
50

Visited:
40

Collected:
35

Promised:
3

Not Interested:
2

Total:
₹15,500
```

---

# 40. Collection Target

Optional:

```text
Target:
₹80,000

Collected:
₹55,000

Progress:
68.75%
```

A target is informational only.

It must never alter the financial ledger.

---

# 41. Pending Follow-Up Dashboard

Admin can see:

```text
Follow-Ups

House #24
₹1,000 promised
Tomorrow

House #35
₹500 promised
Sunday
```

Tap a row to open the household.

---

# 42. Collection Coverage

Show:

```text
Collection Coverage

120 / 150 households visited

80%
```

This is useful to identify streets that have not yet been covered.

---

# 43. Next House Workflow

The ideal flow:

```text
House #24
   ↓
Enter ₹500
   ↓
Save
   ↓
✓ Saved
   ↓
Next
   ↓
House #25
```

This should be optimized for one-handed mobile use.

---

# 44. Offline-First Collection

Because volunteers will be walking around the neighborhood, internet may be unstable.

Where compatible with Firestore offline capabilities:

```text
Previously synced households
        ↓
View offline
        ↓
Record collection
        ↓
Local pending state
        ↓
Sync when connection returns
```

Show:

```text
Pending Sync
```

clearly.

---

# 45. Offline Safety

Do not claim:

```text
Reconciled
```

or:

```text
Server Confirmed
```

while a critical operation is still pending synchronization.

Collection entry can use existing offline Firestore behavior.

---

# 46. Offline Duplicate Handling

Two volunteers could be offline and record:

```text
House #24
₹500
```

The system may not immediately know that the other volunteer did the same.

When synchronization occurs:

- Preserve legitimate transactions.
- Flag suspicious duplicate activity where appropriate.
- Do not silently delete a financial record.

---

# 47. Real-Time Collaboration

When connected:

```text
Ravi records ₹500
```

another collector viewing the same street should see:

```text
House #24
✓ Collected ₹500
```

Use scoped listeners:

```text
Current Pandal
+
Current Festival
+
Selected Street
```

Do not create global listeners across every Pandal/Festival.

---

# 48. Firestore Read Optimization

Do not load:

```text
Every household
+
Every Festival
+
Every historical collection
```

when the app starts.

Prefer:

```text
Selected Street
+
Current Festival
```

for the active collection workflow.

Load historical data only when the user opens it.

---

# 49. Pagination

For large household lists, use:

```text
Pagination
```

or chunked loading.

Avoid rendering hundreds of complex cards at once.

Use efficient React Native list rendering.

---

# 50. Collection Receipt Reference

Reuse the existing collection receipt/reference system from the main financial architecture.

Example:

```text
GNS26-000184
```

Do not create another receipt-numbering system.

---

# 51. Digital Receipt — Future Enhancement

A future version can support:

```text
Collection
 ↓
Digital Receipt
 ↓
Share
```

Potentially through:

```text
WhatsApp
PDF
Image
```

Do not make this mandatory for MVP.

---

# 52. Household Import — Future Enhancement

Admin may later import:

```text
CSV

Street
House Number
Name
Mobile
```

This is useful if the Pandal already maintains a household list.

Implement after the core collection workflow is stable.

---

# 53. Household Export — Future Enhancement

Admin may export:

```text
Street
House Number
Name
Mobile
Festival Collection
Status
```

CSV is sufficient initially.

---

# 54. Privacy

Household data can include:

```text
Name
Mobile
Address
Collection History
```

Restrict access to authorized Pandal members.

Avoid exposing mobile numbers unnecessarily in shared screens.

---

# 55. RBAC

Suggested permissions:

```text
households.view
households.create
households.update
households.archive

collections.view
collections.create
collections.update
collections.void

collection.assign
collection.reports
```

Use the existing dynamic role/permission architecture.

---

# 56. Normal Collector Access

A normal collector should generally be able to:

```text
View assigned collection area
View basic household information
Record visit
Record collection
Record promise/follow-up
View relevant collection history
```

They should not automatically be able to:

```text
Delete households
Void financial records
Change Festival financial settings
```

---

# 57. Admin Access

Admin can:

```text
Manage streets
Manage households
Assign collectors
View all collection information
Manage authorized corrections
View collection reports
```

subject to existing permissions.

---

# 58. Financial Integration

A valid household collection should flow into the existing financial architecture:

```text
Household
₹500 Cash
    ↓
Collection
    ↓
Festival Fund +₹500
    ↓
Collection Session +₹500
```

Only one financial transaction should exist.

---

# 59. No Double Counting

If:

```text
Household Collection:
₹500
```

and:

```text
Collection Session:
₹500
```

Festival funds must increase only:

```text
₹500
```

The Session is an aggregation, not another receipt.

---

# 60. Voided Collection

If a ₹500 collection is voided:

```text
Collection
→ VOIDED
```

then active totals should decrease consistently:

```text
Household Total
Session Total
Festival Collection Total
```

The historical voided record should remain auditable.

---

# 61. Atomic Financial Operations

If a Collection updates financial aggregates, use the existing safe transaction architecture.

Avoid unsafe:

```text
Read balance
+
₹500
→
Write balance
```

without transaction protection.

Two volunteers may submit collections simultaneously.

---

# 62. Duplicate Submission Protection

Protect against:

```text
Double tap
Network retry
Offline retry
```

A single user action must not accidentally create two identical financial transactions.

Use an appropriate idempotency/client-operation identifier strategy.

---

# 63. Audit Trail

Record important actions:

```text
Household Created
Household Updated
Household Archived

Collection Created
Collection Updated
Collection Voided

Collector Assignment Created
Collector Assignment Changed

Follow-Up Created
Follow-Up Completed
```

Include:

```text
performedBy
performedAt
pandalId
festivalId
entityId
```

---

# 64. Data Integrity Rules

### Rule 1

Household is persistent Pandal data.

### Rule 2

Collection is Festival-specific financial data.

### Rule 3

Visit is not automatically a financial transaction.

### Rule 4

Promise is not received money.

### Rule 5

Collection Session is an aggregation.

### Rule 6

Never double-count a Collection.

### Rule 7

Voided collections must not contribute to active totals.

### Rule 8

Household history must survive across years.

### Rule 9

Financial corrections require proper permissions.

### Rule 10

Do not create a second financial ledger inside Household Management.

---

# 65. Acceptance Criteria

## Streets

- [ ] Admin can create streets.
- [ ] Streets belong to the Pandal.
- [ ] Streets can be ordered.
- [ ] Streets can be archived.
- [ ] Historical collection data remains available.

## Households

- [ ] Household belongs to a Pandal.
- [ ] Household can be associated with a street.
- [ ] House number supports string values.
- [ ] Primary contact is supported.
- [ ] Mobile is optional.
- [ ] Household persists across Festivals.
- [ ] Household can be archived/moved.
- [ ] Historical collections remain intact.

## Collections

- [ ] Collection belongs to a Festival.
- [ ] Collection can reference a household.
- [ ] Collector is recorded.
- [ ] Payment method is recorded.
- [ ] Multiple contributions are supported.
- [ ] Voided collections are excluded from active totals.
- [ ] Collections integrate with Collection Sessions.
- [ ] Collections integrate with Festival financial totals.

## Field Collection

- [ ] Street progress is visible.
- [ ] Household status is visible.
- [ ] Promised contributions are supported.
- [ ] Follow-ups are supported.
- [ ] Duplicate visit warnings work.
- [ ] Duplicate collection warnings work.
- [ ] Next-house workflow is fast.

## Offline

- [ ] Previously synced household data is available offline.
- [ ] Collection entries use existing Firestore offline support where appropriate.
- [ ] Pending sync state is visible.
- [ ] Retry/double-submit protection works.

## Security

- [ ] RBAC is enforced.
- [ ] Cross-Pandal access is blocked.
- [ ] Cross-Festival collection access is blocked.
- [ ] Financial void/correction permissions are restricted.

---

# 66. Recommended Implementation Order

```text
1. Street model
2. Household model
3. Street/Household CRUD
4. Festival-specific household status
5. Existing Collection integration
6. Quick collection entry
7. Street collection screen
8. Collection progress
9. Previous-year history
10. Promise/follow-up workflow
11. Collector assignment
12. Duplicate warnings
13. Offline behavior
14. Audit logging
15. Reports/export
16. Optional digital receipts
17. Optional import/export
```

---

# 67. Implementation Instructions for Cursor/Claude

Before changing code:

1. Inspect the existing Pandal and Festival architecture.
2. Inspect the existing Collection model.
3. Inspect Collection Sessions and Reconciliation.
4. Inspect Festival financial calculations.
5. Inspect the existing RBAC system.
6. Inspect Firestore Security Rules.
7. Inspect existing offline Firestore configuration.
8. Inspect receipt/reference generation.
9. Inspect existing UI components from the Expense Tracker.
10. Reuse existing services/components wherever possible.
11. Do not create a second Collection model.
12. Do not duplicate Festival balance calculations.
13. Use Firestore transactions/atomic operations for financial changes.
14. Add tests for concurrent collections and duplicate submissions.
15. Optimize queries for street-level collection.
16. Do not rewrite unrelated modules.

---

# 68. Critical Test Scenarios

## Scenario A — New Household

```text
Gandhi Street
House #24
Ramesh
```

Expected:

```text
Household created
2026 status = NOT_VISITED
```

## Scenario B — Collection

```text
House #24
₹500
Cash
```

Expected:

```text
Household 2026 total = ₹500
Festival collection = +₹500
Session = +₹500
```

Only one financial receipt exists.

## Scenario C — Multiple Contributions

```text
₹500
+
₹300
```

Expected:

```text
Household total = ₹800
```

Both transactions remain visible.

## Scenario D — Promise

```text
Promised = ₹1,000
```

Expected:

```text
Festival cash unchanged
```

After actual receipt:

```text
Festival cash +₹1,000
```

## Scenario E — Void

```text
₹500
→ VOIDED
```

Expected:

```text
Household active total decreases
Festival active collection decreases
Session active total decreases
```

## Scenario F — Double Tap

```text
Save
Save
```

Expected:

```text
One collection
```

not two.

## Scenario G — Concurrent Volunteers

```text
Ravi → ₹500
Suresh → ₹300
```

Expected:

```text
Festival collection = ₹800
```

Neither overwrites the other.

## Scenario H — Previous Year

```text
2025 → ₹300
2026 → ₹500
```

Expected:

```text
Both years remain visible.
2025 is not modified.
```

---

# 69. Final UX Principle

The collection workflow should feel like:

```text
SELECT STREET
      ↓
SELECT/NEXT HOUSE
      ↓
ENTER AMOUNT
      ↓
SELECT PAYMENT
      ↓
SAVE
      ↓
✓ CONFIRMED
      ↓
NEXT HOUSE
```

Not:

```text
Dashboard
→ Finance
→ Collections
→ Festival
→ Street
→ Household
→ Add
→ Form
→ Save
→ Dashboard
```

The first workflow should be the target.

---

# 70. Final Mental Model

```text
                         PANDAL
                            |
                         STREETS
                            |
                    Gandhi Street
                            |
                 +----------+----------+
                 |                     |
              House #24             House #25
                 |                     |
              Ramesh                 Suresh
                 |                     |
               2026                  2026
               ₹500                  ₹300
                 |                     |
                 +----------+----------+
                            |
                        COLLECTION
                            |
                    COLLECTION SESSION
                            |
                       FESTIVAL FUND
```

The module should always make it possible to answer:

> **Which houses have been visited, which have contributed, who collected the money, how much was collected, which households need follow-up, and how does this year's collection compare with previous years?**
