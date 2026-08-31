# Ganesh Seva — Feature Specification 13
## Festival Checklist & Setup Workflow

**Document:** `13-festival-checklist-and-setup-workflow.md`  
**Status:** Product / Implementation Specification  
**Stack:** Expo React Native + Firebase Auth + Firestore + Supabase Storage

---

# 1. Purpose

The Festival Checklist & Setup Workflow helps the committee prepare for Ganesh Chaturthi in a structured way.

It answers:

> **What has been prepared, what is still pending, who is responsible, and what needs attention before the Festival starts?**

This feature should provide a lightweight Festival preparation checklist without becoming a complicated project-management system.

---

# 2. Core Concept

A Festival contains preparation items:

```text
Festival 2026
    |
    +-- Idol
    +-- Decoration
    +-- Electrical
    +-- Sound
    +-- Pooja
    +-- Prasadam
    +-- Collection
    +-- Volunteers
    +-- Permissions
    +-- Cleaning
    +-- Immersion
```

Each item can have:

```text
Task
Owner
Due Date
Status
Notes
```

Reuse Feature 10 Tasks wherever possible.

---

# 3. Checklist vs Task

These concepts should remain related but distinct.

### Checklist Item

A preparation requirement:

```text
Sound system arranged
```

### Task

A specific action:

```text
Ravi → Book sound system
```

A checklist item can optionally generate or link to a Task.

Do not build two independent task systems.

---

# 4. Checklist Data Model

Conceptually:

```text
pandals/{pandalId}/festivals/{festivalId}/checklistItems/{itemId}
```

Suggested fields:

```text
itemId
pandalId
festivalId
title
description
category
status
priority
assignedTo
dueDate
linkedTaskId
completedBy
completedAt
sortOrder
createdBy
createdAt
updatedBy
updatedAt
```

---

# 5. Checklist Status

Recommended:

```text
PENDING
IN_PROGRESS
COMPLETED
SKIPPED
```

Lifecycle:

```text
PENDING
   ↓
IN_PROGRESS
   ↓
COMPLETED
```

Use `SKIPPED` when an item is intentionally not required.

---

# 6. Checklist Categories

Suggested:

```text
Idol
Decoration
Electrical
Sound
Pooja
Prasadam
Collection
Finance
Volunteers
Cleaning
Safety
Permissions
Logistics
Immersion
General
```

Reuse existing category definitions where possible.

---

# 7. Priority

Recommended:

```text
LOW
MEDIUM
HIGH
CRITICAL
```

Critical should be used for genuinely necessary preparation items.

Example:

```text
Electrical Safety Check
CRITICAL
```

---

# 8. Default Festival Checklist

When a new Festival is created, optionally offer:

```text
Use Ganesh Festival Checklist
```

Suggested default items:

```text
☐ Idol booked
☐ Idol arrival arranged
☐ Pandal structure arranged
☐ Decoration materials purchased
☐ Electrical connection checked
☐ Lights arranged
☐ Sound system arranged
☐ Pooja materials purchased
☐ Prasadam plan finalized
☐ Chanda collection started
☐ Committee contributions recorded
☐ Volunteer duties assigned
☐ Cleaning arranged
☐ Safety arrangements checked
☐ Immersion vehicle arranged
☐ Final expense review completed
```

The Admin should be able to remove irrelevant items.

---

# 9. Checklist Templates

The default checklist should be treated as a template.

Conceptually:

```text
Festival Checklist Template
        ↓
Create Festival
        ↓
Copy Items
        ↓
2026 Checklist
```

Do not create a global database of unnecessary templates for the MVP.

A simple built-in template is sufficient.

---

# 10. Copy Previous Festival Checklist

Useful future capability:

```text
2026 Checklist
      ↓
Copy to 2027
```

Completed historical statuses must not be copied.

Only:

```text
Item
Category
Description
Priority
```

should be copied.

---

# 11. Checklist Dashboard

Recommended:

```text
Festival Preparation

Completed
18 / 30

60%

Critical Pending
2

Overdue
3
```

Then show:

```text
Upcoming
In Progress
Pending
Completed
```

---

# 12. Preparation Progress

Example:

```text
Festival Readiness

████████████░░░░
75%

30 items
22 completed
5 pending
2 in progress
1 skipped
```

The percentage should be based on applicable checklist items.

Skipped items should not unnecessarily reduce readiness if they were intentionally excluded.

---

# 13. Category Progress

Example:

```text
Decoration
✓ 5 / 5

Pooja
✓ 4 / 5

Electrical
⚠ 2 / 4

Immersion
○ 1 / 3
```

This allows Admin to identify weak areas quickly.

---

# 14. Checklist Item Creation

Admin/authorized user:

```text
Add Checklist Item

Title:
Arrange immersion vehicle

Category:
Immersion

Priority:
High

Due:
Festival Day - 1

[ Save ]
```

---

# 15. Checklist Item Assignment

An item may optionally be assigned to a Pandal member.

Example:

```text
Arrange sound system

Assigned:
Ravi
```

Only active Pandal members can be assigned.

Use the existing RBAC/membership architecture.

---

# 16. Link Checklist to Task

Example:

```text
Checklist:
Sound system arranged

Task:
Book sound system

Status:
Pending
```

When the linked Task is completed, the checklist can suggest:

```text
Mark checklist item complete?
```

Avoid automatically completing the checklist unless the relationship is explicitly one-to-one and safe.

---

# 17. Checklist Item Detail

Example:

```text
Sound System

Category:
Sound

Priority:
High

Assigned:
Ravi

Due:
28 Aug

Status:
In Progress

Linked Task:
Book sound system
```

Actions:

```text
Mark Complete
Edit
Assign
```

depending on permissions.

---

# 18. Due Dates

Support:

```text
Date
Optional Time
```

Example:

```text
Due:
29 Aug
6:00 PM
```

For festival-relative planning, optionally display:

```text
2 days before Festival
```

Internally store an actual timestamp/date when possible.

---

# 19. Overdue Items

If:

```text
Due date < now
```

and:

```text
Status != COMPLETED
```

show:

```text
OVERDUE
```

Do not automatically cancel overdue items.

---

# 20. Upcoming Items

Show:

```text
Due Today
Due Tomorrow
Due This Week
```

This makes preparation actionable.

---

# 21. Critical Pending Items

Admin dashboard should highlight:

```text
⚠ Electrical safety check
⚠ Immersion vehicle
```

Critical items should remain visible until completed/skipped.

---

# 22. Completion

When completed, record:

```text
status = COMPLETED
completedBy
completedAt
```

Example:

```text
✓ Sound system arranged

Completed by Ravi
28 Aug, 5:30 PM
```

---

# 23. Skipping

An item may be unnecessary:

```text
Cultural Program
```

If the Pandal does not have one:

```text
Status:
SKIPPED
```

Optionally record:

```text
Reason:
No cultural program this year.
```

Do not delete the item if preserving the template/history is useful.

---

# 24. Checklist Notes

Allow optional notes:

```text
Sound system confirmed with vendor.
```

Notes should not replace:

```text
Expense
Sponsor
Contribution
Task
```

records.

---

# 25. Attachments

Optional future support:

```text
Photo
Document
Quotation
Receipt
```

If implemented, reuse the existing Supabase Storage service.

Do not build a second file-upload architecture.

---

# 26. Vendor / Expense Linking

A checklist item may link to a financial record.

Example:

```text
Checklist:
Decoration completed

Expense:
₹18,500
```

Use references.

Do not duplicate the Expense amount inside the checklist as financial truth.

---

# 27. Budget Integration

Feature 12 Budget can show:

```text
Decoration
Budget:
₹20,000

Actual:
₹18,500
```

The checklist may simply show:

```text
Decoration preparation:
COMPLETED
```

Do not make checklist completion modify budget totals.

---

# 28. Inventory Integration

Feature 1 Assets/Inventory can be linked.

Example:

```text
Checklist:
Arrange existing chairs

Inventory:
20 chairs available
```

This helps prevent unnecessary purchases.

---

# 29. Collection Integration

Preparation checklist can include:

```text
Chanda collection started
Collection target configured
Street assignments completed
Collection sessions arranged
```

But the checklist must not create collection transactions.

---

# 30. Volunteer Integration

Feature 14 can later connect:

```text
Checklist:
Pooja materials arranged

Volunteer:
Ravi
```

The checklist is the requirement; the volunteer module handles duty scheduling.

---

# 31. Event Integration

Feature 10 Events can be connected.

Example:

```text
Event:
Ganesh Sthapana

Checklist:
Idol arrived
Pooja materials ready
Decoration completed
Sound checked
```

The event remains the scheduled activity.

---

# 32. Festival Phases

Optional organization:

```text
Before Festival
Festival Days
Visarjan
After Festival
```

This is better than putting every item into one long list.

---

# 33. Suggested Default Phases

### Before Festival

```text
Idol
Budget
Decoration
Electrical
Sound
Pooja
Collection
Volunteers
```

### During Festival

```text
Pooja
Aarti
Prasadam
Cleaning
Collection
Daily Finance Review
```

### Visarjan

```text
Immersion vehicle
Materials
Volunteer assignment
Safety
Final collection
```

### After Festival

```text
Cleaning
Asset return/storage
Pending payments
Expense review
Settlement
Permanent Fund transfer
```

---

# 34. Phase Progress

Example:

```text
Before Festival
✓ 15 / 15

Festival Days
✓ 8 / 12

Visarjan
2 / 6

After Festival
0 / 5
```

This gives Admin a much clearer view than a single 50-item list.

---

# 35. Festival Readiness Score

Optional:

```text
Festival Readiness
82%
```

Use simple calculation based on checklist completion.

Do not present this as a safety certification.

It is an operational indicator only.

---

# 36. Safety Checklist

A dedicated safety category is recommended.

Example:

```text
☐ Electrical connections checked
☐ Wires secured
☐ Fire extinguisher available where appropriate
☐ Pandal exits clear
☐ Extension boards checked
☐ Immersion logistics confirmed
```

Keep safety items practical and non-technical.

---

# 37. Critical Safety Items

Admin should be able to mark items:

```text
CRITICAL
```

Critical incomplete items should be visible prominently.

Example:

```text
⚠ 2 Critical Items Pending
```

Do not allow normal users to hide them from Admin.

---

# 38. Daily Checklist

During the Festival, a simple daily checklist can be useful:

```text
Today

☐ Morning cleaning
☐ Pooja materials ready
☐ Prasadam arranged
☐ Sound checked
☐ Collection handover completed
☐ Evening cleanup
```

This can be implemented later using templates.

---

# 39. Recurring Checklist

Avoid complex recurring scheduling in the first implementation.

If needed later:

```text
Daily Aarti Preparation
```

can generate daily checklist instances.

Do not create an elaborate recurring-task engine for the POC.

---

# 40. Admin Controls

Admin should be able to:

```text
Create
Edit
Delete/Archive
Assign
Reorder
Complete
Skip
Restore
```

subject to RBAC.

---

# 41. Normal User Controls

Depending on permissions:

```text
View
Update assigned item
Mark assigned item complete
Add note
```

Do not allow every user to modify the entire Festival checklist by default.

---

# 42. RBAC Permissions

Suggested:

```text
checklist.view
checklist.create
checklist.update
checklist.assign
checklist.complete
checklist.skip
checklist.delete
checklist.reorder
```

Use the existing dynamic role/permission system.

---

# 43. Real-Time Collaboration

If connected:

```text
Ravi completes:
Sound System
```

Admin should see:

```text
✓ Sound System
```

without manually refreshing.

Scope listeners to:

```text
Current Pandal
+
Current Festival
```

---

# 44. Offline Behavior

The checklist should work reasonably with poor connectivity.

Use existing Firestore offline support where appropriate:

```text
View synced checklist
Mark item complete
Queue change
Sync when connected
```

Show pending synchronization where necessary.

---

# 45. Offline Conflict Handling

If two users update the same item:

```text
Ravi → COMPLETED
Suresh → IN_PROGRESS
```

the system must use a predictable conflict strategy.

Prefer:

- Server timestamps
- Explicit update metadata
- Audit trail

For critical checklist items, preserve who made the latest change.

---

# 46. Performance

Do not load every historical Festival checklist.

Load:

```text
Current Festival
+
Relevant phase
```

Use efficient list rendering.

---

# 47. Read Optimization

Avoid separate Firestore listeners for every category.

Prefer:

```text
One scoped Festival checklist query
```

and perform local grouping.

Do not continuously reload the checklist after every action.

---

# 48. Audit Trail

Record important changes:

```text
Checklist Item Created
Checklist Item Updated
Checklist Item Assigned
Checklist Item Completed
Checklist Item Skipped
Checklist Item Reopened
Checklist Item Archived
```

Include:

```text
performedBy
performedAt
pandalId
festivalId
itemId
```

---

# 49. Notifications

Useful notifications:

```text
Task/checklist assigned
Checklist item due soon
Critical item overdue
```

Avoid notifying the whole committee for every checklist completion.

Use Feature 10 notification infrastructure.

---

# 50. Admin Dashboard Integration

Show:

```text
Festival Readiness

82%

Critical Pending:
2

Overdue:
3

Due Today:
5
```

Tapping should open the checklist filtered to the relevant items.

---

# 51. Recommended UX

The main screen should look approximately like:

```text
Festival Preparation

82% Ready

⚠ 2 Critical Pending
⚠ 3 Overdue

Before Festival
██████████████░░ 90%

✓ Idol booked
✓ Decoration
✓ Electrical
○ Sound system
✓ Pooja materials

Festival Days
██████████░░░░░ 70%

✓ Prasadam
○ Cleaning
○ Daily finance review
```

Use compact cards and clear status indicators.

---

# 52. Avoid AI-Generated / Vibe-Coded UI

The UI should match the existing Expense Tracker design language.

Reuse:

```text
Typography
Spacing
Cards
Buttons
Bottom navigation patterns
Modal styles
Input components
Empty states
Loading states
```

Do not introduce random gradients, excessive rounded cards, unnecessary illustrations, or inconsistent colors.

The Ganesh Pandal module should feel like the same professional application.

---

# 53. Empty States

Example:

```text
No checklist items yet.

Create a custom preparation checklist
or start with the Festival template.

[ Use Festival Checklist ]
```

Avoid blank screens.

---

# 54. Error States

Examples:

```text
Unable to save checklist item.
Please check your connection and try again.
```

For offline:

```text
Saved locally
Waiting for sync
```

Do not show generic unexplained errors.

---

# 55. Acceptance Criteria

## Checklist

- [ ] Festival checklist exists.
- [ ] Checklist items belong to a Festival.
- [ ] Default Festival template can be used.
- [ ] Items can be created.
- [ ] Items can be edited.
- [ ] Items can be assigned.
- [ ] Items can be completed.
- [ ] Items can be skipped.
- [ ] Due dates work.
- [ ] Overdue items are visible.
- [ ] Critical items are visible.

## Workflow

- [ ] Checklist can be grouped by phase.
- [ ] Progress is calculated.
- [ ] Category progress is visible.
- [ ] Festival readiness is visible.
- [ ] Previous Festival checklist can eventually be copied.
- [ ] Historical checklist status is preserved.

## Integration

- [ ] Feature 10 Tasks can be linked.
- [ ] Feature 10 Events can be linked.
- [ ] Feature 12 Budget can be referenced.
- [ ] Inventory can be referenced.
- [ ] Existing notification infrastructure is reused.
- [ ] Existing Supabase Storage service is reused for attachments.

## Security

- [ ] RBAC is enforced.
- [ ] Only active Pandal members can access the current Pandal checklist.
- [ ] Cross-Pandal access is blocked.
- [ ] Cross-Festival access is blocked.
- [ ] Important changes are audited.

## Performance

- [ ] Current Festival is the default scope.
- [ ] Historical Festivals are not loaded unnecessarily.
- [ ] Firestore listeners are scoped.
- [ ] Large lists are efficiently rendered.

---

# 56. Recommended Implementation Order

```text
1. Checklist data model
2. Default Festival checklist template
3. Checklist list screen
4. Checklist item detail
5. Create/edit item
6. Assign item
7. Complete/skip workflow
8. Due dates and overdue states
9. Phase/category grouping
10. Progress calculation
11. Critical-item dashboard
12. Task linking
13. Event/Budget/Inventory references
14. Offline behavior
15. Notifications
16. Audit logging
17. Previous-Festival copy
18. Daily/recurring templates if actually needed
```

---

# 57. Implementation Guidance for Cursor/Claude

Before modifying code:

1. Inspect the existing Festival model.
2. Inspect Feature 10 Tasks and Events implementation.
3. Inspect Feature 12 Budget implementation.
4. Inspect Assets/Inventory implementation.
5. Inspect existing RBAC permissions.
6. Inspect Firestore Security Rules.
7. Inspect notification infrastructure.
8. Inspect existing Expense Tracker UI components.
9. Reuse existing Task functionality rather than creating a second task engine.
10. Reuse existing Event functionality rather than creating a second calendar/event engine.
11. Keep checklist records Festival-scoped.
12. Do not allow checklist completion to create financial transactions.
13. Do not duplicate Expense, Contribution, Sponsor, or Asset data.
14. Use references between modules.
15. Add tests for authorization, completion, phase progress, and Festival isolation.
16. Optimize Firestore listeners and reads.
17. Do not rewrite unrelated modules.

---

# 58. Critical Test Scenarios

## Scenario A — New Festival

Create Festival:

```text
Ganesh Chaturthi 2026
```

Choose:

```text
Use Festival Checklist
```

Expected:

```text
Default checklist created for 2026.
```

---

## Scenario B — Complete Item

```text
Sound system
PENDING
```

Ravi completes it.

Expected:

```text
COMPLETED
completedBy = Ravi
completedAt = recorded
```

---

## Scenario C — Skip Item

```text
Cultural Program
```

Admin selects:

```text
SKIPPED
```

Expected:

```text
Item no longer appears as pending.
```

---

## Scenario D — Overdue

```text
Due:
Yesterday

Status:
PENDING
```

Expected:

```text
OVERDUE
```

---

## Scenario E — Task Link

```text
Checklist:
Sound system arranged

Linked Task:
Book sound system
```

Expected:

```text
Task and checklist remain separate records.
```

---

## Scenario F — Festival Isolation

```text
2026 Checklist
```

must not appear in:

```text
2027 Active Checklist
```

unless explicitly copied.

---

## Scenario G — Permission

Normal user attempts:

```text
Delete critical checklist item
```

Expected:

```text
Permission denied.
```

---

## Scenario H — Concurrent Update

```text
Ravi completes item
Suresh edits item
```

Expected:

```text
No silent data corruption.
Latest update is auditable.
```

---

# 59. Golden Rules

### Rule 1

> The checklist is an operational planning layer, not a financial ledger.

### Rule 2

> Reuse Feature 10 Tasks instead of building a second task system.

### Rule 3

> Reuse Feature 10 Events instead of building a second event system.

### Rule 4

> Checklist completion must never automatically create an Expense or Contribution.

### Rule 5

> Actual financial values come from the financial modules.

### Rule 6

> Checklist items belong to a Festival.

### Rule 7

> Historical Festival checklists must remain intact.

### Rule 8

> Critical incomplete items must be easy for Admin to find.

### Rule 9

> Skipped items should not be treated as unfinished work.

### Rule 10

> Offline changes must show synchronization state.

### Rule 11

> Every important change should be attributable to a user.

### Rule 12

> Keep the feature lightweight; do not turn it into a full project-management platform.

---

# 60. Final Mental Model

```text
                         FESTIVAL
                            |
                     PREPARATION
                            |
       +--------------------+--------------------+
       |                    |                    |
   BEFORE FESTIVAL       FESTIVAL DAYS        VISARJAN
       |                    |                    |
   Idol                  Pooja                Vehicle
   Decoration             Aarti                Safety
   Electrical             Prasadam             Volunteers
   Sound                  Cleaning
   Volunteers             Collection
       |                    |
       +--------------------+--------------------+
                            |
                       READINESS
                            |
                   22 / 30 COMPLETED
                            |
                           73%
```

The feature should always make it possible to answer:

> **Are we ready for the Festival, what is still pending, what is critical, who is responsible, and what needs to be completed next?**
