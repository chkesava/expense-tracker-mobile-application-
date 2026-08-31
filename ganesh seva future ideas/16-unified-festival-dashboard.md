# Ganesh Seva — Feature Specification 16
## Unified Festival Dashboard

**Document:** `16-unified-festival-dashboard.md`  
**Status:** Product / Implementation Specification  
**Stack:** Expo React Native + Firebase Auth + Firestore + Supabase Storage

---

# 1. Purpose

The Unified Festival Dashboard is the central home screen for the Ganesh Pandal module.

It should answer, at a glance:

> **How is our Festival doing right now?**

The dashboard should bring together the most important information from:

```text
Festival
Finance
God Fund vs Personal Money
Collections
Committee Contributions
In-Kind Contributions
Sponsors
Expenses
Permanent Fund
Assets / Inventory
Budget
Checklist
Volunteer Duties
Tasks
Events
Audit / Activity
Settlement
```

The dashboard is an **overview and navigation layer**.

It must not become another source of financial truth.

---

# 2. Core Principle

The dashboard should summarize existing data.

```text
Existing Modules
      ↓
Aggregates / Queries
      ↓
Unified Dashboard
```

Do not create duplicate records just to display dashboard numbers.

For example:

```text
Collections
₹75,000
```

comes from the existing Collection/financial architecture.

The dashboard must not maintain a separate:

```text
dashboardCollectionsTotal
```

unless an existing aggregate architecture already requires it.

---

# 3. Dashboard Scope

The dashboard must always be scoped to:

```text
Current Pandal
+
Selected Festival
```

Example:

```text
Pandal:
Sri Ganesh Seva

Festival:
Ganesh Chaturthi 2026
```

Do not mix:

```text
2025
+
2026
+
Permanent Fund
```

into one Festival financial total.

Permanent Fund can be shown separately because it is a Pandal-level fund.

---

# 4. Recommended Dashboard Structure

Top-to-bottom:

```text
Festival Header
        ↓
Financial Summary
        ↓
God Fund / Personal Money
        ↓
Collection Progress
        ↓
Budget vs Actual
        ↓
Festival Readiness
        ↓
Today's Duties
        ↓
Pending Actions
        ↓
Assets / Inventory Highlights
        ↓
Recent Activity
        ↓
Settlement / Closing Status
```

The screen should prioritize actionable information.

---

# 5. Festival Header

Example:

```text
Ganesh Chaturthi 2026

Sri Ganesh Seva Pandal

Day 3 of 10

[ Festival Settings ]
```

Show:

```text
Festival Name
Festival Status
Current Day / Dates
```

Do not make the header excessively large.

---

# 6. Festival Status

Recommended:

```text
PLANNING
ACTIVE
COMPLETED
SETTLED
ARCHIVED
```

Example:

```text
● ACTIVE
```

Status should come from the Festival model.

Do not infer Festival status independently in the dashboard.

---

# 7. Quick Financial Summary

Primary financial card:

```text
Festival Funds

Available:
₹72,500

Collections:
₹80,000

Expenses:
₹7,500
```

However, use the existing financial model to determine what "Available" means.

Do not simply calculate:

```text
Collections - Expenses
```

if the system also has:

```text
Opening Fund
Committee Contributions
Sponsors
Transfers
Personal Money
Reimbursements
```

The displayed balance must use the application's authoritative financial calculation.

---

# 8. God Fund vs Personal Money

This is a first-class concept and should be highly visible.

Example:

```text
God Fund
₹68,000

Personal Money Used
₹4,500

Total Festival Cost
₹72,500
```

Another useful view:

```text
Funding Breakdown

God Fund
₹68,000
94%

Personal Money
₹4,500
6%
```

Do not hide Personal Money inside the total.

---

# 9. Personal Contribution Recovery

If the existing architecture tracks personal money that is expected to be reimbursed:

```text
Personal Money Used:
₹4,500

Reimbursed:
₹2,000

Pending:
₹2,500
```

This should link to the existing reimbursement model.

Do not create a separate reimbursement balance.

---

# 10. Opening / Existing Funds

Show existing Festival funding separately:

```text
Opening Funds
₹20,000
```

If the money originated from the Permanent Fund:

```text
Permanent Fund Transfer
₹20,000
```

Do not classify it as Chanda.

---

# 11. Permanent Fund

The Pandal's universal carry-forward fund should be visible separately.

Example:

```text
Permanent Pandal Fund

₹20,000
```

This amount is:

```text
Pandal-level
Year-independent
Carry-forward
```

It should not be included in the active Festival's Chanda total.

---

# 12. Collection Progress

Show:

```text
Chanda Collection

₹75,000 / ₹80,000

93.75%
```

Also:

```text
Households
120 / 150 visited

80%
```

This integrates with Feature 11.

---

# 13. Collection Breakdown

Useful compact summary:

```text
Cash
₹40,000

UPI
₹30,000

Bank
₹5,000
```

Only show payment-method totals if the underlying financial records support them reliably.

---

# 14. Collection Status

Show:

```text
120 Visited
100 Collected
8 Promised
12 Pending
```

This is more actionable than showing only the money total.

---

# 15. Committee Contribution

Show:

```text
Committee Contributions

₹17,000 / ₹20,000

85%
```

If contributions have a configured target.

Do not count unpaid promised contributions as received money.

---

# 16. In-Kind Contributions

Show separately:

```text
In-Kind Contributions

12 received

Estimated Value:
₹18,500
```

Examples:

```text
Idol
Laddu
Flowers
Decoration
Food
```

Do not add estimated in-kind value to cash balance.

---

# 17. Sponsor Summary

Example:

```text
Sponsors

Confirmed:
₹12,000

Received:
₹8,000

Pending:
₹4,000
```

Use the existing Sponsor model.

---

# 18. Expense Summary

Show:

```text
Expenses

Actual:
₹72,500

Transactions:
28
```

Optionally:

```text
Largest Category:
Decoration ₹18,500
```

Do not load every expense just to calculate this on every dashboard refresh.

Use existing aggregates where available.

---

# 19. Recent Expenses

Show only a small list:

```text
Recent Expenses

Decoration
₹5,000
Ravi · 10 min ago

Prasadam
₹2,500
Suresh · 1 hr ago

Sound
₹8,000
Kiran · Today
```

Use:

```text
View All
```

for the complete Expense screen.

---

# 20. Budget vs Actual

Compact dashboard card:

```text
Budget

Planned Expenses:
₹1,00,000

Actual:
₹72,500

72.5% Used
```

If categories are over budget:

```text
⚠ 2 categories over budget
```

Link to Feature 12.

---

# 21. Receipt / Income Budget

Show:

```text
Expected Receipts:
₹1,20,000

Actual:
₹1,15,000

96%
```

This should distinguish:

```text
Received
Promised
Expected
```

correctly.

---

# 22. Budget Alerts

Examples:

```text
⚠ Decoration over budget
⚠ Chanda ₹5,000 below target
```

Do not show alerts when everything is healthy.

Avoid notification overload.

---

# 23. Festival Readiness

Feature 13 integration:

```text
Festival Readiness

82%

22 / 27 completed

⚠ 2 Critical Pending
3 Overdue
```

Tapping opens the Checklist.

---

# 24. Critical Preparation

Always surface important incomplete items:

```text
Critical Pending

⚠ Electrical safety check
⚠ Immersion vehicle
```

Do not bury critical operational items below financial cards.

---

# 25. Today's Duties

Feature 14 integration:

```text
Today's Duties

8:00 AM
Collection
Ravi + Suresh

6:00 PM
Evening Aarti
4 volunteers

9:00 PM
Cleaning
2 volunteers
```

Show:

```text
My Next Duty
```

prominently for normal users.

---

# 26. Admin vs Normal User Dashboard

The dashboard should adapt based on permissions.

### Admin

Can see:

```text
Financial Summary
Budget
Collections
Members
RBAC Alerts
Checklist
Volunteer Schedule
Activity
Settlement
```

### Normal User

Should see:

```text
My Duties
Collection Work
Relevant Financial Summary
Checklist Items Assigned to Me
Announcements
Recent Activity
```

Do not expose Admin-only controls.

---

# 27. Permission-Aware Widgets

Each dashboard section should check permissions.

Example:

```text
budget.view
```

controls Budget widget.

```text
collections.view
```

controls Collection widget.

```text
audit.view
```

controls Activity widget.

```text
duties.view
```

controls Duty widget.

Do not assume:

```text
isAdmin === true
```

is the only authorization mechanism.

Use the existing dynamic RBAC architecture.

---

# 28. Admin Alerts

Admin should see:

```text
Needs Attention

2 Critical Checklist Items
3 Overdue Tasks
1 Unassigned Duty
2 Budget Overruns
₹2,500 Reimbursement Pending
```

This becomes the operational command center.

---

# 29. Pending Actions

Create a single compact section:

```text
Needs Attention

⚠ 3 collection follow-ups
⚠ 2 overdue checklist items
⚠ 1 unassigned shift
⚠ ₹2,500 reimbursement pending
```

Each item should deep-link to the relevant module.

Do not duplicate the actual data.

---

# 30. Upcoming Events

Show:

```text
Upcoming

Tomorrow
Morning Pooja
6:00 AM

Today
Evening Aarti
6:00 PM

Visarjan
30 Aug
```

Use Feature 10 Events.

---

# 31. Upcoming Tasks

Show only actionable tasks:

```text
Due Today
Arrange flowers

Due Tomorrow
Confirm immersion vehicle
```

Use Feature 10 Tasks.

---

# 32. Asset / Inventory Summary

Feature 1 integration:

```text
Pandal Assets

42 Items

Available:
38

Needs Attention:
4
```

Example:

```text
2 chairs damaged
1 speaker needs repair
1 extension board missing
```

Do not treat assets as expenses on the dashboard.

---

# 33. Asset Reuse Insight

Useful:

```text
Existing Assets

20 Chairs
2 Speakers
4 Lights
3 Fans
```

This helps the committee understand what is already available.

---

# 34. Collection Session Summary

Feature 08 integration:

```text
Today's Collection

Sessions:
3

Collected:
₹8,500

Pending Handover:
₹8,500
```

If already reconciled:

```text
✓ ₹8,500 Reconciled
```

Use the existing Collection Session model.

---

# 35. Cash Position

For Admin/Treasurer:

```text
Cash Position

Cash:
₹18,000

UPI:
₹30,000

Bank:
₹12,000
```

Use actual financial data.

Do not display a generic "cash" number that includes UPI or bank money.

---

# 36. Reconciliation Alert

Example:

```text
⚠ Cash Reconciliation

Expected:
₹18,500

Actual:
₹18,200

Difference:
₹300
```

Link directly to the reconciliation screen.

---

# 37. Recent Activity

Feature 15 integration:

```text
Recent Activity

Ravi collected ₹500
2 min ago

Suresh added ₹2,000 expense
10 min ago

Admin assigned Kiran to Aarti
30 min ago
```

Keep this compact.

Use:

```text
View All
```

for the complete Audit/Activity screen.

---

# 38. Financial Activity Priority

Important financial activity should be easy to notice:

```text
₹20,000 Fund Transfer
₹10,000 Expense
₹5,000 Expense Correction
```

Do not hide these among harmless operational activity.

---

# 39. Settlement Status

Near Festival completion:

```text
Festival Settlement

Status:
Not Started
```

or:

```text
Settlement In Progress
```

or:

```text
✓ Settled
```

Admin should be able to open settlement from the dashboard.

---

# 40. Festival Closing Summary

After settlement:

```text
2026 Festival

Final Receipts:
₹1,20,000

Final Expenses:
₹95,000

Closing:
₹25,000

Transferred to Permanent Fund:
₹20,000

Pending:
₹5,000
```

Use the authoritative Settlement records.

Do not independently recalculate the final balance.

---

# 41. Permanent Fund Shortcut

When Festival is settled, show:

```text
Permanent Fund

Current:
₹20,000

[ View Fund ]
```

If transfer is pending:

```text
₹25,000 available for settlement
```

but do not automatically transfer it.

---

# 42. Festival Day Indicator

Example:

```text
Day 4 of 10
```

or:

```text
2 Days Until Festival
```

The indicator should be based on Festival dates.

---

# 43. Before Festival State

When the Festival is still planning:

```text
Planning

Budget:
Configured ✓

Collection Target:
Configured ✓

Checklist:
45%

Volunteer Schedule:
Not Started

Critical:
3 pending
```

---

# 44. Active Festival State

During Festival:

```text
Day 4 of 10

Funds
₹72,500

Collections
₹75,000

Expenses
₹72,500

Readiness
82%

Today's Duties
8

Needs Attention
4
```

---

# 45. Post-Festival State

After Festival:

```text
Festival Complete

Settlement:
Pending

Expenses:
₹95,000

Final Balance:
₹25,000

Permanent Fund Transfer:
Pending
```

---

# 46. Settled Festival State

```text
✓ Festival Settled

Final Balance:
₹25,000

Transferred:
₹20,000

Retained:
₹5,000

[ View Settlement ]
```

Historical dashboards should remain readable.

---

# 47. Quick Actions

Admin:

```text
+ Add Expense
+ Add Collection
+ Add Contribution
+ Add In-Kind
+ Add Sponsor
+ Add Task
+ Add Duty
```

Normal user should only see actions permitted by RBAC.

Do not place 10 large buttons on the screen.

Use:

```text
Add
```

or a compact action sheet if appropriate.

---

# 48. Quick Add Design

The quick-add menu should prioritize the most common operations:

```text
Add Expense
Add Collection
Add Contribution
```

Less common actions:

```text
Sponsor
Asset
Duty
Checklist
```

can be inside the expanded menu.

---

# 49. Dashboard Navigation

Every widget should be tappable.

Example:

```text
Collections card
      ↓
Collection module

Expense card
      ↓
Expense module

Budget card
      ↓
Budget module

Readiness card
      ↓
Checklist module

Duties card
      ↓
Duty module
```

This makes the dashboard a navigation hub.

---

# 50. Pull to Refresh

Support standard pull-to-refresh if useful.

But do not rely on refresh as the primary collaboration mechanism.

Real-time listeners should update relevant current data when connected.

---

# 51. Real-Time Updates

When another volunteer adds:

```text
₹500 Collection
```

the dashboard should update relevant summaries when connected.

Avoid manually refreshing every widget independently.

---

# 52. Firestore Listener Strategy

Do not subscribe to every collection in the application.

Prefer:

```text
Current Pandal
+
Current Festival
+
Required Dashboard Aggregates
```

Use existing aggregate documents where available.

---

# 53. Read Optimization

Dashboard is the most frequently opened screen.

Therefore:

> **Optimize this screen aggressively.**

Avoid:

```text
Load all expenses
Load all collections
Load all households
Load all audit logs
Load all tasks
Load all duties
Load all assets
```

just to calculate summaries.

Use:

```text
Aggregates
Limited queries
Scoped listeners
Cached data
Pagination for detail sections
```

---

# 54. Dashboard Aggregates

If the existing architecture supports aggregate documents, use them.

Possible aggregate:

```text
festivals/{festivalId}/summary
```

Containing safe derived values such as:

```text
collectionTotal
expenseTotal
committeeContributionTotal
sponsorReceivedTotal
inKindCount
householdsVisited
householdsCollected
```

Do not create aggregates blindly.

Use the existing financial architecture and transaction logic.

---

# 55. Financial Aggregate Integrity

If an aggregate is used for performance:

```text
Transaction
+
Aggregate Update
```

must be atomic where appropriate.

For example:

```text
Collection Created
+
Festival Collection Total +₹500
```

must not be independently updated in unsafe client code.

---

# 56. Offline Dashboard

When offline, show cached/last-synced data where available.

Example:

```text
Last synced:
10:42 AM
```

If data may be stale, indicate:

```text
Offline
Some values may be outdated.
```

Do not show stale values as guaranteed current server state.

---

# 57. Offline Financial Actions

If users create financial records offline:

```text
Pending Sync
```

should be visible somewhere appropriate.

The dashboard should not falsely imply that every number is server-confirmed.

---

# 58. Network State

A small indicator is sufficient:

```text
● Online
```

or:

```text
Offline · Sync pending
```

Do not use a large banner that permanently consumes dashboard space.

---

# 59. Loading State

Use skeleton/loading components consistent with the Expense Tracker app.

Avoid:

```text
blank white screen
```

while dashboard data loads.

---

# 60. Error Handling

If one widget fails:

```text
Budget unavailable
Retry
```

do not make the entire dashboard unusable.

Independent sections should fail gracefully where possible.

---

# 61. Empty State

New Festival:

```text
Welcome to your Festival

Start by configuring:
✓ Budget
✓ Collection Target
✓ Checklist
✓ Volunteers
```

Use contextual next actions.

---

# 62. First-Time Festival Setup

If a Festival has no configuration:

```text
Festival Setup

1. Configure Budget
2. Configure Collection
3. Add Committee Members
4. Create Checklist
5. Assign Duties
```

This should guide the Admin without forcing a wizard.

---

# 63. Dashboard Personalization

Do not build drag-and-drop dashboard customization for the POC.

Use a sensible default layout.

Future:

```text
Pin
Hide
Reorder
```

can be considered.

---

# 64. Role-Aware Prioritization

For a Collector:

```text
My Collection
Today's Duty
Collection Progress
```

should be more prominent.

For Treasurer:

```text
Financial Summary
Cash
Reconciliation
Budget
```

should be more prominent.

For Admin:

```text
Needs Attention
Finance
RBAC
Readiness
Duties
```

should be prominent.

This can be done with lightweight conditional ordering rather than separate dashboards.

---

# 65. Avoid Separate Dashboards Per Role

Do not build:

```text
AdminDashboard
TreasurerDashboard
CollectorDashboard
VolunteerDashboard
```

as completely separate screens.

Use:

```text
One Unified Dashboard
+
Permission-aware sections
+
Role-aware priority
```

This keeps maintenance simple.

---

# 66. UI Design Direction

The dashboard must match the Expense Tracker application's polished UI.

Reuse:

```text
Typography
Spacing
Cards
Buttons
Icons
Colors
Bottom navigation
Charts
Input styles
Modal patterns
```

Do not make it look like a generic AI-generated dashboard.

Avoid:

```text
Excessive gradients
Huge cards
Random colors
Overly rounded containers
Too many icons
Decorative illustrations
Unnecessary charts
```

---

# 67. Information Density

The dashboard contains lots of information.

Do not display everything at full detail.

Use:

```text
Summary
+
Small preview
+
View All
```

Example:

```text
Recent Expenses
3 items

[ View All ]
```

This keeps the mobile screen manageable.

---

# 68. Financial Visual Hierarchy

The most important numbers should be immediately visible:

```text
Available Funds
Collections
Expenses
God Fund
Personal Money
```

Secondary information:

```text
Budget
Sponsors
Assets
Tasks
```

Tertiary information:

```text
Recent activity
Historical details
```

---

# 69. Color Semantics

Reuse the Expense Tracker's existing design tokens.

Semantic states should be consistent:

```text
Success
Warning
Error
Neutral
```

Do not introduce new arbitrary colors for every category.

---

# 70. Accessibility

Ensure:

```text
Readable text
Adequate touch targets
Clear status labels
Icons with text where necessary
Accessible contrast
```

Do not rely only on color to communicate:

```text
Over Budget
Completed
Pending
Critical
```

---

# 71. Admin Control Center

For Admin, the dashboard should feel like:

```text
Festival Control Center
```

with:

```text
Financial Health
Operational Readiness
Collection Progress
Volunteer Coverage
Pending Issues
Recent Changes
```

This is the primary value of the Unified Dashboard.

---

# 72. Suggested Admin Layout

```text
Ganesh Chaturthi 2026
● ACTIVE

Available Funds
₹72,500

God Fund ₹68,000
Personal ₹4,500

────────────────────

Collections
₹75,000 / ₹80,000
93.75%

120 / 150 Houses Visited

────────────────────

Expenses
₹72,500
72.5% of Budget

⚠ 2 Over Budget

────────────────────

Festival Readiness
82%

⚠ 2 Critical
3 Overdue

────────────────────

Today's Duties
3 Active
1 Unassigned

────────────────────

Needs Attention
4 Items

────────────────────

Recent Activity
...
```

---

# 73. Normal User Layout

```text
Ganesh Chaturthi 2026

My Next Duty
Collection
8 AM – 11 AM
Gandhi Street

────────────────────

Collection Progress
₹75,000 / ₹80,000

────────────────────

My Tasks
2 Pending

────────────────────

Festival Readiness
82%

────────────────────

Recent Activity
...
```

Only permitted financial information should be shown.

---

# 74. Admin Quick Actions

Recommended:

```text
Add Expense
Add Collection
Add Contribution
```

Then:

```text
Manage
```

for:

```text
Users
Roles
Budget
Duties
Checklist
Assets
```

Do not clutter the primary screen.

---

# 75. Normal User Quick Actions

Examples:

```text
Record Collection
My Duties
My Tasks
```

based on permissions.

---

# 76. Dashboard and Notifications

Do not duplicate every notification inside the dashboard.

Instead show:

```text
Needs Attention
```

for actionable issues.

Use Feature 10 notifications for time-sensitive alerts.

---

# 77. Dashboard Search

Do not add a global search bar in the first version unless the existing application already has one.

Search belongs inside relevant modules.

---

# 78. Dashboard Date Context

Always show the current Festival context.

Example:

```text
Ganesh Chaturthi 2026
24 Aug – 2 Sep
```

This prevents users from accidentally assuming they are viewing another Festival.

---

# 79. Festival Switcher

If the Pandal has multiple Festivals:

```text
Ganesh Chaturthi 2026 ▼
```

Allow Admin/user to switch to a historical Festival where permitted.

Current Festival should remain the default.

---

# 80. Historical Festival Dashboard

Historical Festivals should show:

```text
Completed
```

and allow viewing:

```text
Final Finance
Collection
Expenses
Budget vs Actual
Settlement
Assets
Audit
```

Do not show active actions such as:

```text
Add Collection
```

unless explicitly permitted for corrections.

---

# 81. Permanent Fund Across Festivals

Example:

```text
Permanent Fund
₹20,000

2026 Opening:
₹10,000

2026 Transfer:
₹5,000

Current:
₹15,000
```

Use the actual Permanent Fund ledger.

Do not calculate it from Festival balances.

---

# 82. Settlement Warning

If Festival dates have ended but settlement is not completed:

```text
⚠ Festival ended

Settlement is still pending.
```

Provide:

```text
[ Review Settlement ]
```

for authorized users.

---

# 83. Financial Health Indicator

Optional:

```text
Financial Health

Healthy
```

or:

```text
Attention Needed
```

Use understandable criteria.

Do not create a mysterious numerical financial score.

---

# 84. Operational Health Indicator

Optional:

```text
Festival Readiness
82%
```

This is already enough.

Do not add multiple abstract scores.

---

# 85. Dashboard Metrics That Matter

Prioritize:

```text
Available Funds
God Fund
Personal Money
Collections
Collection Target
Expenses
Budget Usage
Permanent Fund
Festival Readiness
Today's Duties
Pending Actions
```

Everything else is secondary.

---

# 86. Dashboard Metrics That Should NOT Be Primary

Avoid prominently displaying:

```text
Number of app opens
Volunteer activity ranking
Total historical households across all years
Number of audit records
Number of database records
```

These do not help run the Festival.

---

# 87. Security

Dashboard data must follow the same authorization model as the underlying modules.

Do not rely on:

```text
UI hiding
```

for security.

Firestore rules and validated application logic must enforce access.

---

# 88. Cross-Pandal Isolation

A user in:

```text
Pandal A
```

must not see:

```text
Pandal B dashboard data.
```

---

# 89. Cross-Festival Isolation

Current Festival:

```text
2026
```

must not accidentally include:

```text
2025 financial records.
```

Historical data should only appear when explicitly requested.

---

# 90. Auditability

Dashboard itself does not need an audit event for:

```text
Viewing dashboard
```

But actions initiated from it must use the normal module audit systems.

Example:

```text
Dashboard → Add Expense
```

must generate the normal:

```text
Expense Created
```

audit event.

---

# 91. Performance Budget

The dashboard should feel fast on a normal Android device.

Target:

```text
Immediate cached/skeleton UI
+
Progressive data loading
```

Do not block the entire screen waiting for one slow query.

---

# 92. Recommended Widget Architecture

Create reusable dashboard widgets such as:

```text
FinancialSummaryCard
FundBreakdownCard
CollectionProgressCard
BudgetStatusCard
ReadinessCard
TodayDutiesCard
NeedsAttentionCard
RecentActivityCard
AssetSummaryCard
SettlementCard
```

Widgets should consume existing service/query data.

They should not contain business logic that duplicates the financial layer.

---

# 93. Avoid Widget Duplication

Do not build separate financial calculations inside:

```text
FinancialSummaryCard
CollectionCard
BudgetCard
SettlementCard
```

Use shared selectors/services/aggregates.

---

# 94. Testing

Every widget should have:

```text
Loading
Success
Empty
Error
Offline
Permission denied
```

states where relevant.

---

# 95. Acceptance Criteria

## Dashboard

- [ ] Current Festival is clearly identified.
- [ ] Current Pandal is clearly identified.
- [ ] Dashboard summarizes existing modules.
- [ ] No duplicate financial ledger is created.
- [ ] Financial summary is accurate.
- [ ] God Fund vs Personal Money is visible.
- [ ] Permanent Fund is shown separately.
- [ ] Collection progress is visible.
- [ ] Committee contribution progress is visible.
- [ ] In-kind contributions are separated from cash.
- [ ] Sponsor summary is available.
- [ ] Expense summary is available.
- [ ] Budget vs actual is visible.
- [ ] Festival readiness is visible.
- [ ] Today's duties are visible.
- [ ] Pending actions are visible.
- [ ] Recent activity is visible.
- [ ] Settlement status is visible.

## Navigation

- [ ] Dashboard cards deep-link to their modules.
- [ ] Quick actions respect RBAC.
- [ ] Historical Festival can be viewed.
- [ ] Current Festival remains default.

## Security

- [ ] Cross-Pandal access is blocked.
- [ ] Cross-Festival data leakage is prevented.
- [ ] Permission-aware widgets work.
- [ ] Admin-only information is protected.

## Performance

- [ ] Dashboard does not load all historical records.
- [ ] Real-time listeners are scoped.
- [ ] Detail lists are limited/paginated.
- [ ] Existing aggregates are reused.
- [ ] Offline/cached data is handled gracefully.

## UX

- [ ] UI matches Expense Tracker design language.
- [ ] Mobile-first layout works.
- [ ] Loading states exist.
- [ ] Error states exist.
- [ ] Empty states exist.
- [ ] Touch targets are usable.
- [ ] Color is not the only status indicator.

---

# 96. Recommended Implementation Order

```text
1. Inspect existing Festival architecture
2. Inspect financial aggregates/services
3. Build dashboard data composition layer
4. Festival header/status
5. Financial summary
6. God Fund vs Personal Money
7. Permanent Fund
8. Collection progress
9. Expense summary
10. Budget vs Actual
11. Readiness
12. Today's Duties
13. Needs Attention
14. Recent Activity
15. Assets summary
16. Settlement status
17. Permission-aware widgets
18. Quick actions
19. Historical Festival mode
20. Offline/cache handling
21. Performance optimization
22. Tests
```

---

# 97. Implementation Guidance for Cursor/Claude

Before modifying code:

1. Inspect the complete existing Ganesh Pandal architecture.
2. Inspect Festival selection/state.
3. Inspect the authoritative financial calculation layer.
4. Inspect God Fund vs Personal Money.
5. Inspect Permanent Fund.
6. Inspect Collections and Collection Sessions.
7. Inspect Expenses and Reimbursements.
8. Inspect Committee Contributions.
9. Inspect In-Kind Contributions.
10. Inspect Sponsors.
11. Inspect Feature 12 Budget.
12. Inspect Feature 13 Checklist.
13. Inspect Feature 14 Duties.
14. Inspect Feature 15 Audit/Activity.
15. Inspect Feature 1 Assets/Inventory.
16. Inspect Feature 10 Tasks/Events/Notifications.
17. Inspect existing RBAC.
18. Reuse existing UI components from the Expense Tracker.
19. Create a dashboard composition/data layer rather than duplicating business logic.
20. Do not create a second financial ledger.
21. Do not create duplicate calculations in individual widgets.
22. Reuse existing aggregates where available.
23. Scope all queries to the current Pandal and Festival.
24. Do not load historical records unnecessarily.
25. Add tests for financial totals and permission-aware rendering.
26. Test offline/stale dashboard behavior.
27. Do not rewrite unrelated modules.

---

# 98. Critical Test Scenarios

## Scenario A — New Festival

```text
Festival:
2026

No transactions yet.
```

Expected:

```text
Collections:
₹0

Expenses:
₹0

Readiness:
based on checklist

Budget:
Not configured
```

No errors.

---

## Scenario B — Financial Summary

```text
Opening Fund:
₹20,000

Collections:
₹50,000

Expenses:
₹10,000
```

Expected:

```text
Dashboard uses authoritative financial balance.
```

Do not assume a simplistic calculation if the ledger contains other transaction types.

---

## Scenario C — God Fund vs Personal

```text
God Fund:
₹7,000

Personal:
₹3,000

Expense:
₹10,000
```

Expected:

```text
Total Cost:
₹10,000

God Fund:
₹7,000

Personal:
₹3,000
```

---

## Scenario D — Collection

Volunteer adds:

```text
₹500
```

Expected when synchronized:

```text
Collection total updates.
Financial balance updates according to ledger.
Collection progress updates.
Activity updates.
```

No duplicate financial transaction.

---

## Scenario E — Budget Overrun

```text
Budget:
₹20,000

Actual:
₹24,000
```

Expected:

```text
Over Budget:
₹4,000
```

Dashboard does not change the budget automatically.

---

## Scenario F — Critical Checklist

```text
2 critical items pending
```

Expected:

```text
Needs Attention
2 Critical
```

and:

```text
Readiness
```

updates appropriately.

---

## Scenario G — Unassigned Duty

```text
1 shift
0 volunteers
```

Expected:

```text
Unassigned Duty
```

visible to authorized users.

---

## Scenario H — Permanent Fund

```text
Permanent Fund:
₹20,000
```

Expected:

```text
Permanent Fund:
₹20,000
```

separate from Festival Chanda.

---

## Scenario I — Historical Festival

Switch:

```text
2025
```

Expected:

```text
2025 financial data
2025 checklist
2025 duties
2025 settlement
```

No 2026 transactions mixed into totals.

---

## Scenario J — Permission

User lacks:

```text
budget.view
```

Expected:

```text
Budget widget hidden or permission-safe.
```

Do not merely hide sensitive data while still fetching it unnecessarily.

---

## Scenario K — Cross-Pandal

User belongs to:

```text
Pandal A
```

Expected:

```text
Only Pandal A dashboard data.
```

---

## Scenario L — Offline

Device loses network.

Expected:

```text
Cached dashboard remains usable.
Offline state visible.
Potentially stale data clearly indicated.
```

---

## Scenario M — Concurrent Collection

Two volunteers record:

```text
Ravi:
₹500

Suresh:
₹300
```

Expected:

```text
Total:
₹800
```

No overwrite.

---

# 99. Golden Rules

### Rule 1

> The dashboard is an overview layer, not a financial ledger.

### Rule 2

> Financial numbers must come from the authoritative financial architecture.

### Rule 3

> God Fund and Personal Money must remain clearly separated.

### Rule 4

> Permanent Fund must remain separate from Festival income.

### Rule 5

> Promised money is not received money.

### Rule 6

> In-kind contributions are not cash.

### Rule 7

> Budget is planning data; actuals come from real transactions.

### Rule 8

> Dashboard widgets must not duplicate business logic.

### Rule 9

> Every widget must respect RBAC.

### Rule 10

> Cross-Pandal and cross-Festival data must never leak.

### Rule 11

> Current Festival data should be prioritized.

### Rule 12

> Historical data should load only when requested.

### Rule 13

> The dashboard should surface problems, not overwhelm the user with data.

### Rule 14

> The UI must match the polished Expense Tracker design.

### Rule 15

> Offline/stale data must be clearly indicated.

### Rule 16

> Dashboard actions must use the normal module transaction and audit systems.

---

# 100. Final Product Mental Model

```text
                         GANESH PANDAL
                              |
                           FESTIVAL
                              |
                    GANESH CHATURTHI 2026
                              |
                +-------------+-------------+
                |                           |
            FINANCIAL                    OPERATIONS
                |                           |
       +--------+--------+          +-------+-------+
       |        |        |          |       |       |
    Funds   Collection Budget    Tasks   Duties Checklist
       |        |        |          |       |       |
       +--------+--------+----------+-------+-------+
                              |
                         DASHBOARD
                              |
       +----------------------+----------------------+
       |                      |                      |
   Financial Health      Festival Readiness    Needs Attention
       |                      |                      |
   ₹72,500                  82%                 4 Items
       |
       +----------------------+----------------------+
                              |
                        Recent Activity
                              |
                        Festival Settlement
                              |
                        Permanent Fund
```

The dashboard should make the committee feel:

> **"I opened one screen and I immediately know how much money we have, where the money came from, how much we've spent, how much Chanda is collected, whether we're within budget, whether the Festival is ready, who needs to do something today, and whether anything requires my attention."**
