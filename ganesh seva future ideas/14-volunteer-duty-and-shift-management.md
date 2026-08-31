# Ganesh Seva — Feature Specification 14
## Volunteer Duty & Shift Management

**Document:** `14-volunteer-duty-and-shift-management.md`  
**Status:** Product / Implementation Specification  
**Stack:** Expo React Native + Firebase Auth + Firestore + Supabase Storage

---

# 1. Purpose

Volunteer Duty & Shift Management helps the Pandal coordinate committee members and volunteers during the Festival.

It answers:

> **Who is responsible for what, where, and when?**

Typical duties include:

```text
House-to-house collection
Pooja
Aarti
Prasadam
Cleaning
Decoration
Electrical
Sound
Security
Crowd management
Cash handover
Immersion
```

The feature should be lightweight and integrate with the existing:

```text
RBAC
Tasks
Events
Collection Sessions
Checklist
Notifications
```

It should not become a complex workforce-management application.

---

# 2. Core Concept

The structure is:

```text
Festival
   ↓
Duty
   ↓
Shift
   ↓
Volunteer
```

Example:

```text
Evening Pooja
6:00 PM – 9:00 PM

Ravi
Suresh
Kiran
```

---

# 3. Duty vs Shift

Keep the concepts clear.

### Duty

The responsibility:

```text
Evening Pooja
Collection
Cleaning
Sound Management
```

### Shift

A scheduled time slot for that duty:

```text
Evening Pooja
6 PM – 9 PM
```

One duty can have multiple shifts.

---

# 4. Data Model

Conceptually:

```text
pandals/{pandalId}/festivals/{festivalId}/duties/{dutyId}
```

and:

```text
pandals/{pandalId}/festivals/{festivalId}/shifts/{shiftId}
```

Suggested duty fields:

```text
dutyId
pandalId
festivalId
title
description
category
location
status
createdBy
createdAt
updatedAt
```

Suggested shift fields:

```text
shiftId
dutyId
pandalId
festivalId
startAt
endAt
assignedUserIds
createdBy
createdAt
updatedAt
status
notes
```

Use the existing project's naming conventions if different.

---

# 5. Duty Categories

Recommended:

```text
Collection
Pooja
Aarti
Prasadam
Cleaning
Decoration
Electrical
Sound
Security
Logistics
Finance
Immersion
General
```

Categories should remain optional.

---

# 6. Shift Status

Recommended:

```text
SCHEDULED
IN_PROGRESS
COMPLETED
CANCELLED
```

---

# 7. Volunteer Assignment

A shift can have one or more volunteers.

Example:

```text
Morning Collection
8 AM – 11 AM

Ravi
Suresh
```

Only active Pandal members should be assignable.

---

# 8. Admin Shift Creation

Example:

```text
Create Shift

Duty:
Morning Collection

Date:
30 Aug

Start:
8:00 AM

End:
11:00 AM

Volunteers:
Ravi
Suresh

Location:
Gandhi Street

[ Create Shift ]
```

Keep the form short.

---

# 9. Volunteer Selection

Show active Pandal members with:

```text
Name
Role
Current assignments
```

Example:

```text
☑ Ravi
   Collector

☐ Suresh
   Treasurer

☐ Kiran
   Volunteer
```

Do not expose unnecessary private user information.

---

# 10. Conflict Detection

Before assigning a volunteer, check for overlapping shifts.

Example:

```text
Ravi

8 AM – 11 AM
Collection

9 AM – 12 PM
Pooja
```

Show:

```text
⚠ Schedule Conflict
Ravi already has a shift during this time.
```

Allow Admin to override if genuinely necessary, but make the conflict visible.

---

# 11. Double Booking

Do not silently double-book a volunteer.

The system should warn when:

```text
Existing Shift overlaps New Shift
```

A warning is preferable to an automatic hard block because committee members may sometimes handle multiple responsibilities.

---

# 12. Volunteer Availability

MVP:

```text
No availability calendar required.
```

Use conflict detection from existing assignments.

Future:

```text
Available
Unavailable
Preferred Times
```

can be added if needed.

---

# 13. My Duties

Normal users should have a simple screen:

```text
My Duties

Today

8:00 AM
Collection
Gandhi Street

6:00 PM
Evening Aarti
Pandal
```

This should be easy to access from the Pandal home/dashboard.

---

# 14. Duty Detail

Example:

```text
Morning Collection

8:00 AM – 11:00 AM

Gandhi Street

Volunteers:
Ravi
Suresh

Status:
Scheduled
```

Actions:

```text
Start Shift
Mark Complete
View Related Task
```

depending on permissions.

---

# 15. Start Shift

A volunteer can optionally select:

```text
Start Shift
```

Then:

```text
Status:
IN_PROGRESS
```

Record:

```text
startedBy
startedAt
```

Do not require location tracking.

---

# 16. Complete Shift

When finished:

```text
Mark Complete
```

Record:

```text
completedBy
completedAt
```

A shift may be completed by an assigned volunteer or authorized Admin.

---

# 17. No GPS Requirement

Do not introduce:

```text
GPS tracking
Background location
Continuous location monitoring
```

for the POC.

It adds complexity, permissions, battery usage, and privacy concerns without being necessary for your Pandal.

---

# 18. Collection Shift Integration

Collection shifts should connect to Feature 08 and Feature 11.

Example:

```text
Shift:
Morning Collection

Volunteer:
Ravi

Collection Session:
Morning Collection #001
```

The shift itself does not create financial transactions.

---

# 19. Collection Accountability

At the end of a collection shift:

```text
Ravi

Households Visited:
35

Collected:
₹12,500

Collection Session:
#001

Handover:
Pending
```

This connects operations to financial reconciliation.

---

# 20. Cash Handover Integration

If a shift involves cash collection:

```text
Shift Complete
      ↓
Collection Session
      ↓
Cash Handover
      ↓
Reconciliation
```

Do not create a separate cash ledger inside Volunteer Duty Management.

---

# 21. Pooja Duty

Example:

```text
Morning Pooja
6:00 AM – 8:00 AM

Ravi
Kiran
```

Optional linked checklist:

```text
☑ Pooja materials ready
☑ Flowers ready
☐ Prasadam ready
```

Use Feature 13 for checklist records.

---

# 22. Prasadam Duty

Example:

```text
Prasadam Distribution

12 PM – 2 PM

Volunteers:
Suresh
Kiran
Mahesh
```

No financial transaction is created by the duty itself.

---

# 23. Cleaning Duty

Example:

```text
Evening Cleaning

9 PM – 10 PM

Ravi
Suresh
```

Can optionally link to:

```text
Festival Checklist
```

---

# 24. Decoration Duty

Example:

```text
Decoration Setup

25 Aug
4 PM – 8 PM

Volunteers:
Ravi
Kiran
```

Related purchases remain in:

```text
Expenses
```

---

# 25. Electrical / Sound Duty

Example:

```text
Electrical Check
4 PM – 5 PM

Assigned:
Ravi
```

This can link to a critical checklist item.

---

# 26. Immersion Duty

Example:

```text
Visarjan

4 PM – 10 PM

Drivers
Volunteers
Finance/Handover person
```

Use separate tasks/checklist items for detailed preparation.

---

# 27. Event Integration

A shift can optionally be associated with an Event.

Example:

```text
Event:
Evening Aarti

Related Duty:
Aarti Volunteers

Shift:
6 PM – 9 PM
```

Do not duplicate Event information.

Store a reference:

```text
eventId
```

---

# 28. Task Integration

A duty can optionally link to Tasks.

Example:

```text
Duty:
Decoration Setup

Tasks:
Arrange lights
Set up backdrop
Arrange chairs
```

Tasks remain separate operational records.

---

# 29. Checklist Integration

A shift may have related Checklist items.

Example:

```text
Sound Duty

Checklist:
☑ Speakers connected
☑ Microphone tested
☐ Backup cable ready
```

Do not duplicate checklist state inside the shift.

---

# 30. Calendar View

Provide a simple schedule:

```text
30 Aug

6:00 AM
Morning Pooja

8:00 AM
Collection

12:00 PM
Prasadam

6:00 PM
Evening Aarti

9:00 PM
Cleaning
```

A chronological list may be sufficient for the MVP.

A full calendar library is optional.

---

# 31. Today's Duty View

Admin dashboard:

```text
Today's Duties

6:00 AM
Morning Pooja
2 volunteers

8:00 AM
Collection
3 volunteers

6:00 PM
Aarti
4 volunteers
```

---

# 32. Unassigned Shifts

Admin should see:

```text
⚠ 3 Unassigned Shifts
```

Example:

```text
Visarjan Vehicle
4 PM – 10 PM
No volunteers assigned
```

This is more useful than allowing an important duty to silently remain unstaffed.

---

# 33. Minimum Volunteer Requirement

Optional:

```text
Required Volunteers:
3

Assigned:
2

Status:
UNDERSTAFFED
```

This is useful for:

```text
Collection
Security
Prasadam
Immersion
```

Do not require this field for every duty.

---

# 34. Shift Capacity

Optional fields:

```text
minimumVolunteers
recommendedVolunteers
```

Example:

```text
Collection
Minimum: 2
Recommended: 3
Assigned: 3
```

---

# 35. Duty Assignment Dashboard

Admin:

```text
Volunteer Schedule

Ravi
8 AM – 11 AM
Collection

6 PM – 9 PM
Aarti

Suresh
8 AM – 11 AM
Collection

12 PM – 2 PM
Prasadam
```

This gives an at-a-glance view of assignments.

---

# 36. Volunteer Workload

Show:

```text
Ravi
4 shifts

Suresh
2 shifts

Kiran
3 shifts
```

This helps Admin distribute duties fairly.

Do not turn this into a performance ranking.

---

# 37. Fair Distribution

When assigning shifts, show:

```text
Ravi:
4 shifts

Suresh:
1 shift
```

as context.

Admin decides assignments.

Do not automatically rebalance volunteers.

---

# 38. Availability Conflict

If a volunteer has:

```text
8 AM – 11 AM Collection
```

and Admin tries:

```text
10 AM – 12 PM Cleaning
```

show:

```text
Conflict detected.
```

Provide:

```text
Keep Assignment
```

or:

```text
Choose Another Volunteer
```

---

# 39. Shift Reminder

Use Feature 10 notification infrastructure.

Example:

```text
Your Collection shift starts in 1 hour.
```

Avoid repeated reminders.

---

# 40. Shift Start Notification

Optional:

```text
Your shift starts now.
```

Use sparingly.

---

# 41. Shift Change Notification

If Admin changes:

```text
Ravi
```

to:

```text
Suresh
```

notify affected users.

Example:

```text
Your duty has changed.

Collection
8 AM – 11 AM

You are no longer assigned.
```

New assignee receives:

```text
You were assigned:
Collection
8 AM – 11 AM
```

---

# 42. Notification Preferences

Use existing Feature 10 preferences.

Suggested:

```text
Duty Assignment
ON

Duty Reminder
ON

Duty Changes
ON
```

---

# 43. Shift History

Keep historical records:

```text
Morning Collection
30 Aug

Assigned:
Ravi
Suresh

Completed:
Ravi
Suresh

Completed at:
11:10 AM
```

Historical data should not be deleted casually.

---

# 44. Attendance / Participation

MVP should keep this simple.

Optional status:

```text
ATTENDED
MISSED
```

Do not build biometric attendance or location tracking.

---

# 45. Missed Shift

If:

```text
End time passed
```

and the shift was not completed:

```text
Needs Review
```

Do not automatically mark someone as absent unless the product explicitly records attendance.

---

# 46. Shift Notes

Allow:

```text
Notes
```

Example:

```text
Suresh arrived late because of another duty.
```

Keep notes factual and minimal.

---

# 47. Duty Templates

Useful future feature:

```text
Festival Duty Template

Morning Pooja
Collection
Prasadam
Evening Aarti
Cleaning
```

Copy into the next Festival.

Do not copy completed statuses.

---

# 48. Previous Festival Copy

Future workflow:

```text
2026 Duty Schedule
        ↓
Copy to 2027
        ↓
Review volunteers
        ↓
Publish
```

Do not automatically carry over user assignments because committee membership may change.

---

# 49. RBAC

Suggested permissions:

```text
duties.view
duties.create
duties.update
duties.assign
duties.complete
duties.cancel
duties.delete
duties.reports
```

Use the existing dynamic RBAC architecture.

---

# 50. Normal User Permissions

Typical normal volunteer:

```text
duties.view
duties.complete
```

Possibly:

```text
duties.update
```

for their own assigned shift if the permission model supports it.

---

# 51. Admin Permissions

Admin/authorized role:

```text
Create duties
Create shifts
Assign volunteers
Change assignments
Cancel shifts
View all schedules
View duty reports
```

Enforce permissions server-side through Firestore Rules/validated application logic.

---

# 52. Security

Every operation must validate:

```text
Authenticated User
+
Active Pandal Membership
+
Correct Festival
+
Required Permission
```

Never trust client-provided:

```text
pandalId
festivalId
assignedUserIds
```

without authorization checks.

---

# 53. Cross-Pandal Isolation

A user belonging to:

```text
Pandal A
```

must not be able to read or modify:

```text
Pandal B duties
```

Use the existing Pandal membership architecture.

---

# 54. Cross-Festival Isolation

A:

```text
2026 shift
```

must not appear in:

```text
2027 active schedule
```

unless intentionally copied.

---

# 55. Real-Time Collaboration

When Admin assigns:

```text
Ravi → Collection
```

Ravi should see the assignment without manually refreshing when connected.

Use a scoped listener:

```text
Current Pandal
+
Current Festival
+
Current User
```

Avoid global schedule listeners.

---

# 56. Offline Behavior

For poor connectivity:

```text
View previously synced duties
View assigned shifts
```

Where compatible with Firestore offline support:

```text
Update shift status
Queue synchronization
```

Show pending sync where appropriate.

---

# 57. Offline Assignment Caution

Admin should preferably perform major schedule changes while connected.

If an assignment change is pending:

```text
Sync Pending
```

must be visible.

Do not claim that a volunteer has definitely been notified while the assignment has not reached the server.

---

# 58. Performance

Do not load every historical Festival duty.

Default:

```text
Current Festival
+
Upcoming/Today
```

Historical schedule should load only when requested.

---

# 59. Firestore Optimization

Use:

- Festival-scoped queries
- User-scoped queries for My Duties
- Date filters
- Limits
- Existing indexes
- Minimal real-time listeners

Avoid one listener per volunteer.

---

# 60. Audit Trail

Record:

```text
Duty Created
Duty Updated
Shift Created
Shift Assigned
Shift Reassigned
Shift Started
Shift Completed
Shift Cancelled
```

Include:

```text
performedBy
performedAt
pandalId
festivalId
dutyId
shiftId
```

---

# 61. Financial Boundary

This feature must never independently modify:

```text
God Fund
Personal Money
Permanent Fund
Expense totals
Collection totals
```

Financial effects happen through:

```text
Collection
Collection Session
Expense
Reimbursement
Handover
```

The duty system only references these records.

---

# 62. Collection Session Relationship

Example:

```text
Duty:
Morning Collection

Shift:
8 AM – 11 AM

Collection Session:
Morning Session #001
```

The relationship should be:

```text
Duty/Shift
      ↓
Collection Session
      ↓
Collections
```

not:

```text
Duty
      ↓
Direct financial balance mutation
```

---

# 63. Admin Dashboard Integration

Show:

```text
Today's Duties

8 shifts

6 assigned
1 unassigned
1 understaffed
```

Also:

```text
Upcoming
Next duty:
Evening Aarti
6 PM
4 volunteers
```

---

# 64. Volunteer Dashboard Integration

Show:

```text
My Next Duty

Collection
8 AM – 11 AM
Gandhi Street

2 volunteers
```

Then:

```text
Upcoming
Evening Aarti
6 PM
```

---

# 65. UX Guidelines

The screen should prioritize:

```text
WHAT
WHEN
WHERE
WHO
STATUS
```

Example card:

```text
┌────────────────────────────┐
│ Morning Collection         │
│ 8:00 AM – 11:00 AM         │
│ Gandhi Street              │
│                            │
│ 👤 Ravi  👤 Suresh         │
│                            │
│ ● Scheduled                │
└────────────────────────────┘
```

Avoid oversized decorative cards.

Use the same visual language as the Expense Tracker application.

---

# 66. Mobile-First UX

A volunteer should be able to:

```text
Open Pandal
   ↓
My Duties
   ↓
See next shift
   ↓
Start
   ↓
Complete
```

with minimal navigation.

---

# 67. Empty States

Example:

```text
No duties assigned.

You don't have any Festival duties yet.
```

Admin:

```text
No shifts created.

Create the first duty schedule.
```

Provide a clear action.

---

# 68. Error States

Example:

```text
Unable to update shift.
Please check your connection.
```

If offline:

```text
Saved locally
Waiting for synchronization
```

Do not show misleading success states for unconfirmed server operations.

---

# 69. Acceptance Criteria

## Duties

- [ ] Admin can create duties.
- [ ] Duties are Festival-scoped.
- [ ] Duty categories are supported.
- [ ] Duties can be edited.
- [ ] Duties can be cancelled.
- [ ] Historical duties remain accessible.

## Shifts

- [ ] Shifts have start/end time.
- [ ] Shifts can have one or more volunteers.
- [ ] Only active Pandal members can be assigned.
- [ ] Shift status is supported.
- [ ] Shift conflicts are detected.
- [ ] Unassigned shifts are visible.
- [ ] Understaffed shifts are visible where minimum staffing is configured.

## Volunteer Experience

- [ ] User can view My Duties.
- [ ] User can see next duty.
- [ ] User can start a shift if permitted.
- [ ] User can complete an assigned shift.
- [ ] User receives assignment/reminder notifications when enabled.

## Integration

- [ ] Collection duties can reference Collection Sessions.
- [ ] Duties can reference Tasks.
- [ ] Duties can reference Checklist items.
- [ ] Duties can reference Events.
- [ ] Financial records are not duplicated.

## Security

- [ ] RBAC is enforced.
- [ ] Cross-Pandal access is blocked.
- [ ] Cross-Festival access is blocked.
- [ ] Only authorized users can assign/reassign shifts.
- [ ] Important changes are audited.

## Offline/Performance

- [ ] Previously synced schedules can be viewed offline.
- [ ] Pending sync state is visible.
- [ ] Current Festival is the default scope.
- [ ] Historical data is not unnecessarily loaded.
- [ ] Real-time listeners are scoped.

---

# 70. Recommended Implementation Order

```text
1. Duty model
2. Shift model
3. Duty/shift list
4. Create duty
5. Create shift
6. Volunteer assignment
7. Conflict detection
8. My Duties
9. Start/complete workflow
10. Today's schedule
11. Unassigned/understaffed indicators
12. Task/Event/Checklist references
13. Collection Session integration
14. Notifications
15. Offline handling
16. Audit logging
17. Duty templates
18. Previous-Festival copy
```

---

# 71. Implementation Guidance for Cursor/Claude

Before modifying code:

1. Inspect existing Pandal/Festival architecture.
2. Inspect existing RBAC and user membership models.
3. Inspect Feature 10 Tasks, Events and Notifications.
4. Inspect Feature 13 Checklist.
5. Inspect Feature 08 Collection Sessions.
6. Inspect existing navigation and dashboard components.
7. Reuse existing notification infrastructure.
8. Reuse existing UI components from the Expense Tracker.
9. Do not create another user/member system.
10. Do not create another task/event system.
11. Do not create another financial ledger.
12. Use references between Duty, Task, Event, Checklist and Collection Session.
13. Add tests for assignment authorization and shift conflicts.
14. Optimize queries for current Festival and current user.
15. Do not implement GPS/background location.
16. Do not rewrite unrelated modules.

---

# 72. Critical Test Scenarios

## Scenario A — Create Shift

```text
Duty:
Morning Collection

8 AM – 11 AM

Ravi
Suresh
```

Expected:

```text
Shift created
Both volunteers see it.
```

## Scenario B — Assignment

Admin assigns:

```text
Ravi → Collection
```

Expected:

```text
Ravi sees the duty.
```

## Scenario C — Conflict

Ravi already has:

```text
8 AM – 11 AM
```

Admin assigns:

```text
10 AM – 12 PM
```

Expected:

```text
Conflict warning shown.
```

## Scenario D — Completion

Ravi completes:

```text
Collection Shift
```

Expected:

```text
Status = COMPLETED
completedBy = Ravi
completedAt = recorded
```

## Scenario E — Unassigned

```text
Visarjan
4 PM – 10 PM
0 volunteers
```

Expected:

```text
UNASSIGNED warning.
```

## Scenario F — Understaffed

```text
Minimum:
3

Assigned:
2
```

Expected:

```text
UNDERSTAFFED
```

## Scenario G — Financial Boundary

Completing a:

```text
Collection Shift
```

must not automatically create a financial transaction.

Only the Collection Session/Collection records affect finances.

## Scenario H — Festival Isolation

```text
2026 duties
```

must not appear in:

```text
2027 active schedule
```

unless copied.

## Scenario I — Cross-Pandal Security

User from Pandal A attempts to access:

```text
Pandal B shift
```

Expected:

```text
Permission denied.
```

---

# 73. Golden Rules

### Rule 1

> A Duty describes a responsibility; a Shift describes when that responsibility is performed.

### Rule 2

> Only active Pandal members can be assigned.

### Rule 3

> Always warn about overlapping shifts.

### Rule 4

> Do not require GPS or background location.

### Rule 5

> Duties do not create financial transactions.

### Rule 6

> Collection duties should reference Collection Sessions.

### Rule 7

> Tasks, Events and Checklists remain separate modules.

### Rule 8

> Use notifications sparingly.

### Rule 9

> Preserve historical schedules.

### Rule 10

> Do not automatically carry volunteer assignments into a new Festival.

### Rule 11

> Keep the feature lightweight and mobile-first.

### Rule 12

> Every important assignment/change should be auditable.

---

# 74. Final Mental Model

```text
                         FESTIVAL
                            |
                         DUTIES
                            |
        +-------------------+-------------------+
        |                   |                   |
     COLLECTION           POOJA              PRASADAM
        |                   |                   |
     8–11 AM              6–8 AM             12–2 PM
        |                   |                   |
   Ravi + Suresh        Ravi + Kiran       Suresh + Mahesh
        |                   |                   |
        +-------------------+-------------------+
                            |
                      VOLUNTEER SCHEDULE
                            |
                     MY NEXT DUTY
```

The system should always make it possible to answer:

> **Who is responsible for each Festival activity, when and where they need to be there, whether the duty is staffed, whether anyone is double-booked, and what operational or financial record the duty is connected to?**
