# Ganesh Seva — Feature Specification 10
## Tasks, Events, Announcements & Notifications

**Document:** 10-tasks-events-announcements-and-notifications.md  
**Status:** Product / Implementation Specification  
**Stack:** Expo React Native + Firebase Auth + Firestore + Supabase Storage

---

# 1. Purpose

This feature provides a lightweight operational layer for the Ganesh Pandal.

The financial modules answer:

> Where did the money come from and where did it go?

This feature answers:

> What needs to be done, when does it need to happen, who is responsible, and what does the committee need to know?

It should cover:

```text
Tasks
Events
Announcements
Notifications
Reminders
```

The feature should remain simple enough for a small Pandal and should not become a full project-management application.

---

# 2. Core Concepts

Keep these concepts separate.

### Task

Something that needs to be completed.

```text
Buy flowers
Arrange chairs
Collect pending Chanda
Book immersion vehicle
```

### Event

Something scheduled for a particular date/time.

```text
Ganesh Idol Arrival
Pooja
Aarti
Prasadam Distribution
Visarjan
```

### Announcement

Information communicated to committee members.

```text
Tomorrow's collection starts at 8 AM.
```

### Notification

A delivery mechanism for an important event/action.

```text
You were assigned:
Buy flowers
```

---

# 3. Task Data Model

Conceptually:

```text
pandals/{pandalId}/festivals/{festivalId}/tasks/{taskId}
```

Suggested fields:

```text
taskId
pandalId
festivalId
title
description
category
status
priority
assignedTo
createdBy
dueDate
completedAt
completedBy
createdAt
updatedAt
```

Adapt to existing naming conventions.

---

# 4. Task Status

Recommended:

```text
TODO
IN_PROGRESS
COMPLETED
CANCELLED
```

Lifecycle:

```text
TODO
 ↓
IN_PROGRESS
 ↓
COMPLETED
```

A task can also be cancelled by an authorized user.

---

# 5. Task Priority

Recommended:

```text
LOW
MEDIUM
HIGH
URGENT
```

Avoid excessive priority levels.

---

# 6. Task Categories

Suggested:

```text
Collection
Finance
Decoration
Pooja
Prasadam
Logistics
Cleaning
Electrical
Sound
Immersion
General
```

Categories should be optional.

---

# 7. Creating a Task

Example:

```text
Add Task

Title:
Buy flowers

Due:
28 Aug

Priority:
High

Assign To:
Ravi

Notes:
Buy enough for morning pooja

[ Create Task ]
```

Keep the initial form short.

---

# 8. Task Assignment

A task can be assigned to:

```text
One user
```

or optionally:

```text
Multiple users
```

For the MVP, single-user assignment is preferable unless the existing architecture already supports multi-assignment cleanly.

---

# 9. Task Assignee

The assignee must be an active member of the current Pandal.

Do not allow assigning a task to:

```text
Unknown user
Inactive member
Member of another Pandal
```

Validate membership using the existing RBAC/Pandal membership architecture.

---

# 10. Task Due Date

Tasks can optionally have:

```text
Due Date
Due Time
```

Example:

```text
28 Aug 2026
6:00 PM
```

If only a date matters, time should remain optional.

---

# 11. Overdue Tasks

If:

```text
Due date < Current date
```

and:

```text
Status != COMPLETED
```

show:

```text
OVERDUE
```

Do not automatically change the task status to cancelled.

---

# 12. Task Completion

When a task is completed:

```text
Status:
COMPLETED
```

Record:

```text
completedBy
completedAt
```

Example:

```text
Buy flowers

✓ Completed

Completed by:
Ravi

28 Aug, 5:45 PM
```

---

# 13. Task Notes

Allow optional notes.

Example:

```text
Bought flowers from usual vendor.
```

Do not use notes to store financial values that belong in Expenses/Contributions.

---

# 14. Task Attachments

Optional future/POC capability:

```text
Photo
Receipt
Document
```

If implemented, use the existing Document/Supabase Storage service.

Do not create a separate upload system.

---

# 15. Task Financial Linking

Some tasks may be related to a financial record.

Example:

```text
Task:
Pay decoration vendor

Linked Expense:
EXP-123
```

or:

```text
Task:
Collect pending ₹5,000
```

The task itself must not create a financial transaction automatically unless explicitly designed to do so.

---

# 16. Task Dashboard

Recommended:

```text
Tasks

Today
3

Overdue
2

In Progress
4

Completed
12
```

Then:

```text
My Tasks
```

and:

```text
All Tasks
```

depending on permissions.

---

# 17. My Tasks

A volunteer should easily see:

```text
My Tasks

🔴 Overdue
Buy flowers

🟠 Due Today
Collect pending Chanda

🟢 Completed
Arrange chairs
```

This should be the primary task view for normal users.

---

# 18. Admin Task View

Admin can see:

```text
All Tasks

Ravi
3 tasks

Suresh
2 tasks

Kiran
5 tasks
```

with filters by:

```text
User
Status
Priority
Due Date
Category
```

---

# 19. Task Permissions

Suggested:

```text
tasks.view
tasks.create
tasks.update
tasks.assign
tasks.complete
tasks.cancel
tasks.delete
```

Avoid granting delete permission broadly.

Prefer cancellation/archive for historical tasks.

Use the existing dynamic RBAC system.

---

# 20. Event Concept

Events represent scheduled Festival activities.

Examples:

```text
Ganesh Idol Arrival
Ganesh Sthapana
Morning Pooja
Evening Aarti
Prasadam
Cultural Program
Visarjan
```

---

# 21. Event Data Model

Conceptually:

```text
pandals/{pandalId}/festivals/{festivalId}/events/{eventId}
```

Suggested:

```text
eventId
pandalId
festivalId
title
description
startAt
endAt
location
createdBy
createdAt
updatedAt
status
```

---

# 22. Event Status

Recommended:

```text
SCHEDULED
ONGOING
COMPLETED
CANCELLED
```

Status can be derived from time in some views, but explicit status is useful for cancellation/completion.

---

# 23. Event Creation

Example:

```text
Add Event

Event:
Evening Aarti

Date:
30 Aug

Start:
7:00 PM

End:
8:00 PM

Location:
Pandal

[ Save Event ]
```

---

# 24. Event Location

Optional:

```text
Pandal
Community Hall
Main Street
Temple
Other
```

Allow custom text.

---

# 25. Event Calendar

Provide a simple:

```text
Festival Calendar
```

with:

```text
Today
Tomorrow
Upcoming
Past
```

A full complex calendar library is not necessary for the MVP if a simple chronological list works better.

---

# 26. Event Detail

Example:

```text
Evening Aarti

30 Aug
7:00 PM – 8:00 PM

Location:
Pandal

Notes:
All committee members requested to attend.
```

Actions:

```text
Edit
Cancel
Mark Complete
```

based on permissions.

---

# 27. Event Reminders

Optional reminders:

```text
1 day before
1 hour before
30 minutes before
```

Do not create reminders for every event by default.

Allow the creator to choose.

---

# 28. Event Notifications

When an important event is approaching:

```text
Evening Aarti starts in 1 hour.
```

Notifications should be sent only when appropriate.

Avoid notification spam.

---

# 29. Announcement Concept

Announcements are committee-wide messages.

Examples:

```text
Tomorrow collection starts at 8 AM.

Please submit today's cash collection to the Treasurer.

Visarjan arrangements are finalized.
```

---

# 30. Announcement Data Model

Conceptually:

```text
pandals/{pandalId}/festivals/{festivalId}/announcements/{announcementId}
```

Suggested:

```text
announcementId
pandalId
festivalId
title
message
priority
createdBy
createdAt
expiresAt
status
```

---

# 31. Announcement Priority

Recommended:

```text
NORMAL
IMPORTANT
URGENT
```

Use urgent sparingly.

---

# 32. Announcement Expiry

Announcements can optionally have:

```text
expiresAt
```

Example:

```text
Today's collection announcement
Expires:
25 Aug 11:59 PM
```

Expired announcements should move out of the active announcement list.

Keep historical records if required.

---

# 33. Announcement Creation

Admin/authorized member:

```text
New Announcement

Title:
Collection Timing

Message:
Tomorrow collection starts at 8 AM.

Priority:
Important

Expires:
Tomorrow

[ Publish ]
```

---

# 34. Announcement Audience

MVP:

```text
All active Pandal members
```

Future:

```text
Specific role
Specific users
Collectors
Treasurers
Admins
```

Do not make audience targeting complex initially.

---

# 35. Announcement Permissions

Suggested:

```text
announcements.view
announcements.create
announcements.update
announcements.delete
```

Normal users should generally only have:

```text
announcements.view
```

---

# 36. Notification Concept

Notifications can originate from:

```text
Task Assignment
Task Due
Task Overdue
Event Reminder
Announcement
Handover Request
Reconciliation Issue
Admin Invitation
Role Assignment
```

Do not build independent notification logic in every module.

Use one centralized notification service.

---

# 37. Notification Data Model

Conceptually:

```text
users/{userId}/notifications/{notificationId}
```

or an equivalent user-scoped collection.

Suggested:

```text
notificationId
userId
pandalId
festivalId
type
title
message
entityType
entityId
isRead
createdAt
expiresAt
```

---

# 38. Notification Types

Recommended:

```text
TASK_ASSIGNED
TASK_DUE
TASK_OVERDUE

EVENT_REMINDER

ANNOUNCEMENT

HANDOVER_REQUEST
RECONCILIATION_VARIANCE

INVITATION
ROLE_CHANGED
```

---

# 39. Notification Center

Top-level app UI can have:

```text
🔔
```

with an unread badge.

Example:

```text
Notifications

● You were assigned "Buy flowers"
  5 min ago

● Evening Aarti starts in 1 hour
  20 min ago

○ New committee announcement
  2 hours ago
```

---

# 40. Read/Unread

Users should be able to:

```text
Mark as Read
Mark All as Read
```

Unread count should be efficient.

Avoid reading every notification document every time the app opens.

---

# 41. Notification Deep Linking

When a notification is tapped:

```text
Task Notification
→ Task Detail

Event Reminder
→ Event Detail

Announcement
→ Announcement Detail

Handover Request
→ Handover Screen
```

Use a structured:

```text
entityType
entityId
```

rather than hard-coded navigation strings.

---

# 42. Push Notifications

For the Expo app, push notifications can be added using Expo-compatible notification infrastructure.

However, do not make push notifications a hard dependency for the entire feature.

The in-app notification center should remain the source of user-visible notification history.

---

# 43. Push Token

If push notifications are implemented, maintain a user's device token securely.

A user may have:

```text
Phone
+
Tablet
```

so support multiple active device tokens where practical.

Remove invalid/expired tokens when notification delivery indicates they are no longer valid.

---

# 44. Notification Preferences

Allow users to control non-critical notifications.

Example:

```text
Notification Settings

Task Assignments     ON
Task Reminders       ON
Event Reminders      ON
Announcements        ON
```

Critical security/account notifications should not necessarily be optional.

---

# 45. Avoid Notification Spam

Do not send:

```text
Every collection
Every expense
Every small database update
```

as push notifications.

For example, if 20 volunteers are entering Chanda:

```text
Do NOT notify all members for every ₹500 collection.
```

Use summaries where useful.

---

# 46. Admin Announcement Broadcast

Admin can send:

```text
Important Announcement
```

to all active Pandal members.

Example:

```text
Visarjan Plan

Visarjan vehicle leaves at 4 PM.
Everyone meet at the Pandal by 3:30 PM.
```

---

# 47. Announcement Read Tracking

For important announcements, optionally track:

```text
Read by:
Ravi
Suresh
Kiran
```

This is useful for critical committee communications.

Do not implement mandatory read receipts for every announcement in the MVP.

---

# 48. Task Reminders

For a task:

```text
Buy flowers
Due:
Tomorrow 6 PM
```

send:

```text
Reminder:
"Buy flowers" is due tomorrow.
```

For overdue:

```text
Task overdue:
"Buy flowers"
```

Do not send repeated notifications every few minutes.

---

# 49. Event Reminder Rules

Recommended:

```text
24 hours before
1 hour before
```

Allow the user/event creator to choose.

Avoid defaulting to multiple reminders for every event.

---

# 50. Recurring Events

Future capability:

```text
Daily Aarti
```

For MVP, avoid complex recurring-event logic unless the Pandal actually needs it.

A simple repeated-event creation flow is sufficient.

---

# 51. Festival-Specific Scope

Tasks and events should belong to the current Festival.

Example:

```text
2026
Buy flowers
```

should not appear in:

```text
2027
```

unless explicitly copied forward.

Pandal-level permanent data should remain separate.

---

# 52. Copy Tasks to Next Festival

Useful future feature:

```text
2026 Tasks
    ↓
Copy Template
    ↓
2027 Tasks
```

Example:

```text
Book Sound System
Arrange Chairs
Book Immersion Vehicle
```

Do not automatically copy completed historical tasks.

---

# 53. Event Templates

Similarly:

```text
Festival Event Template

Morning Pooja
Evening Aarti
Prasadam
Visarjan
```

can be copied to the next Festival.

This can be implemented later.

---

# 54. Task Categories and Financial Modules

Tasks can link to financial modules but should not replace them.

Example:

```text
Task:
Collect pending ₹2,000

Related:
Collection/Household record
```

Another:

```text
Task:
Buy decoration material

Related:
Expense after purchase
```

The task is operational.

The Expense remains financial truth.

---

# 55. Event and Expense Relationship

An event may optionally have related expenses.

Example:

```text
Event:
Visarjan

Related Expenses:
Vehicle ₹8,000
Flowers ₹2,000
Prasadam ₹5,000
```

Use references, not duplicate financial records.

---

# 56. Admin Dashboard Integration

Show:

```text
Today's Operations

Tasks Due:
5

Overdue:
2

Upcoming Events:
3

Unread Announcements:
1

Unread Notifications:
4
```

This gives Admin a quick operational overview.

---

# 57. Normal User Dashboard

Show:

```text
My Tasks
2 Due Today

Upcoming
Evening Aarti
7:00 PM

Announcements
1 New

Notifications
3
```

Do not overwhelm normal users with Admin financial information unless they have permission.

---

# 58. Offline Behavior

Tasks and announcements can use Firestore offline capabilities where appropriate.

For notification delivery:

```text
Push notification
```

requires network/device services.

The in-app notification record should synchronize when connectivity returns.

Do not mark an action as server-complete if the write is only locally pending.

---

# 59. Real-Time Collaboration

Useful real-time updates:

```text
Task assigned
Task completed
New announcement
Event updated
```

Avoid listening to every historical notification forever.

Use:

```text
active Festival
+
relevant user
```

scoping.

---

# 60. Security

All records must enforce:

```text
Authenticated User
+
Active Pandal Membership
+
Correct Festival
+
Required Permission
```

Users must never be able to manipulate:

```text
pandalId
festivalId
assignedTo
createdBy
```

to gain access or assign work outside their Pandal.

---

# 61. RBAC

Suggested permissions:

```text
tasks.view
tasks.create
tasks.update
tasks.assign
tasks.complete
tasks.cancel

events.view
events.create
events.update
events.cancel
events.complete

announcements.view
announcements.create
announcements.update
announcements.delete

notifications.view
notifications.manage
```

Use the existing dynamic role/permission architecture.

---

# 62. Audit Trail

Record important operations:

```text
Task Created
Task Assigned
Task Reassigned
Task Completed
Task Cancelled

Event Created
Event Updated
Event Cancelled
Event Completed

Announcement Published
Announcement Updated
Announcement Archived
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

# 63. Notification Audit

For important notifications, retain:

```text
Created
Delivered where supported
Read
```

Do not assume that:

```text
created
```

means:

```text
push delivered
```

These are different states.

---

# 64. Performance

Do not load:

```text
All Tasks
+
All Events
+
All Announcements
+
All Notifications
```

at application startup.

Prefer:

```text
Today's tasks
Upcoming events
Active announcements
Unread notification count
```

and lazy-load history.

---

# 65. Firestore Read Optimization

Use:

- User-scoped notification queries
- Festival-scoped task queries
- Festival-scoped event queries
- Active announcement queries
- Limits
- Pagination where needed
- Appropriate indexes

Avoid unnecessary real-time listeners.

This is especially important because the application is intended to remain inexpensive for a small Pandal.

---

# 66. Notification Cost Control

Do not implement a notification for every Firestore write.

Good:

```text
Task assignment
Event reminder
Important announcement
Handover request
```

Bad:

```text
Every collection entered
Every expense entered
Every dashboard refresh
```

---

# 67. Acceptance Criteria

## Tasks

- [ ] User can create a task.
- [ ] User can assign a task.
- [ ] Only active Pandal members can be assigned.
- [ ] Task has status.
- [ ] Task has optional priority.
- [ ] Task can have a due date/time.
- [ ] Overdue tasks are visible.
- [ ] Task completion records who completed it.
- [ ] Authorized users can cancel tasks.
- [ ] Tasks are Festival-scoped.
- [ ] Task history is retained.

## Events

- [ ] Authorized users can create events.
- [ ] Events have date/time.
- [ ] Location is supported.
- [ ] Events are Festival-scoped.
- [ ] Events can be cancelled/completed.
- [ ] Upcoming events are visible.
- [ ] Event reminders are supported where implemented.

## Announcements

- [ ] Authorized users can publish announcements.
- [ ] All active Pandal members can view them.
- [ ] Priority is supported.
- [ ] Expiry is supported.
- [ ] Historical announcements can be retained.
- [ ] Unauthorized users cannot publish.

## Notifications

- [ ] Notification center exists.
- [ ] Unread count is supported.
- [ ] Notifications can be marked read.
- [ ] Notifications deep-link to relevant records.
- [ ] Task/event/announcement notifications work.
- [ ] Push notifications do not become mandatory for core functionality.
- [ ] Notification spam is avoided.

## Security

- [ ] RBAC is enforced.
- [ ] Cross-Pandal access is blocked.
- [ ] Cross-Festival access is blocked.
- [ ] Users cannot assign tasks outside their Pandal.
- [ ] Important actions are audited.

---

# 68. Recommended Implementation Order

```text
1. Task model
2. Task list/detail
3. Task creation
4. Task assignment
5. Task completion
6. Overdue handling
7. Event model
8. Event list/detail
9. Event creation/editing
10. Announcement model
11. Announcement list/detail
12. Announcement publishing
13. In-app notification model
14. Notification center
15. Deep linking
16. Push notification support
17. Notification preferences
18. Admin dashboard integration
19. Audit events
20. Performance optimization
```

---

# 69. Implementation Guidance for Cursor/Claude

Before modifying code:

1. Inspect the existing Pandal/Festival architecture.
2. Inspect existing RBAC permissions.
3. Inspect current user/member models.
4. Inspect existing notification or invitation code.
5. Inspect Firestore Security Rules.
6. Inspect existing Expo navigation/deep-linking.
7. Inspect existing UI components from the Expense Tracker.
8. Reuse existing date/time utilities.
9. Reuse existing Firebase services.
10. Reuse existing Supabase Storage service if attachments are implemented.
11. Avoid adding a heavyweight project-management library.
12. Avoid adding notification listeners everywhere.
13. Keep all queries Pandal/Festival/user scoped.
14. Add tests for authorization and task assignment.
15. Do not rewrite unrelated financial modules.

---

# 70. Critical Test Scenarios

### Scenario A — Task Assignment

```text
Admin:
Assign "Buy flowers"
To:
Ravi
```

Expected:

```text
Ravi sees task
Ravi receives notification if enabled
```

---

### Scenario B — Unauthorized Assignment

```text
User:
Assign task to member of another Pandal
```

Expected:

```text
Rejected
```

---

### Scenario C — Task Completion

```text
Ravi completes task
```

Expected:

```text
Status:
COMPLETED

completedBy:
Ravi

completedAt:
recorded
```

---

### Scenario D — Overdue Task

```text
Due:
Yesterday

Status:
TODO
```

Expected:

```text
OVERDUE
```

---

### Scenario E — Event Reminder

```text
Event:
Evening Aarti
7:00 PM
```

Expected:

```text
Reminder at configured time
```

No duplicate reminders.

---

### Scenario F — Announcement

```text
Admin publishes:
Visarjan at 4 PM
```

Expected:

```text
Active Pandal members can see it.
```

---

### Scenario G — Notification Deep Link

```text
Tap:
"You were assigned Buy Flowers"
```

Expected:

```text
Task Detail opens.
```

---

### Scenario H — Festival Isolation

```text
2026 task:
Buy flowers
```

Expected:

```text
Not visible in 2027 active Festival tasks.
```

---

# 71. Golden Rules

### Rule 1

> Tasks are operational records, not financial transactions.

### Rule 2

> Events represent scheduled activities.

### Rule 3

> Announcements communicate information to the committee.

### Rule 4

> Notifications are delivery mechanisms and should not duplicate business records.

### Rule 5

> Do not notify every user about every financial transaction.

### Rule 6

> Only active Pandal members can receive/perform relevant Pandal actions.

### Rule 7

> Tasks and events belong to a Festival unless intentionally made Pandal-level.

### Rule 8

> Completing a task must never automatically create an Expense or Contribution.

### Rule 9

> An event linked to an Expense must reference the Expense rather than duplicate it.

### Rule 10

> Notification history should remain user-scoped.

### Rule 11

> Push notifications are optional infrastructure; core application functionality should work without them.

### Rule 12

> Keep this module lightweight and avoid turning Ganesh Seva into a complex project-management application.

---

# 72. Final Mental Model

```text
                         FESTIVAL
                            |
             +--------------+--------------+
             |              |              |
           TASKS          EVENTS      ANNOUNCEMENTS
             |              |              |
          Ravi            Aarti        Committee
          Suresh          Pooja        Updates
          Kiran           Visarjan
             |              |              |
             +--------------+--------------+
                            |
                     NOTIFICATIONS
                            |
                 +----------+----------+
                 |          |          |
              Task Due   Event      Announcement
                        Reminder
```

The system should always make it possible to answer:

> **What needs to be done, who is responsible, what Festival activities are scheduled, what information has been communicated, and what notifications still need the user's attention?**
