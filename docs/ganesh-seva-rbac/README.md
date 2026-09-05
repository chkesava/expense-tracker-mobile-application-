# Ganesh Seva RBAC — Implementation Briefs

Jira project: **KAN** ([Ganesh seva board](https://kesavach.atlassian.net/jira/software/projects/KAN/board))

These files are implementation briefs for **KAN-9 through KAN-32** (RBAC-01 through RBAC-24) and the KAN-33 epic features that reuse that foundation. Each file contains the Jira ticket, existing code to start from, and a checklist.

Do not implement from these files blindly. Inspect the current membership, role, permission, and Firestore Rules code first. Some of this is already partially built (see `ganesh seva future ideas/GANESH_SEVA_AUDIT_TICKETS.md`).

| Ticket | Feature | Title | File |
| --- | --- | --- | --- |
| [KAN-9](https://kesavach.atlassian.net/browse/KAN-9) | RBAC-01 | Firestore Security Rules & Authorization Foundation | [KAN-09-rbac-01-firestore-security-rules-authorization-foundation.md](./KAN-09-rbac-01-firestore-security-rules-authorization-foundation.md) |
| [KAN-10](https://kesavach.atlassian.net/browse/KAN-10) | RBAC-02 | Pandal Membership Authorization | [KAN-10-rbac-02-pandal-membership-authorization.md](./KAN-10-rbac-02-pandal-membership-authorization.md) |
| [KAN-11](https://kesavach.atlassian.net/browse/KAN-11) | RBAC-03 | Role & Permission Management | [KAN-11-rbac-03-role-permission-management.md](./KAN-11-rbac-03-role-permission-management.md) |
| [KAN-12](https://kesavach.atlassian.net/browse/KAN-12) | RBAC-04 | Permission-Based CRUD Authorization | [KAN-12-rbac-04-permission-based-crud-authorization.md](./KAN-12-rbac-04-permission-based-crud-authorization.md) |
| [KAN-13](https://kesavach.atlassian.net/browse/KAN-13) | RBAC-05 | Own vs All Record Access | [KAN-13-rbac-05-own-vs-all-record-access.md](./KAN-13-rbac-05-own-vs-all-record-access.md) |
| [KAN-14](https://kesavach.atlassian.net/browse/KAN-14) | RBAC-06 | Admin Protection & Minimum Admin Rule | [KAN-14-rbac-06-admin-protection-minimum-admin-rule.md](./KAN-14-rbac-06-admin-protection-minimum-admin-rule.md) |
| [KAN-15](https://kesavach.atlassian.net/browse/KAN-15) | RBAC-07 | Pandal Invitation & Admin Approval | [KAN-15-rbac-07-pandal-invitation-admin-approval.md](./KAN-15-rbac-07-pandal-invitation-admin-approval.md) |
| [KAN-16](https://kesavach.atlassian.net/browse/KAN-16) | RBAC-08 | Financial Permission Separation | [KAN-16-rbac-08-financial-permission-separation.md](./KAN-16-rbac-08-financial-permission-separation.md) |
| [KAN-17](https://kesavach.atlassian.net/browse/KAN-17) | RBAC-09 | RBAC & Permission Change Audit | [KAN-17-rbac-09-rbac-permission-change-audit.md](./KAN-17-rbac-09-rbac-permission-change-audit.md) |
| [KAN-18](https://kesavach.atlassian.net/browse/KAN-18) | RBAC-10 | Re-authentication for Critical Actions | [KAN-18-rbac-10-re-authentication-for-critical-actions.md](./KAN-18-rbac-10-re-authentication-for-critical-actions.md) |
| [KAN-19](https://kesavach.atlassian.net/browse/KAN-19) | RBAC-11 | Financial & Festival Record Locking | [KAN-19-rbac-11-financial-festival-record-locking.md](./KAN-19-rbac-11-financial-festival-record-locking.md) |
| [KAN-20](https://kesavach.atlassian.net/browse/KAN-20) | RBAC-12 | Member Suspension & Access Revocation | [KAN-20-rbac-12-member-suspension-access-revocation.md](./KAN-20-rbac-12-member-suspension-access-revocation.md) |
| [KAN-21](https://kesavach.atlassian.net/browse/KAN-21) | RBAC-13 | Invitation Expiry & Revocation | [KAN-21-rbac-13-invitation-expiry-revocation.md](./KAN-21-rbac-13-invitation-expiry-revocation.md) |
| [KAN-22](https://kesavach.atlassian.net/browse/KAN-22) | RBAC-14 | Pandal Admin Transfer | [KAN-22-rbac-14-pandal-admin-transfer.md](./KAN-22-rbac-14-pandal-admin-transfer.md) |
| [KAN-23](https://kesavach.atlassian.net/browse/KAN-23) | RBAC-15 | Automated Firestore Security Rules Testing | [KAN-23-rbac-15-automated-firestore-security-rules-testing.md](./KAN-23-rbac-15-automated-firestore-security-rules-testing.md) |
| [KAN-24](https://kesavach.atlassian.net/browse/KAN-24) | RBAC-16 | Pandal Data Isolation | [KAN-24-rbac-16-pandal-data-isolation.md](./KAN-24-rbac-16-pandal-data-isolation.md) |
| [KAN-25](https://kesavach.atlassian.net/browse/KAN-25) | RBAC-17 | Festival Data Isolation | [KAN-25-rbac-17-festival-data-isolation.md](./KAN-25-rbac-17-festival-data-isolation.md) |
| [KAN-26](https://kesavach.atlassian.net/browse/KAN-26) | RBAC-18 | Privileged Role Separation | [KAN-26-rbac-18-privileged-role-separation.md](./KAN-26-rbac-18-privileged-role-separation.md) |
| [KAN-27](https://kesavach.atlassian.net/browse/KAN-27) | RBAC-19 | Permission Groups & RBAC Management UX | [KAN-27-rbac-19-permission-groups-rbac-management-ux.md](./KAN-27-rbac-19-permission-groups-rbac-management-ux.md) |
| [KAN-28](https://kesavach.atlassian.net/browse/KAN-28) | RBAC-20 | Temporary Permissions | [KAN-28-rbac-20-temporary-permissions.md](./KAN-28-rbac-20-temporary-permissions.md) |
| [KAN-29](https://kesavach.atlassian.net/browse/KAN-29) | RBAC-21 | Device & Session Management | [KAN-29-rbac-21-device-session-management.md](./KAN-29-rbac-21-device-session-management.md) |
| [KAN-30](https://kesavach.atlassian.net/browse/KAN-30) | RBAC-22 | Sensitive Data Visibility Permissions | [KAN-30-rbac-22-sensitive-data-visibility-permissions.md](./KAN-30-rbac-22-sensitive-data-visibility-permissions.md) |
| [KAN-31](https://kesavach.atlassian.net/browse/KAN-31) | RBAC-23 | Critical Action Approval Controls | [KAN-31-rbac-23-critical-action-approval-controls.md](./KAN-31-rbac-23-critical-action-approval-controls.md) |
| [KAN-32](https://kesavach.atlassian.net/browse/KAN-32) | RBAC-24 | Security Monitoring & Emergency Controls | [KAN-32-rbac-24-security-monitoring-emergency-controls.md](./KAN-32-rbac-24-security-monitoring-emergency-controls.md) |
| [KAN-34](https://kesavach.atlassian.net/browse/KAN-34) | Feature 01 | Foundation Auth & Pandal Membership | [KAN-34-foundation-auth-pandal-membership.md](./KAN-34-foundation-auth-pandal-membership.md) |

## Suggested order

1. Foundation: KAN-9, KAN-10, KAN-11, KAN-12
2. Isolation and admin safety: KAN-24, KAN-25, KAN-14, KAN-26
3. Membership lifecycle: KAN-15, KAN-20, KAN-21, KAN-22
4. Financial controls: KAN-16, KAN-13, KAN-19
5. Audit and verification: KAN-17, KAN-23
6. Hardening: KAN-18, KAN-27, KAN-28, KAN-29, KAN-30, KAN-31, KAN-32
