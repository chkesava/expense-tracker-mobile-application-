# Ganesh Seva — Feature Specification 02
## Pandal & Festival Management

**Document:** 02-pandal-festival-management.md  
**Stack:** Expo React Native + Firebase Auth + Firestore + Supabase Storage  
**Architecture:** Pandal-level data + year-wise Festival data

---

# 1. Purpose

This feature defines how Ganesh Seva manages the Pandal itself and the yearly Ganesh festivals conducted by that Pandal.

The important distinction is:

```text
Pandal
  |
  +-- Permanent / reusable information
  |
  +-- Permanent Fund
  |
  +-- Members
  |
  +-- Roles
  |
  +-- Assets
  |
  +-- Sponsors
  |
  +-- Festivals
        |
        +-- 2026
        +-- 2027
        +-- 2028
```

The Pandal is persistent.

The Festival is year-specific.

---

# 2. Product Principle

The same application should be reusable every year.

Example:

```text
Sri Ganesh Youth Committee

2026 Festival
2027 Festival
2028 Festival
```

Each year gets its own financial/activity records while the Pandal itself remains the permanent parent.

---

# 3. Pandal-Level Data

Pandal-level information should include only information that survives across festival years.

Examples:

- Pandal name
- Locality/area
- Description
- Contact information
- Members
- Roles
- Permissions
- Permanent Fund
- Reusable Assets
- Vendor information
- Sponsor history
- Audit history
- Pandal settings

Do not place year-specific transactions directly at the Pandal level.

---

# 4. Festival-Level Data

Each Festival represents one year's Ganesh Utsav.

Example:

```text
2026 Ganesh Utsav
```

Festival-specific data can include:

- Opening Fund
- Collections
- Committee Contributions
- In-Kind Contributions
- Sponsors
- Expenses
- Reimbursements
- Collection Sessions
- Cash Reconciliation
- Festival Tasks
- Events
- Settlement
- Festival reports

---

# 5. Festival Creation

Authorized users should be able to create a new Festival.

Suggested fields:

```text
Festival Name
Year
Start Date
End Date
Description
```

Example:

```text
Ganesh Utsav 2026

Start:
27 Aug 2026

End:
30 Aug 2026
```

Avoid unnecessary fields.

---

# 6. Festival Year Uniqueness

A Pandal should not accidentally have two active Festivals for the same year.

Example:

```text
Sri Ganesh Youth Committee
2026
```

should not be created twice accidentally.

Before creating a Festival, check for an existing Festival for the same year.

This should also be protected against concurrent creation.

---

# 7. Festival Status

Recommended states:

```text
UPCOMING
ACTIVE
CLOSED
```

Optional:

```text
ARCHIVED
```

Status should be derived from dates where appropriate, but the final lifecycle must be explicit enough to support settlement/locking.

---

# 8. Upcoming Festival

An upcoming Festival can be configured before the event starts.

Admin can prepare:

- Collection configuration
- Committee contribution targets
- Categories
- Sponsors
- Tasks
- Event schedule
- Opening Fund
- Vendors
- Expected expenses

Financial records should still clearly identify the Festival.

---

# 9. Active Festival

The active Festival is the Festival currently being operated.

The main Ganesh Seva dashboard should prominently show:

```text
Ganesh Utsav 2026
ACTIVE
```

All quick actions should automatically use the current Festival context.

Example:

```text
+ Add Collection
```

must record the collection against the active Festival.

---

# 10. Festival Switching

Users should be able to view previous Festivals if their permissions allow it.

Example:

```text
Festival

2026 Ganesh Utsav
ACTIVE

2025 Ganesh Utsav
CLOSED

2024 Ganesh Utsav
CLOSED
```

Switching Festival should change the displayed year-specific data.

---

# 11. Protect Against Wrong-Festival Entries

This is important.

If the user is viewing:

```text
2026
```

then:

```text
Add Expense
Add Collection
Add Contribution
```

must not accidentally create records under 2025 or another Festival.

The current `festivalId` must be explicit.

---

# 12. Permanent Fund Separation

The Permanent Pandal Fund is NOT a Festival Fund.

Correct:

```text
Pandal
 |
 +-- Permanent Fund
 |
 +-- 2026 Festival
 |
 +-- 2027 Festival
```

Incorrect:

```text
2026 Festival
 |
 +-- Permanent Fund
```

The Permanent Fund survives after the Festival closes.

---

# 13. Opening Fund

A Festival can start with existing money.

Example:

```text
2026 Opening Fund

Cash:
₹10,000

UPI:
₹5,000

Bank:
₹5,000

Total:
₹20,000
```

This may come from:

- Permanent Fund transfer
- Previous retained Festival balance
- Other legitimate opening balance

Opening money must NOT automatically be classified as Chanda.

---

# 14. Festival Fund Sources

Festival money may come from:

```text
Opening Fund
Chanda
Committee Contributions
Cash Sponsorships
Other Cash Contributions
Permanent Fund Transfer
```

In-kind contributions must NOT increase cash balance.

Promised money must NOT increase available balance until received.

---

# 15. Festival Expense Scope

Expenses must belong to a specific Festival unless they are explicitly Pandal-level asset information.

Example:

```text
2026
Decoration ₹5,000
```

should not appear as a 2027 expense.

If an item becomes a reusable Pandal Asset:

```text
20 Chairs
```

the asset can remain at Pandal level after the Festival ends.

---

# 16. Festival Settlement

A Festival should eventually be closed through a settlement process.

Conceptually:

```text
Opening Fund
+
Festival Money In
-
Festival Money Out
=
Closing Balance
```

Then Admin can explicitly decide:

```text
Transfer to Permanent Fund
+
Remaining Festival Balance
=
Closing Balance
```

Do not automatically move all money to the Permanent Fund.

Detailed settlement behavior belongs to the Festival Settlement feature.

---

# 17. Closing a Festival

Only authorized users can close a Festival.

Before closing, show a summary:

```text
2026 Festival Settlement

Total Money In
₹1,20,000

Total Expenses
₹90,000

Closing Balance
₹30,000

Permanent Fund Transfer
₹25,000

Remaining
₹5,000
```

Require explicit confirmation.

---

# 18. Closed Festival Protection

Once closed:

```text
2026
🔒 CLOSED
```

Normal users should not be able to modify historical financial records.

Admin may have a controlled reopen mechanism if the product supports it.

Reopening must create an audit event.

Do not silently unlock a closed Festival.

---

# 19. Festival Dashboard

The Festival dashboard should provide a clear yearly overview.

Suggested hierarchy:

```text
Ganesh Utsav 2026
ACTIVE

God Fund
₹45,500

Money In
₹1,20,000

Expenses
₹74,500

Pending Reimbursements
₹2,500

Collections
₹86,000

Committee Contributions
₹20,000
```

Then:

```text
Recent Activity
Pending Actions
Quick Actions
```

Use the existing Expense Tracker design language.

Avoid a generic AI-generated dashboard made entirely of random cards.

---

# 20. Festival Selector UX

The selector should be easy to use.

Example:

```text
Ganesh Utsav 2026  ▼
```

Opening it:

```text
2026 · Active
2025 · Closed
2024 · Closed
```

Clearly distinguish active/current Festival from historical Festivals.

---

# 21. Festival Creation Permissions

Not every committee member should automatically create a Festival.

Use RBAC.

Recommended permission:

```text
festival.create
```

Other permissions may include:

```text
festival.view
festival.update
festival.close
festival.reopen
festival.delete
```

Do not hardcode these around a single role if the application's dynamic RBAC system is already implemented.

---

# 22. Festival Deletion

Avoid normal deletion of Festivals.

A Festival can contain:

- Financial records
- Contributions
- Expenses
- Audit events
- Settlement data

Therefore, prefer:

```text
Close
Archive
```

over permanent deletion.

If deletion is ever supported, restrict it heavily and require explicit confirmation.

---

# 23. Data Model

A clean conceptual structure is:

```text
pandals/{pandalId}

    members/{uid}

    roles/{roleId}

    permissions/{permissionId}

    assets/{assetId}

    sponsors/{sponsorId}

    auditLogs/{logId}

    permanentFund/...

    festivals/{festivalId}

        collections/{collectionId}

        expenses/{expenseId}

        contributions/{contributionId}

        reimbursements/{reimbursementId}

        collectionSessions/{sessionId}

        reconciliations/{reconciliationId}

        tasks/{taskId}

        events/{eventId}

        settlement/{settlementId}
```

Adapt this to the existing codebase rather than blindly rebuilding the database.

---

# 24. Firestore Query Rules

Every Festival-specific query must include the correct Festival context.

Do not rely only on UI state.

Examples:

```text
collections → festivalId
expenses → festivalId
contributions → festivalId
reimbursements → festivalId
sessions → festivalId
```

Security Rules should ensure that a user cannot access a Festival they are not authorized to access.

---

# 25. Concurrent Festival Creation

Two authorized users could theoretically attempt:

```text
Create 2026 Festival
```

at the same time.

Prevent duplicate Festivals using a transaction or deterministic uniqueness strategy.

Do not depend solely on:

```text query first
then create
```

because both clients could pass the query before either creates the document.

---

# 26. Current Festival Selection

The application needs a reliable way to determine:

```text Current Festival
```

Avoid storing only a fragile local variable.

The selected Festival should be validated against the Pandal's available Festivals.

If the selected Festival is closed, clearly indicate that the user is viewing historical data.

---

# 27. Festival Context and Navigation

When navigating between screens:

```text
Home
Collections
Expenses
Contributions
Reports
```

the selected Festival should remain consistent.

Avoid situations such as:

```text
Home → 2026
Expenses → 2025
Collections → 2026
```

unless the user intentionally changed the Festival.

---

# 28. Reports

Festival reports should default to the selected Festival.

Example:

```text
Festival Report
2026
```

Historical reports:

```text
Festival Report
2025
```

Never combine years accidentally.

Year-over-year comparison can intentionally combine historical Festivals, but that must be an explicit report.

---

# 29. Assets Across Festivals

Assets are generally Pandal-level.

Example:

```text
2026:
Purchased 20 Chairs

Pandal Asset:
20 Chairs
```

In 2027:

```text
Existing Assets
20 Chairs
```

The chairs should not become a new 2027 expense simply because they are reused.

The original purchase remains part of its original financial history.

---

# 30. Sponsor History

Sponsors may have activity across multiple Festivals.

Keep the sponsor identity/history at the Pandal level where appropriate, while each sponsorship transaction belongs to its Festival.

Example:

```text
ABC Electricals
 |
 +-- 2025 Sponsorship ₹5,000
 +-- 2026 Sponsorship ₹8,000
```

This allows useful historical reporting.

---

# 31. Member History

Membership is Pandal-level.

A member may participate in:

```text
2025
2026
2027
```

Their Festival-specific activities should remain linked to the relevant Festival.

Do not create a completely new user identity every year.

---

# 32. Festival Tasks and Events

Festival-specific operational information belongs to the Festival.

Example:

```text
2026 Festival
 |
 +-- Tasks
 |    Buy Idol
 |    Arrange Sound
 |    Decoration
 |
 +-- Events
      Pooja
      Prasadam
      Cultural Program
      Immersion
```

These should not contaminate the permanent Pandal data model.

---

# 33. Festival Naming

Use a consistent display format:

```text
Ganesh Utsav 2026
```

Internally, use stable IDs.

Do not use the display name as the Firestore document ID if that creates problems with renaming.

---

# 34. Dates and Time

Use consistent timestamps.

Prefer Firestore server timestamps for:

```text
createdAt
updatedAt
closedAt
settledAt
```

Festival event dates should use an appropriate date/time representation.

Be careful with timezone handling for India.

The product is primarily intended for:

```text
Asia/Kolkata
```

but avoid hardcoding timezone logic into every screen.

---

# 35. Offline Behavior

If the user is offline:

- Viewing previously cached Festival data can be allowed where safe.
- New normal records can use Firestore offline capabilities where appropriate.
- Critical fund transfers and settlement operations must not create ambiguous financial states.
- Closed/open state changes must synchronize safely.
- The UI should clearly communicate synchronization status.

Do not claim a transaction is finalized if the client cannot safely confirm it.

---

# 36. Security

Firestore Security Rules must enforce:

```text
Authenticated
+
Active Pandal Membership
+
Required Permission
+
Correct Pandal/Festival Context
```

A client must not be able to change:

```text
pandalId
festivalId
createdBy
financial ownership
```

to gain unauthorized access.

---

# 37. Audit Events

Record important Festival lifecycle events:

```text
Festival Created
Festival Updated
Festival Activated
Festival Closed
Festival Reopened
Festival Archived
Opening Fund Added
Settlement Created
```

Each event should contain:

```text
pandalId
festivalId
performedBy
performedAt
action
```

---

# 38. UX Requirements

The Festival experience should always make these obvious:

```text
Which Pandal?
Which Festival?
What is the Festival status?
```

Example:

```text
Sri Ganesh Youth Committee

Ganesh Utsav 2026
ACTIVE
```

Do not make users guess which year's data they are looking at.

---

# 39. Acceptance Criteria

## Pandal

- [ ] Pandal persists independently of yearly Festivals.
- [ ] Pandal has a stable ID.
- [ ] Pandal data is properly scoped.
- [ ] Members are Pandal-level.
- [ ] Permanent Fund is Pandal-level.
- [ ] Reusable Assets can survive across years.

## Festival

- [ ] Authorized user can create a Festival.
- [ ] Duplicate year creation is prevented.
- [ ] Festival has a clear status.
- [ ] Current Festival can be selected.
- [ ] Historical Festivals can be viewed if authorized.
- [ ] Festival-specific records use the correct festivalId.
- [ ] Closed Festivals are protected.
- [ ] Festival settlement is explicit.

## Financial Isolation

- [ ] 2026 collections do not appear in 2027 totals.
- [ ] 2026 expenses do not become 2027 expenses.
- [ ] Opening Fund is clearly identified.
- [ ] Permanent Fund remains outside Festival accounting.
- [ ] In-kind contributions do not increase cash.
- [ ] Promised money does not increase available cash.

## Security

- [ ] Festival access requires active membership.
- [ ] Festival management uses RBAC.
- [ ] Users cannot change festivalId to access another Festival.
- [ ] Users cannot change pandalId to access another Pandal.
- [ ] Closed Festival modifications are restricted.

## UX

- [ ] Current Pandal is visible.
- [ ] Current Festival is visible.
- [ ] Festival selector is clear.
- [ ] Switching Festival updates all relevant screens.
- [ ] Loading and empty states are handled.
- [ ] Historical data is clearly marked.

---

# 40. Implementation Guidance

Before changing code:

1. Inspect the existing Pandal data model.
2. Inspect the existing Festival model.
3. Inspect navigation and Festival context.
4. Inspect Firestore queries.
5. Inspect Firestore Security Rules.
6. Inspect RBAC permissions.
7. Inspect existing Permanent Fund implementation.
8. Inspect existing dashboard calculations.
9. Identify duplicate or conflicting Festival implementations.
10. Preserve working Expense Tracker functionality.

Do not rebuild the application from scratch.

Implement only the missing/broken parts.

---

# 41. Final Mental Model

The entire application should behave like:

```text
                 GANESH PANDAL
                       |
          +------------+-------------+
          |            |             |
       Members      Permanent      Assets
       & RBAC          Fund
                       |
          +------------+-------------+
                       |
                    Festivals
                       |
        +--------------+--------------+
        |              |              |
      2026            2027           2028
        |              |              |
   Collections     Collections    Collections
   Expenses        Expenses       Expenses
   Contributions   Contributions  Contributions
   Sessions        Sessions       Sessions
   Tasks           Tasks          Tasks
   Settlement      Settlement    Settlement
```

### Golden rule

> **Pandal information persists across years. Festival information belongs to one specific year.**

This separation is the foundation for the Permanent Fund, historical reporting, year-over-year comparison, and future reuse of the application.
