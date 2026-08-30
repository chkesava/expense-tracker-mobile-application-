# Ganesh Seva — Feature Specification 01
## Foundation, Authentication, Pandal Access & Membership

**Stack:** Expo React Native + Firebase Auth + Firestore + Supabase Storage  
**Architecture:** Single-Pandal focused, shared real-time application

---

## 1. Product Context

Ganesh Seva is a shared mobile application for managing one Ganesh Pandal's festival operations and finances.

The product supports:
- Pandal administrators
- Committee members
- Collection volunteers
- Treasurers
- Other authorized roles

The same Pandal data is shared between authorized members in real time.

The application is intentionally **not a multi-tenant SaaS platform** at this stage.

Core architecture:

```text
Expo React Native
        |
        +---- Firebase Authentication
        |
        +---- Firestore
        |
        +---- Supabase Storage
```

---

## 2. Core Access Model

Authentication and authorization must remain separate.

```text
Firebase User
      |
      v
Ganesh Seva Access
      |
      v
Pandal Membership
      |
      v
Role(s)
      |
      v
Permissions
```

A valid Firebase account does **not** automatically grant Pandal access.

Possible membership states:

```text
PENDING
ACTIVE
REJECTED
REMOVED
```

Only an `ACTIVE` membership with appropriate permissions can access protected Pandal data.

---

## 3. Login Entry

When the app opens:

### Not authenticated

Show the Login screen.

### Already authenticated

Reuse the existing Firebase Auth session.

Do not require an unnecessary second login or OTP.

---

## 4. Split Login Experience

The Login screen should clearly provide two application paths:

```text
Welcome

[ Expense Tracker ]

[ Ganesh Seva ]
```

Requirements:

- Existing Expense Tracker authentication must continue working.
- Ganesh Seva must not expose Expense Tracker data.
- Expense Tracker must not expose Ganesh Seva data.
- Both can use the same Firebase authentication identity.
- Existing Firebase authentication should be reused for Ganesh Seva.

---

## 5. First-Time Ganesh Seva Flow

After Firebase authentication:

```text
Firebase User
      |
      v
Check Pandal Membership
      |
      +---- ACTIVE ----> Pandal Home
      |
      +---- PENDING ---> Pending Access
      |
      +---- REJECTED --> Access Rejected
      |
      +---- REMOVED ---> Access Removed
      |
      +---- NONE ------> Create or Join Pandal
```

A user without active membership must never see financial data.

---

## 6. Create Pandal

A user without a Pandal can choose:

```text
Create Pandal
```

Suggested fields:

```text
Pandal Name *
Area / Locality
Description
Contact Information
```

Keep the form simple.

---

## 7. Creator Becomes Initial Admin

The person who creates the Pandal automatically becomes its initial Admin.

Creation should be atomic:

```text
Create Pandal
      |
      +---- Pandal document
      +---- Membership document
      +---- Admin role assignment
```

Do not create the Pandal first and assign Admin later through an unreliable second operation.

The client must not be able to arbitrarily claim the Admin role.

Firestore Security Rules must protect this operation.

---

## 8. Join Pandal

A user without active membership can choose:

```text
Join Pandal
```

Use the existing project's join mechanism, such as:

```text
Pandal Code
Invite
Admin Invitation
```

Do not create duplicate invitation systems if one already exists.

---

## 9. Join Request

A join request should contain enough information for the Admin to identify the requester.

Example:

```text
Name
Email
Profile Photo
Optional Mobile
Requested At
Status
```

Avoid unnecessary personal data.

Expected flow:

```text
User
  |
  v
Join Request
  |
  v
Admin Review
```

---

## 10. Pending State

After requesting access:

```text
Membership Status:
PENDING
```

Show:

```text
Access Request Sent

Your request to join:

Sri Ganesh Youth Committee

is waiting for Admin approval.
```

The pending user must not see:

- Collections
- Expenses
- God Fund
- Permanent Fund
- Sponsors
- Members' financial information
- Reports

---

## 11. Admin Approval

Admin sees:

```text
Pending Join Requests
```

Example:

```text
Ravi Kumar
ravi@email.com

Requested:
Aug 25, 2026

[ Approve ]
[ Reject ]
```

Approval should consistently update:

```text
Join Request
+
Membership
+
Role assignment
```

Avoid inconsistent states such as an approved request without an active membership.

---

## 12. Rejection

Admin can reject a request.

Expected:

```text
Join Request:
REJECTED
```

The user must not gain Pandal access.

Keep historical requests instead of silently deleting them.

---

## 13. Removed Membership

Admin can remove a member.

Expected:

```text
Membership:
REMOVED
```

A removed user may still authenticate with Firebase but must not access:

- Pandal financial records
- Members
- Expenses
- Collections
- Contributions
- Assets
- Sponsors
- Reports
- Admin functions

unless they are approved again.

---

## 14. Pandal Context

Once membership is active, maintain the current Pandal context.

Use:

```text
pandalId
```

for all Pandal-specific operations.

Do not hardcode the Pandal ID.

Although the current product is for one Pandal, normal `pandalId` relationships keep the application reusable without introducing complex tenant architecture.

---

## 15. Festival Context

Keep Pandal-level and Festival-level data separate.

```text
Pandal
 |
 +-- Permanent Fund
 +-- Members
 +-- Roles
 +-- Assets
 +-- Sponsors
 |
 +-- Festivals
       |
       +-- 2026
       +-- 2027
       +-- ...
```

The current Festival must be explicitly selected/resolved.

Permanent Fund is Pandal-level; collections and expenses are Festival-level.

---

## 16. Multiple Admins

A Pandal may have multiple Admins.

The creator is the initial Admin.

Authorized Admins can promote another member if allowed by the existing RBAC system.

Admin access must be permission-based and protected by Firestore Security Rules.

---

## 17. Admin Safety

Never allow the last Admin to accidentally remove/demote themselves.

Before:

```text
Remove Admin
Demote Admin
Remove Member
```

verify that another valid Admin remains.

If the current user is the only Admin:

```text
You cannot remove or demote yourself
until another Admin is assigned.
```

Enforce this in both UI and authorization logic where possible.

---

## 18. User Profile

Keep a lightweight profile:

```text
uid
displayName
email
photoURL
mobile
createdAt
updatedAt
```

Use Firebase Auth values where possible.

Do not duplicate unnecessary authentication data.

---

## 19. Membership Record

Conceptually:

```text
pandals/{pandalId}/members/{uid}
```

Example:

```json
{
  "uid": "...",
  "status": "ACTIVE",
  "roles": ["admin"],
  "joinedAt": "...",
  "joinedBy": "...",
  "updatedAt": "..."
}
```

Adapt to the existing schema.

Do not store entire user profiles inside every membership record.

---

## 20. Join Request Record

Conceptually:

```text
pandals/{pandalId}/joinRequests/{requestId}
```

Example:

```json
{
  "uid": "...",
  "status": "PENDING",
  "requestedAt": "...",
  "reviewedAt": null,
  "reviewedBy": null
}
```

Use the project's existing naming conventions.

---

## 21. Pandal Record

Conceptually:

```text
pandals/{pandalId}
```

Example:

```json
{
  "name": "Sri Ganesh Youth Committee",
  "createdBy": "...",
  "createdAt": "...",
  "updatedAt": "..."
}
```

Do not put all members, expenses, collections, and other records into one giant document.

---

## 22. Shared Real-Time Data

The product is collaborative.

If:

```text
Ravi adds a collection
```

then another authorized member should see the update through Firestore's real-time behavior where appropriate.

Audit:

- Firestore listeners
- Query scoping
- Stale state
- Cache invalidation
- Duplicate listeners
- Race conditions

Do not add listeners to static data unnecessarily.

---

## 23. RBAC Foundation

The access model must integrate with dynamic RBAC:

```text
User
 ↓
Membership
 ↓
Role(s)
 ↓
Permissions
```

Avoid hardcoded authorization such as:

```text
if user.email == ...
if user.uid == ...
```

except for a carefully controlled bootstrap mechanism.

---

## 24. Authentication vs Authorization

Authentication answers:

> Who are you?

Firebase Auth handles this.

Authorization answers:

> What can you access or do?

Membership + Roles + Permissions handle this.

Example:

```text
Firebase authenticated
+
Pandal membership ACTIVE
+
expenses.create permission
=
Can create expense
```

Authentication alone must never grant financial access.

---

## 25. Firestore Security Rules

Security Rules are mandatory.

Rules must prevent:

- Unauthenticated access
- Non-members reading Pandal data
- Removed members accessing data
- Users granting themselves Admin
- Users granting themselves permissions
- Unauthorized member role changes
- Unauthorized Admin actions
- Cross-Pandal data access

Frontend checks are not sufficient.

---

## 26. Invitation Flow

If invitations exist:

```text
Admin
 ↓
Invite User
 ↓
User authenticates
 ↓
Invitation appears
 ↓
User accepts
 ↓
Membership becomes Active
```

If the project already uses join requests, extend that system rather than building a parallel mechanism.

---

## 27. Invitation Validation

Validate:

- Authenticated UID
- Invitation validity
- Pandal ID
- Expiration if implemented
- Existing membership
- Intended role/permissions

Never trust client-provided:

```text
role
pandalId
permission set
```

without authorization checks.

---

## 28. Logout

Logout should:

- Sign out Firebase
- Clear Pandal-specific local state where appropriate
- Clear sensitive cached state where necessary
- Return to Login

Do not leave sensitive financial screens accessible after logout through stale navigation state.

---

## 29. Session Restoration

On app startup:

```text
Firebase Auth State
        ↓
Load membership
        ↓
Load current Pandal
        ↓
Load current Festival
        ↓
Resolve permissions
        ↓
Open authorized screen
```

Do not render protected financial screens before authorization is resolved.

---

## 30. Loading State

During startup use a proper splash/loading state.

Avoid:

```text
Blank screen
```

or:

```text
Dashboard briefly appears
then disappears
```

because membership has not loaded.

---

## 31. Error Handling

Handle:

- Firebase unavailable
- Firestore permission denied
- Invalid invitation
- Expired invitation
- Rejected request
- Removed membership
- Network unavailable

Use friendly user-facing messages.

Do not expose raw Firebase errors unnecessarily.

---

## 32. Audit Trail

Record important membership events:

```text
Pandal Created
Admin Assigned
Join Request Created
Join Request Approved
Join Request Rejected
Member Removed
Member Reinstated
Role Assigned
Admin Promoted
Admin Demoted
```

Each event should identify:

```text
performedBy
performedAt
targetUser
pandalId
action
```

Reuse the existing audit infrastructure.

---

## 33. UX Requirements

### No Pandal

```text
Welcome to Ganesh Seva

Create a new Pandal
or
Join an existing Pandal
```

### Pending

```text
Waiting for Admin approval
```

### Active

```text
Welcome back

Sri Ganesh Youth Committee
Ganesh Utsav 2026
```

### Rejected

```text
Your request was not approved.
```

### Removed

```text
You no longer have access to this Pandal.
```

Avoid technical terminology.

---

## 34. Supabase Storage Boundary

Supabase Storage is for files only.

Do not use it for:

- User authorization
- Membership
- Financial ledger
- Roles
- Permissions

Those remain in Firebase/Firestore.

Never expose a Supabase `service_role` key in the Expo/mobile application.

---

## 35. Offline Considerations

Basic authentication/session state can be cached appropriately.

Authorization changes must eventually synchronize.

If a member is removed, stale offline state must not permanently grant access.

Firestore Security Rules remain the final authorization layer.

---

## 36. Acceptance Tests

### Authentication

- [ ] Unauthenticated user sees Login.
- [ ] Existing Firebase session is reused.
- [ ] No unnecessary second OTP.
- [ ] Google login works if configured.
- [ ] Email login works if configured.

### Pandal Access

- [ ] Authenticated user without membership cannot see Pandal data.
- [ ] User can create a Pandal.
- [ ] Creator automatically becomes Admin.
- [ ] User can request access.
- [ ] Pending user cannot access financial data.
- [ ] Admin can approve.
- [ ] Admin can reject.
- [ ] Removed user loses access.

### Admin

- [ ] Creator becomes Admin atomically.
- [ ] Multiple Admins work if allowed.
- [ ] Last Admin cannot remove/demote themselves.
- [ ] Admin promotion is authorized.
- [ ] Admin cannot be self-assigned.

### Security

- [ ] Firestore Rules enforce membership.
- [ ] Firestore Rules protect role changes.
- [ ] Users cannot read unauthorized Pandal data.
- [ ] Users cannot self-grant permissions.
- [ ] Removed users cannot access protected data.

### Session

- [ ] Logout returns to Login.
- [ ] App restart restores valid session.
- [ ] Authorization resolves before protected screens render.

---

## 37. Implementation Instructions

Before modifying code:

1. Inspect the current Firebase Auth implementation.
2. Inspect navigation.
3. Inspect Pandal models.
4. Inspect membership models.
5. Inspect current RBAC.
6. Inspect Firestore Security Rules.
7. Inspect Admin Dashboard.
8. Inspect audit logging.
9. Identify duplicate/conflicting implementations.
10. Produce a short gap analysis.

Then implement only missing/broken functionality.

Do not rewrite unrelated Expense Tracker functionality.

Do not introduce multi-tenant infrastructure.

Do not introduce a dedicated backend unless the existing security architecture genuinely requires it.

---

## 38. Final Foundation Architecture

```text
                 Firebase Auth
                      |
                      v
                Authenticated User
                      |
                      v
              Ganesh Seva Access
                      |
                      v
              Pandal Membership
                      |
             +--------+--------+
             |                 |
          ACTIVE           NOT ACTIVE
             |                 |
             v                 v
        Role Resolution    No Pandal Data
             |
             v
        Permissions
             |
       +-----+------+
       |            |
    Member        Admin
       |            |
       v            v
 Festival       Management
 Data           Controls
```

### Core rule

> **Being logged into Firebase does not mean the user is authorized to access the Pandal.**

Protected operations require:

```text
Authentication
+
Pandal Membership
+
Role
+
Permission
```
