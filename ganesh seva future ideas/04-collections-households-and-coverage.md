# Ganesh Seva — Feature Specification 04
## Collections, Households & Collection Coverage

**Document:** 04-collections-households-and-coverage.md  
**Status:** Product / Implementation Specification  
**Stack:** Expo React Native + Firebase Auth + Firestore + Supabase Storage

---

# 1. Purpose

This feature defines the complete **Chanda / House Collection** system for Ganesh Seva.

The goal is to make door-to-door collection simple for volunteers while giving the Admin a reliable view of:

- Who has contributed
- How much was collected
- Which household was visited
- Which houses are still pending
- Who collected the money
- Which collection session it belongs to
- How much was collected by Cash/UPI/Bank
- Whether a possible duplicate collection exists
- Collection coverage by area
- Festival-wise collection performance

The collection system must remain fast enough for a volunteer standing at someone's door.

---

# 2. Core Collection Model

The basic flow is:

```text
Household
    |
    v
Collection Visit
    |
    v
Contribution
    |
    v
Payment
    |
    v
Festival Fund
```

A collection should be associated with:

```text
Pandal
Festival
Household / Donor
Amount
Payment Method
Collector
Receipt Number
Date
```

---

# 3. Collection vs Committee Contribution

Do not mix normal Chanda with committee-member contributions.

### House Collection

Money collected from households/community members.

Example:

```text
Ramesh Kumar
House #12
₹500
```

### Committee Contribution

Money personally committed/contributed by a committee member.

Example:

```text
Ravi Kumar
Committee Contribution
Target ₹5,000
Received ₹3,000
```

They should have separate financial categories and reporting.

---

# 4. Household Concept

A Household represents a collection location/family that volunteers may visit.

Suggested fields:

```text
householdId
pandalId
areaId
houseNumber
address / landmark
primaryName
mobile
expectedAmount
notes
status
createdAt
updatedAt
```

Only collect information necessary for the collection process.

---

# 5. Household Identifier

A household should have a stable identifier.

Possible display:

```text
House #12
```

or:

```text
12-A
```

Do not rely only on a person's name because names can be duplicated.

The combination of:

```text
Area
+
House Number
```

can be used for duplicate warnings.

---

# 6. Household Status

Recommended states:

```text
PENDING
PARTIALLY_PAID
PAID
NOT_AVAILABLE
DECLINED
```

Optional:

```text
DO_NOT_VISIT
```

Use statuses to support collection coverage.

---

# 7. Collection Record

Each actual collection should contain:

```text
collectionId
pandalId
festivalId
householdId (if known)
donorName
mobile (optional)
amount
paymentMethod
collectorId
receiptNumber
collectionDate
notes
createdBy
createdAt
updatedBy
updatedAt
```

Use the existing project naming conventions.

---

# 8. Payment Methods

At minimum:

```text
CASH
UPI
BANK
```

Optional:

```text
OTHER
```

The payment method describes **how the money was received**.

It must not be confused with:

```text
God Fund
Personal Money
```

For a collection, the money is normally entering the Festival/Pandal fund.

---

# 9. Fast Collection Entry

This is one of the most important UX requirements.

A volunteer should be able to record a collection in seconds.

Recommended primary fields:

```text
Donor / Household
Amount
Payment Method
```

The app should automatically supply:

```text
Festival
Collector
Created By
Date
```

Additional information should be under:

```text
More Details
```

Do not show a large form at the door.

---

# 10. Collection Entry Example

Example:

```text
Add Collection

Household
House #12 · Ramesh Kumar

Amount
₹500

Payment Method

[ Cash ] [ UPI ] [ Bank ]

[ Save Collection ]
```

After saving:

```text
✓ Collection Recorded

Receipt:
GNS26-000182
```

---

# 11. Household Selection

When entering a collection, allow:

```text
Search household
```

Search by:

- House number
- Name
- Mobile
- Area
- Landmark

Example:

```text
Search: Ramesh

House #12
Ramesh Kumar

House #42
Ramesh Rao
```

This reduces duplicate households.

---

# 12. New Household During Collection

Volunteers should be able to create a household without leaving the collection workflow.

Example:

```text
No household found

[ + Add Household ]
```

Then:

```text
House Number
Name
Mobile (optional)
Area
```

After saving, return to the collection form with the new household selected.

---

# 13. Household Collection History

A household detail screen should show:

```text
House #12
Ramesh Kumar

2026 Collection
₹500

Previous Collections
2025
₹300

2024
₹500
```

Historical information should only be shown when the user has permission and the corresponding Festival data exists.

---

# 14. Current Festival vs Historical Collections

When recording a collection:

```text
Current Festival = 2026
```

the new collection must belong to 2026.

Previous-year collections must remain historical.

Do not overwrite a household's previous contribution.

---

# 15. Partial Collections

A household may pay in multiple installments.

Example:

```text
Expected:
₹1,000

First Collection:
₹500

Second Collection:
₹500
```

Household status:

```text
PAID
```

The app should calculate:

```text
Expected ₹1,000
Collected ₹1,000
Remaining ₹0
```

---

# 16. Overpayment

If:

```text
Expected ₹1,000
```

and the household gives:

```text
₹1,500
```

do not silently reject or alter the amount.

Show:

```text
Expected ₹1,000
Collection ₹1,500

₹500 above expected amount
```

The Admin/collector can confirm the actual amount.

The financial ledger must use the actual received amount.

---

# 17. Expected Collection Amount

The Admin may configure a recommended/expected collection amount.

Example:

```text
Expected per household:
₹500
```

This is a target, not an automatic transaction.

The application must never create ₹500 of income merely because an expected amount exists.

Only actual received money becomes a financial transaction.

---

# 18. Collection Configuration

The Pandal may define:

```text
Default Expected Amount
```

Example:

```text
Standard Chanda:
₹500
```

The collector can record a different actual amount when necessary.

Possible:

```text
₹300
₹500
₹1,000
₹2,000
```

Do not force every household to contribute exactly the configured amount unless the Pandal explicitly chooses that behavior.

---

# 19. Collection Areas

Divide the collection region into manageable areas.

Example:

```text
Area A
Houses 1–30

Area B
Houses 31–60

Area C
Houses 61–90
```

Suggested Area fields:

```text
areaId
name
description
householdCount
assignedCollectors
createdAt
updatedAt
```

---

# 20. Collector Assignment

Admin can assign volunteers to an area.

Example:

```text
Area A
Assigned:
Ravi
Suresh
```

The assignment is operational guidance.

Do not assume an assigned volunteer is the only person who can record a collection unless the business rules explicitly require that.

---

# 21. Collection Coverage

Provide a coverage summary:

```text
Collection Coverage

Total Houses
150

Collected
112

Pending
38

Coverage
74.7%
```

The exact calculation must use household status/actual visits according to the chosen business definition.

---

# 22. Coverage by Area

Show:

```text
Area A
30 / 30
100%

Area B
25 / 40
62.5%

Area C
57 / 80
71.2%
```

This lets Admin immediately identify unfinished areas.

---

# 23. Define "Collected" Carefully

A household should not necessarily be marked `PAID` just because it was visited.

Example:

```text
Household visited
₹0 received
```

should not count as a successful financial collection.

Coverage can separately track:

```text
Visited
Collected
Pending
Declined
Not Available
```

This distinction prevents misleading collection statistics.

---

# 24. Collection Visit

If the application supports detailed visit tracking, a visit can record:

```text
householdId
festivalId
collectorId
visitedAt
status
notes
```

Possible status:

```text
COLLECTED
NO_PAYMENT
NOT_AVAILABLE
DECLINED
FOLLOW_UP
```

A visit is not automatically a money transaction.

---

# 25. Follow-Up

If a household was unavailable:

```text
House #25
NOT_AVAILABLE
```

allow:

```text
[ Mark Follow-Up ]
```

Then it appears in:

```text
Pending Follow-Ups
```

This is more useful than repeatedly searching the entire household list.

---

# 26. Collection Coverage Dashboard

Admin should be able to see:

```text
Collection Progress

₹80,000 Collected

142 Donors

112 / 150 Houses

75% Coverage
```

Then:

```text
Pending
38

Follow-Up
12

Not Available
8
```

Keep the screen visually simple.

---

# 27. Duplicate Collection Detection

Because many volunteers can collect simultaneously, the application should detect likely duplicates.

Example:

Ravi records:

```text
House #12
Ramesh Kumar
₹500
```

Suresh later enters:

```text
House #12
Ramesh Kumar
₹500
```

Show:

```text
Possible Duplicate

A collection already exists:

Ramesh Kumar
House #12
₹500
Collected by Ravi
10:32 AM

[Record Anyway]
[Cancel]
```

---

# 28. Duplicate Detection Rules

Duplicate detection should be a warning, not automatically a hard block.

Potential matching fields:

```text
householdId
houseNumber
donorName
mobile
festivalId
recent collection date
```

A duplicate warning must not prevent legitimate multiple installments.

For example:

```text
₹500 today
₹500 next week
```

may be valid.

Use reasonable matching rules and make the warning explain why it appeared.

---

# 29. Mobile Number

Mobile is optional.

If provided, it can improve:

- Household matching
- Duplicate detection
- Donor history

Do not make mobile mandatory unless the Pandal decides it is necessary.

Do not expose phone numbers unnecessarily in shared lists.

---

# 30. Receipt Number

Every successful collection should have a unique receipt/reference number.

Example:

```text
GNS26-000182
```

The number must:

- Be unique
- Remain stable
- Be generated safely under concurrent writes
- Be displayed after collection
- Be available in reports
- Be usable later for digital receipts

Do not use a simple client-side count.

---

# 31. Collection Receipt

Collection detail should show:

```text
Ganesh Seva

Receipt:
GNS26-000182

Received From:
Ramesh Kumar

House:
#12

Amount:
₹500

Payment:
Cash

Collected By:
Ravi

Date:
25 Aug 2026
```

Digital PDF/WhatsApp sharing can be added later.

---

# 32. Collection Editing

Authorized users can edit a collection if the RBAC permission allows it.

Changes must be audited.

Example:

```text
₹500 → ₹700
```

should not silently destroy the original history.

For critical financial changes, consider voiding/recreating rather than destructive editing.

---

# 33. Collection Voiding

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

A voided collection should no longer count toward available funds.

Historical audit information must remain.

---

# 34. Collection Search

Search should support:

```text
Name
House Number
Mobile
Receipt Number
```

Example:

```text
Search:
GNS26-000182
```

returns the exact collection.

---

# 35. Collection Filters

Useful filters:

```text
Area
Collector
Payment Method
Date
Amount
Status
Household
```

Keep filters accessible without making the main screen complicated.

---

# 36. Collection Sorting

Useful default:

```text
Newest first
```

Optional:

```text
Oldest
Highest Amount
Lowest Amount
House Number
```

Do not make sorting expensive with unnecessary client-side loading of huge datasets.

---

# 37. Collection Statistics

Useful metrics:

```text
Total Collected
Number of Donors
Average Collection
Cash
UPI
Bank
Today
This Week
Festival Total
```

These should all be calculated from actual collection transactions.

---

# 38. Collector Statistics

Admin can view:

```text
Ravi
Collections: 42
Amount: ₹18,500

Suresh
Collections: 35
Amount: ₹15,000
```

This is useful for operational tracking.

Do not present it as a competition unless the committee explicitly wants that.

---

# 39. Daily Collection Summary

Example:

```text
Today

Collections
27

Collected
₹12,500

Cash
₹7,500

UPI
₹5,000
```

Useful for end-of-day reconciliation.

---

# 40. Collection Sessions

Collections can optionally be linked to a Collection Session.

Example:

```text
Morning Collection
Collector: Ravi
Date: Aug 25
```

Then:

```text
27 collections
₹12,500
```

Detailed session functionality belongs to the Collection Sessions feature document.

---

# 41. Cash Handover Relationship

The collection system should preserve enough information to later support:

```text
Collector
    ↓
Collections
    ↓
Collection Session
    ↓
Cash Handover
    ↓
Pandal Fund
```

Do not bypass collection records by only updating a total cash balance.

---

# 42. Committee Contribution Separation

A committee member who personally contributes money should be recorded through the Committee Contribution feature.

Do not make:

```text
Ravi
₹5,000
```

look identical to:

```text
Household Chanda
₹5,000
```

The source/category must remain clear.

---

# 43. Financial Integration

A successful collection should create the appropriate financial event:

```text
COLLECTION
MONEY_IN
```

The amount increases the Festival's God Fund.

The payment method determines the relevant holding location:

```text
Cash
UPI
Bank
```

---

# 44. Firestore Transaction Safety

Collection creation must be safe under concurrent users.

Avoid:

```text
read total
+
new amount
→
write total
```

as the only mechanism.

Prefer:

- Firestore transactions
- Atomic increments
- Transactional receipt generation
- Idempotency where appropriate

Two volunteers saving collections simultaneously must not lose either transaction.

---

# 45. Duplicate Submission Protection

A user may tap:

```text
Save
Save
```

or the network may retry a request.

The system must prevent accidental duplicate financial records.

Use an appropriate idempotency/client-operation identifier or transaction strategy.

The user should not see two identical collections simply because the Save button was tapped twice.

---

# 46. Offline Collection Entry

Door-to-door collection may occur in weak connectivity.

If Firestore offline support is used:

```text
Offline
   ↓
Record collection locally
   ↓
Sync later
```

The UI should clearly show:

```text
Pending Sync
```

Do not generate conflicting financial totals.

Receipt numbering must remain safe when offline.

If the existing receipt-number architecture cannot guarantee unique numbers offline, defer final receipt assignment until synchronization.

---

# 47. Sync State

Collection records can show:

```text
✓ Synced
```

or:

```text
⟳ Pending Sync
```

or:

```text
⚠ Sync Failed
```

Users should be able to retry failed synchronization where supported.

---

# 48. Real-Time Collaboration

If Ravi adds:

```text
House #12
₹500
```

Suresh's collection list should update appropriately.

The system must avoid duplicate listeners and unnecessary Firestore reads.

---

# 49. Security

Collection data is shared only with authorized Pandal members.

Firestore Rules must verify:

```text
Authenticated User
+
Active Membership
+
Required Collection Permission
+
Correct Pandal/Festival Context
```

Do not rely only on UI checks.

---

# 50. Collection Permissions

Suggested permissions:

```text
collections.view
collections.create
collections.update
collections.void
collections.export
collections.manageHouseholds
collections.manageAreas
collections.viewCollectorStats
```

Use the application's dynamic RBAC system.

Do not automatically give every member all permissions.

---

# 51. Household Permissions

Suggested:

```text
households.view
households.create
households.update
households.archive
```

Avoid allowing normal volunteers to delete historical household information.

Prefer:

```text
ARCHIVED
```

where appropriate.

---

# 52. Privacy

Because household data may include phone numbers:

- Show only necessary information.
- Avoid displaying full mobile numbers in broad lists unless needed.
- Restrict sensitive fields through permissions where appropriate.
- Do not expose household data outside the Pandal.
- Do not log unnecessary personal information.

---

# 53. UX Design

The collection module should follow the existing Expense Tracker's polished design language.

Prioritize:

```text
Search
Area/coverage
Amount
Payment method
Collector
Recent collections
```

Avoid:

```text
Huge forms
Excessive cards
Unnecessary gradients
Generic AI dashboard styling
```

The collection workflow should feel fast and practical.

---

# 54. Collection List UI

Suggested:

```text
Collections

₹80,000
142 collections

[ Search ]

[ All ] [ Cash ] [ UPI ] [ Bank ]

Ramesh Kumar
₹500
House #12 · Cash
Ravi · 10:32 AM

Suresh Rao
₹1,000
House #34 · UPI
Kiran · 10:48 AM
```

Follow the actual Expense Tracker component system rather than inventing a new visual style.

---

# 55. Household List UI

Suggested:

```text
Households

150 Houses
112 Collected
38 Pending

[ Search ]

#12
Ramesh Kumar
₹500 / ₹500
PAID

#13
Suresh Rao
₹300 / ₹500
PARTIAL

#14
Kiran
₹0 / ₹500
PENDING
```

Use clear but restrained status indicators.

---

# 56. Coverage UI

Suggested:

```text
Collection Coverage

112 / 150
74.7%

Area A
30 / 30 ✓

Area B
25 / 40

Area C
57 / 80
```

The most important action should be obvious:

```text
[ View Pending Houses ]
```

---

# 57. Empty States

No households:

```text
No households added yet.

Add households to track
door-to-door collection.

[ Add Household ]
```

No collections:

```text
No collections yet.

Start recording your first Chanda.

[ Add Collection ]
```

No pending houses:

```text
All collection areas are complete 🎉
```

Keep celebratory messaging subtle.

---

# 58. Error States

Examples:

```text
We couldn't save this collection.

Please check your connection and try again.
```

For duplicate:

```text
This looks similar to an existing collection.
Please review before saving.
```

For permission:

```text
You don't have permission to record collections.
```

---

# 59. Data Model Summary

Conceptually:

```text
pandals/{pandalId}
    |
    +-- areas/{areaId}
    |
    +-- households/{householdId}
    |
    +-- festivals/{festivalId}
           |
           +-- collections/{collectionId}
           |
           +-- collectionVisits/{visitId}
           |
           +-- collectionSessions/{sessionId}
```

If the existing project uses another structure, preserve consistency while ensuring Pandal/Festival scoping is correct.

---

# 60. Important Relationship Rules

```text
Household
    =
Pandal-level reusable entity

Collection
    =
Festival-level financial transaction

Visit
    =
Festival-level operational event

Area
    =
Pandal-level collection organization
```

This lets the same household and area be reused every year while preserving historical collection records.

---

# 61. Year-to-Year Reuse

At the beginning of 2027:

```text
Existing Households
        ↓
Reuse for 2027
```

Do not duplicate every household unnecessarily.

The new Festival should create new collection records linked to the same household.

Example:

```text
House #12
Ramesh Kumar

2025 → ₹300
2026 → ₹500
2027 → pending
```

---

# 62. Household Changes

If a household changes its name/mobile/address:

Do not rewrite historical collection records.

Maintain the household's current profile while preserving historical transaction snapshots/audit information where necessary.

---

# 63. Collection Amount Storage

Use a safe monetary representation appropriate to the existing Firestore architecture.

Avoid JavaScript floating-point arithmetic for financial calculations.

For INR amounts, integer paise or another precise representation can be used if the existing system supports it consistently.

Do not mix representations across features.

---

# 64. Audit Trail

Record important events:

```text
Household Created
Household Updated
Collection Created
Collection Updated
Collection Voided
Visit Created
Area Created
Area Assignment Changed
```

For financial operations include:

```text
performedBy
performedAt
```

---

# 65. Reports

Collection reports should support:

```text
Festival
Date
Area
Collector
Payment Method
Household
Amount
Receipt Number
```

Example summary:

```text
2026 Chanda Report

Total:
₹80,000

Cash:
₹45,000

UPI:
₹30,000

Bank:
₹5,000

Donors:
142

Households:
112 / 150
```

---

# 66. Export

If the application already supports exports, collection data should be exportable.

Useful columns:

```text
Receipt Number
Donor
House Number
Area
Amount
Payment Method
Collector
Date
Status
```

CSV/PDF export can be implemented without introducing a paid backend.

---

# 67. Performance

Avoid reading all households and all collections on every screen load.

Use:

- Appropriate Firestore queries
- Pagination/limits where needed
- Indexed fields
- Cached data where appropriate
- Real-time listeners only where valuable

Especially avoid duplicate listeners for:

```text
All households
All collections
All visits
All areas
```

on the same screen.

---

# 68. Acceptance Criteria

## Collection

- [ ] Volunteer can record a collection quickly.
- [ ] Collection belongs to the correct Pandal.
- [ ] Collection belongs to the correct Festival.
- [ ] Actual amount is stored.
- [ ] Payment method is stored.
- [ ] Collector is recorded.
- [ ] Receipt number is unique.
- [ ] Collection increases the correct Festival fund.
- [ ] Duplicate submissions are prevented.
- [ ] Financial operations are concurrency-safe.

## Household

- [ ] Household can be created.
- [ ] Household can be searched.
- [ ] Household has stable identity.
- [ ] Household can have multiple yearly collections.
- [ ] Historical collections are preserved.
- [ ] Partial collection is supported.
- [ ] Expected amount does not create fake income.

## Coverage

- [ ] Total household count is accurate.
- [ ] Collected count is accurate.
- [ ] Pending count is accurate.
- [ ] Coverage percentage is accurate.
- [ ] Coverage can be viewed by area.
- [ ] Pending houses can be identified.
- [ ] Visits and actual money received are not incorrectly conflated.

## Duplicate Detection

- [ ] Possible duplicate is detected.
- [ ] User receives a clear warning.
- [ ] Legitimate installments remain possible.
- [ ] User can explicitly proceed when appropriate.

## Collaboration

- [ ] Multiple volunteers can record collections.
- [ ] Real-time updates work where intended.
- [ ] Concurrent writes do not lose data.
- [ ] Duplicate listeners are avoided.

## Security

- [ ] Only authorized members can view collections.
- [ ] Collection creation uses RBAC.
- [ ] Household management uses RBAC.
- [ ] Unauthorized users cannot modify collections.
- [ ] Cross-Pandal access is blocked.
- [ ] Cross-Festival access is properly scoped.

## Offline

- [ ] Collection entry handles weak connectivity.
- [ ] Sync state is visible.
- [ ] Failed sync can be retried where supported.
- [ ] Offline behavior does not create duplicate financial records.
- [ ] Receipt numbering remains safe.

---

# 69. Recommended Implementation Order

Implement in this order:

```text
1. Household data model
2. Collection data model
3. Fast Add Collection
4. Payment Method
5. Collector attribution
6. Receipt number
7. Household search
8. Collection history
9. Collection list/filter
10. Collection coverage
11. Areas
12. Collector assignment
13. Duplicate detection
14. Visit/follow-up tracking
15. Collection statistics
16. Reports/export
17. Offline improvements
```

Do not build every advanced feature before the basic collection flow is stable.

---

# 70. Golden Rules

### Rule 1

> Expected collection is a target, not money received.

### Rule 2

> Only actual received money increases the Festival Fund.

### Rule 3

> Household identity is separate from individual collection transactions.

### Rule 4

> The same household can contribute across multiple Festivals.

### Rule 5

> Collection and committee contribution are different financial sources.

### Rule 6

> A visit is not automatically a payment.

### Rule 7

> Incomplete/declined/unavailable households must not be counted as paid.

### Rule 8

> Duplicate detection should warn rather than blindly block legitimate installments.

### Rule 9

> Every collection must identify who recorded/collected it.

### Rule 10

> Every financial collection must be safe under concurrent writes.

### Rule 11

> Historical collections should not be silently deleted.

### Rule 12

> The collection workflow must be faster and simpler than a normal accounting form.
