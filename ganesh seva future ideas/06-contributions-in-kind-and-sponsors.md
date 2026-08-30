# Ganesh Seva — Feature Specification 06
## Contributions, In-Kind Contributions & Sponsors

**Document:** 06-contributions-in-kind-and-sponsors.md  
**Status:** Product / Implementation Specification  
**Stack:** Expo React Native + Firebase Auth + Firestore + Supabase Storage

---

# 1. Purpose

This feature manages contributions that are **not normal household Chanda collections** and ensures the application can track both monetary and non-monetary support given to the Ganesh Pandal.

The system must support:

```text
Committee Contributions
Other Cash Contributions
In-Kind Contributions
Promised Contributions
Received Contributions
Sponsors
Sponsorships
```

The most important rule is:

> **A contribution can have a value without being cash.**

For example:

```text
Ganesh Idol
Estimated Value: ₹15,000
Type: In-Kind
Status: Received
```

This should appear in contribution reporting, but it must **not increase the available cash balance**.

---

# 2. Contribution Categories

Keep the contribution model separate from Chanda.

Recommended types:

```text
COMMITTEE
OTHER_CASH
IN_KIND
SPONSORSHIP
```

Possible future:

```text
DONATION
```

Do not duplicate the existing Collection model unnecessarily.

---

# 3. Committee Contribution

A committee member may contribute money personally to the Festival.

Example:

```text
Ravi Kumar

Committee Contribution
Target: ₹5,000
Received: ₹3,000
Pending: ₹2,000
```

Committee contribution is different from:

```text
Personal Expense
```

A committee contribution normally means the member does not expect reimbursement.

---

# 4. Committee Contribution Target

Admin can configure an expected contribution amount.

Example:

```text
Committee Contribution Target

₹5,000 per member
```

If there are:

```text
10 members
```

the expected total is:

```text
₹50,000
```

But this target must never automatically create income.

Only actual received money becomes financial income.

---

# 5. Individual Contribution Override

The default target should be configurable, but individual members may contribute differently.

Example:

```text
Default:
₹5,000

Ravi:
₹10,000

Suresh:
₹2,500
```

The system should allow the Admin to record actual amounts without forcing the default target.

---

# 6. Committee Contribution Status

Recommended:

```text
NOT_STARTED
PARTIAL
RECEIVED
WAIVED
```

Example:

```text
Ravi

Target:
₹5,000

Received:
₹3,000

Remaining:
₹2,000

Status:
PARTIAL
```

---

# 7. Committee Contribution Data Model

Conceptually:

```text
pandals/{pandalId}/festivals/{festivalId}/committeeContributions/{contributionId}
```

Suggested fields:

```text
contributionId
pandalId
festivalId
memberId
targetAmount
receivedAmount
remainingAmount
paymentMethod
status
notes
createdBy
createdAt
updatedBy
updatedAt
```

Adapt to the existing schema.

---

# 8. Committee Contribution Payment

When a member contributes:

```text
Ravi
₹3,000
```

record:

```text
Committee Contribution
₹3,000
Payment:
Cash
```

Festival money increases by ₹3,000.

The contribution target is reduced accordingly.

---

# 9. Multiple Payments

A committee member may pay in installments.

Example:

```text
Target:
₹5,000

Payment 1:
₹2,000

Payment 2:
₹3,000

Total:
₹5,000
```

Status:

```text
RECEIVED
```

Do not overwrite the first payment when recording the second.

Where practical, retain individual contribution transactions.

---

# 10. Over-Contribution

If:

```text
Target:
₹5,000

Actual:
₹7,000
```

record the actual ₹7,000.

Show:

```text
Target:
₹5,000

Received:
₹7,000

Above Target:
₹2,000
```

Do not cap the actual contribution at the target.

---

# 11. Waived Contribution

If the committee decides that a member does not need to contribute:

```text
Target:
₹5,000

Status:
WAIVED
```

This should not create or remove money.

It only changes the expected contribution obligation.

Record:

```text
waivedBy
waivedAt
waiveReason
```

where appropriate.

---

# 12. Other Cash Contributions

Support contributions from people or organizations that are not part of normal household Chanda.

Example:

```text
Name:
Ramesh Traders

Amount:
₹10,000

Type:
Other Cash Contribution

Payment:
UPI
```

This increases Festival available funds.

---

# 13. Other Contribution Fields

Suggested:

```text
Contributor Name
Mobile (optional)
Amount
Payment Method
Purpose
Notes
Date
```

Example:

```text
Contributor:
ABC Traders

Amount:
₹10,000

Purpose:
General Festival Support
```

---

# 14. Purpose-Specific Contributions

Allow an optional purpose.

Examples:

```text
Prasadam Fund
Decoration
Pooja
Immersion
General Pandal
```

The purpose is descriptive unless the Pandal explicitly enables restricted funds.

Do not make purpose-specific accounting mandatory in the MVP.

---

# 15. In-Kind Contributions

An in-kind contribution is something provided instead of cash.

Examples:

```text
Ganesh Idol
Laddu
Flowers
Decoration Materials
Sound System
Chairs
Water Bottles
Food
Transport
```

Example:

```text
Contribution:
Ganesh Idol

Contributor:
Ravi Murthy Works

Estimated Value:
₹15,000

Type:
IN_KIND

Status:
RECEIVED
```

---

# 16. In-Kind Contribution Cash Rule

An in-kind contribution must NOT increase:

```text
Cash
UPI
Bank
Available God Fund
```

It may increase:

```text
Total Contribution Value
```

for reporting.

Example:

```text
Cash Contributions:
₹80,000

In-Kind Value:
₹25,000

Total Support Value:
₹1,05,000
```

But:

```text
Available Cash:
₹80,000
```

---

# 17. Estimated Value

In-kind contributions can have:

```text
Estimated Value
```

This is not necessarily the actual market price.

Example:

```text
Laddu
Quantity:
500

Estimated Value:
₹5,000
```

Label this clearly as:

```text
Estimated Value
```

Do not present it as cash received.

---

# 18. Quantity for In-Kind Contributions

Allow quantity when appropriate.

Example:

```text
Laddu
Quantity:
500

Estimated Value:
₹5,000
```

or:

```text
Chairs
Quantity:
20

Estimated Value:
₹15,000
```

Quantity is optional.

---

# 19. Unit Information

Optional:

```text
Unit:
pieces
kg
litres
sets
boxes
```

Example:

```text
Flowers
20 kg
₹4,000 estimated value
```

Do not require units for every contribution.

---

# 20. In-Kind Contribution Status

Recommended:

```text
PROMISED
RECEIVED
CANCELLED
```

Example:

```text
Ganesh Idol

₹15,000 estimated value

PROMISED
```

Later:

```text
RECEIVED
```

---

# 21. Promised vs Received

This distinction is critical.

Example:

```text
Ravi promised:
Ganesh Idol
₹15,000 estimated value
```

The dashboard can show:

```text
Promised In-Kind:
₹15,000
```

but must NOT show:

```text
Available Cash:
+₹15,000
```

Only when actually received should it appear in received in-kind reporting.

---

# 22. In-Kind Contribution That Becomes an Asset

Some in-kind contributions may become reusable Pandal Assets.

Example:

```text
20 Chairs
Donated by Ravi
Estimated Value ₹15,000
```

The contribution can be linked to:

```text
Pandal Asset
20 Chairs
```

Then next year:

```text
Existing Asset:
20 Chairs
```

This avoids treating the chairs as a new purchase.

---

# 23. Consumable In-Kind Contributions

Some in-kind contributions are consumed during the Festival.

Examples:

```text
Laddu
Flowers
Food
Water
Pooja Materials
```

These should remain contribution records.

They should not automatically become Assets.

---

# 24. Sponsor Concept

Sponsors are different from normal contributors.

A sponsor is a person/business/organization associated with supporting the Festival, potentially through:

```text
Cash
In-Kind
Service
Material
```

Example:

```text
ABC Electricals

Sponsor
2026

Provided:
Lighting

Estimated Value:
₹8,000
```

---

# 25. Sponsor vs Sponsorship

Separate:

```text
Sponsor
```

from:

```text
Sponsorship Transaction
```

A sponsor can participate every year.

Example:

```text
ABC Electricals

2025:
₹5,000

2026:
₹8,000

2027:
₹10,000
```

The Sponsor is the reusable Pandal-level identity.

The sponsorship is Festival-specific.

---

# 26. Sponsor Data Model

Conceptually:

```text
pandals/{pandalId}/sponsors/{sponsorId}
```

Suggested:

```text
sponsorId
name
businessName
contactName
mobile
email
address
notes
createdAt
updatedAt
```

Only collect necessary information.

---

# 27. Sponsorship Data Model

Conceptually:

```text
pandals/{pandalId}/festivals/{festivalId}/sponsorships/{sponsorshipId}
```

Suggested:

```text
sponsorshipId
pandalId
festivalId
sponsorId
type
amount
estimatedValue
purpose
status
paymentMethod
notes
createdBy
createdAt
updatedAt
```

---

# 28. Sponsorship Types

Recommended:

```text
CASH
IN_KIND
SERVICE
```

Example:

```text
ABC Electricals

Type:
SERVICE

Provided:
Lighting installation
```

Estimated value can be recorded where appropriate.

---

# 29. Sponsorship Status

For cash:

```text
PROMISED
RECEIVED
CANCELLED
```

For in-kind/service:

```text
PROMISED
RECEIVED
CANCELLED
```

Do not count promised sponsorship as received.

---

# 30. Sponsor Payment

Cash sponsorship:

```text
ABC Electricals
₹10,000
UPI
RECEIVED
```

This increases Festival available funds.

In-kind sponsorship:

```text
ABC Electricals
Lighting
₹10,000 estimated value
RECEIVED
```

This does not increase Festival cash.

---

# 31. Sponsor Purpose

Optional purpose:

```text
Decoration
Lighting
Sound
Prasadam
Immersion
General Festival
```

Example:

```text
ABC Electricals
₹10,000
Purpose:
Lighting
```

---

# 32. Sponsor History

Sponsor detail screen:

```text
ABC Electricals

2026
₹10,000
Lighting

2025
₹8,000
Decoration
```

Show:

```text
Total Historical Support
```

but distinguish:

```text
Cash
In-Kind
Service
```

---

# 33. Sponsor Summary

Festival dashboard:

```text
Sponsors

Cash Received
₹18,000

In-Kind Value
₹12,000

Promised
₹5,000
```

Do not combine all three into available cash.

---

# 34. Contribution Summary

Festival contribution dashboard:

```text
Contributions

Committee
₹20,000

Chanda
₹80,000

Other Cash
₹10,000

Sponsorship Cash
₹8,000

In-Kind
₹25,000

Promised
₹7,000
```

Only cash received categories should affect available cash.

---

# 35. Total Support Value

A useful optional metric:

```text
Total Festival Support

Cash Received:
₹1,18,000

In-Kind Received:
₹25,000

Total Support Value:
₹1,43,000
```

Label clearly that the second value is estimated/non-cash where applicable.

---

# 36. Contribution Detail Screen

Example:

```text
Ganesh Idol

Contributor:
Ravi Murthy Works

Type:
In-Kind

Estimated Value:
₹15,000

Status:
Received

Quantity:
1

Date:
25 Aug 2026

Notes:
Traditional clay idol
```

---

# 37. Add Contribution UX

Keep the initial form simple:

```text
Add Contribution

Contributor
Ravi

Type
[ Committee ]
[ Other Cash ]
[ In-Kind ]
[ Sponsorship ]

Amount / Value
₹5,000

Status
Received

[ Save ]
```

Additional fields appear based on type.

---

# 38. Committee Contribution UX

```text
Member
Ravi

Target
₹5,000

Received
₹3,000

Payment
Cash

[ Add Payment ]
```

The target and actual payment should remain distinct.

---

# 39. In-Kind UX

```text
Contributor
Ravi

Item
Ganesh Idol

Estimated Value
₹15,000

Status
Received

Quantity
1

[ Save Contribution ]
```

Do not show unnecessary payment-method fields for non-cash contributions.

---

# 40. Sponsor UX

```text
Sponsor
ABC Electricals

Support Type
Cash

Amount
₹10,000

Purpose
Lighting

Status
Received

[ Save Sponsorship ]
```

For in-kind/service:

```text
Estimated Value
```

instead of cash amount.

---

# 41. Contribution Editing

Authorized users can edit contributions.

Financial changes must be audited.

Example:

```text
₹5,000
→
₹7,000
```

must retain:

```text
old value
new value
changed by
changed at
```

---

# 42. Contribution Voiding

Avoid hard deletion.

Use:

```text
VOIDED
```

for monetary contributions where appropriate.

Keep:

```text
voidedBy
voidedAt
voidReason
```

A voided cash contribution must no longer increase Festival cash totals.

---

# 43. Promised Contribution Cancellation

If someone promised:

```text
₹10,000 sponsorship
```

and later cancels:

```text
Status:
CANCELLED
```

The system must not change actual received cash because the promised amount was never cash.

---

# 44. Contribution Conversion

If appropriate, allow controlled conversion:

```text
PROMISED
    ↓
RECEIVED
```

For example:

```text
Promised:
Ganesh Idol ₹15,000

Received:
Ganesh Idol ₹15,000
```

This must be audited.

Do not modify the original history silently.

---

# 45. Committee Contribution vs Personal Expense

These must remain separate.

### Committee Contribution

```text
Ravi contributes ₹5,000
No reimbursement expected
```

### Personal Expense

```text
Ravi buys decoration for ₹5,000
Reimbursement expected
```

The financial effects are different.

---

# 46. Committee Contribution vs Chanda

Do not combine them.

Example:

```text
Chanda:
₹80,000

Committee:
₹20,000
```

Dashboard can show:

```text
Total Cash Received:
₹1,00,000
```

while retaining the source breakdown.

---

# 47. In-Kind vs Expense

If someone donates:

```text
20 Chairs
₹15,000 estimated value
```

do not create:

```text
Expense:
₹15,000
```

because no Pandal cash was spent.

Instead:

```text
In-Kind Contribution
+
Pandal Asset
```

if the item is reusable.

---

# 48. Sponsor vs Vendor

A sponsor provides support.

A vendor sells something to the Pandal.

Example:

```text
Vendor:
Decoration company
Expense:
₹10,000
```

versus:

```text
Sponsor:
ABC Electricals
Provided lighting
₹10,000 estimated value
```

Do not automatically treat sponsors as vendors.

---

# 49. Financial Integration

### Cash Committee Contribution

```text
Festival Fund ↑
```

### Cash Other Contribution

```text
Festival Fund ↑
```

### Cash Sponsorship

```text
Festival Fund ↑
```

### In-Kind

```text
Cash unchanged
Contribution Value ↑
```

### Promised Cash

```text
Cash unchanged
Pending/Promised Value ↑
```

### Promised In-Kind

```text
Cash unchanged
Promised Value ↑
```

---

# 50. Payment Method

For cash contributions:

```text
CASH
UPI
BANK
OTHER
```

For in-kind contributions, payment method should normally be omitted.

Do not force a fake payment method such as `CASH` for a donated idol.

---

# 51. Receipt Support

Cash contributions can eventually receive a digital receipt.

Suggested reference:

```text
GNS26-CON-000182
```

Sponsorships can have a reference as well.

In-kind contributions may use:

```text
Contribution Reference
```

rather than a cash receipt if appropriate.

---

# 52. Firestore Structure

Recommended conceptual structure:

```text
pandals/{pandalId}

    sponsors/{sponsorId}

    festivals/{festivalId}

        committeeContributions/{contributionId}

        otherContributions/{contributionId}

        inKindContributions/{contributionId}

        sponsorships/{sponsorshipId}
```

A unified contribution collection can also be used if it produces cleaner queries.

Do not create redundant collections merely for visual categorization.

---

# 53. Query Efficiency

Avoid reading all contributions every time the dashboard opens.

Use:

- Festival filters
- Status filters
- Type filters
- Pagination where necessary
- Appropriate indexes
- Cached summaries where useful

Do not create unnecessary real-time listeners.

---

# 54. Concurrency

Two users may record contributions simultaneously.

Example:

```text
Ravi:
₹5,000 committee contribution

Suresh:
₹10,000 sponsorship
```

Both must be retained.

Use safe Firestore writes/transactions where balance updates are involved.

Avoid unsafe:

```text
Read balance
+
amount
→
overwrite balance
```

---

# 55. Duplicate Submission Protection

Prevent duplicate records caused by:

```text
Double tapping Save
Network retry
App retry
```

Use an appropriate idempotency strategy.

Do not create two identical ₹10,000 sponsorships because the app retried the request.

---

# 56. Offline Support

Contributions should work reasonably under unstable connectivity.

Show:

```text
Pending Sync
```

where applicable.

Cash financial transactions must synchronize safely.

Do not falsely display an unsynchronized contribution as permanently settled if the system cannot confirm synchronization.

---

# 57. Security

Only authorized Pandal members with the relevant permissions can:

- View contributions
- Create contributions
- Edit contributions
- Void contributions
- Manage sponsors

Firestore Security Rules must enforce this.

Do not trust client-supplied:

```text
pandalId
festivalId
memberId
amount
status
```

without authorization and validation.

---

# 58. Contribution Permissions

Suggested:

```text
contributions.view
contributions.create
contributions.update
contributions.void

committeeContributions.manage

inKindContributions.manage

sponsors.view
sponsors.create
sponsors.update
sponsors.archive

sponsorships.create
sponsorships.update
sponsorships.void
```

Use the application's existing dynamic RBAC system.

---

# 59. Privacy

Contributor information may contain:

```text
Name
Mobile
Email
Business Information
```

Only expose what is needed.

Avoid showing full phone numbers in broad lists unless necessary.

Keep data within the authorized Pandal.

---

# 60. Dashboard UX

Recommended sections:

```text
Contributions

Cash Received
₹1,18,000

Committee
₹20,000

Other
₹10,000

Sponsors
₹8,000

In-Kind Value
₹25,000

Promised
₹7,000
```

Make it visually obvious that:

```text
Cash
```

and:

```text
Non-Cash Value
```

are different.

---

# 61. Contribution List UI

Example:

```text
Contributions

[ All ] [ Cash ] [ In-Kind ] [ Sponsors ]

Ravi Kumar
₹5,000
Committee
Received

Ganesh Idol
₹15,000 estimated
In-Kind
Received

ABC Electricals
₹10,000
Sponsorship
Received
```

Use clear labels.

---

# 62. Sponsor List UI

Example:

```text
Sponsors

ABC Electricals
₹10,000 · Lighting

Ravi Traders
₹5,000 · Prasadam

Sri Bakery
₹8,000 · Food
```

Show Festival-specific sponsorship totals.

---

# 63. In-Kind List UI

Example:

```text
In-Kind Contributions

Ganesh Idol
₹15,000 estimated

500 Laddu
₹5,000 estimated

20 Chairs
₹15,000 estimated
```

Clearly label estimated values.

---

# 64. Acceptance Criteria

## Committee Contributions

- [ ] Admin can configure a target.
- [ ] Member-specific actual contribution can differ from target.
- [ ] Partial payments work.
- [ ] Multiple payments are retained.
- [ ] Over-contribution is allowed.
- [ ] Waived contribution is supported.
- [ ] Actual received money increases Festival cash.
- [ ] Target alone does not increase cash.

## Other Cash Contributions

- [ ] Contributor can be recorded.
- [ ] Amount is validated.
- [ ] Payment method is recorded.
- [ ] Purpose is optional.
- [ ] Actual cash increases Festival funds.
- [ ] Historical records are retained.

## In-Kind

- [ ] Item can be recorded.
- [ ] Estimated value can be recorded.
- [ ] Quantity is supported.
- [ ] Promised/received status works.
- [ ] In-kind does not increase cash.
- [ ] Reusable items can link to Assets.
- [ ] Consumables remain contributions.

## Sponsors

- [ ] Sponsor profile is reusable across years.
- [ ] Sponsorship belongs to a Festival.
- [ ] Cash sponsorship increases cash when received.
- [ ] In-kind sponsorship does not increase cash.
- [ ] Promised sponsorship does not increase cash.
- [ ] Sponsor history can be viewed.

## Security

- [ ] RBAC controls contribution operations.
- [ ] Unauthorized members cannot modify contributions.
- [ ] Cross-Pandal access is blocked.
- [ ] Cross-Festival access is correctly scoped.

## Integrity

- [ ] Concurrent contributions do not overwrite each other.
- [ ] Duplicate submission is prevented.
- [ ] Voided contributions are excluded from totals.
- [ ] Financial changes are audited.

---

# 65. Recommended Implementation Order

```text
1. Committee contribution model
2. Contribution target configuration
3. Actual contribution payments
4. Partial/complete status
5. Other cash contributions
6. In-kind contribution model
7. Promised/received status
8. Sponsor model
9. Sponsorship transactions
10. Contribution list/details
11. Dashboard summaries
12. Asset linkage
13. Receipts/references
14. Search/filter
15. Audit
16. Offline improvements
17. Reports/export
```

---

# 66. Implementation Guidance for Cursor/Claude

Before modifying code:

1. Inspect existing Committee Contribution implementation.
2. Inspect existing Chanda/Collection implementation.
3. Inspect existing Expense and Personal Money logic.
4. Inspect Permanent Fund and Festival Fund calculations.
5. Inspect existing Sponsor/Contribution models.
6. Inspect RBAC permissions.
7. Inspect Firestore Security Rules.
8. Inspect Asset model before linking donated items.
9. Inspect receipt/reference generation.
10. Identify duplicate financial calculations.
11. Reuse existing components and services.
12. Add tests for cash vs in-kind vs promised behavior.
13. Do not rewrite unrelated Expense Tracker functionality.

---

# 67. Critical Test Scenarios

### Scenario A — Committee Contribution

```text
Target:
₹5,000

Received:
₹3,000

Expected:
Festival Cash +₹3,000
Pending Target ₹2,000
```

### Scenario B — Full Committee Contribution

```text
Target:
₹5,000

Received:
₹5,000

Expected:
Festival Cash +₹5,000
Pending ₹0
Status RECEIVED
```

### Scenario C — In-Kind Idol

```text
Ganesh Idol
Estimated Value:
₹15,000

Expected:
Cash +₹0
In-Kind Value +₹15,000
```

### Scenario D — Promised Sponsor

```text
Sponsor:
ABC Electricals

Promised:
₹10,000

Expected:
Cash +₹0
Promised +₹10,000
```

### Scenario E — Received Sponsor

```text
Promised:
₹10,000

Received:
₹10,000

Expected:
Cash +₹10,000
Promised Pending ₹0
```

### Scenario F — Donated Chairs

```text
20 Chairs
Estimated Value:
₹15,000

Expected:
Cash +₹0
In-Kind +₹15,000
Asset:
20 Chairs
```

---

# 68. Golden Rules

### Rule 1

> A contribution is not automatically cash.

### Rule 2

> Promised money is not received money.

### Rule 3

> In-kind value must never increase cash balance.

### Rule 4

> Committee contribution is different from personal expense reimbursement.

### Rule 5

> Chanda is different from committee contribution.

### Rule 6

> Sponsor identity is Pandal-level; sponsorship activity is Festival-level.

### Rule 7

> Cash sponsorship increases Festival funds only when actually received.

### Rule 8

> Estimated in-kind value must always be clearly labeled as estimated/non-cash.

### Rule 9

> Reusable donated items may become Pandal Assets.

### Rule 10

> Consumable donated items should remain contributions and should not become reusable Assets.

### Rule 11

> Financial contribution records must be auditable.

### Rule 12

> Do not double-count a contribution as both cash and in-kind.

---

# 69. Final Mental Model

```text
                         CONTRIBUTIONS
                               |
             +-----------------+------------------+
             |                 |                  |
        CASH RECEIVED       IN-KIND            PROMISED
             |                 |                  |
       +-----+-----+       Value Only        Future Support
       |           |            |                  |
   Committee    Sponsor      Asset?             Not Cash
       |           |            |
       +-----------+            |
             |                  |
             v                  v
        Festival Fund      Contribution Value
```

The application should always make it possible to answer:

> **How much cash did the Pandal actually receive, how much came from committee members, how much came from sponsors, what was donated as goods/services, and what has only been promised?**
