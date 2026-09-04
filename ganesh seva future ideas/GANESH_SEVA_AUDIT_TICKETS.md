# Ganesh Seva — Audit & Implementation Backlog

**Audit date:** 2026-08-24
**Scope:** the complete Ganesh Seva feature — `app/(ganesh)/**`, `app/(ganesh-auth)/**`, `components/ganesh/**`, `hooks/useGanesh*`, `hooks/ganesh/**`, `services/ganesh/**`, `shared/utils/ganesh*`, `shared/types/ganesh.ts`, the Ganesh section of `firestore.rules`, and `supabase/ganesh-files.policies.sql`.
**Method:** full-file static review of every file in scope, cross-checked against the Firestore Security Rules and the Supabase RLS policies; plus `npm run typecheck`, `npm run typecheck:shared`, and `npm test`.
**Status:** audit only. **No application code was modified.** This file is the sole deliverable.

---

## Fix Log

| Date | Tickets | Change | State |
| --- | --- | --- | --- |
| 2026-08-26 | GS-003 | `pandalInvites` read split into `get` / `list: false` | Fixed, **not deployed** |
| 2026-08-26 | GS-005 | `fundTransfers` and `auditLogs` excluded from the wildcard's `update` / `delete` | Fixed, **not deployed** |
| 2026-08-26 | GS-002 | Open-join self-create pins `permissions` and `roleIds` to the built-in member set | Fixed, **not deployed** |
| 2026-08-26 | GS-004 | Amount / status / flag / summary-key validation added to the festival wildcard | **Partial** (unknown-field `hasOnly` deferred to GS-074), not deployed |
| 2026-08-27 | GS-019 | `voidFinancialRecord` guards on an open festival | Fixed client-side; rules gap is GS-018 |
| 2026-08-27 | GS-009 | Reversing a personal amount past what is still owed is refused | Fixed |
| 2026-08-27 | GS-010 | God Fund spend checks the balance inside `runTransaction` | Fixed |
| 2026-08-27 | GS-008 | Reimbursement re-reads its ceiling server-side and checks God Fund solvency | Fixed |
| 2026-08-27 | GS-014 | Guarded `afterAdminCount()`; legacy pandals unfrozen | Fixed; **deployed 2026-09-03**. Backfill run in dry-run 2026-09-03: 0 of 3 pandals disagreed, so no write was needed. Script also had to be ported to firebase-admin v14 first — it was previously unrunnable. |
| 2026-08-27 | GS-015 | `adminCount` pinned to +/-1 per update; member create must move it | **Partial**, not deployed |
| 2026-08-27 | GS-016 | `members`/`roles`/`settings` no longer offered as grantable; `audit.read` un-inverted | Fixed (UI ships with app; rules half **not deployed**) |
| 2026-08-27 | GS-018 | Closed festivals read-only; ledger records never hard-deleted | Fixed, **not deployed** |
| 2026-08-27 | GS-037 | Creating a contribution already `received` requires `contributions.receive` | Fixed (UI ships with app; rules half **not deployed**) |
| 2026-08-27 | GS-007 | Settlement waits for the summary; server re-derives the closing balance | Fixed |
| 2026-08-27 | GS-006 | Household picker plus per-match merge in the duplicate dialog | Fixed |
| 2026-08-27 | GS-028 | Duplicate dialog locks while a save is in flight | Fixed |
| 2026-08-27 | GS-001 | Edge Function deployed; policies locked in production; client routed through it | **Deployed, outage until a build ships** — auth path unverified |
| 2026-08-27 | GS-069 | Replacing a photo, and a failed attach, now clean up Storage | **Partial** — void does not delete a photo (deliberate: it's audit evidence); late-failure cleanup not closed |

All four are `firestore.rules` changes only; no application code was touched.
**Deployed 2026-09-03** (`firebase deploy --only firestore:rules --project expenseapp-27f94`),
together with the `sponsoredExpenseAmount` summary key added for GS-039. CI still does not
deploy `firestore.rules`, so any future rules change needs the same manual step from
`docs/FIREBASE_RULES_DEPLOY.md`.
Coverage is mirrored in `shared/utils/ganeshPermissions.rules.contract.test.ts`, which is a
hand-written mirror, not an emulator run (GS-074 remains open).

The 2026-08-27 rows are application code (`services/ganesh/**`, `hooks/useGaneshWrites.ts`,
`shared/utils/ganesh*`) and ship with the app - no deploy step. They introduce one
deliberate behaviour change: **God Fund spending, reimbursements and voids now require a
connection**, because each runs inside a Firestore transaction so a balance can be read and
enforced atomically. Expenses paid entirely from personal money or by a sponsor touch no
balance and stay offline-capable.

---

## Executive Summary

**Status as of 2026-09-04.** Original counts were 9 CRITICAL, 32 HIGH,
41 MEDIUM, 21 LOW across 103 tickets. GS-104 was found and fixed on
2026-09-04 by the new emulator harness, taking the total to 104.

| Severity | Closed | Partial | Open | Total |
| --- | ---: | ---: | ---: | ---: |
| CRITICAL | 9 | 1 | 0 | 10 |
| HIGH | 31 | 1 | 0 | 32 |
| MEDIUM | 32 | 0 | 10 | 42 |
| LOW | 16 | 1 | 3 | 20 |
| **Total** | **88** | **3** | **13** | **104** |

Every CRITICAL and HIGH is now closed or partial. Three partials remain: GS-004
(no whole-document field allowlist outside `summary`, CRITICAL) and GS-040 (the
photo queue is still not persisted, HIGH). Both are blocked on work larger than
a rules edit or a screen fix, and each ticket records what that is: GS-004 needs
the emulator harness in GS-074 before an allowlist can be deployed safely
against a Firebase project that also serves production, and GS-040 needs a
durable queue with a provider-level worker. The third is GS-096, whose only
open criterion (batch signed-URL minting) needs a new action on the
`ganesh-files` Edge Function and a Supabase deploy.

### How much of this you can trust

**CRITICAL and HIGH: verified.** Each was checked against current code, not
taken from this file. That mattered — **9 of the 22 checked were already fixed
or misfiled**, some for weeks:

- Fixed without the ticket being updated: GS-011, GS-012, GS-013, GS-015,
  GS-024, GS-027, GS-038, plus GS-049, GS-056 and GS-059 among the MEDIUMs
- GS-014 needed no work at all — a dry run found 0 of 3 pandals disagreed
- N-05 and N-06, filed by the 2026-09-03 follow-up audit, were author error and
  were retracted rather than fixed

**MEDIUM and LOW: now swept.** All 37 that were open on 2026-09-04 were read and
checked against code (see "Stale-ticket sweep" at the end of this file): 6
closed as already fixed, 17 confirmed still real, 14 left unverified because
they need more than a grep. 33 remain open. The 14 unverified are named
explicitly there rather than counted as if they had been checked. Expect no
longer applicable. **Triage before scheduling any of them** — re-fixing
something already fixed costs more than checking did.

### Highest-value item still open

GS-053 held this slot and was fixed on 2026-09-03 — all six writes now leave a
trail, including the recompute, which records exactly which totals it moved and
who ran it.

Nothing among the remaining 57 has been assessed as taking its place, because
those 57 are mostly unverified. Triage first.

### Verification results (original audit, 2026-08-24)

- **TypeScript (`npm run typecheck`)** — PASSED, 0 errors
- **TypeScript shared (`npm run typecheck:shared`)** — PASSED, 0 errors
- **Unit tests (`npm test`)** — PASSED, 125 files / 1221 tests, 0 failures

As of 2026-09-03 the suite is **147 files / 1470 tests**, all passing, and
`firestore.rules` is deployed to `expenseapp-27f94`.
- **ESLint** — NOT RUN: no `lint` script exists in `package.json`
- **Expo build** — NOT RUN
- **Firestore rules emulator tests** — NOT RUN: none exist (see GS-074)
- **`node_modules` was absent** in this worktree; it was installed to run the above. `package-lock.json` was reverted after the run and the tree left clean.

**The build is green. Every defect below is behavioural, not a compile error.** This matters for planning: the pure-function layer (`shared/utils/ganeshMath.ts`, `ganeshContributions.ts`, `ganeshSponsors.ts`, `ganeshPermissions.ts`) is genuinely well tested and largely correct. The defects concentrate in three places the tests do not reach: **the Firestore Security Rules**, **the service-layer wiring between those pure functions and Firestore**, and **the screen-level loading/error states**.

### Most important problem areas

1. **Storage is effectively public.** `supabase/ganesh-files.policies.sql` grants the `anon` role full read/write/update/delete over every pandal's files with no membership predicate. The publishable key is bundled into the APK. This is the single highest-severity finding (GS-001).
2. **Client-supplied authorization data is trusted by the rules.** The member document's `permissions` array is what `hasPermOf()` reads, and the open-join self-create path lets a user write that array unconstrained (GS-002). Combined with a fully enumerable `pandalInvites` collection (GS-003), this is a complete takeover path for any pandal with `joinMode: 'open'`.
3. **The rules validate permissions but never payloads.** No `hasOnly`, no type check, no range check on any festival subcollection — including the `summary` document that is the sole source of truth for every displayed balance (GS-004).
4. **Financial writes are read-modify-write outside transactions.** God Fund spending and reimbursements both check a balance with a plain `getDoc` and then commit an unconditional `increment()`. The Permanent Fund does this correctly with `runTransaction`; the festival ledger does not (GS-008, GS-010).
5. **Households are non-functional.** No UI path ever passes a `householdId`, so every collection creates a brand-new household. The `partial → paid` transition is unreachable and the duplicate-detection dialog has no merge action (GS-006).
6. **Screens render `₹0` as settled fact while loading.** Ten financially significant screens — including the festival report and the settlement screen — have no loading or error state. On the settlement screen this lets a user irreversibly close a festival on an unloaded zero (GS-007).
7. **Four whole features are missing**, not partial: Cash Reconciliation, Daily Collection Sessions, Collection Receipt Numbers, and Money Purpose (GS-075 – GS-078).

### What is genuinely right — do not regress it

Recording these explicitly so the fix cycle does not undo working design:

- **One central God Fund formula.** `availableGodFund()` in `shared/utils/ganeshMath.ts:15` is used by all seven call sites including the write-side guards. There is no divergent copy.
- **In-kind and promised value never leak into cash.** Separate summary fields, gated bumps, and the rebuild excludes `promised`/`cancelled`. Verified end to end.
- **Duplicate "Mark Received" is prevented server-side** by the status-transition rules (`firestore.rules:770-784`, `799-820`) evaluated against the live document.
- **The Permanent Fund is correctly pandal-level**, mutated only inside `runTransaction`, with negative-balance guards and online gating.
- **Festival isolation is structural.** Every festival-scoped read is path-scoped; there are no `collectionGroup` queries anywhere.
- **Asset-vs-expense accounting is correct.** `addAssetPurchase` writes the expense and the asset in one batch, satisfying both `existsAfter` rules. Assets are pandal-level and survive across years.
- **Navigation integrity is 41/41 clean.** No dead links, no unreachable screens.
- **Currency formatting is consistent.** Every value routes through `formatInr`; zero ad-hoc formatting.
- **`AdminGate` covers every admin route**, including nested deep links.
- **`lib/firestoreWrite.ts`** correctly distinguishes "durably queued" from "server-acked" and routes late failures rather than dropping them.

---

## Recommended Fix Order

1. **Storage exposure** — GS-001, GS-036. Nothing else in the storage area matters until the RLS decision is made.
2. **Authorization holes in the rules** — GS-002, GS-003, GS-004, GS-005. These are remote-exploitable without the app.
3. **Financial integrity** — GS-008, GS-009, GS-010, GS-011, GS-012, GS-019, GS-022.
4. **Rules-vs-client contract breaks that make features silently fail** — GS-014, GS-015, GS-016, GS-018, GS-037.
5. **Core workflows that are broken** — GS-006, GS-007, GS-020, GS-025, GS-026, GS-027, GS-028.
6. **Error handling and loading states** — GS-029, GS-030, GS-031, GS-032, GS-034, GS-035.
7. **Audit trail completeness** — GS-021, GS-052, GS-053.
8. **Offline and storage reliability** — GS-040, GS-068, GS-069.
9. **Missing features** — GS-075 – GS-079, scheduled against actual committee need.
10. **Performance, UX polish, code quality** — the remainder.

> **Nothing in the rules section takes effect until someone runs the manual deploy** described in `docs/FIREBASE_RULES_DEPLOY.md`. CI does not deploy `firestore.rules`. Factor this into every rules ticket.

---

## Feature Audit Matrix

| Feature | Status | Issues | Ticket IDs |
| --- | --- | ---: | --- |
| Authentication / Login | IMPLEMENTED | 3 | GS-044, GS-045, GS-046 |
| Pandal creation | IMPLEMENTED | 2 | GS-088, GS-017 |
| Pandal membership | PARTIAL | 4 | GS-002, GS-003, GS-042, GS-043 |
| Admin (last-admin protection) | PARTIAL | 3 | GS-014, GS-015, GS-017 |
| Dynamic Roles & Permissions | PARTIAL | 3 | GS-002, GS-016, GS-014 |
| Admin Dashboard | PARTIAL | 4 | GS-034, GS-054, GS-055, GS-056 |
| Shared real-time data | IMPLEMENTED | 2 | GS-048, GS-049 |
| Year-wise Festivals | IMPLEMENTED | 5 | GS-047, GS-048, GS-061, GS-087, GS-018 |
| Permanent Pandal Fund | IMPLEMENTED | 4 | GS-021, GS-023, GS-070, GS-085 |
| Opening Funds | IMPLEMENTED | 0 | — |
| Committee Contributions | PARTIAL | 4 | GS-059, GS-063, GS-091, GS-011 |
| Chanda Collections | PARTIAL | 4 | GS-086, GS-094, GS-076, GS-077 |
| Households | **BROKEN** | 6 | GS-006, GS-026, GS-038, GS-062, GS-093, GS-053 |
| Expenses | PARTIAL | 4 | GS-010, GS-019, GS-039, GS-011 |
| God Fund vs Personal Money | IMPLEMENTED | 1 | GS-010 |
| Split Funding | IMPLEMENTED | 2 | GS-039, GS-080 |
| Reimbursements | **BROKEN** | 3 | GS-008, GS-009, GS-024 |
| In-Kind Contributions | IMPLEMENTED | 3 | GS-037, GS-089, GS-090 |
| Promised vs Received | IMPLEMENTED | 1 | GS-037 |
| Sponsors | IMPLEMENTED | 5 | GS-039, GS-050, GS-051, GS-060, GS-092 |
| Pandal Assets | IMPLEMENTED | 3 | GS-020, GS-067, GS-095 |
| Asset vs Expense | IMPLEMENTED | 1 | GS-020 |
| Cash / UPI / Bank | **BROKEN** | 1 | GS-011 |
| Cash Reconciliation | **MISSING** | 1 | GS-075 |
| Daily Collection Sessions | **MISSING** | 1 | GS-076 |
| Collection Receipt Numbers | **MISSING** | 1 | GS-077 |
| Fund Transfers | PARTIAL | 4 | GS-021, GS-023, GS-070, GS-085 |
| Festival Settlement | **BROKEN** | 4 | GS-007, GS-021, GS-022, GS-018 |
| Money Purpose | **MISSING** | 1 | GS-078 |
| Supabase Storage | **BROKEN** | 5 | GS-001, GS-036, GS-069, GS-096, GS-098 |
| Offline behaviour | PARTIAL | 4 | GS-040, GS-059, GS-068, GS-010 |
| Audit Trail | PARTIAL | 5 | GS-021, GS-005, GS-052, GS-053, GS-092 |
| Security Rules | **BROKEN** | 12 | GS-002 – GS-005, GS-014 – GS-018, GS-037, GS-073, GS-074 |
| Reports | PARTIAL | 6 | GS-013, GS-032, GS-039, GS-050, GS-051, GS-079 |
| Error handling | PARTIAL | 5 | GS-029, GS-030, GS-031, GS-035, GS-056 |
| Performance | PARTIAL | 5 | GS-064, GS-065, GS-066, GS-067, GS-097 |
| UX consistency | PARTIAL | 8 | GS-025 – GS-028, GS-032, GS-033, GS-055, GS-101 |

---

## Ticket Summary

| ID | Severity | Category | Feature | Title | Status |
| --- | --- | --- | --- | --- | --- |
| GS-001 | CRITICAL | STORAGE | Supabase Storage | Supabase policies grant `anon` full CRUD over every pandal's files | CODE FIXED — AWAITING RELEASE BUILD |
| GS-002 | CRITICAL | RBAC | Pandal membership | Open-join self-create accepts an arbitrary `permissions` array | FIXED — DEPLOYED 2026-09-03 |
| GS-003 | CRITICAL | SECURITY | Pandal membership | `pandalInvites` is listable by any signed-in user | FIXED — DEPLOYED 2026-09-03 |
| GS-004 | CRITICAL | SECURITY | Security Rules | Festival subcollections have no payload validation; `summary` is forgeable | PARTIAL — DEPLOYED 2026-09-03 |
| GS-005 | CRITICAL | SECURITY | Audit Trail | `fundTransfers` and `auditLogs` are mutable via the wildcard match | FIXED — DEPLOYED 2026-09-03 |
| GS-006 | CRITICAL | COLLECTIONS | Households | Every collection creates a new household; the merge path is unreachable | FIXED |
| GS-007 | CRITICAL | FESTIVAL | Festival Settlement | A festival can be closed on an unloaded ₹0 summary | FIXED |
| GS-008 | CRITICAL | FINANCE | Reimbursements | Reimbursement cap is client-supplied and there is no solvency check | FIXED |
| GS-009 | CRITICAL | FINANCE | Reimbursements | `pendingReimbursements` goes negative when a reimbursed expense is voided | FIXED |
| GS-010 | HIGH | FINANCE | Expenses | God Fund overspend: balance checked by a non-transactional cached read | FIXED |
| GS-011 | HIGH | FINANCE | Cash / UPI / Bank | Payment method is not tracked end to end; cash cannot be reconciled | FIXED — verified 2026-09-03 |
| GS-012 | HIGH | FIRESTORE | Reports | `recomputeFestivalSummary` truncates at 2000 docs and clobbers concurrent writes | FIXED — verified 2026-09-03 |
| GS-013 | HIGH | REPORTING | Reports | Report totals are computed from 400-doc truncated lists | FIXED — verified 2026-09-03 |
| GS-014 | HIGH | RBAC | Admin | `pandalAfter().adminCount` is dereferenced unguarded; legacy pandals are frozen | FIXED — DEPLOYED 2026-09-03; backfill verified unnecessary (0 of 3 pandals disagreed) |
| GS-015 | HIGH | RBAC | Admin | `adminCount` is unpinned on pandal update and bypassed on member create | FIXED — verified and DEPLOYED 2026-09-03 |
| GS-016 | HIGH | RBAC | Roles & Permissions | `members.*` / `roles.*` permissions are honoured by the UI and ignored by the rules | FIXED — DEPLOYED 2026-09-03 |
| GS-017 | HIGH | SECURITY | Pandal creation | A removed founder keeps permanent delete rights; no ownership transfer exists | FIXED 2026-09-03 — DEPLOYED |
| GS-018 | HIGH | FIRESTORE | Festival Settlement | Closed festivals remain mutable and hard-deletable | FIXED — DEPLOYED 2026-09-03 |
| GS-019 | HIGH | FINANCE | Expenses | `voidFinancialRecord` has no open-festival guard | FIXED (rules gap closed by GS-018) |
| GS-020 | HIGH | ASSETS | Asset vs Expense | Voiding an asset purchase orphans the asset in inventory | FIXED 2026-09-03 |
| GS-021 | HIGH | REPORTING | Audit Trail | Fund transfers and settlement closes write no audit entry | FIXED 2026-09-03 |
| GS-022 | HIGH | FINANCE | Festival Settlement | Money left in a closed festival disappears from every total | FIXED 2026-09-03 |
| GS-023 | HIGH | PERMANENT_FUND | Fund Transfers | Transfer in and transfer out resolve different festivals | FIXED 2026-09-03 |
| GS-024 | HIGH | FINANCE | Reimbursements | Per-member financial counters are never rebuilt by the recompute tool | FIXED — verified 2026-09-03 |
| GS-025 | HIGH | UX | Committee Contributions | Target inputs seeded `0` and never re-synced; Save wipes real targets | FIXED 2026-09-03 |
| GS-026 | HIGH | UX | Households | Expected-amount input is always seeded `0`; Save flips the household to paid | ALREADY FIXED — verified 2026-09-03 |
| GS-027 | HIGH | UX | Collections | Voiding a collection has no confirmation, no busy lock and no error handling | FIXED — verified 2026-09-03 |
| GS-028 | HIGH | UX | Collections | Duplicate-household dialog's Continue can be double-submitted | FIXED |
| GS-029 | HIGH | CODE_QUALITY | Error handling | `useGaneshWrites` guards throw synchronously, defeating `.catch` and spinners | FIXED 2026-09-03 |
| GS-030 | HIGH | UX | Error handling | Late write failures bypass `lib/errors.ts` and arrive after a success toast | FIXED 2026-09-03 |
| GS-031 | HIGH | UX | Error handling | Nine write paths have no error handling at all | FIXED 2026-09-03 |
| GS-032 | HIGH | UX | Reports | Ten financial screens render 0 with no loading or error state | FIXED - 2026-09-04 |
| GS-033 | HIGH | UX | Expenses | No keyboard avoidance on any Ganesh money-entry form | FIXED 2026-09-03 |
| GS-034 | HIGH | UX | Admin Dashboard | Summary tiles and "Needs attention" act on unloaded data | FIXED 2026-09-03 |
| GS-035 | HIGH | UX | Festival | A closed festival is reported to the user as "You don't have access" | FIXED 2026-09-03 |
| GS-036 | HIGH | STORAGE | Supabase Storage | File size and MIME type are enforced only on the client | CODE DONE 2026-09-03 — AWAITING BUCKET SQL |
| GS-037 | HIGH | CONTRIBUTIONS | Promised vs Received | Contributions can be created already `received`, bypassing `contributions.receive` | FIXED — DEPLOYED 2026-09-03 |
| GS-038 | HIGH | COLLECTIONS | Households | `collectedAmount` written as an absolute value on void; status from a stale read | FIXED — verified 2026-09-03 |
| GS-039 | HIGH | FINANCE | Split Funding | The sponsored portion of an expense is absent from every summary total | FIXED 2026-09-03 |
| GS-040 | HIGH | OFFLINE | Supabase Storage | The "waiting for connection" photo queue is ephemeral screen state | PARTIAL 2026-09-03 — copy honest, queue not built |
| GS-041 | HIGH | DATA_VALIDATION | Security Rules | No server-side validation of amounts, dates or enums anywhere | FIXED 2026-09-03 - AWAITING RULES DEPLOY |
| GS-042 | MEDIUM | SECURITY | Pandal membership | `pandalJoinRequests` is unbounded, undeletable and accepts any `pandalId` | FIXED 2026-09-04 — DEPLOYED |
| GS-043 | MEDIUM | SECURITY | Pandal membership | An invite can be created pointing at someone else's pandal | FIXED 2026-09-04 — DEPLOYED |
| GS-044 | MEDIUM | AUTH | Authentication | The Ganesh session is never cleared on sign-out | OPEN |
| GS-045 | MEDIUM | AUTH | Authentication | `GaneshGate` writes real PII into the duress user tree | FIXED 2026-09-04 |
| GS-046 | MEDIUM | AUTH | Authentication | The login screen claims an isolation the architecture does not provide | OPEN |
| GS-047 | MEDIUM | NAVIGATION | Festivals | The restored pandal/festival session is never validated | FIXED — verified 2026-09-04 |
| GS-048 | MEDIUM | UX | Festivals | Previous-festival rows stay on screen after a switch | FIXED — verified 2026-09-04 |
| GS-049 | MEDIUM | CODE_QUALITY | Shared real-time data | `useGaneshCollection` omits `extra` from its effect dependencies | FIXED — verified 2026-09-03 |
| GS-050 | MEDIUM | REPORTING | Sponsors | Reports display the same rupees twice under two "Cash received" headings | FIXED 2026-09-04 |
| GS-051 | MEDIUM | REPORTING | Sponsors | `summarizeSponsorships` and `breakdownSponsors` disagree on expense sponsorships | FIXED 2026-09-04 |
| GS-052 | MEDIUM | REPORTING | Audit Trail | Asset and sponsor audits never reach the Pandal-wide audit screen | FIXED 2026-09-04 |
| GS-053 | MEDIUM | REPORTING | Audit Trail | Household edits, category adds, profile edits and recomputes are unaudited | FIXED 2026-09-03 |
| GS-054 | MEDIUM | UX | Admin Dashboard | `AdminGate` mounts admin children behind an overlay | FIXED - 2026-09-05 |
| GS-055 | MEDIUM | UX | Admin Dashboard | The dashboard duplicates eight destinations across five sections | FIXED - 2026-09-05 (one real duplicate; rest stale) |
| GS-056 | MEDIUM | UX | Admin Dashboard | The dashboard error state ignores half of its queries | FIXED 2026-09-03 |
| GS-057 | MEDIUM | UX | Festival | Five add-screens have no closed-festival guard | FIXED 2026-09-04 |
| GS-058 | MEDIUM | UX | Festival | No persistent read-only banner when a festival is closed | FIXED - 2026-09-04 |
| GS-059 | MEDIUM | OFFLINE | Committee Contributions | Committee payments bypass the offline money-receive guard | FIXED — verified 2026-09-03 |
| GS-060 | MEDIUM | SPONSORS | Sponsors | Sponsor profile editing is blocked when the current festival is closed | FIXED — verified 2026-09-04 |
| GS-061 | MEDIUM | FESTIVAL | Festivals | Custom expense categories are not carried forward to the next festival | FIXED - 2026-09-04 |
| GS-062 | MEDIUM | COLLECTIONS | Households | The household list is not carried forward between festivals | FIXED — verified 2026-09-04 |
| GS-063 | MEDIUM | CONTRIBUTIONS | Committee Contributions | `ContributionMode: "custom"` is unreachable from the UI | FIXED - 2026-09-04 (removed) |
| GS-064 | MEDIUM | PERFORMANCE | Shared real-time data | `useGaneshSyncReporter` duplicates the four largest listeners | FIXED — verified 2026-09-04 |
| GS-065 | MEDIUM | PERFORMANCE | Households | Households, members, roles and join-request listeners have no `limit` | FIXED — 2026-09-04 |
| GS-066 | MEDIUM | PERFORMANCE | Sponsors | `useSponsorHistory` is an unbounded N+1 with client-side filtering | FIXED — 2026-09-04 (the `where` was already there) |
| GS-067 | MEDIUM | ASSETS | Pandal Assets | Per-asset history is truncated by a pandal-wide 80-document cap | FIXED — 2026-09-04 |
| GS-068 | MEDIUM | OFFLINE | Offline behaviour | The Firestore persistence fallback cannot work and the cache mode is fabricated | OPEN |
| GS-069 | MEDIUM | STORAGE | Supabase Storage | No cleanup path exists; orphaned files accumulate permanently | FIXED - 2026-09-04 (void deletion wont-do) |
| GS-070 | MEDIUM | FINANCE | Permanent Fund | Seed-then-transfer runs as two non-atomic steps with no rollback | OPEN |
| GS-071 | MEDIUM | FIRESTORE | Pandal creation | Multi-batch pandal and festival creation has no rollback | OPEN — assessed 2026-09-04 |
| GS-072 | MEDIUM | FIRESTORE | Reports | The recompute treats a missing contribution status as `received` | FIXED 2026-09-04 |
| GS-073 | MEDIUM | SECURITY | Collections | Every member, including `viewer`, can read all donor PII | FIXED 2026-09-04 — DEPLOYED |
| GS-074 | MEDIUM | CODE_QUALITY | Security Rules | Rules are deployed by hand and the contract test is a hand-written mirror | OPEN — confirmed 2026-09-04 |
| GS-075 | MEDIUM | RECONCILIATION | Cash Reconciliation | Cash Reconciliation is entirely missing | OPEN — confirmed 2026-09-04 |
| GS-076 | MEDIUM | COLLECTIONS | Daily Collection Sessions | Daily Collection Sessions are entirely missing | OPEN — confirmed 2026-09-04 |
| GS-077 | MEDIUM | COLLECTIONS | Receipt Numbers | Collection receipt numbers are entirely missing | FIXED — verified 2026-09-04 |
| GS-078 | MEDIUM | FINANCE | Money Purpose | Money Purpose is missing for every money movement | OPEN — confirmed 2026-09-04 |
| GS-079 | MEDIUM | REPORTING | Reports | No export, no date range, and two "report" rows are plain list links | OPEN |
| GS-080 | MEDIUM | FINANCE | Split Funding | Local `money()` copies drop the epsilon guard, causing false rejections | FIXED 2026-09-04 |
| GS-081 | LOW | FINANCE | Reports | Summary counters are unrounded float accumulators | FIXED 2026-09-04 |
| GS-082 | MEDIUM | SECURITY | Asset vs Expense | `expenseCreateAllowed()` guards create but not update | FIXED 2026-09-04 — DEPLOYED |
| GS-083 | LOW | SECURITY | Festivals | Deleting a pandal or festival orphans every subcollection | FIXED 2026-09-04 — DEPLOYED |
| GS-084 | LOW | SECURITY | Pandal membership | An admin can write arbitrary fields into another user's membership index | FIXED 2026-09-04 — DEPLOYED |
| GS-085 | LOW | PERMANENT_FUND | Fund Transfers | Fund transfers have no idempotency key | FIXED - 2026-09-05 |
| GS-086 | MEDIUM | DATA_VALIDATION | Collections | `collectorId` is arbitrary and unvalidated | FIXED 2026-09-04 — DEPLOYED |
| GS-087 | LOW | FESTIVAL | Festivals | Two festivals can be created for the same year | FIXED — verified 2026-09-04 |
| GS-088 | LOW | SECURITY | Pandal creation | Duplicate pandals are unconstrained and the code fallback is unchecked | FIXED 2026-09-04 |
| GS-089 | LOW | CONTRIBUTIONS | In-Kind | "Cancelled" is offered as a creation status | FIXED - 2026-09-04 (rules deployed) |
| GS-090 | LOW | CONTRIBUTIONS | In-Kind | Sponsorship-kind value is hidden from the contributions tab metrics | FIXED - 2026-09-04 |
| GS-091 | LOW | CONTRIBUTIONS | Committee Contributions | Overpayment is indistinguishable from exact payment | FIXED - 2026-09-04 |
| GS-092 | LOW | SPONSORS | Audit Trail | Every sponsorship audit records `action: "edited"` | FIXED - 2026-09-04 |
| GS-093 | LOW | COLLECTIONS | Households | `assignedCollectorId` and `notes` are dead fields | FIXED - 2026-09-04 (exposed, not deleted) |
| GS-094 | LOW | UX | Collections | The payment-method filter ignores the search box | CLOSED - was already fixed |
| GS-095 | LOW | ASSETS | Pandal Assets | Asset detail resolves from a 400-doc list and shows a misleading message | FIXED — 2026-09-04 |
| GS-096 | LOW | STORAGE | Supabase Storage | Signed URLs live 30 minutes and the cache map never evicts | PARTIAL - 2026-09-05 (cache bounded; expiry already fine) |
| GS-097 | LOW | PERFORMANCE | Supabase Storage | Each upload reads the image into memory three times | FIXED - 2026-09-05 |
| GS-098 | LOW | CODE_QUALITY | Supabase Storage | Dead `ganeshStorage.ts` barrel and a decoy block in `storage.rules` | FIXED - 2026-09-05 |
| GS-099 | LOW | NAVIGATION | Admin Dashboard | Pushing a tab route from the admin stack unwinds the stack | OPEN |
| GS-100 | LOW | CODE_QUALITY | Navigation | Every Ganesh href is cast `as never`, disabling typed routes | OPEN — confirmed 2026-09-04 |
| GS-101 | LOW | UX | Expenses | No unsaved-changes guard on long forms | FIXED - 2026-09-05 |
| GS-102 | LOW | CODE_QUALITY | Platform | `EXPO_PUBLIC_GEMINI_API_KEY` is bundled into the client (outside Ganesh scope) | OPEN — confirmed 2026-09-04, needs a proxy |
| GS-103 | MEDIUM | FIRESTORE | Committee Contributions | Festival member increment writes may be rejected when the doc carries `createdBy` | FIXED 2026-09-04 |
| GS-104 | CRITICAL | SECURITY | Security Rules | Legacy members could not record money: summary rule exceeded the 1000-expression budget | FIXED - 2026-09-04, DEPLOYED |

---

# Detailed Tickets

## GS-001 — Supabase Storage policies grant `anon` full CRUD over every pandal's files

**Severity:** CRITICAL
**Category:** STORAGE
**Feature:** Supabase Storage
**Status:** CODE FIXED — AWAITING RELEASE BUILD (2026-08-27)

### Problem
All four Supabase RLS policies for the `ganesh-files` bucket are granted `to anon, authenticated` with a predicate that checks only the bucket name and the first path segment. There is no pandal-membership check and no `auth.uid()` check of any kind.

### Current Behavior
`supabase/ganesh-files.policies.sql:19-57` defines insert, select, update and delete policies whose entire condition is:

```sql
bucket_id = 'ganesh-files' and split_part(name, '/', 1) = 'pandals'
```

Firebase Auth is not a Supabase session, so every request from the app arrives as the `anon` role. The publishable key is inlined into the release bundle by Metro (`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, read at `lib/env.ts:39-42`, used at `lib/supabase.ts:12`) and is trivially extractable from the APK.

Anyone holding that key, with no account at all, can:
- `storage.list('pandals/…')` to enumerate every pandal's object paths, then `createSignedUrl` for any of them — full cross-tenant read of all expense receipts, contribution photos, sponsor and asset photos.
- Overwrite any pandal's receipt (`upsert: true` at `services/ganesh/storage/supabaseStorage.ts:30`).
- Delete every file in the bucket.

### Expected Behavior
An object under `pandals/{pandalId}/…` should be readable and writable only by an active member of that pandal.

### Evidence
- `supabase/ganesh-files.policies.sql:19-57` — all four policies
- `lib/supabase.ts:12`, `lib/env.ts:39-42` — key source
- `services/ganesh/storage/supabaseStorage.ts:25-40` — upload/signed-URL calls
- `services/ganesh/storage/storageAuth.ts`, `storagePaths.ts` — the client-side RBAC and path validation that this bypasses entirely
- The file's own header (`ganesh-files.policies.sql:9-12`) documents this as the accepted "Option A limitation until a backend mints signed uploads"

### Impact
- **Security:** complete, unauthenticated, cross-tenant loss of confidentiality and integrity for all Ganesh Seva financial evidence.
- **Data:** every receipt in the system can be destroyed by anyone with the APK.
- **User:** donors' and committee members' photographed documents are effectively public.

The application-layer checks in `storageAuth.ts` and `storagePaths.ts` are well written but are not on the attacker's path.

### Recommended Fix
The real fix requires a trusted server component, because Firebase Auth cannot be expressed in Supabase RLS. Two viable approaches:
1. A Supabase Edge Function that verifies the Firebase ID token, checks pandal membership against Firestore, and returns a short-lived signed upload/download URL. Revoke direct client access to the bucket entirely.
2. A backend that mints Supabase JWTs carrying a `pandal_ids` claim, and RLS policies that gate on `auth.jwt() -> 'pandal_ids'`.

Until one exists, treat the bucket as public and do not store anything sensitive in it. Also confirm the bucket's `public` flag is `false` in the dashboard — this is not asserted anywhere in the repo (see Unverified Items).

### Acceptance Criteria
- [ ] Reading an object under `pandals/{A}/…` with only the publishable key and no membership in pandal A is refused.
- [ ] Writing and deleting under another pandal's prefix is refused.
- [ ] Enumerating the bucket with the publishable key returns nothing.
- [ ] An active member of pandal A can still upload and view that pandal's receipts, assets, contribution and sponsor photos.
- [ ] The bucket's `public` flag is asserted `false` by an automated check or a documented deploy step.
- [ ] `supabase/ganesh-files.policies.sql` no longer grants `anon` any privilege.

### Progress - 2026-08-27 (STILL OPEN)
**Nothing has been deployed and nothing has been tested.** The hole is exactly as
described above. What exists now is a reviewable plan plus the two artifacts it needs:

- `docs/GANESH_STORAGE_LOCKDOWN.md` - ordered runbook, with the verification commands that
  constitute this ticket's acceptance criteria and an explicit rollback.
- `supabase/functions/ganesh-files/index.ts` - the trusted broker (approach 1 from the
  Recommended Fix). It takes the caller's Firebase ID token and reads
  `pandals/{pandalId}/members/{uid}` from the Firestore REST API **as that caller**, so
  Firestore verifies the token and applies the Ganesh rules; only then does it use the
  Supabase service-role key to mint a short-lived signed URL. That indirection is what
  removes the need for a Firebase service account inside the function, and avoids keeping a
  second copy of the permission model. Bytes never pass through the function - uploads go
  straight to Storage on a signed upload URL.
- `supabase/ganesh-files.policies.locked.sql` - drops all four policies and creates none.
  With RLS on and no policy, `anon` can do nothing; signed URLs still work because Storage
  validates those outside RLS.

**The client change is deliberately not written.** `supabaseStorage.ts` must route its three
functions through the Edge Function, but applying that before the function is live would
break every photo feature on the next build. It is Step 4 of the runbook.

**Ordering is the whole risk.** Locking the policies is Step 5, after a build that calls the
function is in users' hands. There is no ordering in which old APKs keep working after
lockdown - they call Storage directly, which is precisely what gets revoked. The runbook
states the choice plainly: lock now and accept an outage, or stay exposed until the build
ships.

**GS-036 can be closed independently and immediately** - Step 1 sets the bucket's own file
size limit and allowed MIME types, which are enforced only on the client today. It rejects
nothing the app already accepts.

### Progress - 2026-08-27, later the same day (deployed, awaiting a release build)
All the infrastructure steps from the runbook above have now actually been run against the
live project, in this order:

1. `ganesh-files` Edge Function deployed and confirmed `ACTIVE` (`supabase functions list`).
   Smoke-tested with an unauthenticated request, which correctly returned `401`.
2. **The locked-down policies were applied to production** - `ganesh-files.policies.sql` now
   drops all four `anon`/`authenticated` grants and creates none, and this has been run in
   the live Supabase SQL editor, not just written to a file.
3. `services/ganesh/storage/supabaseStorage.ts` now routes `uploadObject`,
   `createObjectSignedUrl` and `removeObject` through the Edge Function with the caller's
   Firebase ID token, matching what the function expects.

**This happened out of the runbook's stated order.** The runbook is explicit that step 2
(locking the policies) must come after step 3 (the client change) ships in a build users
have installed - otherwise every photo feature breaks in the live app the moment the
policies are locked, because the anon key the installed app is using now has zero grants.
That gap existed in production from when the SQL was applied until this commit landed.

The client fix (commit `1d51b4e`) has NOT yet reached any installed device. **The exposure
is closed; the outage is only closed once a release build ships and is installed.** Until
then every photo upload, view and delete fails in the live app for every user.

**Verified so far:** typecheck and typecheck:shared clean, full suite green
(125 files / 1270 tests), and one unauthenticated smoke test against the deployed function.
**Not verified:** the authenticated path - upload, download, delete as a real signed-in
member - has not been exercised against the live function from a device or an emulator.
That needs `curl` with a real Firebase ID token, or a build, before this ticket can be
called fixed.

### Dependencies
Blocks GS-036, GS-069, GS-096.

---

## GS-002 — Open-join self-create accepts an arbitrary `permissions` array

**Severity:** CRITICAL
**Category:** RBAC
**Feature:** Pandal membership
**Status:** FIXED — DEPLOYED 2026-09-03 (2026-08-26)

### Problem
The Firestore rule that lets a user create their own member document when a pandal has `joinMode: 'open'` constrains `memberId`, `userId`, `status` and `role` — but places no constraint at all on `permissions` or `roleIds`. The `permissions` array on the member document is exactly what the rules read to authorize every subsequent action.

### Current Behavior
`firestore.rules:594-615`:

```
allow create: if signedIn() && (
  ( memberId == request.auth.uid
    && request.resource.data.userId == request.auth.uid
    && request.resource.data.status == 'active'
    && ( (role == 'admin' && pandalAfter().ownerId == request.auth.uid)
      || (role == 'member' && pandalAfter().joinMode == 'open') ) )
  || ( canManageMembers() && role in [...] ) )
```

and the authorization helper that reads the result, `firestore.rules:265-273`:

```
function hasPermOf(pandalId, perm) {
  return isActivePandalMemberOf(pandalId) && (
    ganeshRoleOf(pandalId) == 'admin'
    || (hasPermissionsField(pandalId) && perm in ganeshMemberDoc(pandalId).data.permissions));
}
```

The honest client writes the built-in member permission set (`services/ganesh/ganeshWrites.ts:391-405`). A crafted client, or a direct Firebase SDK call, writes `role: 'member'` with `permissions: [<every permission key>]` and the rule accepts it.

The attacker then holds everything gated by `hasPermOf` — which is everything except `canManageMembersOf`: `permanentFund.transfer`/`.add`, `festival.update`/`.close`/`.create`, `openingFunds.create`, `expenses.create`/`.void`, `contributions.receive`/`.cancel`, `reimbursements.create`, `assets.dispose`/`.manage`, all `sponsors.*`, festival `categories` writes, plus read of `memberAudits` and festival `auditLogs`.

### Expected Behavior
A self-created member document must not be able to name its own privileges. The permission set must be derived from the role, not accepted from the client.

### Evidence
- `firestore.rules:594-615` — the create rule
- `firestore.rules:265-273` — `hasPermOf` trusting the array
- `services/ganesh/ganeshWrites.ts:380-414` — the legitimate write path
- `app/(ganesh)/admin/settings.tsx:105-107` → `services/ganesh/ganeshWrites.ts:532-561` — `joinMode: 'open'` is a normal admin toggle
- Target pandal ids are freely enumerable via GS-003

### Impact
- **Security:** full financial control of any pandal with open join mode, obtainable by any signed-in user with no approval step.
- **Financial correctness:** the attacker can move the Permanent Fund, close the festival, and void expenses.
- **Data:** complete read of the ledger and donor PII.

### Recommended Fix
On the self-create branch, pin the payload: require `request.resource.data.roleIds == ['member']` and either forbid the `permissions` key entirely or require it to equal the built-in member set. Better still, remove client self-create and route open-join through an auto-approved join request handled by the same admin-gated path, so `permissions` is only ever written by a privileged writer.

### Acceptance Criteria
- [ ] A self-created member document containing a `permissions` array wider than the built-in `member` set is rejected.
- [ ] A self-created member document containing `roleIds` other than `['member']` is rejected.
- [ ] Joining an open pandal through the app still works and yields exactly the built-in member permissions.
- [ ] A rules-emulator test covers the escalation attempt (see GS-074).

### Resolution — 2026-08-26
`firestore.rules` now pins the open-join self-create payload. A new top-level
`builtinMemberPermissions()` mirrors `expandPermissions(ROLE_PERMISSIONS.member)`, and
`selfJoinClaimsNoExtraPower()` in the `members/{memberId}` block requires that any
`permissions` array on the self-create is `hasOnly(builtinMemberPermissions())` and any
`roleIds` array is `hasOnly(['member'])`. The predicate is attached only to the
`role == 'member' && joinMode == 'open'` branch, so the founder's own admin self-create
(which legitimately writes `ALL_GANESH_PERMISSIONS`) is untouched.

A member document that omits `permissions` entirely is still accepted — with no
`permissions` field, `hasPermOf` falls through to the role-name fallback, which for
`member` is exactly the built-in set. So the escalation is closed from both directions.

**Verified:** `firebase deploy --only firestore:rules --dry-run` compiles clean.
`shared/utils/ganeshPermissions.rules.contract.test.ts` gained a `GS-002` block covering
the honest payload, a widened `permissions` array, a widened `roleIds` array, the
approval-only pandal, and the founder admin path — plus a drift test asserting the rules
literal still equals `expandPermissions(ROLE_PERMISSIONS.member)`.

**Not verified:** no emulator executes the rules (GS-074 is still open). The contract test
is a hand-written mirror.

### Dependencies
Enabled by GS-003. Related to GS-016.

---

## GS-003 — `pandalInvites` is listable by any signed-in user

**Severity:** CRITICAL
**Category:** SECURITY
**Feature:** Pandal membership
**Status:** FIXED — DEPLOYED 2026-09-03 (2026-08-26)

### Problem
`pandalInvites` is a flat top-level collection keyed by the join code. Its read rule is `allow read: if signedIn()`, and in Firestore `read` covers `list` as well as `get`. Any authenticated account can enumerate the entire collection.

### Current Behavior
`firestore.rules:481-482`:

```
match /pandalInvites/{code} {
  allow read: if signedIn();
```

Each document holds `{pandalId, name, joinMode, createdBy}` (`services/ganesh/ganeshWrites.ts:274-280`). A throwaway phone-OTP account created from the Ganesh login screen can list every pandal's id, display name and join code in the project.

Because the join code is only four characters generated with `Math.random()` (`shared/utils/ganeshIdentity.ts:3-11`), it was never a strong secret — but enumeration removes the guessing step entirely.

### Expected Behavior
A join code is a bearer secret held by the person invited. It should be fetchable by id and never enumerable.

### Evidence
- `firestore.rules:481-482`
- `services/ganesh/ganeshWrites.ts:274-280` — stored fields
- `shared/utils/ganeshIdentity.ts:3-11` — code generation
- `services/ganesh/ganeshWrites.ts:380-388` — the code is the only thing needed to reach a pandal

### Impact
- **Security:** full directory disclosure of every pandal. Directly supplies the target list for GS-002, converting a theoretical escalation into a practical one.
- **User:** enables mass join-request spam against every committee (GS-042).

### Recommended Fix
Split the grant:

```
allow get: if signedIn();
allow list: if false;
```

The person holding an invite already knows the code and reads the document by id, so nothing legitimate breaks.

### Acceptance Criteria
- [ ] A `getDocs` over `pandalInvites` is refused for every caller.
- [ ] `getDoc(doc(db, "pandalInvites", <known code>))` still succeeds for a signed-in user.
- [ ] Join-by-code continues to work end to end.
- [ ] A rules-emulator test asserts the collection cannot be listed.

### Resolution — 2026-08-26
`firestore.rules` splits the grant exactly as recommended:

```
allow get: if signedIn();
allow list: if false;
```

**Verified:** every `pandalInvites` access in the codebase is by document id
(`doc(db, "pandalInvites", code)` at `services/ganesh/ganeshWrites.ts:274, 549, 590`) —
grepped across `app/`, `components/`, `hooks/`, `services/`, `lib/` and `shared/`. There is
no `getDocs`/`query` against the collection, so join-by-code and the unique-code check both
still work. Rules compile clean.

### Dependencies
Blocks GS-002 and GS-042.

---

## GS-104 - Legacy members could not record money: the summary rule exceeded Firestore's 1000-expression budget

**Severity:** CRITICAL
**Category:** SECURITY
**Feature:** Security Rules
**Status:** FIXED - 2026-09-04, DEPLOYED

### Problem
Writing the festival `summary` document exhausted Firestore's cap of 1000
expressions per rule evaluation for any member whose document predates the
denormalized `permissions` array. Firestore reports an overrun as
`PERMISSION_DENIED`, so it is indistinguishable from an authorization failure -
by the client, by the logs, and by every hand-written mirror test in this repo.

Because `bumpSummary` writes the summary **in the same batch** as the ledger
row, and Firestore batches are atomic, the whole money write failed. A legacy
treasurer or collector could not record a collection, an expense or a
contribution at all.

### Current Behavior (before the fix)
`summary` was governed by the festival-subcollection wildcard, so a summary
write evaluated:

- `canWriteFestivalSubcol()` - walking ~10 subcollection branches before
  reaching its own, each branch a permission check
- all nine sub-predicates of `payloadWellFormed()`, eight of which cannot apply
  to a summary
- `expenseCreateAllowed()`, `contributionCreateAllowed()`,
  `contributionNotBornCancelled()`, `sponsorshipCreateAllowed()`

Each permission check has two paths: cheap when the member carries a
`permissions` array, and an expensive role-plus-role-document fallback when it
does not. On the fallback path the total went over 1000.

Measured in the emulator (`firestore/ganeshSummaryBudget.rules.test.ts`):

| member shape | ledger row | summary |
| --- | --- | --- |
| has `permissions` array | accepted | accepted |
| legacy treasurer, no `permissions` | accepted | **refused - budget** |
| legacy collector, no `permissions` | accepted | **refused - budget** |
| legacy admin, no `permissions` | accepted | accepted |

### Why it went unnoticed
The last row. An owner-admin exercising the app sees every money flow work,
because the admin predicate short-circuits before the expensive fallbacks. The
failure only reaches a non-admin committee member on a legacy Pandal - who has
no way to distinguish it from "you don't have permission".

It is also invisible to this repo's other rules tests by construction: they are
TypeScript mirrors of the rules, and a mirror has no notion of an evaluation
budget. This was found within minutes of the emulator harness existing
(GS-074), and it is the second defect a mirror passed that the real engine
rejects - GS-084 was the first.

### Fix
`summaryWriteAllowed()` added to `firestore.rules`, reached through a ternary on
`allow create` and a dedicated `allow update` guarded on `subcol == 'summary'`
so it genuinely short-circuits. A summary write now evaluates three checks:
`pandalNotArchived()`, `summaryWellFormed()` and
`canWriteLedgerSideEffect() || canCreateFestival()`.

`festivalOpen()` is kept so a settled year stays settled (GS-018). The
`createdBy` identity clause is skipped because `summaryWellFormed()`'s key
allowlist does not admit that field - a summary never carries one. The
non-summary rule now tests `subcol != 'summary'` first so it bails before doing
any document reads.

Deployed to `expenseapp-27f94`.

### Verification
`npm run test:rules` - 26 tests. The four that reproduced this now assert the
fix, and three guard the obvious ways to over-correct: a viewer with no money
permission is still refused, a summary field outside the allowlist is still
refused, and a plausible-but-wrong value is still accepted (GS-004's recorded
residual gap, asserted so it cannot change silently).

Unit suite unaffected: 1505 tests pass, `tsc` clean.

### Follow-up
This is the ceiling GS-004's remaining field allowlist would have to fit under.
Headroom on the *other* subcollections has not been measured; the emulator log
still shows overruns on the non-summary rules for some evaluations, which
succeed only because rule matches OR together and the cheap summary rule grants
first. Measuring per-subcollection headroom is the prerequisite for GS-004, and
is now possible.

### Dependencies
Found by GS-074. Blocks GS-004.

---

## GS-004 — Festival subcollections have no payload validation; the `summary` document is forgeable

**Severity:** CRITICAL
**Category:** SECURITY
**Feature:** Security Rules
**Status:** PARTIAL — DEPLOYED 2026-09-03 (2026-08-26)

### Problem
The wildcard rule governing every festival subcollection checks membership, festival status and role/permission — and nothing whatsoever about the document being written. There is no `keys().hasOnly(...)`, no type check, and no range check anywhere in the Ganesh section of the rules.

### Current Behavior
`firestore.rules:826-852`. The only `hasOnly` in the entire file is at line 184 (for `splitShareClaims`) and line 650 (asset dispose). Consequences reachable by any active member holding `collections.create` — which the built-in `collector` role has:

- Write `collections` / `expenses` / `reimbursements` with `amount: -50000`, `amount: "x"`, `amount: 1e300`, or no `amount` field at all.
- Attach arbitrary extra fields to any ledger document.
- **Write directly to the `summary` document.** `subcol == 'summary'` is classified as a ledger side-effect (`firestore.rules:737-738`), so a member can set `godFundExpenses: 0` or `chanda: 9999999`. The summary is the sole input to `availableGodFund()` and therefore to every displayed balance, the settlement calculation, and the God Fund spend check.

### Expected Behavior
Each subcollection should accept only a known field set with correct types and ranges — the discipline already applied to `splitShareClaims` elsewhere in the same file.

### Evidence
- `firestore.rules:723-854` — the wildcard match
- `firestore.rules:737-738` — `summary` treated as a writable side-effect
- `firestore.rules:182-199` — the validation pattern that exists for `splitShareClaims` and was not applied here
- `shared/utils/ganeshMath.ts:15-33` — `availableGodFund` consuming the forgeable summary
- `hooks/useGaneshSummary.ts:23` — every screen reads this document

### Impact
- **Financial correctness:** any member can fabricate the pandal's entire displayed financial position, and unblock God Fund spending by inflating the balance.
- **Data:** the ledger accepts negative, non-numeric and malformed amounts, which then propagate into every aggregate.
- **Security:** the permission model is enforced but the data model is not, so a low-privilege role becomes financially destructive.

### Recommended Fix
Add per-subcollection validation functions to the wildcard branch: `request.resource.data.keys().hasOnly([...])` plus `amount is number && amount >= 0`, status enums, and date-format checks. Handle `summary` separately — either restrict it to `increment`-shaped writes, or move summary maintenance to a trusted server and deny all client writes.

### Acceptance Criteria
- [ ] A collection, expense or reimbursement with a negative, non-numeric or missing `amount` is rejected.
- [ ] A ledger document containing unknown fields is rejected.
- [ ] A direct client write to the `summary` document that is not an expected increment is rejected.
- [ ] Status fields only accept their declared enum values.
- [ ] All existing legitimate write paths still succeed (covered by emulator tests, GS-074).

### Resolution — 2026-08-26 (PARTIAL)
**Done — value validation.** The festival-subcollection wildcard now runs
`payloadWellFormed()` on both `create` and `update`:

- `amountsWellFormed()` — every money field (`amount`, `totalAmount`, `godFundAmount`,
  `personalAmount`, `sponsoredAmount`, `estimatedValue`, `expectedAmount`,
  `collectedAmount`, `contributionTarget`) must be `is number`, `>= 0` and `<= 1e9`
  (₹100 crore, four-plus orders of magnitude above any real figure, chosen to reject
  overflow-shaped values like `1e300`). Derived per-member counters
  (`contributionPaid`, `personalExpenses`, `reimbursed`, `pendingReimbursement`) are
  type- and magnitude-bounded but deliberately **not** floored at zero — GS-009 drives
  them negative today, and a floor would wedge an already-drifted member document with
  permission-denied on every later edit.
- `statusWellFormed()` — `status` is checked against the real enum per subcollection:
  contributions `promised|received|cancelled`, sponsorships
  `prospective|promised|confirmed|received|cancelled`, households
  `pending|partial|paid|not_interested|not_available`.
- `flagsWellFormed()` — `voided is bool`, `date is string`, and `fundTransfers.direction`
  in `to_permanent|from_permanent`.
- `summaryWellFormed()` — the `summary` document is now `keys().hasOnly(...)` the fifteen
  `EMPTY_GANESH_SUMMARY` fields plus `updatedAt`, with each field range-checked
  (`pendingReimbursements` signed, per above). This covers all three writers: the
  `bumpSummary` merge-increments, the festival seed, and `recomputeFestivalSummary`.

**Not done — unknown-field rejection.** Acceptance criterion 2 ("a ledger document
containing unknown fields is rejected") is *not* implemented for the ledger
subcollections. A `keys().hasOnly(...)` allowlist would have to enumerate the union of
every create payload and every partial `updateDoc` across ~30 write sites in
`ganeshWrites.ts`, `ganeshSponsors.ts` and `ganeshPermanentFund.ts`. Missing one optional
field silently breaks a user flow in production, and — per the deploy note at the top of
this file — the fix cycle is a manual deploy. This ticket's own Dependencies line already
says it should land with GS-074; that is the right sequencing and it has not changed.

**Residual gap — summary forgery.** The key allowlist and range checks stop negative,
non-numeric, overflow and stray-field writes, but a member who may write a ledger
side-effect can still write a *plausible* wrong number (`chanda: 9999999`). Closing that
needs server-side summary maintenance, which is out of scope for a rules-only change. A
comment in `firestore.rules` records this so the next reader does not mistake the
allowlist for full protection.

**Verified:** rules compile clean; a `GS-004` block in
`shared/utils/ganeshPermissions.rules.contract.test.ts` mirrors `payloadWellFormed()` and
covers the honest collection payload, negative/string/overflow amounts, each status enum,
the malformed flags, and both accepted and forged summary writes. Full suite green
(125 files / 1236 tests).

### Dependencies
Related to GS-041. Should land with GS-074 so the coverage is provable.


### Resolution (2026-09-04)
Still PARTIAL, but the blocker is now measured rather than assumed - and it is
not the one this ticket has been carrying.

**The remaining acceptance criterion may not be reachable in rules at all.** The
emulator harness built for GS-074 shows the festival-subcollection rule is
already at Firestore's ceiling of 1000 expressions per evaluation for some
writers. A `keys().hasOnly(...)` allowlist can only add expressions. Adding one
across 13 subcollections would push writers that currently pass over the limit,
and an overrun surfaces as `PERMISSION_DENIED` - indistinguishable from an
authorization failure, on a rules file deployed by hand to a Firebase project
that also serves production. The earlier note called this sequencing; it is
closer to a hard constraint.

That was not a hypothetical: the summary path was **already over** the limit for
legacy members. See GS-104, found and fixed today.

**Progress that does help.** Routing `summary` through its own short-circuited
predicate rather than the full wildcard removed ~10 permission branches, eight
irrelevant `payloadWellFormed()` sub-predicates and four `*Allowed()` calls from
that path. The summary document is now the one place with a tight,
purpose-built rule - which is also where forgery mattered most.

**The design that would make an allowlist safe, when it is attempted.** Use
`hasOnly` on **create** only, and on update use
`request.resource.data.diff(resource.data).affectedKeys().hasOnly(...)`. On an
update, `request.resource.data` is the whole post-write document, so a plain
`hasOnly` would reject any edit to an older document still carrying a
since-removed field - wedging real records permanently. `affectedKeys()` checks
only what the write touches. This is worth recording because it is the
non-obvious half of the fix.

**Residual gap unchanged:** a member who may write a ledger side-effect can
still write a *plausible* wrong number (`chanda: 9999999`). That needs
server-side summary maintenance, not a rules change. The emulator suite asserts
this is still accepted, so the day it stops being true the test fails and this
ticket gets revisited.
---

## GS-005 — `fundTransfers` and `auditLogs` are mutable and deletable via the wildcard match

**Severity:** CRITICAL
**Category:** SECURITY
**Feature:** Audit Trail
**Status:** FIXED — DEPLOYED 2026-09-03 (2026-08-26)

### Problem
Firestore ORs all matching rules — a more specific `match` block cannot remove a grant made by a wildcard. The explicit `allow update, delete: if false` on `fundTransfers` is therefore dead code, and the festival `auditLogs` collection is writable and deletable.

### Current Behavior
`firestore.rules:713-721` declares:

```
match /fundTransfers/{docId} { allow update, delete: if false; }
match /auditLogs/{auditId}   { allow read: if canCloseOrUpdateFestival(); }
```

but `firestore.rules:723-854` then matches the same paths via `match /{subcol}/{docId}` and grants `update` (for `fundTransfers`, when `canWritePermanentFund()`) and `delete` (when `canCloseOrUpdateFestival()`).

For `auditLogs`, `canWriteFestivalSubcol()` maps the collection to `canWriteLedgerSideEffect()`, which is true for any member holding `collections.create` — the built-in `member` **and `collector`** roles. Audit documents carry no `createdBy`, so the identity check short-circuits via `!resource.data.keys().hasAny(['createdBy'])`.

The file already recognises this OR-semantics problem for reads — the comment at `firestore.rules:822-824` explains why the wildcard read must exclude `auditLogs` — but the same reasoning was not applied to writes.

### Expected Behavior
Fund transfers and audit logs are append-only. Compare `pandals/{id}/memberAudits` (`firestore.rules:633`) and `permanentFundTransactions` (`firestore.rules:646`), which correctly use `allow update, delete: if false` and are not shadowed by any wildcard.

### Evidence
- `firestore.rules:713-721` — the ineffective explicit rules
- `firestore.rules:723-740, 835-853` — the wildcard that overrides them
- `firestore.rules:822-824` — the comment proving the OR semantics were understood for reads
- `firestore.rules:633, 646` — the correct pattern used elsewhere

### Impact
- **Security:** the financial audit trail is not tamper-evident. A collector can silently rewrite any audit entry while the festival is open; a treasurer can delete them.
- **Financial correctness:** money movements between the Permanent Fund and a festival can be edited or erased after the fact.
- **Reliability:** every downstream investigation into a discrepancy is unreliable.

### Recommended Fix
Exclude `fundTransfers` and `auditLogs` from the wildcard's write grants — remove them from `canWriteFestivalSubcol()` for `update`, and exclude them from `allow delete`. Because an explicit match cannot subtract a grant, the exclusion must live in the wildcard itself.

### Acceptance Criteria
- [ ] Updating a `fundTransfers` document is refused for every role.
- [ ] Deleting a `fundTransfers` document is refused for every role.
- [ ] Updating or deleting a festival `auditLogs` document is refused for every role.
- [ ] Creating a `fundTransfers` document via a Permanent Fund transfer still succeeds.
- [ ] Ledger side-effects still append `auditLogs` entries normally.
- [ ] Emulator tests cover all six cases.

### Resolution — 2026-08-26
The exclusion is placed in the wildcard itself, since an explicit `match` cannot subtract a
grant. A new `isAppendOnlyLog()` returns true for `fundTransfers` and `auditLogs`, and the
wildcard's `allow update` and `allow delete` are both gated on `!isAppendOnlyLog()`.

`create` is intentionally left alone for both: `fundTransfers` keeps its explicit
`allow create: if canWritePermanentFund() && ganeshIdentityCreate()`, and festival
`auditLogs` must stay appendable by ledger writers via `canWriteLedgerSideEffect()`. The
read split is unchanged — the wildcard read still excludes `auditLogs`.

**Verified:** grepped `services/`, `hooks/` and `app/` — no client code updates or deletes
either collection, so nothing legitimate regresses. Rules compile clean. A `GS-005` block
in the contract test asserts update and delete are refused for admin, treasurer, member and
collector on both subcollections, while `collections` stays updatable by a collector and
deletable by a treasurer.

### Dependencies
Related to GS-021 (transfers write no audit at all) and GS-074.

---

## GS-006 — Every collection creates a new household; the merge path is unreachable

**Severity:** CRITICAL
**Category:** COLLECTIONS
**Feature:** Households
**Status:** FIXED (2026-08-27)

### Problem
`addCollection` supports adding a collection to an existing household, but no caller anywhere in the application ever passes a `householdId`. Every collection therefore mints a brand-new household document, and the entire partial-payment model is unreachable.

### Current Behavior
`services/ganesh/ganeshWrites.ts:923`:

```ts
const householdId = input.householdId || (input.createHousehold !== false ? newId() : undefined);
```

The "existing household, `increment(amount)`" branch at `services/ganesh/ganeshWrites.ts:953-966` fires only when `input.householdId` is supplied. The sole entry point, `app/(ganesh)/add-collection.tsx:48-63`, hard-codes `createHousehold: true` and never includes `householdId`.

The duplicate-detection dialog does not help: `possibleHouseholdDuplicates` (`shared/utils/ganeshMath.ts:351-367`) correctly matches on name, house number and mobile, but `DuplicateHouseholdDialog` (`components/ganesh/DuplicateHouseholdDialog.tsx:52-59`) offers only **Cancel** and **Continue**, and `onContinue` calls the same `save()` with the same duplicate-creating payload (`app/(ganesh)/add-collection.tsx:172`).

Concretely: house #12 pays ₹200 against a ₹500 target, producing household row A with status `partial`. The next week the same house pays ₹300, producing household row **B**, also `partial`. Neither ever reaches `paid`.

### Expected Behavior
Selecting an existing household — or choosing a match in the duplicate dialog — should route the collection into that household via `householdId`, incrementing its `collectedAmount` and re-deriving its status.

### Evidence
- `services/ganesh/ganeshWrites.ts:923` — id selection
- `services/ganesh/ganeshWrites.ts:947-989` — the unreachable merge branch
- `app/(ganesh)/add-collection.tsx:48-63` — payload with no `householdId`
- `app/(ganesh)/add-collection.tsx:172` — dialog Continue calls the same `save()`
- `components/ganesh/DuplicateHouseholdDialog.tsx:52-59` — only Cancel/Continue
- Verified by grep: no file in `app/`, `components/`, `hooks/` or `services/` passes `householdId` to `addCollection`

### Impact
- **User:** door-to-door chanda tracking is non-functional for any household that pays in instalments — the normal case.
- **Data:** the household count is really a collection count; `collectedAmount` is always a single payment.
- **Financial correctness:** cash totals are unaffected (collections are counted once), but every household-derived statistic is wrong — the "Paid / Pending" tiles on `app/(ganesh)/(tabs)/collections.tsx:70-71` and the pending count on `app/(ganesh)/admin/index.tsx:57,114`.

### Recommended Fix
Two coordinated changes:
1. Add a household picker to `add-collection.tsx` (search by name / house number / mobile) that sets `householdId` on the payload.
2. Give `DuplicateHouseholdDialog` a per-match "Add to this household" action that passes that household's id, keeping "Create new anyway" as the secondary path.

### Acceptance Criteria
- [ ] A second collection can be recorded against an existing household and increments its `collectedAmount`.
- [ ] A household reaches status `paid` once `collectedAmount >= expectedAmount`.
- [ ] The duplicate dialog offers "Add to this household" per match.
- [ ] Creating a genuinely new household is still possible.
- [ ] The Paid / Pending counts on the collections tab and the admin dashboard reflect real households.

### Resolution - 2026-08-27
The service-side merge branch in `addCollection` was always correct - it increments
`collectedAmount` and re-derives the status, and `deriveHouseholdStatus` only pins
`not_interested` / `not_available`, so `partial -> paid` works. The whole bug was that no
caller ever passed a `householdId`. Two places now do:

1. **A household picker on `add-collection.tsx`.** Search by name, house number or mobile
   (two characters minimum, capped at six results). Choosing a match sets `householdId`,
   prefills any identifying field the user has left blank, and swaps the search box for a
   card showing what that household has collected so far, with a "Record as a new household
   instead" escape. Submitting with a household chosen skips the duplicate dialog - an
   explicit choice is already an answer to that question.
2. **The duplicate dialog offers merge per match.** `DuplicateHouseholdDialog` now lists
   every match with its progress and an "Add to this household" primary action, and
   demotes duplicate creation to a secondary "Create new anyway". Previously its only
   actions were Cancel and Continue, and Continue re-ran the same duplicate-creating save.

A test walks the ticket's own scenario - a house paying 200 then 300 against a 500 target -
through `pending -> partial -> paid`, alongside the two-separate-rows case that stays stuck
on `partial`, so the regression is locked in rather than only fixed.

**Verified:** typecheck and typecheck:shared clean; 125 files / 1270 tests pass.

**Not verified by a test:** the picker and dialog are UI, exercised by the manual guide
rather than by a rendering test - the project has no component-test setup.

### Dependencies
Related to GS-028 (the same dialog), GS-038 and GS-026.

---

## GS-007 — A festival can be closed on an unloaded ₹0 summary

**Severity:** CRITICAL
**Category:** FESTIVAL
**Feature:** Festival Settlement
**Status:** FIXED (2026-08-27)

### Problem
The settlement screen reads the festival summary without consulting its loading state, computes a closing balance of ₹0 from the empty initial value, and allows the user to confirm the close. The server never re-validates the closing amount.

### Current Behavior
`app/(ganesh)/close-festival.tsx:33,40`:

```ts
const { summary } = useGaneshSummary(pandalId, festivalId);   // loading discarded
const closing = availableGodFund(summary);                     // 0 while loading
```

`useGaneshSummary` initialises to `EMPTY_GANESH_SUMMARY` (all zeros, `shared/types/ganesh.ts:554-570`) and only clears `loading` on the first snapshot. With `closing === 0` and the default `transferText === "0"`, `validateSettlement({closing: 0, transfer: 0, remaining: 0})` passes (`app/(ganesh)/close-festival.tsx:53-57`), the Save button is enabled (`disabled={closing < 0}`, line 143), and `writes.closeFestival({transferAmount: 0, …})` runs.

`services/ganesh/ganeshWrites.ts:2006-2017` then sets `status: "closed"` **without re-reading the summary server-side**. The client's `closing` figure is never validated by anything.

### Expected Behavior
The settlement action must be unavailable until the summary snapshot has arrived, and the server should re-derive the closing balance rather than trusting the client.

### Evidence
- `app/(ganesh)/close-festival.tsx:33,40,50-76,143`
- `hooks/useGaneshSummary.ts:11-13` — zero-initialised state
- `shared/types/ganesh.ts:554-570` — `EMPTY_GANESH_SUMMARY`
- `services/ganesh/ganeshWrites.ts:2006-2017` — close with no server-side validation
- `firestore.rules:826-834` — every festival-subcollection create requires `festivalOpen()`, so the close is effectively irreversible from the app

### Impact
- **Financial correctness:** the festival is recorded as settled with "Closing cash ₹0" and nothing is transferred to the Permanent Fund. The real closing cash is stranded with no settlement record.
- **Data:** irreversible. Once closed, the rules block every new ledger entry, so the year cannot be corrected in-app.
- **User:** the screen's own copy at line 109 warns "Closing with a deficit is not a settlement", but the zero case — the dangerous one — has no equivalent guard.

### Recommended Fix
Gate the whole screen on `loading` from `useGaneshSummary` and disable the confirm button until the first snapshot arrives. Additionally, re-read the summary inside the close transaction server-side and reject a settlement whose client-supplied closing balance disagrees.

### Acceptance Criteria
- [ ] The settlement screen shows a loading state until the summary has loaded; the confirm button is disabled throughout.
- [ ] Closing a festival with a non-zero real balance and a ₹0 client figure is rejected.
- [ ] The closing figure used by the server is derived server-side, not accepted from the client.
- [ ] A normal settlement with a correct transfer still succeeds.
- [ ] The screen surfaces a load error instead of rendering zeros.

### Resolution - 2026-08-27
Fixed on both sides, because either alone leaves the hole open.

**Client.** `useGaneshSummary` now exposes `error` and `retry` via the existing
`useLoadFailure` helper - its snapshot error callback previously discarded the
`LoadFailure` it was handed and only cleared `loading`, so a failed listener was
indistinguishable from a festival with no money. `close-festival.tsx` renders an
`AdminQueryState` skeleton while the summary is unresolved and an error state with retry if
the listener fails, so no figure is shown until it is real. The confirm button stays
disabled until then, and `confirm()` re-checks rather than trusting the disabled prop,
because the action is irreversible.

**Server.** The zero-transfer close path did not read the summary at all - it just flipped
the status in a batch. It now runs in a `runTransaction` that re-reads the festival and the
summary, derives the closing balance itself, and compares it against the `remainingAmount`
the client claims. The client no longer gets to assert the balance; it states what it
expects to leave behind and the server checks that.

That distinction matters: transferring nothing is a legitimate settlement when the
committee wants the balance to stay with the festival, so the check cannot simply be
"reject a zero transfer when the balance is non-zero". An unloaded screen claims
`remaining: 0` against a real balance and is rejected; a deliberate keep-it-here claims
`remaining: 50000` and passes. The comparison routes through `validateSettlement`, the same
function the screen uses, so there is one definition of a balanced settlement.

The transaction also refuses a festival that is already closed, and the audit entry now
records the balance left behind rather than nothing. The non-zero transfer path was already
safe - `transferFestivalToPermanent` re-derives the closing balance inside its own
transaction.

**Verified:** typecheck and typecheck:shared clean; 4 new cases in
`shared/utils/ganeshMath.test.ts` covering the unloaded-zero rejection, the deliberate
keep-in-festival, an genuinely empty festival, and a full transfer. Full suite green
(125 files / 1270 tests).

### Dependencies
Related to GS-032 (the same missing-loading-state class), GS-022, GS-021.

---

## GS-008 — Reimbursement cap is client-supplied and there is no God Fund solvency check

**Severity:** CRITICAL
**Category:** FINANCE
**Feature:** Reimbursements
**Status:** FIXED (2026-08-27)

### Problem
`addReimbursement` validates the amount only against a ceiling passed in by the caller, re-reads nothing, runs no transaction, and — unlike `addExpense` — never checks that the God Fund can actually cover the payout. The rules validate nothing.

### Current Behavior
`services/ganesh/ganeshWrites.ts:1783-1842` validates `amount <= input.pendingPersonalExpense` using `validateReimbursement` (`shared/utils/ganeshMath.ts:138-151`). That ceiling comes straight from a locally cached member document at `app/(ganesh)/add-reimbursement.tsx:106-113`. The member document is never re-read and never read inside a transaction, and `pendingReimbursement: increment(-amount)` (`services/ganesh/ganeshWrites.ts:1825`) has no floor.

There is no `validateGodFundSpend` call on this path, even though `availableGodFund()` subtracts reimbursements (`shared/utils/ganeshMath.ts:30`) — so a reimbursement is a real cash outflow that is never checked against available cash.

On the rules side, `reimbursements` falls through the generic `canWriteFestivalSubcol()` branch (`firestore.rules:729`), which checks permission only — no amount, no cap, no balance.

### Expected Behavior
The pending-personal ceiling must be read server-side inside a transaction, and the payout must additionally be checked against the available God Fund, the way expense creation is.

### Evidence
- `services/ganesh/ganeshWrites.ts:1783-1842` — the write path
- `shared/utils/ganeshMath.ts:138-151` — `validateReimbursement`
- `app/(ganesh)/add-reimbursement.tsx:106-113` — client-supplied ceiling
- `services/ganesh/ganeshWrites.ts:1440-1448` — the God Fund check that expenses do and reimbursements do not
- `firestore.rules:729` — no server-side validation

### Impact
- **Financial correctness:** the God Fund can be driven negative through reimbursements with no warning anywhere.
- **Data:** two treasurers reimbursing the same member concurrently both pass their local check and both commit — over-reimbursement is reachable with the stock UI, not just a modified client.
- **User:** a member can be paid more than they are owed, and the ledger will not say so.

### Recommended Fix
Wrap the reimbursement in `runTransaction`: read the festival member document and the summary document inside the transaction, re-derive `pendingPersonalExpense` and `availableGodFund` from what was read, validate both, then write. Follow the pattern already used correctly in `services/ganesh/ganeshPermanentFund.ts:376-386`.

### Acceptance Criteria
- [ ] A reimbursement larger than the member's server-side pending personal amount is rejected.
- [ ] A reimbursement larger than the available God Fund is rejected.
- [ ] Two concurrent reimbursements for the same member cannot jointly exceed the pending amount.
- [ ] `pendingReimbursement` never goes below zero.
- [ ] Partial and full reimbursements still work.

### Resolution - 2026-08-27
`addReimbursement` now runs entirely inside `runTransaction`, mirroring
`transferFestivalToPermanent`. Inside the transaction it reads the festival member
document and the summary document (all reads first - a Firestore transaction refuses a
read after a write), then applies two checks the old path did not have:

1. **Server-read ceiling.** `validateReimbursement` is re-run against
   `pendingReimbursement` as read in the transaction. `input.pendingPersonalExpense` is
   still checked up front so the user gets the friendly copy immediately, but it no longer
   authorizes anything - two treasurers reimbursing the same member concurrently now force
   a transaction retry, and the second is rejected against the updated figure.
2. **God Fund solvency.** A reimbursement is cash leaving the fund, so it clears the same
   check an expense does. Routed through `validateGodFundSpend` rather than a local
   comparison, so the rounding stays the one central formula (see GS-080), and raised as
   `InsufficientFundError("festival", ...)` for the clearer message.

`pendingReimbursement` cannot go below zero on this path because the ceiling is the pending
amount itself; the reversal direction is GS-009, fixed alongside.

Transactions need a server, so `useGaneshWrites.addReimbursement` gates on connectivity
first via `assertReimbursementOnline` and says why, instead of hanging the save button or
queueing a write that can never commit. Same shape as the existing
`assertPermanentFundOnline` and `assertMoneyReceiveOnline` gates.

**Trade-off:** reimbursement is no longer an offline action, and the save now waits for a
real commit rather than `commitWrite`'s 1500 ms "durably queued" window, so it can feel
slower on a poor connection. That is the cost of the balance check being real.

**Verified:** typecheck and typecheck:shared clean; 125 files / 1244 tests pass. New
coverage in `shared/utils/ganeshContributions.test.ts` for the offline gate.

**Not verified:** the concurrency behaviour itself is a property of `runTransaction` and is
not exercised by a test - there is no emulator (GS-074).

### Dependencies
Shares a root cause pattern with GS-010. Related to GS-009 and GS-024.

---

## GS-009 — `pendingReimbursements` goes negative when a reimbursed expense is voided

**Severity:** CRITICAL
**Category:** FINANCE
**Feature:** Reimbursements
**Status:** FIXED (2026-08-27)

### Problem
`pendingReimbursements` is maintained as an unclamped running counter by the incremental write path, while the rebuild path defines it as `max(0, personalMoneyUsed - reimbursements)`. Voiding an expense whose personal portion was already reimbursed drives the counter negative and permanently blocks the member from any future reimbursement.

### Current Behavior
The rebuild defines it correctly at `shared/utils/ganeshMath.ts:334`:

```ts
pendingReimbursements: money(Math.max(0, personalMoneyUsed - reimbursed)),
```

The incremental path does not clamp — increments at `services/ganesh/ganeshWrites.ts:1497, 1638, 1728, 1819, 1945, 1963`.

Reproduction:
1. Record an expense with `personalAmount: 1000` → pending = 1000.
2. Reimburse 1000 → pending = 0.
3. Void the expense — `services/ganesh/ganeshWrites.ts:1942-1948` subtracts `personalAmount` again → **pending = −1000**, while `reimbursements` stays 1000 and `personalMoneyUsed` returns to 0.

Consequences:
- A negative "Pending reimbursement" renders on `app/(ganesh)/(tabs)/index.tsx:102`, `(tabs)/expenses.tsx:151` and `close-festival.tsx:102`.
- The member document goes to `pendingReimbursement: -1000` (`services/ganesh/ganeshWrites.ts:1954`), shown raw at `app/(ganesh)/add-reimbursement.tsx:71`. `validateReimbursement` then rejects **every** future reimbursement to that member, because any positive amount exceeds −1000.
- `availableGodFund` is still reduced by the orphaned ₹1000 with no offsetting `personalMoneyUsed`.
- Pressing "Recalculate from ledger" silently changes the number, because the two definitions disagree.

### Expected Behavior
Voiding an expense whose personal portion has been reimbursed should either be refused, or should reverse the reimbursement in the same operation. The counter must be clamped consistently with `summarizeLedger`.

### Evidence
- `services/ganesh/ganeshWrites.ts:1942-1948, 1954, 1963` — the void path
- `shared/utils/ganeshMath.ts:334` — the conflicting rebuild definition
- `shared/utils/ganeshMath.ts:138-151` — the validator that then blocks the member
- `app/(ganesh)/add-reimbursement.tsx:71` — negative value shown to the user

### Impact
- **Financial correctness:** the God Fund is permanently understated by the orphaned reimbursement, and two authoritative sources disagree about the same figure.
- **Data:** the member's financial record is corrupted in a way no in-app action can repair (the recompute does not rebuild member counters — GS-024).
- **User:** the member can never be reimbursed again.

### Recommended Fix
In `voidFinancialRecord`, detect that the expense's personal portion has been reimbursed and refuse the void with a clear message ("Reverse the reimbursement first"), or reverse both atomically. Independently, clamp the incremental counter at zero so the two definitions agree.

### Acceptance Criteria
- [ ] Voiding an expense whose personal portion is fully or partly reimbursed is either refused with a clear message or reverses the reimbursement atomically.
- [ ] `summary.pendingReimbursements` can never be negative.
- [ ] `FestivalMember.pendingReimbursement` can never be negative.
- [ ] After the scenario above, "Recalculate from ledger" produces the same figures as the incremental path.
- [ ] The affected member can still be reimbursed for genuine outstanding amounts.

### Resolution - 2026-08-27
Reimbursements are not linked to a specific expense - a festival member document carries
only `personalExpenses` and `reimbursed` - so "has this expense's personal portion been
reimbursed?" is not directly answerable. What is answerable, and equivalent, is whether the
reversal exceeds what is still outstanding: `pendingReimbursement` **is**
`personalExpenses - reimbursed` for that member, so a reversal larger than it can only mean
the money has already been paid back.

New `validateReimbursementReversal(reversal, pending)` in `shared/utils/ganeshMath.ts`
encodes that, next to the validators it has to agree with, and is applied at both places
that shrink a personal portion:

- **`voidFinancialRecord`** re-reads the member document and refuses the void, naming the
  amount that has to be un-reimbursed first.
- **`updateExpenseAmounts`** does the same inside its transaction whenever `personalDelta`
  is negative.

This takes the ticket's first option ("refused with a clear message") rather than the
atomic-reversal option, because reversing a reimbursement the user did not ask to reverse
would silently move money in the ledger; naming the blocking record keeps the correction
explicit.

Because every path that decrements the counter is now guarded, the incremental figure and
`summarizeLedger`'s `max(0, personalMoneyUsed - reimbursed)` no longer disagree - a test
asserts exactly that against a rebuilt summary, so "Recalculate from ledger" is a no-op on
this figure instead of silently changing it.

**Residual gap:** the void path's check is a plain read, not a transaction, so a void racing
a reimbursement for the same member could still interleave. `addReimbursement` and
`updateExpenseAmounts` are transactional; making the whole void transactional is a larger
change and is not done here. The deterministic bug - the one reproducible in the ticket's
own three steps - is closed.

Separately, the Firestore rules deliberately do **not** floor these counters at zero (see
the GS-004 resolution): a member document already drifted negative by this bug in
production must stay editable so it can be repaired.

**Verified:** 5 new cases in `shared/utils/ganeshMath.test.ts`, including agreement with
`summarizeLedger` and float-dust tolerance. Full suite green (125 files / 1244 tests).

### Dependencies
Related to GS-008, GS-019, GS-024, GS-012.

---

## GS-010 — God Fund overspend: balance checked by a non-transactional cached read

**Severity:** HIGH
**Category:** FINANCE
**Feature:** Expenses
**Status:** FIXED (2026-08-27)

### Problem
Before spending from the God Fund, the service reads the summary document with a plain `getDoc`, validates in JavaScript, then commits an unconditional `increment()` in a separate batch. There is no transaction, no write precondition, and no rules-level balance check.

### Current Behavior
`services/ganesh/ganeshWrites.ts:1440-1448` (`addExpense`), `1561-1569` (`addAssetPurchase`), `1701-1709` (`updateExpenseAmounts`):

```ts
const summarySnap = await getDoc(pathRef(db, summaryDoc(pandalId, festivalId)));
const spendOk = validateGodFundSpend(input.godFundAmount, availableGodFund(summary));
if (!spendOk.ok) throw new Error(spendOk.error);
// … later, in a separate writeBatch:
bumpSummary(batch, …, { godFundExpenses: input.godFundAmount, … });
```

Two treasurers each spending ₹40,000 against a ₹50,000 balance both pass the check; both increments land; the balance goes to −₹30,000. Offline the problem is worse: `getDoc` resolves from the persistent local cache, so the check runs against a possibly hours-stale balance, and `commitWrite` reports the write as queued after its 1500 ms grace window (`lib/firestoreWrite.ts:56-90`).

The Permanent Fund does this correctly — `services/ganesh/ganeshPermanentFund.ts:376-386` reads the summary *inside* `runTransaction`, and `useGaneshWrites` gates it with `assertPermanentFundOnline`. God Fund spending received neither guard.

### Expected Behavior
The balance check and the write must be atomic, and offline God Fund spending should be gated the way money receipt already is.

### Evidence
- `services/ganesh/ganeshWrites.ts:1440-1448, 1561-1569, 1701-1709`
- `services/ganesh/ganeshPermanentFund.ts:376-386` — the correct pattern
- `hooks/useGaneshWrites.ts:261-288` — no online gate
- `shared/utils/ganeshContributions.ts:145-150` — `assertMoneyReceiveOnline`, applied to receipts but not spends
- `firestore.rules:826-834` — no balance validation server-side

### Impact
- **Financial correctness:** the God Fund silently goes negative, which then feeds the closing balance and the settlement transfer.
- **Data:** two committee members working offline for a day can each spend the full fund.
- **Reliability:** this is the reconciliation-safety gap for the festival ledger.

### Recommended Fix
Move the God Fund check into a `runTransaction` that reads the summary document, mirroring `transferFestivalToPermanent`. Add an `assertMoneyReceiveOnline`-style online gate to `addExpense`, `addAssetPurchase` and `updateExpenseAmounts`.

### Acceptance Criteria
- [ ] Two concurrent God Fund expenses cannot jointly exceed the available balance.
- [ ] An offline God Fund spend is either refused with a clear message or validated on reconnect.
- [ ] `summary.godFundExpenses` cannot drive `availableGodFund` below zero.
- [ ] Personal-money and sponsored expenses (which use no God Fund) are unaffected.
- [ ] Normal online expense creation still works.

### Resolution - 2026-08-27
All three spend sites - `addExpense`, `addAssetPurchase` and `updateExpenseAmounts` - now
read the summary **inside** a `runTransaction` and validate there, so two treasurers
spending against the same balance force a retry instead of both passing the same stale
check.

The split is deliberate and matches the ticket's fourth acceptance criterion:

- **Spends God Fund** (`godFundAmount > 0`, or `godDelta > 0` on an edit) -> transaction.
- **Personal money or sponsor only** -> unchanged `writeBatch` + `commitWrite`, so it still
  works offline and still reports "offline, will sync".

To make that possible without duplicating the write bodies, each function now builds its
appends once as a closure over a `GaneshWriter` - a new type in
`services/ganesh/ganeshWriter.ts` covering the `set` / `update` shape that `WriteBatch` and
`Transaction` share. `audit`, `activity`, `bumpSummary` and the sponsor/asset `append*`
helpers were retyped to it; both Firestore classes are structurally assignable, so no call
site changed. The type's doc comment records *why* a path picks one or the other, so the
next reader does not "simplify" a transaction back into a batch.

Offline is gated at the hook via `assertGodFundSpendOnline(isOnline, godFundAmount)`, which
is a no-op when the God Fund share is zero. On `updateExpenseAmounts` the hook cannot see
the old amount, so it gates on any God Fund share - slightly stricter than the service,
which only opens a transaction when the share actually grows.

**Trade-off:** a God Fund expense now waits for a real commit rather than `commitWrite`'s
1500 ms grace window, so it can feel slower on a poor connection, and it cannot be recorded
offline at all. Both are the cost of the balance check being real.

**Still missing:** there is no rules-level balance check, so this is a client guarantee
only - a crafted client can still write the increment directly. That is GS-004's residual
summary gap and needs server-side summary maintenance.

**Verified:** typecheck and typecheck:shared clean; 125 files / 1244 tests pass;
offline-gate cases added to `shared/utils/ganeshContributions.test.ts`.

**Not verified:** the concurrency behaviour is a property of `runTransaction` and is not
exercised by a test - there is no emulator (GS-074).

### Dependencies
Shares the root pattern with GS-008. Related to GS-004 (no rules-level check).

---

## GS-011 — Payment method is not tracked end to end; cash cannot be reconciled

**Severity:** HIGH
**Category:** FINANCE
**Feature:** Cash / UPI / Bank
**Status:** FIXED — verified 2026-09-03

### Problem
Payment method is captured on some money flows, stored in a free-text field on another, and entirely absent from expenses. No screen anywhere shows a festival Cash/UPI/Bank split, and none could be built from the data as modelled.

### Current Behavior

| Flow | Payment method stored? |
| --- | --- |
| Collections | Yes — `services/ganesh/ganeshWrites.ts:934` |
| Reimbursements | Yes — `services/ganesh/ganeshWrites.ts:1806` |
| Contributions received via detail screen | Yes — `services/ganesh/ganeshWrites.ts:1294` |
| Sponsor cash | Yes — `services/ganesh/ganeshSponsors.ts:258` |
| **Committee member payments** | **No** — the method string is written into the free-text `description` field, `app/(ganesh)/add-member-payment.tsx:139` |
| **Contributions created directly** | **No** — `add-contribution.tsx` has no method picker for `kind: "money"`; `addContribution` never writes `paymentMethod` |
| **Expenses** | **No** — `GaneshExpense` (`shared/types/ganesh.ts:470-492`) has no `paymentMethod` field at all |
| **Opening funds** | `sourceType` only (`services/ganesh/ganeshWrites.ts:871`), never aggregated |

`GaneshSummary` has no cash/upi/bank fields. `FundLocationChips` is Permanent-Fund-only. The one place the four-way split is displayed is `components/ganesh/PermanentFundCard.tsx:50-53`, and even there `fund.total` is maintained independently of the four parts by `applyPermanentFundDelta` (`shared/utils/ganeshMath.ts:197-221`) with **no invariant check that `total === cash + upi + bank + other`** and no recompute path for the Permanent Fund.

### Expected Behavior
Every cash movement carries a structured location, and `Cash + UPI + Bank + Other` reconciles to the displayed total wherever a total is shown.

### Evidence
See the table above; plus `shared/types/ganesh.ts:340-357` (`GaneshSummary` has no location fields) and `shared/utils/ganeshMath.ts:197-221` (no invariant check).

### Impact
- **Financial correctness:** the committee cannot answer "how much cash is in the box versus the bank" — the core question at a chanda handover.
- **Data:** once `PermanentFundSummary.total` and its four parts diverge (legacy document, partial write, console edit), nothing detects or repairs it.
- **User:** blocks Cash Reconciliation (GS-075) and Daily Collection Sessions (GS-076) entirely.

### Recommended Fix
Add a structured `paymentMethod` / `fundLocation` to `GaneshExpense` and to the contribution and committee-payment write paths. Add per-location fields to `GaneshSummary` and maintain them with the same `increment` discipline. Add an invariant check and a repair path for `PermanentFundSummary`.

### Acceptance Criteria
- [ ] Every money-in and money-out record stores a structured payment method.
- [ ] Committee payments no longer encode the method in `description`.
- [ ] A festival-level Cash / UPI / Bank breakdown is displayed and equals the festival total.
- [ ] `PermanentFundSummary.total` is asserted equal to the sum of its parts, with a repair path if it is not.
- [ ] Existing records without a method are handled without breaking the totals.

### Dependencies
Blocks GS-075, GS-076. Related to GS-078.

---

## GS-012 — `recomputeFestivalSummary` truncates at 2000 documents and clobbers concurrent writes

**Severity:** HIGH
**Category:** FIRESTORE
**Feature:** Reports
**Status:** FIXED — verified 2026-09-03

### Problem
The designated ledger-repair tool reads each collection with a hard `limit(2000)`, computes totals from whatever it got, and then overwrites the summary document wholesale with a non-merging `set()` outside any transaction.

### Current Behavior
`services/ganesh/ganeshWrites.ts:2025-2026`:

```ts
const load = async (name) =>
  getDocs(query(colRef(db, festivalCol(pandalId, festivalId, name)), limit(2000)));
```

and `services/ganesh/ganeshWrites.ts:2076-2080` writes the result with `summaryBatch.set(...)` — a full overwrite, no merge, no transaction.

Two distinct failures:
1. **Silent truncation.** On a festival with more than 2000 collections, the tool rewrites the summary from a partial ledger and reports "Totals recalculated". Money vanishes behind a success toast.
2. **Lost updates.** Any ledger write that commits during the multi-second recompute is erased from the summary, because the normal write path uses `increment()` with merge (`services/ganesh/ganeshWrites.ts:200-215`) while the recompute overwrites absolutely.

It is reachable from a plain button with no confirmation and no busy lock (`app/(ganesh)/report.tsx:126`, see GS-031 and GS-062-class double-submit in GS-027).

### Expected Behavior
The rebuild should paginate to completion, run atomically with respect to concurrent ledger writes, and refuse rather than write a partial result.

### Evidence
- `services/ganesh/ganeshWrites.ts:2020-2081`
- `services/ganesh/ganeshWrites.ts:200-215` — the incremental writer it conflicts with
- `app/(ganesh)/report.tsx:126` — the trigger

### Impact
- **Financial correctness:** the tool intended to *fix* a drifted summary can destroy a correct one and replace it with an understated one.
- **Data:** the failure is silent and the operation is destructive — worse than not offering the button.
- **Reliability:** concurrent writes during a recompute are lost.

### Recommended Fix
Paginate with `startAfter` until each collection is exhausted, or detect that a cap was hit and refuse with an error. Perform the final write inside a transaction, or move the rebuild to a trusted server. Add a confirmation dialog and a busy lock to the trigger.

### Acceptance Criteria
- [ ] A festival with more than 2000 documents in any collection is rebuilt correctly, or the operation fails loudly.
- [ ] A ledger write committed during a rebuild is not lost.
- [ ] The trigger has a confirmation dialog and cannot be double-submitted.
- [ ] A failed rebuild surfaces an error rather than a success toast.
- [ ] The rebuild writes an audit entry (see GS-053).

### Dependencies
Related to GS-013, GS-024, GS-053, GS-072.

---

## GS-013 — Report totals are computed from 400-document truncated lists

**Severity:** HIGH
**Category:** REPORTING
**Feature:** Reports
**Status:** FIXED — verified 2026-09-03

### Problem
The festival report renders authoritative-looking financial figures computed client-side over lists that are silently capped at 400 documents, on the same screen as correct summary-backed figures.

### Current Behavior
`app/(ganesh)/report.tsx:35-42` runs `summarizeContributions(contributions)`, `summarizeSponsorships(sponsorships)`, `breakdownSponsors(...)` and `summarizeAssets(assets)` over arrays produced by hooks with hard caps: `hooks/useContributions.ts:18` (400), `hooks/useSponsorships.ts:18` (400), `hooks/usePandalAssets.ts:13` (400). `hooks/useOpeningFunds.ts:13` caps at 100.

The first `MetricGrid` on that screen reads the summary document and is correct; the second reads the truncated lists and is not. They will disagree, on the same screen, with no indication why.

### Expected Behavior
Displayed financial figures should come from the server-maintained summary, or be paginated to completion, or be explicitly labelled as a partial view.

### Evidence
- `app/(ganesh)/report.tsx:35-42, 82, 95, 118`
- `app/(ganesh)/admin/reports.tsx:33-42`
- `hooks/useContributions.ts:18`, `hooks/useSponsorships.ts:18`, `hooks/usePandalAssets.ts:13`, `hooks/useOpeningFunds.ts:13`
- `hooks/useGaneshSummary.ts` — the authoritative source that the top grid correctly uses

### Impact
- **Financial correctness:** a festival with more than 400 contributions or sponsorships prints understated cash figures with no warning.
- **User:** two contradictory numbers on one screen destroys trust in the report, which is the document the committee presents to donors.

### Recommended Fix
Drive every report figure from the summary document where one exists. For genuinely list-derived breakdowns (per-sponsor rows), paginate to completion or show an explicit "showing the most recent 400" notice.

### Acceptance Criteria
- [ ] No report figure is derived from a truncated list without an explicit notice.
- [ ] The two metric grids on `report.tsx` agree for a festival with more than 400 contributions.
- [ ] The per-sponsor breakdown either covers all sponsorships or states that it does not.

### Dependencies
Related to GS-012, GS-032, GS-051.

---

## GS-014 — `pandalAfter().adminCount` is dereferenced unguarded; legacy pandals are frozen

**Severity:** HIGH
**Category:** RBAC
**Feature:** Admin
**Status:** FIXED — DEPLOYED 2026-09-03; backfill verified unnecessary, 0 of 3 pandals disagreed (originally 2026-08-27)

### Problem
`currentAdminCount()` defensively handles a missing `adminCount` field; `keepsAdminCount()` does not. On any pandal document that predates the field, reading `pandalAfter().adminCount` produces an evaluation error and **every** member update is denied — including the migration paths that would repair it.

### Current Behavior
`firestore.rules:557-561` is careful:

```
return pandalData().keys().hasAny(['adminCount']) && pandalData().adminCount is number
  ? pandalData().adminCount : 1;
```

`firestore.rules:579-586` is not — all three branches read `pandalAfter().adminCount` directly.

Three writers update a member document without touching the pandal document, so they cannot self-heal the missing field and hard-fail on such pandals:
1. `services/ganesh/ganeshRoles.ts:396-402` — `setMemberRoleIds` (role assignment).
2. `services/ganesh/ganeshRoles.ts:309-327` — `updatePandalRole` propagating new permissions to assigned members. The role write and every member write are in one batch, so **role editing stops working entirely**.
3. `services/ganesh/ganeshWrites.ts:474-488` — `decideJoinRequest` re-approving a previously removed or suspended person (a merge-set on an existing document is an update).

`adminCount` was introduced after the feature shipped (`git log`: added in `898b06f "feat(ganesh): add membership RBAC…"`, whereas the Ganesh feature landed in `ca26c92`). There is **no backfill anywhere** — grep for `adminCount` returns only the create at `services/ganesh/ganeshWrites.ts:270`, two transactional writers, and read sites.

Note: the hypothesis that *all* member writes are rejected is **false**. `updatePandalMember` (`services/ganesh/ganeshWrites.ts:657-670`) and `setPandalAdmin` (`services/ganesh/ganeshRoles.ts:471-482`) both write `adminCount` in the same batch, and their arithmetic matches the rule exactly. Last-admin protection is genuinely rule-enforced for those two paths.

### Expected Behavior
The `after` read should tolerate a missing field the same way the `before` read does, and existing pandal documents should be backfilled.

### Evidence
- `firestore.rules:557-561` (guarded) vs `579-586` (unguarded)
- `services/ganesh/ganeshRoles.ts:396-402`, `309-327`, `238-242`
- `services/ganesh/ganeshWrites.ts:474-488`, `270`, `657-670`
- `services/ganesh/ganeshRoles.ts:471-482`

**Status:** CONFIRMED as a rules defect. **LIKELY** in production data, depending on whether any pandal predates the field.

### Impact
- **User:** on affected pandals, role assignment, role permission editing and member re-approval all fail with a bare permission-denied and no recovery path in the app. This is a strong candidate for the reported "the app does not appear to be working".
- **Data:** the `ensurePandalRoles` migration batch is blocked by the same rule, so the feature cannot self-heal.

### Recommended Fix
Add a guarded accessor mirroring `currentAdminCount()`:

```
function afterAdminCount() {
  return pandalAfter().keys().hasAny(['adminCount']) && pandalAfter().adminCount is number
    ? pandalAfter().adminCount : 1;
}
```

and use it in all three branches. Run a one-off backfill setting `adminCount` on every existing pandal to its true active-admin count.

### Acceptance Criteria
- [ ] Role assignment succeeds on a pandal document with no `adminCount` field.
- [ ] Role permission editing succeeds on such a pandal.
- [ ] Re-approving a previously removed member succeeds on such a pandal.
- [ ] Last-admin protection still blocks demoting or removing the final admin.
- [ ] Every existing pandal has a correct `adminCount`.
- [ ] Emulator tests cover the missing-field case.

### Resolution - 2026-08-27
`firestore.rules` gains `afterAdminCount()`, mirroring the guard `currentAdminCount()`
already had, and all three branches of `keepsAdminCount()` now use it instead of reading
`pandalAfter().adminCount` directly. A pandal with no `adminCount` field reads as 1 rather
than producing an evaluation error, so the three writers that touch only a member document
- `setMemberRoleIds`, `updatePandalRole`'s permission propagation, and `decideJoinRequest`
re-approving a removed member - work again on such a pandal. Role editing in particular
was failing entirely, since the role write and every member write share one batch.

Last-admin protection is unchanged: demoting or removing the final admin still fails,
because the guard's arithmetic is untouched.

**Backfill written but NOT run.** `scripts/backfill-ganesh-admin-count.js` recounts active
admins per pandal and writes `adminCount` where the stored value disagrees, with a
`--dry-run` mode. It refuses to write a count of zero, which would lock a pandal out of
every member update. Running it touches production data, so that is your call - the rules
fix alone is enough to unfreeze the common case, because a pandal created with the field
has it, and a legacy one reads as 1 which is correct unless it has two or more active
admins.

**Verified:** rules compile via dry run; 4 new cases in
`shared/utils/ganeshPermissions.rules.contract.test.ts` covering the missing field, a
member write that does not touch the count, and both last-admin refusals.

**Not verified:** no emulator executes the rules (GS-074); the backfill script has not been
run against any project.

### Dependencies
Blocks GS-016 verification. Related to GS-015, GS-074.

---

## GS-015 — `adminCount` is unpinned on pandal update and bypassed on member create

**Severity:** HIGH
**Category:** RBAC
**Feature:** Admin
**Status:** FIXED — verified and DEPLOYED 2026-09-03 (originally 2026-08-27, PARTIAL)

### Problem
Two separate holes let `adminCount` desynchronise from the real number of active admins, which defeats the last-admin protection that depends on it.

### Current Behavior
**(a) Unpinned on pandal update.** `firestore.rules:553-556, 568`:

```
function keepsPandalCore() {
  return request.resource.data.ownerId == resource.data.ownerId
    && request.resource.data.code == resource.data.code;
}
allow update: if canManageMembers() && keepsPandalCore();
```

`adminCount` is not pinned. An admin can write `adminCount: 99` in one allowed update, then demote or remove every admin one at a time — `pandalAfter().adminCount >= 1` (line 582) stays satisfied all the way down to zero real admins.

**(b) Bypassed on member create.** `firestore.rules:611-614` permits `canManageMembers() && role in ['admin', …]` with **no** `keepsAdminCount()` clause. An admin can create a new member document with `role: 'admin', status: 'active'` without incrementing `adminCount`. The client blocks this (`services/ganesh/ganeshWrites.ts:453`), but a direct SDK call does not.

### Expected Behavior
`adminCount` should be mutable only as a side effect of an admin-role transition, and should always equal the number of active admins.

### Evidence
- `firestore.rules:553-556, 568` — unpinned update
- `firestore.rules:579-586` — the guard that depends on it
- `firestore.rules:611-614` — create with no count clause
- `services/ganesh/ganeshWrites.ts:453` — the client-only block

### Impact
- **Security:** a pandal can be left with **no** administrator. Since `ownerId` can never change and only an admin can create member documents, there is no in-app recovery path except the owner deleting the pandal (GS-017).
- **Data:** once desynced, the guard protects a count that no longer reflects reality — either locking out a legitimate demotion or permitting removal of the last real admin.

### Recommended Fix
Add `request.resource.data.adminCount == resource.data.adminCount` to `keepsPandalCore()`, so the counter can only move via the `getAfter`-coupled member-write path. Add `keepsAdminCount()` to the members create rule. Consider moving the counter server-side entirely.

### Acceptance Criteria
- [ ] A direct update to `pandals/{id}` that changes `adminCount` without a coupled member write is rejected.
- [ ] Creating a member document with `role: 'admin'` without incrementing `adminCount` is rejected.
- [ ] Promoting and demoting admins through the app still works and keeps the count correct.
- [ ] It is not possible to reach a state with zero active admins.

### Resolution - 2026-08-27 (PARTIAL)
**(b) Member create - fixed.** A new `createKeepsAdminCount()` is applied to the
`canManageMembers()` create branch: creating an active admin must move the counter, and
creating anyone else must leave it alone. It is deliberately NOT applied to the founder's
own self-create, which runs inside the batch that creates the pandal, where a `get()` on
the pandal document does not resolve.

**(a) Pandal update - bounded, not closed.** `keepsPandalCore()` now also requires
`adminCountDeltaBounded()`: the counter may move by at most one per update and may never
land below 1. That kills the one-shot `adminCount: 99` inflation described in the ticket.

It does **not** close the hole. A determined admin can still walk the counter up one
allowed update at a time and then demote every admin. The ticket's suggested fix - pinning
the field outright - cannot work as written, because the counter physically moves *through*
this same `allow update` rule when an admin is promoted or demoted, so pinning it would
break every legitimate admin transition. Closing it properly needs one of:

- the counter maintained server-side, outside client reach; or
- the pandal write naming the member whose transition justifies the delta, so the rule can
  verify it with `getAfter` on that member document.

The second is implementable but changes the document schema and both writers, and would
reject every admin change made by a client older than the rules deploy - a real hazard
given the manual deploy. Left for a deliberate decision rather than smuggled in here.

Worth weighing when scheduling: the actor in this attack is already a full admin acting
against their own pandal, and the outcome is a self-inflicted lockout rather than a breach.

**Verified:** rules compile via dry run; 4 new contract cases covering the create hole and
the bounded delta.

### Dependencies
Depends on GS-014 (fix the guarded accessor first). Related to GS-017.

---

## GS-016 — `members.*` and `roles.*` permissions are honoured by the UI and ignored by the rules

**Severity:** HIGH
**Category:** RBAC
**Feature:** Roles & Permissions
**Status:** FIXED — DEPLOYED 2026-09-03 (2026-08-27)

### Problem
The TypeScript permission matrix treats membership and role management as ordinary, grantable permissions, and the UI gates on them. The Firestore rules recognise only a literal `role == 'admin'`. Custom roles carrying these permissions are therefore decorative — the user sees the buttons and gets permission-denied.

### Current Behavior
`canManageMembersOf` (`firestore.rules:275-277`) is `role == 'admin'` only. Meanwhile the checklist offers every `members.*` and `roles.*` key (`shared/utils/ganeshPermissions.ts:68-73, 82-86`; `shared/utils/ganeshPermissionRegistry.ts:83-104`) and `hooks/useGaneshWrites.ts` gates on them.

| Permission | UI gate | Rule |
| --- | --- | --- |
| `members.approve` | `members.tsx:63`, `join-requests.tsx:65` | `firestore.rules:502` admin |
| `members.suspend` / `.remove` | `member/[id].tsx:258, 286` | `firestore.rules:616` admin |
| `members.assignRole`, `roles.assign` | `member/[id].tsx:217` | `firestore.rules:616` admin |
| `roles.create` / `.update` / `.delete` | `admin/roles/new.tsx:29`, `[id].tsx:127, 131` | `firestore.rules:625-627` admin |
| `settings.update` | `hooks/useGaneshWrites.ts:103` | `firestore.rules:568` admin |
| `audit.read` | `members.tsx:51-52` | `firestore.rules:631` — `canCloseOrUpdateFestival()`, i.e. `festival.update`/`.close` |

Two directions of breakage:
- **Broken feature.** An admin grants a "Committee Secretary" role `members.approve`. That user sees the Join requests button and the Approve/Reject actions, taps Approve, and gets a bare permission-denied toast.
- **Inverted `audit.read`.** A treasurer (or any role with `festival.update`) can read the full membership audit trail directly from the SDK even though the UI hides it for lacking `audit.read`. Conversely a role with `audit.read` but not `festival.update` sees the section render and the query fail.

Two related mismatches: `pandals/{id}/roles` read is `isActivePandalMember()` while the UI gates on `roles.read`; and `pandalJoinRequests` read is any active member (`firestore.rules:495-497`) while the UI gates on `members.approve` — so every member, including `viewer`, can list applicants' names and phone numbers from the SDK.

A related consequence: `festival.create` is honoured by `canCreateFestivalOf()` (`firestore.rules:345`) so the festival document write succeeds, but `createFestival`'s seed batch also writes `categories`, which requires `canCloseOrUpdateFestival()` (`firestore.rules:736`). A custom role with only `festival.create` produces a festival with no categories and no summary.

### Expected Behavior
The client permission model and the rules must agree. Either the rules honour these permissions, or the UI stops offering them.

### Evidence
See the table above, plus `shared/utils/ganeshPermissionRegistry.ts:83-104` and `hooks/useGaneshWrites.ts:96, 103, 132, 452`.

### Impact
- **User:** the dynamic-roles feature — a headline capability — is silently non-functional across the entire members, roles and settings surface. Every non-admin grant fails at the server.
- **Security:** `audit.read` is inverted, over-exposing member audits to treasurers and under-exposing them to the role designed to read them.
- **Reliability:** fails closed, so this is a broken feature rather than a breach.

### Recommended Fix
Pick one direction and apply it consistently.
- *If the rules should honour them:* add `hasPermOf(pandalId, 'members.approve')`-style clauses to `canManageMembersOf` and the roles / join-request rules. This makes `members.assignRole` an escalation vector, so it needs an explicit guard: cannot grant admin, and cannot grant a permission the actor does not hold.
- *If they should stay admin-only:* remove the `members.*` / `roles.*` groups from `PERMISSION_GROUPS` and mark them admin-only in the checklist UI.

Either way, align `audit.read` so it gates `memberAudits` and festival `auditLogs` reads.

### Acceptance Criteria
- [ ] Every permission offered in the checklist either works end to end or is not offered.
- [ ] `audit.read` is the permission that gates audit reads, in both the UI and the rules.
- [ ] A custom role with `festival.create` can create a fully seeded festival, or is prevented from trying.
- [ ] No UI action results in a bare permission-denied for a permission the user was granted.
- [ ] `ganeshPermissions.rules.contract.test.ts` is updated to reflect the chosen direction.

### Resolution - 2026-08-27
Direction chosen: **keep these areas admin-only and stop offering them**, rather than
teaching the rules to honour them. Honouring them would have made `members.assignRole` an
escalation vector needing its own anti-escalation guard, with no emulator to prove it; and
because the mismatch fails closed, nobody loses a capability that works today.

**Checklist.** `shared/utils/ganeshPermissionRegistry.ts` splits the registry:
`PERMISSION_GROUPS` keeps only the grantable areas, and `members`, `roles` and `settings`
move to a new `ADMIN_ONLY_PERMISSION_GROUPS`. `ALL_PERMISSION_GROUPS` is the union, used by
`permissionLabel` and `groupedPermissionPreview` so an admin's own full set still renders
with proper labels. `PermissionChecklist` renders the grantable groups and then a
"Pandal Admins only" note naming the three reserved areas - silently omitting three
sections an admin might go looking for would have been its own bug.

An existing custom role that already carries, say, `members.approve` will drop it the next
time someone saves that role. That key never did anything, so this is the intended outcome.

**`audit.read` un-inverted.** New `canReadAuditOf()` gates `pandals/{id}/memberAudits` and
the festival `auditLogs` read on `audit.read`, with the usual role fallback for members
that carry no `permissions` array. Previously both were gated on
`canCloseOrUpdateFestival()`, i.e. `festival.update`/`.close`, which over-exposed the audit
trail to a role holding `festival.update` and under-exposed it to the role actually granted
`audit.read`.

**Join-request PII.** `pandalJoinRequests` read moves from any active member to
`canManageMembersOf()` (or the applicant themselves). Every member including `viewer` could
previously list applicants' names and phone numbers straight from the SDK.

**`festival.create` seeding.** `canWriteFestivalSubcol()` now also accepts
`canCreateFestival()` for `categories`, `summary`, `activity` and `auditLogs`, so the seed
batch that follows a festival create succeeds. A role holding only `festival.create`
previously produced a festival with no categories and no summary.

**Verified:** typecheck and typecheck:shared clean; rules compile via dry run; 4 new
contract cases assert no offered permission is one the rules gate on a literal admin role,
that the three reserved groups are exactly `members`/`roles`/`settings`, and that
`audit.read` is still offered. Full suite green (125 files / 1262 tests).

### Dependencies
Verification depends on GS-014. Related to GS-002, GS-073, GS-074.

---

## GS-017 — A removed founder keeps permanent delete rights; no ownership transfer exists

**Severity:** HIGH
**Category:** SECURITY
**Feature:** Pandal creation
**Status:** FIXED 2026-09-03 — AWAITING RULES DEPLOY

### Resolution (2026-09-03)

Confirmed live exactly as filed. `allow delete: if signedIn() &&
resource.data.ownerId == request.auth.uid` had no membership check, so a founder
suspended, removed or demoted months earlier could still destroy the pandal —
contradicting this file's own stated principle, "ACTIVE membership is the only
grant. ownerId / memberIds alone are not."

**Hard delete is now refused outright, not admin-gated.** Requiring an active
admin would have closed the reported hole, but a pandal delete can never be a
good outcome: Firestore does not cascade, so every subcollection survives while
the rules reaching them call `pandalData()` — a `get()` on the now-missing
parent — and therefore start denying. The records end up unreachable *and*
undeletable, and the money trail is gone irreversibly.

**Archive replaces it.** `setPandalArchived` sets `archived` / `archivedBy` /
`archivedAt` / `archiveReason`, following the `setSponsorArchived` convention
already in the codebase, and is reversible by any active admin. It refuses while
a festival is still open — an open festival may hold an unsettled balance, and
closing implicitly would bypass `closeFestival`'s balance acknowledgement.
`pandalNotArchived()` is ANDed into every write predicate so an archived pandal
is frozen; it is deliberately **not** folded into `hasPermOf`, which also backs
`canReadAuditOf`, because the committee must keep reading its own history and
audit trail. The pandal document's own `allow update` is left ungated so an
admin can restore.

**Ownership is transferable, admin to admin.** `keepsPandalCore()` now permits
`ownerId` to change onto an active admin of the same pandal. Gated on active
admin rather than on the current owner, deliberately: the situation this ticket
describes is a founder who is gone, so requiring their participation would make
ownership permanently unmovable in exactly the case that matters. `ownerId` no
longer authorizes anything — it is the record of who holds the pandal.

Client: `useFestivalWriteLock` folds the archive freeze in, so all seven write
screens refuse with the right reason instead of a bare permission error; a new
`pandal-custody` screen carries archive / restore / transfer; the setup picker
lists archived pandals separately rather than hiding them.

Scoped out deliberately: member and role writes stay available on an archived
pandal, so an admin can still fix membership before restoring. The freeze
covers the ledger, funds, assets and sponsors.

### Acceptance criteria

- [x] A removed or demoted founder cannot delete the pandal — nobody can.
- [x] An active admin can archive the pandal.
- [x] Ownership can be transferred to another active admin.
- [x] Deletion is replaced by an archive flag rather than cascading.

### Problem
`ownerId` is set at creation, can never change, and grants unconditional delete of the pandal — independent of membership status.

### Current Behavior
`firestore.rules:569`:

```
allow delete: if signedIn() && resource.data.ownerId == request.auth.uid;
```

`ownerId` is pinned immutable by `keepsPandalCore()` (`firestore.rules:554`) and there is no ownership-transfer code anywhere in `services/ganesh/`. A founder who is demoted via `setPandalAdmin` or removed via `updatePandalMember` retains the right to delete `pandals/{id}`, which orphans every subcollection (Firestore does not cascade) and drops the pandal out of every member's list (`hooks/usePandals.ts:53-56`).

### Expected Behavior
Deletion should require current active-admin status, and ownership should be transferable.

### Evidence
- `firestore.rules:569`, `554`
- `services/ganesh/ganeshWrites.ts` — no transfer function exists
- `hooks/usePandals.ts:53-56` — the effect on every member

### Impact
- **Security:** a removed committee member can destroy the entire pandal, including the Permanent Fund record and every festival's ledger.
- **Data:** irreversible and uncascaded — subcollection documents survive as unreachable orphans.

### Recommended Fix
Change the delete rule to require `canManageMembersOf(pandalId)` (active admin) in addition to, or instead of, ownership. Add an ownership-transfer path guarded by the current owner, and consider soft-archiving rather than hard delete.

### Acceptance Criteria
- [ ] A removed or demoted founder cannot delete the pandal.
- [ ] An active admin can archive or delete the pandal.
- [ ] Ownership can be transferred to another active admin.
- [ ] Deletion either cascades or is replaced by an archive flag.

### Dependencies
Related to GS-015, GS-083.

---

## GS-018 — Closed festivals remain mutable and hard-deletable

**Severity:** HIGH
**Category:** FIRESTORE
**Feature:** Festival Settlement
**Status:** FIXED — DEPLOYED 2026-09-03 (2026-08-27)

### Problem
The rules require `festivalOpen()` for creating ledger documents but not for updating or deleting them, so a treasurer can edit or hard-delete records in a festival whose books have been settled and closed.

### Current Behavior
`firestore.rules:846-853`. The second `update` branch is `canCloseOrUpdateFestival() && !(sponsorships && …)` with **no `festivalOpen()` guard**, and `allow delete: if canCloseOrUpdateFestival()` likewise.

So after settlement a treasurer can edit collections, expenses and the summary, and can **hard-delete** any ledger record — bypassing the entire soft-void-plus-audit design in `voidFinancialRecord` (`services/ganesh/ganeshWrites.ts:1844`).

### Expected Behavior
A closed festival should be read-only apart from an explicit, audited reopen action. Deletion of ledger records should never be permitted; voiding is the designed reversal.

### Evidence
- `firestore.rules:846-853`
- `firestore.rules:826-834` — the create path that *does* check `festivalOpen()`
- `services/ganesh/ganeshWrites.ts:1844-1874` — the soft-void design being bypassed

### Impact
- **Financial correctness:** the closing balance was computed and physically transferred at close time. Editing afterwards silently breaks the reconciliation between the closed festival and the Permanent Fund.
- **Data:** hard deletion leaves no audit trail at all.

### Recommended Fix
Add `festivalOpen()` to the `canCloseOrUpdateFestival()` update branch, and remove `allow delete` for ledger subcollections entirely (or scope it to admin plus an open festival). If reopening a festival is a legitimate need, model it explicitly and audit it.

### Acceptance Criteria
- [ ] Updating a ledger record in a closed festival is refused.
- [ ] Deleting a ledger record is refused for every role.
- [ ] Voiding remains the only reversal mechanism and remains audited.
- [ ] Closing a festival still works.

### Resolution - 2026-08-27
Two changes to the festival subcollection wildcard:

1. **`festivalOpen()` added to the closed-festival update branch.** That branch exists so an
   admin or treasurer can edit a document they did not create, bypassing
   `ganeshIdentityUpdate()`. It had no open-festival check, so a settled year stayed fully
   editable. Both update branches now require the festival to be open.
2. **`allow delete: if false`.** Voiding is the designed reversal - it is a soft flag, it is
   audited, and it reverses the summary. A hard delete does none of that. Nothing in the app
   deletes a festival subcollection document (categories are soft-disabled via a `disabled`
   flag, not removed), so no client path regresses.

Closing a festival still works: `transferFestivalToPermanent` writes its `fundTransfers`
row and summary increment inside the same transaction that flips the status, and
`festivalOpen()` reads the pre-transaction state.

One intended consequence: **"Recalculate from ledger" no longer works on a closed
festival**, because it updates the summary. That follows directly from the festival being
read-only, and is the behaviour the ticket asks for.

This also closes the rules half of **GS-019**, which was left as a client-only guarantee.

**Verified:** rules compile via dry run; 3 new contract cases covering refusal for every
role on a closed festival, the still-working admin/treasurer edit while open, and delete
being refused outright.

### Dependencies
Related to GS-019, GS-005, GS-022.

---

## GS-019 — `voidFinancialRecord` has no open-festival guard

**Severity:** HIGH
**Category:** FINANCE
**Feature:** Expenses
**Status:** FIXED (2026-08-27; rules gap closed by GS-018)

### Problem
Every other mutation path checks that the festival is open. The void path does not, and the rules do not backstop it (GS-018).

### Current Behavior
`services/ganesh/ganeshWrites.ts:1844-1874` contains no `requireOpenFestival` call, and the UI guard at `app/(ganesh)/expense/[id].tsx:57` checks only `!expense.voided`.

Note the asymmetry: `receiveContribution` (line 1275), `cancelContribution` (line 1339), `updatePromisedContribution` (line 1375) and `updateExpenseAmounts` (lines 1683-1686) all guard on an open festival. For the *create* paths the rule `allow create: if … festivalOpen()` provides a backstop; the void path is an *update*, and `firestore.rules:846-852` explicitly permits it when `canCloseOrUpdateFestival()` even if the festival is closed.

### Expected Behavior
Voiding should be refused on a closed festival, consistent with every other mutation.

### Evidence
- `services/ganesh/ganeshWrites.ts:1844-1874`
- `services/ganesh/ganeshWrites.ts:1275, 1339, 1375, 1683-1686` — the guards that exist elsewhere
- `firestore.rules:846-852`

### Impact
- **Financial correctness:** voiding an expense after settlement changes `godFundExpenses`, so the closed festival's `availableGodFund` becomes non-zero and no longer reconciles against the amount transferred to the Permanent Fund. Silent and irreversible.

### Recommended Fix
Add `await requireOpenFestival(db, pandalId, festivalId)` to `voidFinancialRecord`, and close the rules gap in GS-018.

### Acceptance Criteria
- [ ] Voiding any record in a closed festival is refused with a clear message.
- [ ] Voiding in an open festival still works and remains audited.
- [ ] The rules refuse the same write independently of the client.

### Resolution - 2026-08-27
`voidFinancialRecord` now calls `await requireOpenFestival(db, pandalId, festivalId)` before
anything else, matching `receiveContribution`, `cancelContribution`,
`updatePromisedContribution` and `updateExpenseAmounts`.

**The rules gap is unchanged.** A void is an `update`, and the festival wildcard still
permits updates on a closed festival for anyone who may close it (the
`canCloseOrUpdateFestival()` branch of `allow update` in `firestore.rules`). So this is a
client-side guarantee only, and the ticket's third acceptance criterion - "the rules refuse
the same write independently of the client" - is **not** met. That is GS-018, still open,
and this ticket stays flagged as partial until it lands.

**Verified:** typecheck clean, full suite green.

### Dependencies
Should land with GS-018. Related to GS-009.

---

## GS-020 — Voiding an asset purchase orphans the asset in inventory

**Severity:** HIGH
**Category:** ASSETS
**Feature:** Asset vs Expense
**Status:** FIXED 2026-09-03

### Problem
The void path reverses the financial side of an asset purchase but never touches the asset document it created, leaving a phantom asset in the pandal's permanent inventory.

### Current Behavior
`services/ganesh/ganeshWrites.ts:1938-1958` reverses `godFundExpenses`, `personalMoneyUsed`, `expenseCount` and `assetPurchaseAmount`, but performs no write to `pandals/{p}/assets/{data.assetId}` — no status change, no audit note, no unlink.

Void a ₹50,000 chair purchase entered by mistake and the cash is corrected, but 50 chairs remain "available" in the Pandal store forever with `acquisitionCost: 50000` counted in "Pandal estimated value" on both report screens, and `relatedExpenseId` still pointing at a voided expense — which `app/(ganesh)/asset/[id].tsx:188-199` renders as a live "Related expense" link.

### Expected Behavior
Voiding an asset-purchase expense should, in the same batch, mark the asset disposed or removed with the void reason, or at minimum write an `assetAudit` and clear the link.

### Evidence
- `services/ganesh/ganeshWrites.ts:1938-1958`
- `services/ganesh/ganeshWrites.ts:1525-1665` — `addAssetPurchase`, which correctly creates both in one batch
- `app/(ganesh)/asset/[id].tsx:188-199` — the stale link rendering

### Impact
- **Data:** permanent, silent inflation of the pandal's asset inventory with no trail.
- **Financial correctness:** "Pandal estimated value" overstates holdings indefinitely.

### Recommended Fix
Extend the expense branch of `voidFinancialRecord`: when `data.assetId` is present, add the asset status change and an `assetAudit` entry to the same batch.

### Acceptance Criteria
- [ ] Voiding an asset-purchase expense marks the linked asset disposed or removed in the same operation.
- [ ] An `assetAudit` entry records the reason.
- [ ] The asset no longer counts toward "Pandal estimated value".
- [ ] The asset detail screen no longer links to a voided expense as if it were live.
- [ ] Voiding a regular expense is unaffected.

### Dependencies
Related to GS-019, GS-018.

---

## GS-021 — Fund transfers and settlement closes write no audit entry

**Severity:** HIGH
**Category:** REPORTING
**Feature:** Audit Trail
**Status:** FIXED 2026-09-03

### Problem
The two highest-value operations in the application — moving money between the Permanent Fund and a festival, and closing a festival with a settlement transfer — leave no entry in the committee-facing audit trail. The audit screen renders and filters an action that nothing ever writes.

### Current Behavior
**(a) Transfers.** None of `transferPermanentToFestival` (`services/ganesh/ganeshPermanentFund.ts:244-347`), `transferFestivalToPermanent` (`349-457`), the donation path (`181-208`), the adjustment path (`210-242`) or the seed path (`131-179`) writes to `festivals/{f}/auditLogs` or any audit collection. They write only `permanentFundTransactions` plus an `activity` feed entry.

The `AuditAction` union declares `"transferred"` (`shared/types/ganesh.ts:66`) and `app/(ganesh)/admin/audit.tsx:62,117` renders and filters on it — but grep confirms **nothing in the codebase ever writes `action: "transferred"`**. The audit screen's "money" filter is permanently missing every fund movement.

**(b) Settlement close.** `services/ganesh/ganeshWrites.ts:1994-2005`: when `transferAmount > 0`, `closeFestival` delegates to `transferFestivalToPermanent(..., closeFestival: true)` and **returns early**, skipping the `audit(... "closed" ...)` call at line 2014. `transferFestivalToPermanent` closes the festival (`services/ganesh/ganeshPermanentFund.ts:443-454`), writes no audit, and even suppresses the activity entry (line 425).

So the zero-transfer close is audited and the settlement close — the common case, reached from `app/(ganesh)/close-festival.tsx:64-66` — is not.

### Expected Behavior
Every fund movement and every festival close writes an audit entry with actor, amount, direction and reason.

### Evidence
- `services/ganesh/ganeshPermanentFund.ts:131-179, 181-208, 210-242, 244-347, 349-457, 425, 443-454`
- `services/ganesh/ganeshWrites.ts:1994-2005, 2014`
- `shared/types/ganesh.ts:66`, `app/(ganesh)/admin/audit.tsx:62, 117`

The presence of dead rendering code for `"transferred"` indicates the omission was unintentional.

### Impact
- **Financial correctness:** money movements between the Permanent Fund and festivals are unauditable.
- **Data:** the year-end close — the most consequential state change in the product — is invisible in the audit log precisely when money moved.
- **User:** a committee cannot answer "who moved this money and when" from the app.

### Recommended Fix
Add `audit(...)` writes with `action: "transferred"` inside each Permanent Fund transaction, and add the `"closed"` audit to the settlement-close path before the early return (or inside `transferFestivalToPermanent` when `closeFestival` is set).

### Acceptance Criteria
- [ ] Every Permanent Fund seed, donation, adjustment and transfer writes an audit entry.
- [ ] Closing a festival writes a `"closed"` audit entry whether or not a transfer occurred.
- [ ] The audit screen's "money" filter shows fund movements.
- [ ] Audit entries record actor, amount, direction and reason.

### Dependencies
Related to GS-005 (audit entries must also be immutable), GS-052, GS-053.

---

## GS-022 — Money left in a closed festival disappears from every total

**Severity:** HIGH
**Category:** FINANCE
**Feature:** Festival Settlement
**Status:** FIXED 2026-09-03

### Resolution (2026-09-03)

Took the aggregate option, not the forced-transfer one. Requiring
`transferAmount == closing` would have removed a deliberate feature - the
settlement screen offers keeping the balance on purpose - and would not have
touched festivals already closed with a residue, failing this ticket's own third
criterion.

`closedFestivalResidue()` and `totalPandalFunds()` in `ganeshMath.ts` derive the
figure from the summaries rather than storing it, so festivals closed long
before this existed are counted with no migration. A negative closing balance is
clamped at zero: that is drift, not cash, and summing it would quietly net real
money away.

Surfaced as "What the Pandal holds" on the Permanent Fund screen - Permanent
Fund + this festival + left in closed festivals + total, with the residue line
appearing only when there is one. The per-festival history rows gained the
closing balance they were missing; the ticket noted they showed Collected and
Spent but never the number in question.

The close confirmation now names the consequence and where to find the money, so
leaving it behind is a deliberate choice rather than a silent one.

**Note:** the ticket's `index.tsx:92` reference was stale. The Ganesh redesign
removed the combined "Total Pandal funds" figure from the dashboard, which now
shows the active festival only.

### Acceptance criteria

- [x] Closed-festival residue is visible in a Pandal-level total.
- [x] That total accounts for every rupee: fund + active festival + residue.
- [x] Historical closed festivals are handled - the figure is derived, not stored.

### Problem
A festival can be closed with a positive, untransferred balance. That cash is real, but it then appears in no pandal-level aggregate anywhere in the application.

### Current Behavior
`app/(ganesh)/close-festival.tsx:134-136` explicitly offers "0 to keep the closing balance in this festival", and `services/ganesh/ganeshWrites.ts:2006-2017` closes with no balance check. `createFestival` (`services/ganesh/ganeshWrites.ts:722-726`) then seeds the next festival with `EMPTY_GANESH_SUMMARY`.

The dashboard's "Total Pandal funds" is `fund.total + godFund` for the **active** festival only (`app/(ganesh)/(tabs)/index.tsx:92`). The only place the residue is visible at all is the per-festival history list on `app/(ganesh)/permanent-fund.tsx:105-118`, and that shows Collected and Spent — not the closing balance.

### Expected Behavior
Either the settlement forces a full transfer, or the pandal-level total includes the residue held in closed festivals.

### Evidence
- `app/(ganesh)/close-festival.tsx:134-136`
- `services/ganesh/ganeshWrites.ts:2006-2017, 722-726`
- `app/(ganesh)/(tabs)/index.tsx:92`
- `app/(ganesh)/permanent-fund.tsx:105-118`

### Impact
- **Financial correctness:** the pandal's stated total funds understate reality by the sum of all closed-festival residues.
- **User:** money that physically exists cannot be found in the app.

### Recommended Fix
Either require `transferAmount == closing` at settlement (making "keep it in the festival" impossible), or add a pandal-level aggregate over closed-festival balances and surface it alongside the Permanent Fund on the dashboard.

### Acceptance Criteria
- [ ] Closed-festival residue is either impossible or visible in the pandal-level total.
- [ ] The dashboard "Total Pandal funds" figure accounts for every rupee the pandal holds.
- [ ] Historical closed festivals with a residue are handled, not just new ones.

### Dependencies
Related to GS-007, GS-021.

---

## GS-023 — Transfer in and transfer out resolve different festivals

**Severity:** HIGH
**Category:** PERMANENT_FUND
**Feature:** Fund Transfers
**Status:** FIXED 2026-09-03

### Problem
The Permanent Fund screen passes one festival id to "Use for festival" while the write hook resolves a different one from the session, so with more than one open festival the two directions can act on different festivals.

### Current Behavior
`app/(ganesh)/permanent-fund.tsx:126` passes `openFestivals[0]?.id` to the "Use for festival" action, but `hooks/useGaneshWrites.ts:392` (`transferFestivalToPermanent`) uses `requireFestival()` — the **session** `festivalId`.

If the session festival is not `openFestivals[0]`, money leaves the Permanent Fund into festival A while "Return from festival" pulls it back out of festival B, and the settlement validator will approve it if B has a balance.

### Expected Behavior
Both directions resolve the festival identically, and the UI names the festival it is about to debit or credit.

### Evidence
- `app/(ganesh)/permanent-fund.tsx:126`
- `hooks/useGaneshWrites.ts:392`
- `services/ganesh/ganeshPermanentFund.ts:244-347, 349-457`

### Impact
- **Financial correctness:** a transfer can credit one festival and debit another, corrupting both ledgers while the Permanent Fund total stays plausible.
- **User:** no indication which festival is affected.

### Recommended Fix
Use a single resolution path for both directions — preferably the session festival — and display the resolved festival name on the confirmation before the transfer commits.

### Acceptance Criteria
- [ ] Both transfer directions operate on the same festival.
- [ ] The UI names the affected festival before the user confirms.
- [ ] With multiple open festivals, the behaviour is unambiguous.

### Dependencies
Related to GS-047 (session validation).

---

## GS-024 — Per-member financial counters are never rebuilt by the recompute tool

**Severity:** HIGH
**Category:** FINANCE
**Feature:** Reimbursements
**Status:** FIXED — verified 2026-09-03

### Problem
`recomputeFestivalSummary` rebuilds the festival summary but never touches the per-member counters, which are maintained by the same unguarded increments and can therefore drift permanently with no repair path.

### Current Behavior
`services/ganesh/ganeshWrites.ts:2020-2081` writes only the summary document. `FestivalMember.contributionPaid`, `personalExpenses`, `reimbursed` and `pendingReimbursement` are maintained by increments at `services/ganesh/ganeshWrites.ts:1150, 1504, 1824, 1927, 1953, 1968` and are never rebuilt.

After the GS-009 scenario the summary can be repaired but the member rows stay wrong forever. Those rows drive `app/(ganesh)/(tabs)/committee.tsx`, `app/(ganesh)/add-reimbursement.tsx`, and the "Collected" figure on `app/(ganesh)/(tabs)/pandal.tsx:52`.

### Expected Behavior
The repair tool should rebuild every derived counter, not just the summary.

### Evidence
- `services/ganesh/ganeshWrites.ts:2020-2081`
- `services/ganesh/ganeshWrites.ts:1150, 1504, 1824, 1927, 1953, 1968`

### Impact
- **Data:** a corrupted member record is permanently unrepairable from within the app.
- **Financial correctness:** committee dues and reimbursement figures diverge from the underlying documents with no way to detect it.

### Recommended Fix
Extend the recompute to rebuild each festival member's counters from the contributions, expenses and reimbursements it already reads, writing them in the same operation.

### Acceptance Criteria
- [ ] The recompute rebuilds `contributionPaid`, `personalExpenses`, `reimbursed` and `pendingReimbursement` for every festival member.
- [ ] After the GS-009 scenario, the recompute fully repairs both the summary and the member rows.
- [ ] The rebuild is subject to the same pagination and atomicity fixes as GS-012.

### Dependencies
Depends on GS-012. Related to GS-009.

---

## GS-025 — Committee target inputs are seeded `0` and never re-synced; Save wipes real targets

**Severity:** HIGH
**Category:** UX
**Feature:** Committee Contributions
**Status:** FIXED 2026-09-03

### Resolution (2026-09-03)

Confirmed live exactly as described. Both inputs now seed empty and are filled
by an effect once the festival loads, keyed on `festival?.id` rather than on the
amounts — re-seeding on every value change would let a snapshot echo overwrite
what the treasurer is part-way through typing, including a concurrent edit from
another committee member landing mid-keystroke. Seeding once per festival can
show a stale figure if someone else changes it while the tab is open, which is
the better failure: it loses nobody's input.

Save is also guarded against the same wipe by another route — an empty field
parses to `0` — and now has the error handling it never had (that half was
GS-031): it was `void writes.updateFestivalTargets(...)`, which since GS-029
made the wrappers async would have discarded a rejection entirely.

### Problem
Two money inputs on the Pandal tab are initialised from data that has not loaded yet, default to `"0"`, and never re-sync when the data arrives. Saving writes those zeros over the real targets.

### Current Behavior
`app/(ganesh)/(tabs)/pandal.tsx:53-54`:

```ts
const [memberTarget, setMemberTarget] = useState(String(festival?.contributionTargetAmount ?? 0));
const [houseTarget,  setHouseTarget]  = useState(String(festival?.householdTargetAmount   ?? 0));
```

`useState` initialisers run once, on the first render — before `useFestivals` (line 43) resolves. The fields are seeded `"0"` and there is no `useEffect` to re-sync.

A treasurer opens the Pandal tab, sees "Member contribution target: 0", presses "Save targets" (lines 206-217), and `contributionTargetAmount: 0, householdTargetAmount: 0` are written — wiping the target for every committee member and every household. The write has no error handling either (GS-031).

### Expected Behavior
The inputs should reflect the stored values once loaded, using the derived pattern already used correctly elsewhere in the same feature.

### Evidence
- `app/(ganesh)/(tabs)/pandal.tsx:53-54, 206-217`
- Correct pattern for comparison: `app/(ganesh)/admin/setup.tsx:24-27`, `admin/festivals.tsx:24-27`, `admin/settings.tsx:29-38`, `member/[id].tsx:72-73`

### Impact
- **Data:** silently destroys the committee and household targets for the whole festival.
- **Financial correctness:** every "remaining contribution" and household `partial`/`paid` derivation depends on these targets.
- **User:** the destructive action looks like a no-op — the field already read `0`.

### Recommended Fix
Replace the `useState` initialiser with the derived `local ?? festival?.value` pattern, or add a `useEffect` keyed on the festival id. Disable Save until the festival has loaded.

### Acceptance Criteria
- [ ] The target inputs display the stored values once the festival loads.
- [ ] Save is disabled until the festival has loaded.
- [ ] Saving without editing does not change the stored targets.
- [ ] The write surfaces an error if it fails.

### Dependencies
Same class as GS-026 and GS-032. Related to GS-031.

---

## GS-026 — Household expected-amount input is always seeded `0`; Save flips the household to paid

**Severity:** HIGH
**Category:** UX
**Feature:** Households
**Status:** ALREADY FIXED — verified 2026-09-03

### Verification (2026-09-03)

Both halves are already fixed; the ticket was stale.

`app/(ganesh)/household/[id].tsx` now takes `loading: householdsLoading` from
`useHouseholds`, renders a "Loading household…" state instead of "not found" on
the first render, seeds `useState("")`, and re-syncs `expected` from an effect.

The sticky-status half is fixed too: `updateHousehold` passes
`forcedStatus: previousStatus` (`ganeshWrites.ts`), and the collection void path
passes the household's own stored status, so `not_interested` / `not_available`
survive an edit.

### Problem
The household detail screen returns "not found" on its first render, so its expected-amount input is *always* initialised to `"0"` and never re-syncs. Saving writes `expectedAmount: 0`, which flips the household's status to `paid`.

### Current Behavior
`app/(ganesh)/household/[id].tsx:41`:

```ts
const [expected, setExpected] = useState(String(household?.expectedAmount ?? 0));
```

On the first render `household` is always `undefined`, because the component returns "Household not found." at lines 43-49 while `useHouseholds` is still loading (its `loading` flag is discarded at line 32 — see GS-032). Once the household loads, the input renders `0` regardless of the stored value, and "Save expected" (lines 66-72) writes `expectedAmount: 0`.

`deriveHouseholdStatus` (`shared/utils/ganeshMath.ts:238-251`) returns `paid` whenever `expected <= 0` and `collected > 0`, so the household is marked fully paid.

Separately, `updateHousehold` loses the sticky statuses: `services/ganesh/ganeshWrites.ts:1033-1038` passes `forcedStatus: input.status`, which in that branch is by definition `undefined`, so a household marked `not_interested` or `not_available` reverts to `pending`/`partial` on any edit. Same defect in the void path at lines 1905-1908.

### Expected Behavior
The input reflects the stored expected amount, and editing it preserves sticky statuses.

### Evidence
- `app/(ganesh)/household/[id].tsx:32, 41, 43-49, 66-72`
- `shared/utils/ganeshMath.ts:238-251`
- `services/ganesh/ganeshWrites.ts:1033-1038, 1905-1908`
- Correct pattern: `app/(ganesh)/asset/[id].tsx:79-92`, `sponsor/[id].tsx:93-100`

### Impact
- **Data:** opening a household and pressing Save — without typing anything — corrupts its expected amount and status.
- **Financial correctness:** household collection targets and the Paid/Pending statistics become wrong.
- **User:** "not interested" households silently return to the collection list.

### Recommended Fix
Add a `useEffect` keyed on `household?.id` to sync the input, gate the screen on the hook's `loading` flag so it stops rendering "not found" during load, and pass `forcedStatus: current.status` in `updateHousehold`.

### Acceptance Criteria
- [ ] The expected-amount field shows the stored value once loaded.
- [ ] The screen shows a loading state rather than "not found" while loading.
- [ ] Saving without editing does not change the stored expected amount.
- [ ] Editing the expected amount preserves `not_interested` / `not_available`.

### Dependencies
Related to GS-006, GS-032, GS-038.

---

## GS-027 — Voiding a collection has no confirmation, no busy lock and no error handling

**Severity:** HIGH
**Category:** UX
**Feature:** Collections
**Status:** FIXED — verified 2026-09-03

### Problem
A small outline button reverses a recorded cash collection on a single tap, with no confirmation dialog, no in-flight lock, and no error handling. A double tap can decrement the collection total twice.

### Current Behavior
`app/(ganesh)/household/[id].tsx:109-123`:

```tsx
<Button size="sm" variant="outline"
  onPress={() => { void writes.voidFinancialRecord({ entityType: "collection", entityId: row.id, reason: "…" }); }}>
  Void
</Button>
```

No `loading` prop (so `components/ui/Button.tsx:60` never disables it), no `.catch`, no `Alert`. Contrast `app/(ganesh)/expense/[id].tsx:86-117`, which does it correctly with an Alert confirmation, `loading={busy}` and `friendlyErrorMessage`.

The service-level double-void guard races: `services/ganesh/ganeshWrites.ts:1866-1868` does `getDoc` then `if (snap.data().voided) throw`, but two taps ~100 ms apart both read `voided: false`, and `bumpSummary` uses `increment()`, so `chanda` is decremented **twice** for one collection.

### Expected Behavior
Reversing recorded cash requires explicit confirmation, is locked while in flight, and reports failures.

### Evidence
- `app/(ganesh)/household/[id].tsx:109-123`
- `components/ui/Button.tsx:60, 137`
- `services/ganesh/ganeshWrites.ts:1866-1868`
- Correct pattern: `app/(ganesh)/expense/[id].tsx:86-117`

### Impact
- **Financial correctness:** a double tap double-decrements `summary.chanda`, understating collections with no trace.
- **Data:** a stray tap silently reverses a cash record.
- **User:** no feedback of any kind, success or failure.

### Recommended Fix
Add an `Alert.alert` confirmation, bind `loading={busy}` to the button, and add `.catch(e => { logError(...); toast.error(friendlyErrorMessage(e, ...)) })`. Make the service-side double-void guard transactional.

### Acceptance Criteria
- [ ] Voiding a collection requires confirmation.
- [ ] The button is disabled while the void is in flight.
- [ ] A failed void surfaces a user-friendly error.
- [ ] Two rapid taps cannot decrement the total twice.

### Dependencies
Related to GS-019, GS-031, GS-038.

---

## GS-028 — The duplicate-household dialog's Continue can be double-submitted

**Severity:** HIGH
**Category:** UX
**Feature:** Collections
**Status:** FIXED (2026-08-27)

### Problem
The duplicate-household modal's Continue button has no loading or disabled state, and the modal stays mounted until the write settles — so it can be tapped twice, writing two collections.

### Current Behavior
`app/(ganesh)/add-collection.tsx:117-123` renders `<DuplicateHouseholdDialog … onContinue={() => void save()} />`, and `components/ganesh/DuplicateHouseholdDialog.tsx:56-58` renders `<Button onPress={onContinue}>Continue</Button>` with no `loading` and no `disabled`.

`save()` sets `busy`, but `busy` is bound only to the underlying "Save collection" button (line 114). The modal is dismissed by `setMatches([])` in the `finally` (line 75) — i.e. only once the write settles. Offline, `commitWrite`'s 1500 ms grace keeps the modal visible for the whole window.

This fires on a duplicate-name match, which is the *common* case for repeat chanda from the same household — exactly the scenario GS-006 makes unavoidable.

### Expected Behavior
The Continue action locks immediately and the modal dismisses on the first press.

### Evidence
- `app/(ganesh)/add-collection.tsx:114, 117-123, 65-77`
- `components/ganesh/DuplicateHouseholdDialog.tsx:56-58`
- `services/ganesh/ganeshWrites.ts:990-993` — the double `chanda` increment

### Impact
- **Financial correctness:** two collections recorded for one payment; `summary.chanda` incremented twice.
- **Data:** duplicate cash entries in the collections ledger, plus two duplicate households.

### Recommended Fix
Pass `loading={busy}` to the dialog's Continue button and dismiss the modal on first press rather than in the `finally`.

### Acceptance Criteria
- [ ] Continue is disabled while the write is in flight.
- [ ] Two rapid taps produce exactly one collection.
- [ ] The behaviour holds offline, during the queued-write grace window.

### Resolution - 2026-08-27
Fixed with GS-006, as the ticket suggests, since it is the same dialog.

`DuplicateHouseholdDialog` now takes a `busy` prop and disables every action while a save is
in flight - the per-match merge buttons, "Create new anyway", and Cancel - and also
suppresses the backdrop-tap and hardware-back dismissals, so the modal cannot be closed out
from under an in-flight write. The screen passes its existing `busy` state, which was
previously bound only to the underlying "Save collection" button.

`save()` additionally returns early if `busy` is already set. That guard is what actually
holds offline: `commitWrite`'s 1500 ms grace window keeps the modal mounted for the whole
period, and a re-entrant call would otherwise slip past a prop that has not re-rendered yet.

The dialog is still dismissed in the `finally` rather than on first press, because a failed
save has to leave the user where they were with their matches intact; the lock is what
prevents the double write, not the dismissal timing.

**Verified:** typecheck clean; full suite green.

**Not verified by a test:** double-tap behaviour is UI timing, covered by the manual guide -
the project has no component-test setup.

### Dependencies
Related to GS-006 (same dialog — fix together), GS-062.

---

## GS-029 — `useGaneshWrites` guards throw synchronously, defeating `.catch` and spinners

**Severity:** HIGH
**Category:** CODE_QUALITY
**Feature:** Error handling
**Status:** FIXED 2026-09-03

### Problem
Every write method in `useGaneshWrites` runs its permission, context and connectivity guards *before* returning a promise. Call sites written as `writes.x(…).then(…).catch(…)` therefore never attach the catch and never run their `finally`, leaving the button spinning forever.

### Current Behavior
`hooks/useGaneshWrites.ts:50-69` plus every method body, e.g.:

```ts
addExpense: (input) => {
  requirePerm("expenses.create");     // throws synchronously (line 262)
  const ctx = requireFestival();      // throws synchronously (line 264)
  return run("Expense saved", () => …);
}
```

`requirePerm` → `assertHasPermission` → `throw` (`shared/utils/ganeshPermissions.ts:302-310`); `requireFestival`/`requirePandal` throw at lines 59-61 / 66-68; `assertPermanentFundOnline` throws at `services/ganesh/ganeshPermanentFund.ts:62-64`.

Affected call sites: `add-expense.tsx:463,493`, `add-asset.tsx:273`, `add-sponsor.tsx:316,355-358`, `add-contribution.tsx:307`, `add-member-payment.tsx:132`, `add-reimbursement.tsx:105`, `add-opening-fund.tsx:74`, `close-festival.tsx:63`, `permanent-fund.tsx:268-293`, `expense/[id].tsx:98,240`, `member/[id].tsx:184,343,366`, `admin/roles/new.tsx:56`, `admin/roles/[id].tsx:67`, plus the argument-evaluation variant in `contribution/[id].tsx:124-132` and `sponsor/[id].tsx:136-142`.

**Two are reachable in normal use:**

**(a) `permanent-fund.tsx:266-305` offline.** `submit()` sets `busy = true`, then calls a method that runs `assertPermanentFundOnline(isOnline)` synchronously (`hooks/useGaneshWrites.ts:339,351,363,379,393`). The Save button (lines 410-416) is disabled only for `mode === "toFestival" && !openFestivalId` — not for offline. Result: uncaught throw, no toast, button spins forever; only an app restart recovers.

**(b) `close-festival.tsx:62-75` offline with a transfer.** Identical, via `hooks/useGaneshWrites.ts:323`. The most consequential action in the feature ends in a permanent spinner.

### Expected Behavior
Guard failures should reject the returned promise so existing `.catch`/`.finally` chains work.

### Evidence
See the call-site list above; plus `hooks/useGaneshWrites.ts:50-69` and `shared/utils/ganeshPermissions.ts:302-310`.

### Impact
- **User:** the UI locks up with a permanent spinner and no message, on financial actions, in the ordinary offline case.
- **Reliability:** 17 call sites have error handling that can never run.

### Recommended Fix
Make the guards reject rather than throw — convert the method bodies to `async`, or wrap the guard section so failures become `Promise.reject`. Additionally, disable the Save buttons on `permanent-fund.tsx` and `close-festival.tsx` when offline rather than relying on an advisory text hint.

### Acceptance Criteria
- [ ] A guard failure rejects the returned promise rather than throwing synchronously.
- [ ] Every existing `.catch` on a `useGaneshWrites` call receives guard failures.
- [ ] No button remains in a spinning state after a guard failure.
- [ ] Offline Permanent Fund and settlement actions are disabled with a clear reason.

### Dependencies
Related to GS-030, GS-031.

---

## GS-030 — Late write failures bypass `lib/errors.ts` and arrive after a success toast

**Severity:** HIGH
**Status:** FIXED 2026-09-03
**Category:** UX
**Feature:** Error handling
**Status:** OPEN

### Problem
When the server rejects a write more than 1500 ms after it was issued, the user has already been told it succeeded and has already navigated away. The subsequent failure message does not go through the project's required error path, does not say why, and does not identify the record.

### Current Behavior
`lib/firestoreWrite.ts:24, 56-80` reports a write as `"queued"` after a 1500 ms grace window. So for a slow rejection:

1. `run()` in `hooks/useGaneshWrites.ts:40-48` fires `toast.success("Collection saved")`.
2. The screen calls `back()` (`app/(ganesh)/add-collection.tsx:69`).
3. The row appears in the list from the local cache.
4. Seconds later the server rejects; `defaultLateFailure` (`lib/firestoreWrite.ts:43-50`) fires `toast.error("A saved collection could not be synced. Please check it.")` and the row vanishes.

That late message does not route through `lib/errors.ts`, does not distinguish a closed festival from a permission problem, and does not name the record.

Given the rules as they stand — closed festival, a role without the permission, a stale festival id — a rejection is likely, so this is the most probable user-visible failure mode in the feature.

### Expected Behavior
Late failures route through `friendlyErrorMessage` and `logError`, name the affected record, and offer a path to retry or review it.

### Evidence
- `lib/firestoreWrite.ts:24, 43-50, 56-80`
- `hooks/useGaneshWrites.ts:40-48`
- `lib/errors.ts:132-138, 146-170` — the required path being bypassed
- Project convention: `lib/errors.ts` is the required path for user-facing messages and logging

### Impact
- **User:** a success confirmation followed by an unattributable failure on a financial record. The user cannot tell which entry was lost.
- **Data:** the record silently disappears from the list after appearing to save.

### Recommended Fix
Route `onLateFailure` through `friendlyErrorMessage` and `logError`, include the record type and identity in the message, and surface a retry affordance. Where the client can predict the rejection — a closed festival in particular — check before writing so the user gets the right message up front (GS-035).

### Acceptance Criteria
- [ ] Late failures produce a message generated by `friendlyErrorMessage`.
- [ ] The message identifies which record failed.
- [ ] The failure is logged via `logError`.
- [ ] A closed-festival rejection produces the closed-festival message, not a generic one.

### Dependencies
Related to GS-035, GS-029, GS-057.

---

## GS-031 — Nine write paths have no error handling at all

**Severity:** HIGH
**Status:** FIXED 2026-09-03
**Category:** UX
**Feature:** Error handling
**Status:** OPEN

### Problem
Nine write call sites are fired with `void` and no `.catch`, so a rules rejection or network failure is a completely silent no-op. Several of them are financially significant.

### Current Behavior

| File:line | Call | Consequence of failure |
| --- | --- | --- |
| `app/(ganesh)/(tabs)/pandal.tsx:208-214` | `void writes.updateFestivalTargets({…})` | Silent. With GS-025 the user believes ₹0 targets were saved. |
| `app/(ganesh)/report.tsx:126` | `void writes.recomputeFestivalSummary()` | Rewrites the whole summary. Silent on failure. |
| `app/(ganesh)/admin/settings.tsx:100,107` | `void writes.updatePandalJoinMode(...)` | Changes who can join the pandal. Silent. |
| `app/(ganesh)/admin/festivals.tsx:68` | `void setSession(…).then(…)` | Rejection path unhandled. |
| `app/(ganesh)/household/[id].tsx:68` | `void writes.updateHousehold(id, {expectedAmount})` | Silent. |
| `app/(ganesh)/household/[id].tsx:80` | `void writes.updateHousehold(id, {status})` | Silent; drives paid/pending reporting. |
| `app/(ganesh)/household/[id].tsx:114-118` | `void writes.voidFinancialRecord({entityType:"collection", …})` | **Voids a cash collection, silently** (GS-027). |
| `app/(ganesh)/member/[id].tsx:270,281,297` | `void writes.updatePandalMember(id, {status})` | Suspend / restore / remove a member. Silent. |
| `app/(ganesh)/setup.tsx:313-315` | `void setSession(…).then(replace)` | Rejection unhandled. |

### Expected Behavior
Every write follows the pattern already used correctly elsewhere in the same feature: `logError(scope, e); toast.error(friendlyErrorMessage(e, "…"))`.

### Evidence
The table above. Correct examples for comparison: `app/(ganesh)/add-collection.tsx:70-73`, `admin/setup.tsx:74-77`, `member/[id].tsx:190-193`. Across the feature, all 24 existing `.catch` blocks do use `logError` + `friendlyErrorMessage` — the gap is coverage, not misuse.

### Impact
- **User:** admin actions appear to succeed and do nothing. Given GS-014 and GS-016 make rejections likely, this is the difference between a diagnosable problem and an inexplicable one.
- **Data:** member suspensions and household status changes silently fail.

### Recommended Fix
Add `.catch` handlers using `logError` and `friendlyErrorMessage` to all nine, and bind a busy state to each button (GS-062-class, see also GS-027).

### Acceptance Criteria
- [ ] All nine write paths handle failure and surface a user-friendly message.
- [ ] Failures are logged via `logError` with a meaningful scope.
- [ ] Each affected button shows an in-flight state.

### Dependencies
Related to GS-029, GS-030, GS-027, GS-025.

---

## GS-032 — Ten financial screens render ₹0 with no loading or error state

**Severity:** HIGH
**Category:** UX
**Feature:** Reports
**Status:** FIXED - 2026-09-04

### Problem
`useGaneshSummary` starts at all-zeros and only clears `loading` on the first snapshot. Ten screens read the summary and consult neither `loading` nor `error`, so an unloaded or permission-denied state is indistinguishable from "the pandal has no money".

### Current Behavior
`hooks/useGaneshSummary.ts:11` initialises to `EMPTY_GANESH_SUMMARY`. The following screens discard both flags:

| Screen | Lines | What the user sees |
| --- | --- | --- |
| `app/(ganesh)/(tabs)/index.tsx` | 34-36, 88-106 | `GodFundHero` and 15 metric tiles all ₹0 — the app's home screen |
| `app/(ganesh)/(tabs)/collections.tsx` | 33, 110-115, 174-179 | `₹0` headline, "0 donors · 0 paid houses", "No collections yet" during load |
| `app/(ganesh)/(tabs)/expenses.tsx` | 111, 146-153 | 4 tiles at ₹0; "No expenses yet" during load |
| `app/(ganesh)/(tabs)/contributions.tsx` | 152, 210-217 | 4 tiles at ₹0 |
| `app/(ganesh)/(tabs)/committee.tsx` | 78-80, 172-179 | "Committee paid ₹0 · Paid 0 · Not paid 0" |
| `app/(ganesh)/(tabs)/pandal.tsx` | 52, 150-160 | "Target ₹0 / Collected ₹0" |
| `app/(ganesh)/report.tsx` | 34-42, 54-101 | The festival report — 16 tiles, all ₹0 |
| `app/(ganesh)/admin/reports.tsx` | 33-42, 54-101 | 10 tiles at ₹0; the only admin screen without `AdminQueryState` |
| `app/(ganesh)/permanent-fund.tsx` | 47-54, 69-122 | Fund card ₹0 |
| `app/(ganesh)/close-festival.tsx` | 33, 40, 93-105 | See GS-007 — the worst case |

Detail screens have a related variant: `app/(ganesh)/household/[id].tsx:43-49` and `app/(ganesh)/member/[id].tsx:106-112` render "not found" during load (correct pattern exists at `expense/[id].tsx:65-71`, `contribution/[id].tsx:93-99`, `sponsor/[id].tsx:117`). `assets.tsx:78` and `sponsors.tsx:107` handle loading and empty but discard `error`, so a permission failure renders an empty state with an "Add" call to action.

### Expected Behavior
Each screen gates on `loading` and surfaces `error`. The hooks already return a ready-to-render `LoadFailure.message`.

### Evidence
The table above, plus `hooks/useGaneshSummary.ts:11-37`, `lib/firestoreErrors.ts:16-30`, and `components/ganesh/AdminQueryState.tsx` — which implements all three states correctly and is used by all eight admin screens but no non-admin screen.

### Impact
- **Financial correctness:** a treasurer reading the report mid-load records a false zero.
- **User:** a permission-denied on the summary renders as ₹0 rather than an error, so the real problem is never diagnosed.
- **Reliability:** this is the enabling condition for GS-007, GS-025, GS-026 and GS-034.

### Recommended Fix
Extend `AdminQueryState` (or an equivalent) to the non-admin screens and gate each on the summary's `loading`/`error`. Prioritise `close-festival.tsx`, `report.tsx` and `(tabs)/index.tsx`.

### Acceptance Criteria
- [ ] No screen displays ₹0 as a settled figure while the summary is loading.
- [ ] A summary load error surfaces a message and a retry rather than zeros.
- [ ] Detail screens show a loading state instead of "not found" during load.
- [ ] `assets.tsx` and `sponsors.tsx` distinguish "empty" from "failed to load".

### Dependencies
Blocks proper fixes for GS-007, GS-025, GS-026, GS-034.


### Resolution (2026-09-04)
Closed. The remaining screens are gated, and two defects the ticket had not
identified were found while checking it.

First, a correction to this ticket's own record: it carried **two contradictory
Status lines** - "MOSTLY FIXED 2026-09-03" and "OPEN" - with no resolution
section and no evidence for either. The duplicate is removed.

**Stale rows in the table.** `(tabs)/pandal.tsx` no longer reads the summary at
all; that screen was redesigned and its "Target 0 / Collected 0" row was
describing code that no longer exists. `assets.tsx` and `sponsors.tsx`
(criterion 4) already pass `error` to `ListStateView`, and
`household/[id].tsx` (criterion 3) already gates on load.

**Fixed now.** Each of these gated its *rows* on a loading state while
rendering summary-derived figures above that gate - the numbers a treasurer
would actually read:

- `CollectionsList` - "Collected this festival 0 - 0 donors - 0 paid houses".
- `ExpensesList` - the "Spent this festival" hero and its four tiles.
- `ContributionsList` - the tiles are computed from `contributions`, so during
  load they summed an empty array and printed a settled 0 while the rows below
  correctly showed a skeleton. On an error it was worse: the tiles claimed zero
  and the list claimed a failure, on the same screen.
- `permanent-fund.tsx` - the fund card.
- `member/[id].tsx` - rendered "Member not found - they may have been removed
  from this Pandal" during every load.
- `(tabs)/committee.tsx` - gated loading but discarded `error`, so a failed
  summary took the same branch as a loaded one and printed 0. The paid/pending
  counts were worse than the ticket describes: with no rows loaded they read
  "Not paid 0 - **All done**", an affirmative claim that every member had
  settled, made before a single member was known.

**Two defects the ticket did not name.**

`usePermanentFund` **discarded its error entirely**. `snapshotErrorHandler`
hands over a `LoadFailure` and both the hook and the provider threw it away,
clearing loading and leaving `EMPTY_PERMANENT_FUND` - so a permission-denied
Permanent Fund was indistinguishable from an empty one, with no error available
to any screen. Now threaded through both the local listener and the shared
provider slice (`fundError`, `retryFund`), mirroring the existing
`summaryError`/`retrySummary` pattern.

That mattered beyond display: `fund.total === 0` also decides whether to offer
**"add initial balance"**, so during load and after a failed load the app was
offering to seed a fund that might already hold the Pandal's savings.

Criterion 1's wording is met by hiding the figures rather than by showing a
dash everywhere - on the money screens a skeleton plus a retry is the honest
shape, since a dash in place of a hero amount reads as a layout bug.
---

## GS-033 — No keyboard avoidance on any Ganesh money-entry form

**Severity:** HIGH
**Category:** UX
**Feature:** Expenses
**Status:** FIXED 2026-09-03

### Problem
`GaneshScreen` wraps content in a plain `ScrollView` with no keyboard handling, and the Android window is configured to pan rather than resize — so focusing a low field puts the keyboard over it and the ScrollView cannot scroll far enough to reveal it.

### Current Behavior
`components/ganesh/GaneshScreen.tsx:34-43` sets `contentInsetAdjustmentBehavior="automatic"` (safe-area only, not the keyboard) and `keyboardShouldPersistTaps="handled"`. There is no `KeyboardAvoidingView` and no `automaticallyAdjustKeyboardInsets` anywhere under `app/(ganesh)/` or `components/ganesh/` — the only Ganesh hit for keyboard handling is `app/(ganesh-auth)/login.tsx`, which does wrap correctly. `app.json:14` sets `"softwareKeyboardLayoutMode": "pan"`.

Affected long forms: `add-expense.tsx` (~20 fields, Save at line 431), `add-sponsor.tsx` (~22 fields, Save at 311), `add-contribution.tsx` (Save at 291), `add-collection.tsx` (Notes at 113), `create-festival.tsx`, `close-festival.tsx` (transfer amount at 114).

Worst case: `app/(ganesh)/permanent-fund.tsx:402-416` puts the Amount and Reason inputs and the Save button inside a `FlashList` `ListHeaderComponent` (lines 67-147) with no keyboard handling at all.

### Expected Behavior
Focused inputs and the primary action remain visible above the keyboard on both platforms.

### Evidence
- `components/ganesh/GaneshScreen.tsx:34-43`
- `app.json:14`
- `app/(ganesh-auth)/login.tsx` — the correct pattern, already in the codebase
- `app/(ganesh)/permanent-fund.tsx:67-147, 402-416`

### Impact
- **User:** the lower fields and the Save button on every money-entry form can be unreachable while typing. This is the primary data-entry path for the whole product, used on low-end Android phones in the field.

### Recommended Fix
Wrap `GaneshScreen` in a `KeyboardAvoidingView` (iOS `padding`) and/or set `automaticallyAdjustKeyboardInsets` on the ScrollView. Handle the `permanent-fund.tsx` FlashList header separately.

### Acceptance Criteria
- [ ] On both platforms, focusing the last field on each long form keeps it and the Save button visible.
- [ ] `permanent-fund.tsx` amount entry is usable with the keyboard open.
- [ ] Verified on a physical Android device, not only a simulator.

### Dependencies
None.

---

## GS-034 — Admin dashboard tiles and "Needs attention" act on unloaded data

**Severity:** HIGH
**Status:** FIXED 2026-09-03
**Category:** UX
**Feature:** Admin Dashboard
**Status:** OPEN

### Problem
The dashboard's composite loading gate covers four of its ten data sources, so tiles render zeros as settled facts and the "Needs attention" section raises false alarms on every cold open.

### Current Behavior
`app/(ganesh)/admin/index.tsx:168-173`:

```ts
const loading =
  (pandalsLoading && !pandal) || (festivalsLoading && festivals.length === 0) ||
  (membersLoading && members.length === 0) ||
  (requestsLoading && requests.length === 0 && !requestsError);
```

It omits `useGaneshSummary` (line 47), `usePermanentFund` (43), `usePandalAssets` (44), `useContributions` (48), `useSponsorships` (49) and `useHouseholds` (50). Once members and festivals resolve, `AdminQueryState` renders children while the summary is still in flight, so "Permanent Fund ₹0", "Pending reimb. ₹0", "Festival expenses ₹0", "Asset purchases ₹0" and "Estimated value ₹0" display as facts.

The "Needs attention" rules then fire on those zeros — `app/(ganesh)/admin/index.tsx:104-111`:

```ts
if ((fund.total ?? 0) <= 0) { needs.push({ title: "Permanent Fund is empty", … }) }
```

`fund.total` is `0` for the whole load window and `usePermanentFund`'s loading flag is never consulted. Every cold open flashes "Permanent Fund is empty — Add existing Pandal money if you have any", plus "Contribution target not configured" (lines 96-103, same defect). Conversely the section can render "You're all caught up" (lines 232-238) before contributions, sponsors and households arrive, then re-render with several critical items.

The nine rules are individually correct and all twelve hrefs resolve — the defect is purely that they run on unsettled data.

### Expected Behavior
Tiles and the needs-attention computation are suppressed until every contributing source has settled.

### Evidence
- `app/(ganesh)/admin/index.tsx:43-50, 96-119, 120-159, 168-173, 192-219, 232-238`
- `shared/types/ganesh.ts:572-578` — `EMPTY_PERMANENT_FUND`

### Impact
- **User:** the one section designed to be trusted for urgency is unreliable in both directions. A committee lead who acts on "Permanent Fund is empty" could seed a duplicate fund.
- **Financial correctness:** an admin can read "Permanent Fund ₹0" on a pandal holding lakhs.

### Recommended Fix
Include every contributing hook in the composite `loading` gate, or render per-tile skeletons. Suppress the `needs` array until all sources have settled, and distinguish "nothing to do" from "not loaded yet".

### Acceptance Criteria
- [ ] No dashboard tile shows ₹0 while its source is loading.
- [ ] "Needs attention" does not render items derived from unloaded data.
- [ ] "You're all caught up" only appears once every source has settled.
- [ ] A load failure on any source is surfaced (GS-056).

### Dependencies
Related to GS-032, GS-056.

---

## GS-035 — A closed festival is reported to the user as "You don't have access"

**Severity:** HIGH
**Status:** FIXED 2026-09-03
**Category:** UX
**Feature:** Festival
**Status:** OPEN

### Problem
Every festival-subcollection create requires `festivalOpen()`. When a user submits against a closed festival, the resulting `permission-denied` is translated into an access message, which is wrong and sends the user to an admin over a non-problem.

### Current Behavior
`firestore.rules:820-827` requires `festivalOpen()` for creates in `collections`, `expenses`, `contributions`, `reimbursements`, `openingFunds`, `summary`, `activity` and `auditLogs`. A rejection maps through `friendlyErrorMessage` (`lib/errors.ts:152`, entry at line 74) to:

> "You don't have access to this. Sign in again or ask the owner for access."

The user does have access; the festival is closed. Nothing in the Ganesh layer distinguishes the two, even though the festival status is already in hand on most of these screens.

If the rejection is slow, the user instead gets a success toast followed by "A saved collection could not be synced" (GS-030) — worse still.

### Expected Behavior
> "This festival is closed. Create the next festival to record new entries."

### Evidence
- `firestore.rules:820-827`
- `lib/errors.ts:74, 146-170`
- `app/(ganesh)/(tabs)/index.tsx:39` — the status is already computed and used only to grey out quick actions

### Impact
- **User:** a collector who tries to record chanda after the festival closed is told they lack access, and escalates.
- **Reliability:** masks the real cause of the most common rejection in the feature.

### Recommended Fix
Check festival status client-side before writing and surface a specific message. Add a closed-festival branch to the Ganesh error mapping so a rejection on a known-closed festival is translated correctly even when it arrives late.

### Acceptance Criteria
- [ ] Submitting against a closed festival produces a closed-festival message, not an access message.
- [ ] The message appears before the write is attempted where the status is known.
- [ ] A late rejection on a closed festival also produces the correct message.

### Dependencies
Related to GS-030, GS-057, GS-058.

---

## GS-036 — File size and MIME type are enforced only on the client

**Severity:** HIGH
**Category:** STORAGE
**Feature:** Supabase Storage
**Status:** CODE DONE 2026-09-03 — AWAITING BUCKET SQL

### Resolution (2026-09-03)

The enforcement is `supabase/ganesh-files.bucket-limits.sql`, which sets
`file_size_limit = 5242880` and `allowed_mime_types = {image/jpeg,image/png,image/webp}`
on the bucket. **It still has to be run** — it needs Supabase project access.
Safe at any time: it revokes nothing and only refuses what the client already
refuses.

It has to be the bucket, not the Edge Function: bytes never pass through that
function (it mints a signed upload URL and the client uploads straight to
Storage), so it cannot weigh a file or see its real content-type. The function
now *does* reject a disallowed declared type (415) or oversize declared length
(413) before minting a URL, and the client sends both — but that is a faster,
clearer error, not the enforcement, because a crafted client can declare
anything. Both fields are optional in the function so builds already in the
field, which send neither, keep working.

This was Step 1 of `docs/GANESH_STORAGE_LOCKDOWN.md` all along — independent of
the rest of that rollout and explicitly "safe to do immediately". It stayed open
because that runbook's status block told readers to skip Steps 0–2 as
"historical" when Step 1 had never been done. Corrected in the same change.

### Problem
Image type and size limits run in the app before upload. The Supabase insert policy imposes no constraint, and no bucket-level limits are configured anywhere in the repo.

### Current Behavior
`services/ganesh/storage/imageRules.ts:17-54` restricts to jpeg/png/webp and caps at 5 MB via `assertPreparedImageSize`, both client-side. `services/ganesh/storage/supabaseStorage.ts:25-36` passes `contentType: mimeType` straight through from caller-supplied metadata and re-derives nothing. `supabase/ganesh-files.policies.sql:19-26` has no `metadata->>'size'` or `metadata->>'mimetype'` predicate, and no bucket `file_size_limit` / `allowed_mime_types` is set in the repo.

### Expected Behavior
Bucket-level `file_size_limit` and `allowed_mime_types`, plus a size and MIME predicate in the insert policy.

### Evidence
- `services/ganesh/storage/imageRules.ts:17-54`
- `services/ganesh/storage/storageTypes.ts:59-62`
- `services/ganesh/storage/supabaseStorage.ts:25-36`
- `supabase/ganesh-files.policies.sql:19-26`

### Impact
- **Security:** anyone with the bundled key can upload executables, HTML (a stored-XSS vector if a signed URL is ever opened in a WebView), or multi-gigabyte files under `pandals/…`.
- **Cost:** unbounded storage and bandwidth spend.

Combined with GS-001 this requires no account at all.

### Recommended Fix
Configure `file_size_limit` and `allowed_mime_types` on the bucket, and add matching predicates to the insert policy. Keep the client-side checks for fast feedback.

### Acceptance Criteria
- [ ] An upload exceeding the size limit is refused server-side.
- [ ] An upload with a disallowed MIME type is refused server-side.
- [ ] Legitimate jpeg/png/webp uploads under the limit still succeed.

### Dependencies
Depends on GS-001 (the access model decision).

---

## GS-037 — Contributions can be created already `received`, bypassing `contributions.receive`

**Severity:** HIGH
**Category:** CONTRIBUTIONS
**Feature:** Promised vs Received
**Status:** FIXED — DEPLOYED 2026-09-03 (2026-08-27)

### Problem
The rules correctly prevent creating a *sponsorship* in the `received` state without the receive permission, but there is no equivalent guard for *contributions* — and the client defaults money contributions to `received`.

### Current Behavior
`firestore.rules:791-797` defines `sponsorshipCreateAllowed()`, which blocks creating a sponsorship with `status: 'received'` unless `canReceiveSponsorOf()`. There is no `contributionCreateAllowed()`. Contribution creation needs only `canWriteExpenseOrContribution()` (`firestore.rules:826-834`).

`addContribution` (`services/ganesh/ganeshWrites.ts:1081`) defaults money contributions to `status: 'received'`. So a plain `member` — who does not hold `contributions.receive` — can mint received cash contributions and bump `summary.otherCashContributions` by any amount.

The status-transition rule (`firestore.rules:770-784`) is only reachable on *update*, so the permission is bypassable simply by setting the final state at creation time. The same shape applies to `appendReceivedContribution` (`services/ganesh/ganeshSponsors.ts:242-269`).

### Expected Behavior
Creating a contribution in the `received` state requires `contributions.receive`, mirroring the sponsorship rule.

### Evidence
- `firestore.rules:791-797` (the guard that exists) vs `826-834` (the missing one)
- `firestore.rules:770-784` — update-only transition rules
- `services/ganesh/ganeshWrites.ts:1081`
- `services/ganesh/ganeshSponsors.ts:242-269`

### Impact
- **Security:** the `contributions.receive` permission is unenforceable — the whole promised-versus-received control is bypassable by construction.
- **Financial correctness:** any member can inject arbitrary cash into the festival ledger.

### Recommended Fix
Add a `contributionCreateAllowed()` function mirroring `sponsorshipCreateAllowed()`, and apply it in the create branch. Consider whether `addContribution` should default money contributions to `promised` instead.

### Acceptance Criteria
- [ ] A member without `contributions.receive` cannot create a contribution with `status: 'received'`.
- [ ] A treasurer can still record a received contribution in one step.
- [ ] Creating a `promised` contribution is unaffected.
- [ ] Emulator tests cover both roles.

### Resolution - 2026-08-27
New `contributionCreateAllowed()` in the festival wildcard, mirroring the
`sponsorshipCreateAllowed()` guard that already existed: creating a contribution with
`status: 'received'` requires `contributions.receive`. The status-transition rules were only
reachable on `update`, so the permission was bypassable simply by setting the final state at
creation time.

**One carve-out, and it is narrow.** Receiving a sponsorship mirrors it into the
contributions ledger as a received row (`appendReceivedContribution` in
`services/ganesh/ganeshSponsors.ts`). That row is allowed when it carries a `sponsorshipId`
**and** the actor holds `sponsors.receive` - which they already needed to receive the
sponsorship itself. A plain member cannot borrow the path by inventing a `sponsorshipId`,
because the `sponsors.receive` half still has to hold; a contract test asserts exactly that.

**Client side, so nobody meets a bare permission-denied** (the failure mode GS-016 is
about):
- `useGaneshWrites.addContribution` now resolves the effective status the same way the
  service does and calls `requirePerm("contributions.receive")` plus
  `assertMoneyReceiveOnline` when it is `received`.
- `app/(ganesh)/add-contribution.tsx` drops the "Received" chip for anyone without the
  permission. The screen already defaulted to "Promised" and always passed status
  explicitly, so a member's normal flow is unchanged.

Note the service default is untouched: `addContribution` still defaults money contributions
to `received` for callers that omit status. The only such caller is the sponsor flow, which
is covered by the carve-out above.

**Verified:** typecheck clean; rules compile via dry run; 4 new contract cases covering
member refusal, treasurer success, a denormalized `contributions.receive` grant, and both
sides of the sponsor carve-out. Full suite green.

### Dependencies
Related to GS-004, GS-074.

---

## GS-038 — Household `collectedAmount` is written as an absolute value on void; status derived from a stale read

**Severity:** HIGH
**Category:** COLLECTIONS
**Feature:** Households
**Status:** FIXED — verified 2026-09-03

### Problem
The void path is the only place in the Ganesh ledger that writes a money field as an absolute value computed from a stale read, so a concurrent collection is silently overwritten. Separately, household `status` is derived outside the batch in both the add and update paths.

### Current Behavior
`services/ganesh/ganeshWrites.ts:1897-1911`:

```ts
const household = await getDoc(householdRef);
const collectedAmount = Math.max(0, Number(household.data().collectedAmount ?? 0) - Number(data.amount ?? 0));
batch.update(householdRef, { collectedAmount, … });   // absolute write, not increment()
```

A concurrent `addCollection` — which correctly uses `increment` at line 958 — that lands between the read and the commit is silently lost.

Status has the same class of problem in the other direction: `addCollection` (lines 952-966) writes `collectedAmount: increment(...)` correctly but derives `status` from `Number(prev.collectedAmount ?? 0) + input.amount`, read outside the batch. Two concurrent collections against one household leave the amount correct and the status stuck at `partial` when it should be `paid`. Same pattern in `updateHousehold` (lines 1027-1038).

There is no household recompute anywhere — `recomputeFestivalSummary` never touches households — so any drift is permanent.

### Expected Behavior
Use `increment(-amount)` on the void path, and derive status from a value read inside the same transaction.

### Evidence
- `services/ganesh/ganeshWrites.ts:1897-1911` — absolute write
- `services/ganesh/ganeshWrites.ts:952-966` — status from a stale read
- `services/ganesh/ganeshWrites.ts:1027-1038` — same in update
- `services/ganesh/ganeshWrites.ts:2020-2081` — recompute skips households

### Impact
- **Data:** a household's collected total can be silently wrong and there is no repair path.
- **Financial correctness:** household-level figures diverge from the collections that produced them.

### Recommended Fix
Replace the absolute write with `increment(-amount)`. Move the status derivation into a transaction that reads the household, or recompute status from the collections when rendering. Add household rebuilding to the recompute tool.

### Acceptance Criteria
- [ ] Voiding a collection uses an atomic decrement.
- [ ] A concurrent collection during a void is not lost.
- [ ] Household status is correct after two concurrent collections.
- [ ] The recompute tool rebuilds household `collectedAmount` and `status`.

### Dependencies
Related to GS-006, GS-026, GS-024, GS-027.

---

## GS-039 — The sponsored portion of an expense is absent from every summary total

**Severity:** HIGH
**Category:** FINANCE
**Feature:** Split Funding
**Status:** FIXED 2026-09-03

### Problem
An expense can be funded by God Fund, personal money and a sponsor. The first two are accumulated into the summary; the sponsored portion is accumulated nowhere, so "Festival expenses" never matches the expense list.

### Current Behavior
`totalExpenses = godFundExpenses + personalMoneyUsed` (`shared/utils/ganeshMath.ts:63-68`). `sponsoredAmount` is never accumulated into `GaneshSummary`: `addExpense` and `addAssetPurchase` bump only `godFundExpenses` and `personalMoneyUsed` (`services/ganesh/ganeshWrites.ts:1494-1499, 1635-1641`), and `recomputeFestivalSummary` never reads `sponsoredAmount` (lines 2051-2066).

`GaneshSummary.sponsoredValue` exists but is fed only by in-kind sponsorships (`services/ganesh/ganeshSponsors.ts:272-274`) and sponsorship-kind contributions (`services/ganesh/ganeshWrites.ts:1157-1158`) — not by the sponsored leg of an expense.

A ₹40,000 sound system fully paid by a sponsor shows `totalAmount: 40000` on the expense row but contributes 0 to `totalExpenses(summary)` and 0 to `sponsoredValue`. `app/(ganesh)/(tabs)/expenses.tsx:148` shows "Festival expenses" from the summary directly above a list whose rows show `item.totalAmount` (line 193), so the rows sum higher than the header. Same mismatch on `report.tsx:68` and `admin/index.tsx:204`.

### Expected Behavior
Either track a `sponsoredExpenseValue` in the summary so the totals reconcile, or label the tile unambiguously as cash-only spend.

### Evidence
- `shared/utils/ganeshMath.ts:63-68`
- `services/ganesh/ganeshWrites.ts:1494-1499, 1635-1641, 2051-2066`
- `app/(ganesh)/(tabs)/expenses.tsx:148, 193`; `report.tsx:68`; `admin/index.tsx:204`

### Impact
- **Financial correctness:** total festival spend is understated by the full sponsored amount.
- **User:** a header that visibly disagrees with the list beneath it.

### Recommended Fix
Add a `sponsoredExpenseValue` field to `GaneshSummary`, bump it in both expense write paths, include it in the rebuild, and either add it to the displayed total or relabel the tile.

### Acceptance Criteria
- [ ] The "Festival expenses" figure reconciles with the sum of the expense rows.
- [ ] The sponsored portion is visible somewhere in the reports.
- [ ] The rebuild produces the same figures as the incremental path.

### Dependencies
Related to GS-050, GS-051, GS-013.

---

## GS-040 — The "waiting for connection" photo queue is ephemeral screen state

**Severity:** HIGH
**Status:** PARTIAL 2026-09-03 - copy made honest, queue not built
**Category:** OFFLINE
**Feature:** Supabase Storage
**Status:** OPEN

### Problem
The UI tells the user a photo is queued and will upload when connectivity returns. There is no queue — the retry lives in a `useEffect` inside the screen component and is discarded on navigation or app kill.

### Current Behavior
`app/(ganesh)/add-expense.tsx:101-127` (and identically `add-asset.tsx:54-80`, `add-contribution.tsx:79`, `add-sponsor.tsx:122`): the Firestore document is created first and always succeeds (queued locally); then `persistReceipt` checks `isOnline` and, if offline, sets status `"waiting"` and returns. The retry is a `useEffect` keyed on `isOnline` in the screen. Navigating back, or the OS killing the app, discards `receipt` and `savedId`. The prepared image also sits in a cache directory the OS may reclaim.

The label shown is "⟳ Waiting for connection" (`components/ganesh/GaneshImageUploader.tsx:93`). This directly contradicts the copy on the collections screen ("It stays available even if the network drops").

### Expected Behavior
Either persist the pending upload and drain it from a provider-level worker, or tell the user plainly that the photo was not saved and must be re-attached from the record screen.

### Evidence
- `app/(ganesh)/add-expense.tsx:101-127`, `add-asset.tsx:54-80`, `add-contribution.tsx:79`, `add-sponsor.tsx:122`
- `components/ganesh/GaneshImageUploader.tsx:93`

### Impact
- **User:** the expense exists with no receipt and nothing ever says so. For a receipt-backed financial ledger this is an accountability gap.
- **Reliability:** the UI makes a durability promise the code does not keep.

### Recommended Fix
Persist `{recordId, localUri, targetPath}` to AsyncStorage and drain the queue from a provider mounted above the screens, with retry and a visible pending indicator on the record itself. If that is too large for now, change the copy to state the photo will be lost and prompt the user to retry.

### Acceptance Criteria
- [ ] A photo captured offline is uploaded after reconnect even if the user navigated away.
- [ ] A photo captured offline survives an app restart, or the UI says clearly that it will not.
- [ ] The record screen shows when a receipt is missing.
- [ ] The offline copy matches the actual behaviour.

### Dependencies
Related to GS-069, GS-001.

---

## GS-041 — No server-side validation of amounts, dates or enums anywhere

**Severity:** HIGH
**Category:** DATA_VALIDATION
**Feature:** Security Rules
**Status:** FIXED 2026-09-03 - AWAITING RULES DEPLOY

### Resolution (2026-09-03)

The matrix below was largely closed already by work that did not update this
ticket. Re-verified row by row against current `firestore.rules`: amounts and
in-kind values are covered by `okMoney` / `okSignedMoney` across 29 call sites
on **create and update**; `okMoney` also asserts `is number`, which was the
"Neither" row; God Fund overspend and over-reimbursement were fixed in
transactions (GS-010, GS-008); contribution, sponsorship, household, seva and
reimbursement status enums are all in `statusWellFormed`; festival `year` is
`is int`.

Two genuine gaps remained, and are what this change closes:

- **Date validity.** `date` was checked as `is string` only, so "banana" and
  "9999-99-99" were both accepted and anything grouping or sorting by date
  inherited the garbage. `okDate()` now enforces YYYY-MM-DD with real month and
  day ranges, applied to `date` and `expectedDate`.
- **`paymentMethod`.** Unvalidated, and it decides which Cash/UPI/Bank bucket
  money moves between. A junk value silently landed in `other` via
  `resolveFundLocation`'s default - harmless by design, but the buckets became
  load-bearing with the God Fund location work, so the vocabulary is pinned.

**A client/server mismatch was found and fixed in the same pass.** The seva date
check accepted 2026-99-99. Left alone, the client would have told the user their
input was fine and the new rules would have refused the write with a bare
permission error - worse than either check alone. There is now one canonical
`GANESH_DATE_PATTERN` in `ganeshIdentity.ts`, used by the client and mirrored by
`okDate()`, with a test pinning its exact source so the two cannot drift.

Still open, tracked under **GS-004**: no whole-document field allowlist outside
`summary`, so arbitrary extra fields remain writable on other subcollections.

### Problem
Validation is almost entirely client-side. This ticket records the full coverage matrix so the gaps can be closed systematically rather than one screen at a time.

### Current Behavior

| Hazard | Client | Rules | Verdict |
| --- | --- | --- | --- |
| Negative / zero collection, opening fund, contribution, PF donation | Yes — `validatePositiveAmount` (`shared/utils/ganeshMath.ts:88-96`) | No | Client only |
| Negative estimated value (in-kind) | Yes — `validateInKindValue` | No | Client only |
| Expense split ≠ total; negative components | Yes — `validateExpenseFunding` (`ganeshMath.ts:105-124`) | No | Client only |
| God Fund overspend | Racy non-transactional read (GS-010) | No | Broken |
| Over-reimbursement | Client-supplied cap (GS-008) | No | Broken |
| Over-transfer either direction | Yes, inside `runTransaction` | No | Transaction only |
| PF balance negative | Yes — `applyPermanentFundDelta` inside txn | No | Transaction only |
| `amount` is a number at all | `Number()` coercion only | No | **Neither** |
| Contribution status transitions | Yes | Update only (`firestore.rules:765-784`) | Create bypasses — GS-037 |
| Sponsorship status transitions | Yes | Create and update (`firestore.rules:786-820`) | Both — correct |
| Household status enum | Yes — `deriveHouseholdStatus` | No | Client only |
| Asset status / quantity | Yes — `validateAssetDraft` | Dispose-only key set | Partial |
| Date validity | No — free-text | No | **Neither** |
| Festival `year` | `>= 2000`, only in `updateFestivalDetails` | No | Partial |
| Writing to a closed festival | Yes — `requireOpenFestival` | Create yes; update/delete no | GS-018 |
| Arbitrary extra fields | No | No | **Neither** — GS-004 |

### Expected Behavior
Every hazard that can corrupt money is enforced server-side, with the client check retained for fast feedback.

### Evidence
The matrix above; source references as cited.

### Impact
- **Data:** a modified client, or a direct SDK call, can write negative, non-numeric or malformed financial records that then propagate into every aggregate.
- **Financial correctness:** none of the money guarantees the UI implies are actually enforced.

### Recommended Fix
Implement alongside GS-004: add type, range and enum validation to the rules for every festival subcollection. Add a `year` check to `createFestival` and a date-format check to the date fields.

### Acceptance Criteria
- [ ] Every row in the matrix above reads "Both" or has a documented reason not to.
- [ ] Negative and non-numeric amounts are refused server-side on every money collection.
- [ ] Date fields are validated.
- [ ] Emulator tests cover the hazard list.

### Dependencies
Umbrella for GS-004, GS-008, GS-010, GS-018, GS-037, GS-086.

---

## GS-042 — `pandalJoinRequests` is unbounded, undeletable and accepts any `pandalId`

**Severity:** MEDIUM
**Category:** SECURITY
**Feature:** Pandal membership
**Status:** FIXED 2026-09-04 — DEPLOYED

### Problem
Join-request creation validates only the caller's own uid and a `pending` status. The document id is unconstrained, the target pandal is never checked to exist, there is no rate limit, and nobody can ever delete a request.

### Current Behavior
`firestore.rules:498-500`: `allow create: if signedIn() && userId == uid && status == 'pending'`. The client uses `${pandalId}__${uid}` (`services/ganesh/ganeshWrites.ts:389`) by convention only. `firestore.rules:513` sets `allow delete: if false`, so not even the pandal admin can clear a request.

With GS-003 supplying the full pandal list, one account can flood every committee's approval queue with attacker-controlled `displayName` and `phone` strings, which render into `app/(ganesh)/join-requests.tsx:93-98`.

### Expected Behavior
The document id is pinned to `{pandalId}__{uid}` so one user has one slot per pandal, and admins can dismiss requests.

### Evidence
`firestore.rules:494-513`; `services/ganesh/ganeshWrites.ts:389`; `app/(ganesh)/join-requests.tsx:93-98`.

### Impact
- **User:** an admin's join-requests screen can be permanently flooded with entries that can never be removed.
- **Security:** unbounded writes from any authenticated account.

### Recommended Fix
Require `requestId == request.resource.data.pandalId + '__' + request.auth.uid` on create, validate that the pandal exists, and allow delete by an admin of that pandal.

### Acceptance Criteria
- [ ] A user can hold at most one join request per pandal.
- [ ] A request naming a non-existent pandal is refused.
- [ ] A pandal admin can dismiss a request.
- [ ] Normal join-by-code still works.

### Dependencies
Depends on GS-003. Related to GS-043.

---

## GS-043 — An invite can be created pointing at someone else's pandal

**Severity:** MEDIUM
**Category:** SECURITY
**Feature:** Pandal membership
**Status:** FIXED 2026-09-04 — DEPLOYED

### Problem
Invite creation checks only that `createdBy` is the caller and `pandalId` is a string. It never checks that the caller administers that pandal.

### Current Behavior
`firestore.rules:483-486`. An attacker can mint `pandalInvites/<code>` carrying another committee's `pandalId` and an arbitrary `name` and `joinMode`. `services/ganesh/ganeshWrites.ts:388` trusts `invite.data().joinMode` for its client-side branch.

Self-create is still blocked server-side because `firestore.rules:607` checks `pandalAfter().joinMode` on the *pandal* document rather than the invite — so this is not directly escalating. It does permit code squatting against `uniquePandalCode()`'s eight-attempt loop (`services/ganesh/ganeshWrites.ts:217-224`) and lets an attacker publish a misleading name for a real pandal.

### Expected Behavior
Only an admin of the named pandal can create an invite for it.

### Evidence
`firestore.rules:483-486, 607`; `services/ganesh/ganeshWrites.ts:217-224, 388`.

### Impact
- **Security:** unauthenticated-quality writes into a shared namespace; a phishing and confusion vector; can block legitimate code generation.

### Recommended Fix
Add `canManageMembersOf(request.resource.data.pandalId)` to the create rule.

### Acceptance Criteria
- [ ] Creating an invite for a pandal the caller does not administer is refused.
- [ ] Pandal creation, which mints the first invite, still works.

### Dependencies
Related to GS-003, GS-088.

---

## GS-044 — The Ganesh session is never cleared on sign-out

**Severity:** MEDIUM
**Category:** AUTH
**Feature:** Authentication
**Status:** OPEN — partially mitigated, verified 2026-09-03

### Problem
`GaneshSessionProvider` persists the selected pandal and festival to AsyncStorage under a device-global key, exposes a `clearSession` function, and nothing ever calls it.

### Current Behavior
`providers/GaneshSessionProvider.tsx:16` uses the key `"@ganesh_session"` with no uid namespacing. `clearSession` is defined at lines 59-62 and included in the context value at line 79 — but a repo-wide grep for `clearSession` returns only its own definition and the context wiring. No sign-out path calls it.

So the stored `{pandalId, festivalId}` survives sign-out. If a second person signs in on the same device, they inherit the previous user's pandal and festival context.

### Expected Behavior
The Ganesh session is cleared on sign-out, or namespaced by uid so it cannot be inherited.

### Evidence
`providers/GaneshSessionProvider.tsx:16, 37-62, 79`; grep for `clearSession` and `@ganesh_session`.

### Impact
- **User:** a second user on a shared device lands in the previous user's pandal context. Firestore rules prevent any data leak (`pandals/{id}` read requires active membership), so the effect is a confusing state rather than a breach.
- **Reliability:** stale context contributes to the class of problems in GS-047.

### Recommended Fix
Call `clearSession()` from the sign-out flow, and namespace the storage key by uid as defence in depth.

### Acceptance Criteria
- [ ] Signing out clears the stored pandal and festival.
- [ ] A second user signing in on the same device starts with no Ganesh session.
- [ ] The existing user's session still persists across app restarts.

### Dependencies
Related to GS-047.


### Verification (2026-09-03)

Still open, though narrower than filed. `clearSession()` now exists and IS
called from `app/(ganesh)/(tabs)/_layout.tsx` when the user turns out to have no
active pandal, so a revoked membership no longer leaves a live session pinned.

But that is membership loss, not sign-out: `AuthProvider.logout` makes no
reference to `clearSession` or the stored session key, so signing out still
leaves the Ganesh pandal/festival selection on the device for whoever signs in
next.
---

## GS-045 — `GaneshGate` writes real PII into the duress user tree

**Severity:** MEDIUM
**Category:** AUTH
**Feature:** Authentication
**Status:** FIXED 2026-09-04

### Problem
The Ganesh gate is the one Ganesh consumer that uses `useAuth().user` rather than `realUser`. Under duress mode that uid is the decoy tree, so the user's real display name, email and phone are written into it.

### Current Behavior
`app/(ganesh)/_layout.tsx:19-23`:

```ts
const { user, loading } = useAuth();
useEffect(() => { …; void upsertGaneshProfile(db, user); }, [user]);
```

`useAuth().user` is the duress proxy when privacy mode is on (`providers/AuthProvider.tsx:243-247`, `lib/authHelpers.ts:20-27` — the uid becomes `<real uid>_duress`). Every other Ganesh consumer uses `realUser` (`providers/GaneshSessionProvider.tsx:33, 64-71`, `hooks/usePandals.ts:10`, `hooks/useMyJoinRequests.ts:8`).

`services/ganesh/ganeshProfile.ts:15-25` therefore writes real PII into `users/<uid>_duress`, which `firestore.rules:18-21` explicitly permits. That is the decoy tree — writing real identity into it defeats the purpose of duress mode.

The call is also `void`-ed with no `.catch`, contrary to the project's `lib/errors.ts` convention, producing an unhandled rejection on failure.

### Expected Behavior
Use `realUser`, and wrap the call in `logError`.

### Evidence
`app/(ganesh)/_layout.tsx:19-23`; `providers/AuthProvider.tsx:243-247`; `lib/authHelpers.ts:20-27`; `services/ganesh/ganeshProfile.ts:15-25`; `firestore.rules:18-21`.

### Impact
- **Security:** duress mode's decoy tree contains the real user's identity.
- **Reliability:** unhandled rejection on failure.

### Recommended Fix
Switch to `realUser` and add error handling.

### Acceptance Criteria
- [ ] The Ganesh profile is written under the real uid, never the duress uid.
- [ ] No real PII is written into a `_duress` tree by the Ganesh feature.
- [ ] Failures are logged via `logError`.

### Dependencies
None.

---

## GS-046 — The login screen claims an isolation the architecture does not provide

**Severity:** MEDIUM
**Category:** AUTH
**Feature:** Authentication
**Status:** OPEN

### Problem
The Ganesh login screen tells the user it never opens Expense Tracker. It is the same Firebase account, and a workspace switch is one tap away with no re-authentication.

### Current Behavior
`app/(ganesh-auth)/login.tsx:162-165` states "This never opens Expense Tracker." After signing in through that screen, `app/(ganesh)/setup.tsx:270-277` renders a "Switch app" button calling `setActiveWorkspace("expense")`, and `app/index.tsx:48-55` routes to `/(app)` on the next launch. If the phone number or email resolves to an existing Expense Tracker account, that account's entire `users/{uid}/**` tree — readable per `firestore.rules:39-45` — is reachable without re-authenticating.

Note the underlying auth reuse is correct and intentional: `app/(ganesh)/_layout.tsx:15-42` consumes the single root `AuthProvider`, and `app/(ganesh-auth)/login.tsx:57-59` redirects an already-signed-in user straight into Ganesh. There is no unnecessary second OTP. The defect is the copy, not the architecture.

### Expected Behavior
Either remove the claim, or gate the workspace switch behind re-authentication or a biometric prompt.

### Evidence
`app/(ganesh-auth)/login.tsx:57-59, 162-165`; `app/(ganesh)/setup.tsx:270-277`; `app/index.tsx:48-55`; `firestore.rules:39-45`.

### Impact
- **User:** a stated privacy boundary that does not exist. Someone handing their phone to a committee member believing Ganesh Seva is sandboxed is mistaken.

### Recommended Fix
Reword the copy to describe what actually happens, or add a re-auth gate to the workspace switch.

### Acceptance Criteria
- [ ] The login copy accurately describes the account model.
- [ ] If the claim is kept, switching to Expense Tracker requires re-authentication.

### Dependencies
None.

---

## GS-047 — The restored pandal/festival session is never validated

**Severity:** MEDIUM
**Category:** NAVIGATION
**Feature:** Festivals
**Status:** FIXED — verified 2026-09-04

### Problem
The persisted session is restored verbatim with no check that the festival still exists, still belongs to that pandal, or that the user is still a member of it.

### Current Behavior
`providers/GaneshSessionProvider.tsx:37-52` restores `{pandalId, festivalId}` from AsyncStorage unconditionally. The tabs layout (`app/(ganesh)/(tabs)/_layout.tsx:31-34`) validates that the *pandal* still exists and the user is a member, but only checks `!festivalId` — never that the festival document exists or belongs to that pandal. Festival deletion is permitted (`firestore.rules:711`).

A dangling `festivalId` yields silently empty lists and zeroed summaries, and every write fails because `festivalOpen()` (`firestore.rules:703-705`) errors on a missing document.

### Expected Behavior
On session restore, reconcile against the festival list and fall back to the newest open festival or to `/setup`.

### Evidence
`providers/GaneshSessionProvider.tsx:37-52`; `app/(ganesh)/(tabs)/_layout.tsx:31-34`; `firestore.rules:703-705, 711`.

### Impact
- **User:** the whole feature appears empty with no explanation, and every write fails with a generic permission error.

### Recommended Fix
Validate the restored pair once `useFestivals` resolves; clear or replace it if invalid.

### Acceptance Criteria
- [ ] A stale or deleted `festivalId` is detected and replaced or cleared.
- [ ] The user is routed to festival selection rather than an empty ledger.
- [ ] A valid session still restores without a flash.

### Dependencies
Related to GS-044, GS-023, GS-035.

---

## GS-048 — Previous-festival rows stay on screen after a switch

**Severity:** MEDIUM
**Category:** UX
**Feature:** Festivals
**Status:** FIXED — verified 2026-09-04

### Problem
When the festival scope changes, the collection hooks re-subscribe but never clear the existing items, so the previous year's rows remain rendered under the new year's heading until the first snapshot arrives.

### Current Behavior
`hooks/ganesh/useGaneshCollection.ts:36-75` sets `setLoading(true)` on a `pathKey` change but never calls `setItems([])`. Same in `hooks/useGaneshSummary.ts:15-37` and `hooks/useContributions.ts:31-60`.

On a cold or slow network that window is seconds long. Screens like `app/(ganesh)/(tabs)/committee.tsx` blend last year's `contributionPaid` with this year's targets during it.

### Expected Behavior
Clear items when the scope changes, or key the screen so it remounts.

### Evidence
`hooks/ganesh/useGaneshCollection.ts:36-75`; `hooks/useGaneshSummary.ts:15-37`; `hooks/useContributions.ts:31-60`.

### Impact
- **User:** an operator can read 2026 numbers under a 2027 heading and act on them.
- **Financial correctness:** transient but plausible misreading of committee dues.

### Recommended Fix
Reset the items array in the effect when `pathKey` changes, before subscribing.

### Acceptance Criteria
- [ ] Switching festivals clears the previous festival's rows immediately.
- [ ] A loading state is shown until the new snapshot arrives.
- [ ] No screen renders data from two festivals simultaneously.

### Dependencies
Related to GS-032.

---

## GS-049 — `useGaneshCollection` omits `extra` from its effect dependencies

**Severity:** MEDIUM
**Category:** CODE_QUALITY
**Feature:** Shared real-time data
**Status:** FIXED — verified 2026-09-03

### Problem
The `where` clauses passed via `options.extra` are not in the effect's dependency array, so a filter change on a constant path never rebuilds the listener.

### Current Behavior
`hooks/ganesh/useGaneshCollection.ts:46` spreads `options?.extra` into the constraints, but the deps at line 75 are `[enabled, pathKey, orderByField, orderDirection, limitTo, retryToken]` — `extra` and `mapDoc` are both absent.

Two hooks use `extra`, and both have a constant `pathKey`:
- `hooks/useJoinRequests.ts:7,10` — path is always `["pandalJoinRequests"]`, filter is `where("pandalId","==",pandalId)`
- `hooks/useMyJoinRequests.ts:11,14` — path is always `["pandalJoinRequests"]`, filter is `where("userId","==",uid)`

So switching from pandal A to pandal B without unmounting leaves the listener bound to A's filter — the admin sees the previous pandal's join requests, including applicants' names and phone numbers.

**Status:** the dependency bug is CONFIRMED; current reachability is LIKELY-but-masked. Pandal switching today routes through `setSession(...).then(() => replace("/(ganesh)"))` (`app/(ganesh)/setup.tsx:313`, `admin/festivals.tsx:68`), which remounts the tree. It is one non-remounting navigation change away from being live, and the rules would not stop it — `firestore.rules:495-497` permits reading a request whose `pandalId` the user is an active member of, which is exactly the stale case for a multi-pandal user.

### Expected Behavior
A filter change rebuilds the listener.

### Evidence
`hooks/ganesh/useGaneshCollection.ts:46, 75`; `hooks/useJoinRequests.ts:7,10`; `hooks/useMyJoinRequests.ts:11,14`.

### Impact
- **Data:** latent cross-pandal display of join requests. `decideJoinRequest` re-reads the request by id (`services/ganesh/ganeshWrites.ts:439`) so the write would land correctly, but the admin acts on a list they believe belongs to a different pandal.

### Recommended Fix
Include a serialized key for `extra` in the deps, and memoize `mapDoc` at each call site or hold it in a ref.

### Acceptance Criteria
- [ ] Changing the filter rebuilds the listener and replaces the items.
- [ ] Switching pandals without a remount shows the correct join requests.
- [ ] No listener leaks on rapid scope changes.

### Dependencies
Related to GS-048.


### Verification (2026-09-03)

Fixed. `useGaneshCollection` now takes an `extraKey` string alongside `extra`
and keys its subscribe effect on that, so the constraint array no longer has to
appear in the dependency list to be tracked. `useJoinRequests` and
`useMyJoinRequests` pass it.
---

## GS-050 — Reports display the same rupees twice under two "Cash received" headings

**Severity:** MEDIUM
**Category:** REPORTING
**Feature:** Sponsors
**Status:** FIXED 2026-09-04

### Problem
Receiving a cash sponsorship writes both a sponsorship record and a money contribution. The report shows a contributions block and a sponsors block, both labelled "Cash received", where one is a subset of the other — under a note claiming they are separate.

### Current Behavior
`services/ganesh/ganeshSponsors.ts:242-274` creates a `kind: "money"` contribution when a cash sponsorship is received, and bumps `otherCashContributions` — a direct input to `availableGodFund`. So sponsor cash *is* in the God Fund.

`app/(ganesh)/report.tsx:82` (contributions) and `report.tsx:95` (sponsors) both display "Cash received"; `contributionTotals.cashReceived` already includes `sponsorTotals.cashReceived`. Identical duplication at `app/(ganesh)/admin/reports.tsx:76, 89`. Worse, `app/(ganesh)/report.tsx:90-92` labels the sponsor figure "Separate from Closing / God Fund", which is the opposite of the truth.

The ledger itself is correct — the summary is bumped once. This is a presentation defect, but on the document the committee presents to donors.

### Expected Behavior
Label the sponsor figure as a subset ("of which from sponsors"), or exclude `sponsorId`-bearing contributions from the contributions block. Correct the misleading note.

### Evidence
`services/ganesh/ganeshSponsors.ts:242-274`; `app/(ganesh)/report.tsx:82, 90-92, 95`; `app/(ganesh)/admin/reports.tsx:76, 89`.

### Impact
- **User:** a committee member adding the two sections double-counts sponsor cash, and the note actively encourages it.

### Recommended Fix
Relabel and correct the note; optionally split the contributions figure into "of which sponsors".

### Acceptance Criteria
- [ ] No two figures on a report screen represent the same rupees without saying so.
- [ ] The "Separate from Closing / God Fund" note is corrected or removed.
- [ ] Adding the displayed sections yields the true total.

### Dependencies
Related to GS-039, GS-051, GS-013.

---

## GS-051 — `summarizeSponsorships` and `breakdownSponsors` disagree on expense sponsorships

**Severity:** MEDIUM
**Category:** REPORTING
**Feature:** Sponsors
**Status:** FIXED 2026-09-04

### Problem
Two helpers in the same file classify a `sponsoringType: "expense"` sponsorship differently, so the totals and the per-sponsor rows on the same screen do not agree.

### Current Behavior
Both in `shared/utils/ganeshSponsors.ts`:
- `summarizeSponsorships` (lines 183-186) handles `received` for `cash` and `isInKindSponsoring` only, so `sponsoringType: "expense"` falls through and is counted **nowhere**.
- `breakdownSponsors` (lines 235-237) uses `else current.received += value`, so the same deal **is** counted as received.

Affected: `app/(ganesh)/report.tsx:95` (totals) versus `report.tsx:118` (per-sponsor rows) — the rows do not sum to the total on the same screen; `app/(ganesh)/sponsors.tsx:178`; and `app/(ganesh)/sponsor/[id].tsx:209`, which shows `cashReceived + inKindReceived` and therefore contradicts the report's row for the same sponsor.

### Expected Behavior
One classification, applied consistently.

### Evidence
`shared/utils/ganeshSponsors.ts:183-186, 235-237`; `app/(ganesh)/report.tsx:95, 118`; `sponsors.tsx:178`; `sponsor/[id].tsx:209`.

### Impact
- **User:** three screens report different figures for the same sponsor.
- **Financial correctness:** presentational only — the ledger is unaffected — but it undermines the sponsor reporting the committee uses to thank donors.

### Recommended Fix
Decide how expense sponsorships should be classified and apply it in both helpers. Add a unit test that asserts the two agree for every `sponsoringType`.

### Acceptance Criteria
- [ ] The per-sponsor rows sum to the sponsors total on `report.tsx`.
- [ ] The sponsor detail figure matches the report row for the same sponsor.
- [ ] A test asserts agreement across all sponsoring types.

### Dependencies
Related to GS-050, GS-039.

---

## GS-052 — Asset and sponsor audits never reach the Pandal-wide audit screen

**Severity:** MEDIUM
**Category:** REPORTING
**Feature:** Audit Trail
**Status:** FIXED 2026-09-04

### Problem
Four audit trails exist, but the audit screen merges only two of them.

### Current Behavior
`app/(ganesh)/admin/audit.tsx:92-94, 99-123` merges only `useMemberAudits` and `useFestivalAuditLogs`. `usePandalAssetAudits` and `usePandalSponsorAudits` exist and are readable per the rules (`firestore.rules:680-684, 693-697`, both honouring `audit.read`), but are surfaced only on the individual asset detail screen — and not at all for sponsors.

So asset disposals, quantity write-downs and sponsor profile edits are absent from the Pandal-wide audit view.

### Expected Behavior
The audit screen aggregates all four trails.

### Evidence
`app/(ganesh)/admin/audit.tsx:92-94, 99-123`; `hooks/usePandalAssets.ts:18-28`; `hooks/usePandalSponsors.ts:68`; `firestore.rules:680-684, 693-697`.

### Impact
- **User:** the audit screen presents itself as the complete record and is not.

### Recommended Fix
Merge the asset and sponsor audit streams into the audit screen with appropriate filters.

### Acceptance Criteria
- [ ] Asset audits appear in the Pandal-wide audit screen.
- [ ] Sponsor audits appear there.
- [ ] Filtering works across all four sources.

### Dependencies
Related to GS-021, GS-053, GS-092.

---

## GS-053 — Household edits, category adds, profile edits and recomputes are unaudited

**Severity:** MEDIUM
**Category:** REPORTING
**Feature:** Audit Trail
**Status:** FIXED 2026-09-03

### Problem
Several state-changing writes produce no audit entry and no activity entry.

### Current Behavior

| Action | Location | Audit |
| --- | --- | --- |
| `updateHousehold` (expected amount, status) | `services/ganesh/ganeshWrites.ts:1010-1044` | none |
| `addCustomCategory` | `services/ganesh/ganeshWrites.ts:2083-2104` | none (`updateCategory` at 2126 does) |
| `updatePandalProfile` (name, area, phone) | `services/ganesh/ganeshWrites.ts:563-596` | none |
| `attachExpenseReceipt` | `services/ganesh/ganeshWrites.ts:1763-1781` | none |
| `attachContributionPhoto` | `services/ganesh/ganeshWrites.ts:1194-1212` | none (asset and sponsor photos *are* audited) |
| `recomputeFestivalSummary` (overwrites all totals) | `services/ganesh/ganeshWrites.ts:2020-2081` | none |

The recompute is the notable one: an admin can silently rewrite every festival total with no record that it happened.

### Expected Behavior
Every write that changes financial state or configuration is audited.

### Evidence
The table above.

### Impact
- **Data:** household targets and statuses — which drive collection reporting — change with no trail.
- **Financial correctness:** a destructive summary rewrite is invisible.

### Recommended Fix
Add `audit(...)` entries to each path, prioritising `recomputeFestivalSummary` and `updateHousehold`.

### Acceptance Criteria
- [ ] Each action in the table writes an audit entry.
- [ ] The recompute records who ran it and what the totals were before and after.
- [ ] The entries are visible in the audit screen.

### Dependencies
Related to GS-012, GS-021, GS-052.


### Re-confirmed (2026-09-03)

All six writes still produce no audit and no activity entry - verified by
inspecting each function body for `audit(` / `memberAudit(` / `activity(`:
`updateHousehold`, `addCustomCategory`, `updatePandalProfile`,
`attachExpenseReceipt`, `attachContributionPhoto`, `recomputeFestivalSummary`.

**This has become more important than when it was filed.** The recompute is now
the documented repair path for two separate problems - the God Fund location
split (`GANESH_GOD_FUND_LOCATION_AUDIT_2026-09-03.md`) and any summary drift
from the pre-transaction era - so it is more likely to be run, and it still
rewrites every total on a festival with no record that it happened or who did
it. In an app whose stated purpose is a money trail a committee can trust, that
is the one write that most needs a trace.

### Resolution (2026-09-03)

All six writes now record an entry. Each was verified as unaudited first by
inspecting the function body, then fixed:

| Write | Trail |
| --- | --- |
| `addCustomCategory` | `created` / `category`. `updateCategory` beside it already audited, so this was an inconsistency as much as a gap |
| `updateHousehold` | `edited` / `household`, with the before and after of `expectedAmount` and `status` |
| `updatePandalProfile` | `pandal_profile` in `pandalMemberAudits` — it is Pandal-scoped, so a festival's `auditLogs` is the wrong home. `memberAudit` gained `oldValue` / `newValue` slots for edits that are not role changes |
| `attachExpenseReceipt` | `edited` / `expense`, recording paths only — enough to show evidence was replaced and which object it was, without copying file internals into the trail |
| `attachContributionPhoto` | `edited` / `contribution`, same treatment. Asset and sponsor photos were already audited, so these two were the outliers |
| `recomputeFestivalSummary` | `adjusted` / `summary`, described below |

**The recompute is the one that mattered.** It had no `actor` parameter at all,
so it could not have named who ran it even if it had written an entry; the
signature now takes one, passed from the hook.

Its entry records **only the totals that actually moved**, with before and
after. A recompute that changes nothing is the common case, and an entry
listing every unchanged total would bury the one that did move. The write goes
through the same transaction as the summary rewrite, so a rebuild that fails
cannot leave behind an entry claiming a rebuild that happened.

3 tests in `services/ganesh/ganeshRecomputeAudit.test.ts`. One of them caught
something worth recording: a fixture with `chanda: 5000` and an empty Cash
bucket is *not* an unchanged festival — that is precisely the unbackfilled
state described in `GANESH_GOD_FUND_LOCATION_AUDIT_2026-09-03.md`, and the
recompute rightly reclassifies it. The audit trail makes that visible now
instead of it happening silently.
---

## GS-054 — `AdminGate` mounts admin children behind an overlay

**Severity:** MEDIUM
**Category:** UX
**Feature:** Admin Dashboard
**Status:** FIXED - 2026-09-05

### Problem
The gate renders its children unconditionally and paints the loading spinner and the denial screen as absolute-fill siblings on top, rather than rendering them instead of the children.

### Current Behavior
`components/ganesh/AdminGate.tsx:21-53`. Coverage itself is correct — the gate wraps the whole admin `Stack` (`app/(ganesh)/admin/_layout.tsx:10-29`), so `index`, `settings`, `festivals`, `categories`, `audit`, `setup`, `reports` and the nested `roles/` group are all behind it, including deep links.

But a non-admin who deep-links to `/(ganesh)/admin/audit` mounts the full admin subtree for the 1600 ms before `replace()` fires (line 17). `useFestivalAuditLogs`, `useMemberAudits`, `usePandalRoles` and `useJoinRequests` all open live listeners that the rules reject. The covering `View` has no `accessibilityViewIsModal` or `importantForAccessibility="no-hide-descendants"`, so a screen reader can still traverse the content behind it.

### Expected Behavior
`if (!isAdmin) return <Denied/>;` — do not mount children at all.

### Evidence
`components/ganesh/AdminGate.tsx:17, 21-53`; `app/(ganesh)/admin/_layout.tsx:10-29`.

### Impact
- **Security:** defence in depth only — the server rules remain the real boundary, so this is not a data breach.
- **Reliability:** wasted permission-denied round trips and log noise.
- **Accessibility:** the visual gate is bypassable by a screen reader.

### Recommended Fix
Early-return the denial and loading states instead of overlaying them.

### Acceptance Criteria
- [ ] A non-admin deep-linking to an admin route mounts no admin data listeners.
- [ ] No permission-denied errors are logged for the denial path.
- [ ] A screen reader cannot reach the admin content behind the denial screen.
- [ ] An admin still reaches every admin route normally.

### Dependencies
None.


### Resolution (2026-09-05)
`AdminGate` now returns each state instead of overlaying it: loading returns a
spinner screen, non-admin returns the denial screen, and only an admin reaches
`children`. The `useEffect` holding the redirect timer stays above the early
returns so hook order is stable across the loading -> allowed/denied
transition.

All four acceptance criteria met, and the third is met **by construction**
rather than by adding a prop: with nothing rendered behind the denial screen
there is no admin content for a screen reader to traverse, so no
`accessibilityViewIsModal` or `importantForAccessibility` is needed - and none
can later be forgotten.

The listener waste this fixes was real: a non-admin deep-linking to
`/(ganesh)/admin/audit` mounted the whole admin subtree for the 1600 ms before
the redirect, so `useFestivalAuditLogs`, `useMemberAudits`, `usePandalRoles` and
`useJoinRequests` each opened a live listener the rules then rejected.

The server rules remain the real boundary - this was always defence in depth.
What changed is what the client asks for, not what it is allowed to have.
---

## GS-055 — The admin dashboard duplicates eight destinations across five sections

**Severity:** MEDIUM
**Category:** UX
**Feature:** Admin Dashboard
**Status:** FIXED - 2026-09-05 (largely stale; one real duplicate, which leaked a gated figure)

### Problem
All 25 dashboard rows navigate somewhere real, but the screen has five overlapping sections that repeat the same destinations, roughly doubling its length.

### Current Behavior
`app/(ganesh)/admin/index.tsx:254-397`:
- `/(ganesh)/members` — three times (lines 268, 306, 322), labelled "Members", "Manage members", "Members"
- `/(ganesh)/admin/reports` — twice (288, 380)
- `/(ganesh)/admin/setup` — twice (283, 351)
- `/(ganesh)/admin/festivals` — twice (278, 341)
- `/(ganesh)/permanent-fund` — twice (273, 346), as "Permanent Fund" and "Money & funds"
- `/(ganesh)/sponsors` — twice (228, 371)
- `/(ganesh)/join-requests` — twice (262, 327)
- The "Members" metric tile appears twice (193-198 and 293-299)

### Expected Behavior
One destination, one row.

### Evidence
`app/(ganesh)/admin/index.tsx:193-198, 228, 254-397`.

### Impact
- **User:** the admin must scan four sections to find whether an action exists, on a phone. This is a usability cost, not a styling preference.

### Recommended Fix
Consolidate into a single set of sections with no repeated destinations.

### Acceptance Criteria
- [ ] No destination appears more than once on the dashboard.
- [ ] Every action previously reachable is still reachable.
- [ ] The screen is materially shorter.

### Dependencies
None.


### Resolution (2026-09-05)
Mostly stale, with one real duplicate that turned out to be a permission bug
rather than clutter.

**Stale.** The ticket describes eight duplicated destinations across five
overlapping sections and 25 rows. The screen has since been restructured into
the groups CLAUDE.md asks for - Admin summary, Needs attention, Financial
overview, People, Festival & funds, Pandal property, Review & settings - and of
the 17 destinations on it, exactly **one** was reachable twice. None of the
specific duplications the ticket lists still exists: `/members`,
`/admin/reports`, `/admin/setup`, `/admin/festivals`, `/sponsors` and
`/join-requests` each appear once. The "Members metric tile twice" claim does
not hold either; there are four metric tiles and no repeats.

**Real.** `/(ganesh)/permanent-fund` appeared in both *Financial overview* and
*Festival & funds*, same destination and same figure. The copy under Festival &
funds was removed, for two reasons - and the second is the one that matters:

- The Permanent Fund is Pandal-level, not festival-scoped, so it does not
  belong under a festival heading.
- Unlike the Financial-overview row, that copy was **not** gated on
  `can("permanentFund.read")`. It rendered `formatInr(fund.total)`
  unconditionally, so a member the permission was meant to keep the balance
  from could read it off the admin dashboard. Deduplicating closed a permission
  inconsistency, not just shortened a screen.

**Judgement recorded:** the *Needs attention* section is left alone. It is a
dynamic alert list driven by `needs`, so a route it surfaces may also live in
its own section - that is a contextual alert pointing at work to do, not a
duplicated navigation entry, and collapsing it would remove the one part of the
dashboard that tells an admin where to start.
---

## GS-056 — The admin dashboard error state ignores half of its queries

**Severity:** MEDIUM
**Category:** UX
**Feature:** Admin Dashboard
**Status:** FIXED 2026-09-03

### Problem
The composite error value covers four of the ten hooks; the rest have their `LoadFailure` destructured away and discarded.

### Current Behavior
`app/(ganesh)/admin/index.tsx:173`:

```ts
const error = pandalsError ?? festivalsError ?? membersError ?? requestsError;
```

`usePermanentFund`, `usePandalAssets`, `useGaneshSummary`, `useContributions`, `useSponsorships` and `useHouseholds` all expose a `LoadFailure` (`lib/firestoreErrors.ts:16-30`) that is dropped at lines 43-50. A permission-denied on the summary renders as ₹0, not as an error.

### Expected Behavior
Every query's failure is surfaced.

### Evidence
`app/(ganesh)/admin/index.tsx:43-50, 173`; `lib/firestoreErrors.ts:16-30`.

### Impact
- **User:** a genuine failure is indistinguishable from empty data, so the real problem is never diagnosed.

### Recommended Fix
Include every hook's error in the composite, and render `AdminQueryState`'s error branch with a retry.

### Acceptance Criteria
- [ ] A failure in any dashboard query surfaces an error and a retry.
- [ ] No dashboard figure renders as ₹0 when its source failed.

### Dependencies
Related to GS-034, GS-032.


### Resolution (2026-09-03)

Closed by the GS-034 work. The admin dashboard's `error` now falls through all
nine sources - pandals, festivals, members, requests, summary, assets,
contributions, sponsorships, households - rather than the four it covered.
---

## GS-057 — Five add-screens have no closed-festival guard

**Severity:** MEDIUM
**Category:** UX
**Feature:** Festival
**Status:** FIXED 2026-09-04

### Problem
Two of the seven money-entry screens disable Save when the festival is closed; five do not, so the user fills in a whole form that the rules will reject.

### Current Behavior
`app/(ganesh)/add-expense.tsx:84, 433` and `add-sponsor.tsx:89, 313` correctly compute `closed` and disable Save. These do not:

| File | Save button | Note |
| --- | --- | --- |
| `add-collection.tsx:114` | `loading={busy}` only | reads `festival` at line 32 solely for `householdTargetAmount`; status is available and unused |
| `add-contribution.tsx:291-293` | `disabled={ledgerSaved}` only | does not load festivals at all |
| `add-member-payment.tsx:127-128` | `loading={busy}` only | loads `festival` at line 35 for targets, ignores status |
| `add-reimbursement.tsx:100-101` | `loading={busy}` only | does not load festivals at all |
| `add-opening-fund.tsx:70-71` | `loading={busy}` only | does not load festivals at all |

Reachable via deep link, or via a back-stack entry that predates the close.

### Expected Behavior
All money-entry screens disable Save and explain why when the festival is closed.

### Evidence
The table above; `firestore.rules:820-827` for the rejection.

### Impact
- **User:** wasted data entry followed by a misleading error (GS-035).

### Recommended Fix
Apply the `add-expense.tsx` pattern to all five, or lift the check into `GaneshWriteLock`.

### Acceptance Criteria
- [ ] All seven money-entry screens disable Save on a closed festival.
- [ ] The reason is stated on screen.
- [ ] Open-festival entry is unaffected.

### Dependencies
Related to GS-035, GS-058.

---

## GS-058 — No persistent read-only banner when a festival is closed

**Severity:** MEDIUM
**Category:** UX
**Feature:** Festival
**Status:** FIXED - 2026-09-04

### Problem
Nothing tells the user the ledger is frozen. The closed state is communicated only by absent buttons, which reads as a permissions problem.

### Current Behavior
`app/(ganesh)/(tabs)/index.tsx:39` computes `closed` and uses it only to grey out the quick actions. `collections.tsx:181`, `expenses.tsx:212`, `contributions.tsx:257` and `committee.tsx:217` simply hide the FAB. There is no banner anywhere.

### Expected Behavior
A persistent "This festival is closed — read only" banner on every festival-scoped screen, with a route to create the next festival.

### Evidence
`app/(ganesh)/(tabs)/index.tsx:39`; `collections.tsx:181`; `expenses.tsx:212`; `contributions.tsx:257`; `committee.tsx:217`.

### Impact
- **User:** a collector concludes their permissions were revoked rather than that the year ended.

### Recommended Fix
Add the banner to `GaneshScreen` or the tabs layout, driven by the festival status already in context.

### Acceptance Criteria
- [ ] Every festival-scoped screen shows a read-only banner when the festival is closed.
- [ ] The banner links to creating the next festival for those permitted.

### Dependencies
Related to GS-035, GS-057.


### Resolution (2026-09-04)
`components/ganesh/GaneshClosedBanner.tsx` added and placed on all five
festival-scoped surfaces: Home, and the Collections, Expenses, Contributions and
Committee screens.

Self-contained on purpose - it reads the session and festival status itself and
returns `null` while the festival is open. A screen adds it with one line and
cannot get the condition subtly wrong, which matters when the same condition has
to agree across five screens.

Only `status === "closed"` shows it. An unknown or still-loading status must not
claim the books are shut - that is GS-032's mistake in the opposite direction.

The "Create the next festival" route is offered only to a role holding
`festival.create`. On Home this **replaces** a bare "Create next festival"
button, which had been offering the way out without ever saying what was wrong.
The copy differs by role for the same reason: a member who cannot create the
next festival is told the year is a record rather than a permissions problem,
which is the exact misreading the ticket describes - and the same false signal
`explainRefusal` was added to remove on the write path (GS-035).
---

## GS-059 — Committee payments bypass the offline money-receive guard

**Severity:** MEDIUM
**Category:** OFFLINE
**Feature:** Committee Contributions
**Status:** FIXED — verified 2026-09-03

### Problem
Money receipt is gated on connectivity everywhere except the committee-payment path, which records received cash offline.

### Current Behavior
`hooks/useGaneshWrites.ts:217` applies `assertMoneyReceiveOnline` in `receiveContribution`; `addContribution` (lines 191-198) does not. `app/(ganesh)/add-member-payment.tsx:132-142` calls `addContribution({kind: "money", status: "received"})` with no network check — unlike `add-sponsor.tsx:313` and `contribution/[id].tsx:392`, which do gate on `isOnline`.

### Expected Behavior
Recording received money offline is gated the same way everywhere.

### Evidence
`hooks/useGaneshWrites.ts:191-198, 217`; `app/(ganesh)/add-member-payment.tsx:132-142`; `shared/utils/ganeshContributions.ts:145-150`.

### Impact
- **Financial correctness:** an offline committee payment queues a `contributionPaid` and `committeeContributions` increment. If the same payment is entered on a second phone, it double-counts — which is precisely what the guard exists to prevent.

### Recommended Fix
Apply `assertMoneyReceiveOnline` to `addContribution` when `status === "received"` and `kind === "money"`.

### Acceptance Criteria
- [ ] Recording a received committee payment offline is refused with a clear message.
- [ ] Recording a promised contribution offline still works.
- [ ] Online committee payments are unaffected.

### Dependencies
Related to GS-037, GS-010.


### Verification (2026-09-03)

Fixed. Committee payments go through `addContribution`, and its wrapper in
`useGaneshWrites` now calls `assertMoneyReceiveOnline(isOnline, input.kind)`
whenever the contribution is being recorded as already received, so the offline
guard applies to this path too.
---

## GS-060 — Sponsor profile editing is blocked when the current festival is closed

**Severity:** MEDIUM
**Category:** SPONSORS
**Feature:** Sponsors
**Status:** FIXED — verified 2026-09-04

### Problem
Sponsor profiles are pandal-level and the rules impose no festival condition on them, but the UI gates profile editing on an open festival.

### Current Behavior
`app/(ganesh)/sponsor/[id].tsx:213` gates the profile form on `can("sponsors.update") && openFestival`, and `add-sponsor.tsx:313` disables Save when closed. The sponsor document lives at `pandals/{p}/sponsors/{id}` and `firestore.rules:686-691` has no festival-status condition.

So after closing the 2026 festival and before creating 2027, a committee cannot correct a sponsor's phone number or add a new sponsor.

### Expected Behavior
Pandal-level sponsor profiles are editable regardless of festival status; only festival-scoped *sponsorships* need the open-festival gate.

### Evidence
`app/(ganesh)/sponsor/[id].tsx:213`; `add-sponsor.tsx:313`; `firestore.rules:686-691`.

### Impact
- **User:** a pure client-side restriction with no data-model basis blocks legitimate work in the off-season.

### Recommended Fix
Separate the gates: profile edits require only `sponsors.update`; sponsorship transitions keep the open-festival requirement.

### Acceptance Criteria
- [ ] A sponsor profile can be created and edited with no open festival.
- [ ] Sponsorship status transitions still require an open festival.

### Dependencies
None.

---

## GS-061 — Custom expense categories are not carried forward to the next festival

**Severity:** MEDIUM
**Category:** FESTIVAL
**Feature:** Festivals
**Status:** FIXED - 2026-09-04

### Problem
Creating a festival seeds only the built-in default categories, so every custom category must be recreated each year.

### Current Behavior
`services/ganesh/ganeshWrites.ts:741-750` seeds `DEFAULT_GANESH_CATEGORIES` only. Categories are festival-scoped (`shared/utils/ganeshPaths.ts`), which is correct for preserving historical naming, but nothing copies the previous year's custom entries forward. `addCustomCategory` also writes no audit entry (GS-053).

### Expected Behavior
Offer to carry forward the previous festival's custom categories at creation time.

### Evidence
`services/ganesh/ganeshWrites.ts:696-756, 741-750, 2083-2104`.

### Impact
- **User:** avoidable repeated setup work each year, and inconsistent category naming across years makes multi-year comparison harder.

### Recommended Fix
At festival creation, copy the previous festival's non-default categories, ideally behind a confirmation.

### Acceptance Criteria
- [ ] Creating a festival offers to carry forward custom categories.
- [ ] Declining still seeds the defaults.
- [ ] Historical festivals keep their own category documents unchanged.

### Dependencies
Related to GS-062.


### Resolution (2026-09-04)
`customCategoriesToCarryForward` added to `ganeshMath.ts` beside its household
sibling `mapHouseholdForNewFestival`, and wired into `createFestival` as its own
batch after the seed - the same shape as the GS-062 household carry-forward, and
for the same reason: a failure there leaves a usable festival with default
categories rather than no festival at all.

Offered rather than automatic, per the acceptance criteria: a "Carry them
forward / Start with defaults only" chip on `create-festival.tsx`, shown only
when a previous festival exists, because otherwise the question is meaningless.
`carryForwardCategories` defaults to **true** in the service, so a caller that
omits it gets the safe behaviour - silently losing the committee's categories is
the bug this flag exists to fix, and that should not be the default anyone gets
by accident.

Four filtering rules, each with a reason recorded at the helper:

- **Defaults are skipped.** The new festival seeds its own, and the shipped
  default list can change between releases; copying last year's copies would
  freeze an old default set forever.
- **Disabled categories are skipped.** The committee explicitly turned those
  off; carrying them forward would undo that decision every single year.
- **A custom name that has since become a default is skipped**, so a category
  promoted into the shipped list does not appear twice and split its expenses.
- **Names compare case- and whitespace-insensitively**, and duplicates within
  the previous year collapse - which is the actual cause of the ticket's
  "inconsistent naming across years makes comparison harder".

Historical festivals are untouched: this only ever writes into the new
festival's own subcollection.

9 tests on the helper, including the malformed documents a real collection
contains (missing name, numeric name, non-numeric sortOrder, missing
`isDefault`). A missing or nonsensical `sortOrder` falls back to the same 500
`addCustomCategory` writes, so carried categories sort where custom ones do.
---

## GS-062 — The household list is not carried forward between festivals

**Severity:** MEDIUM
**Category:** COLLECTIONS
**Feature:** Households
**Status:** FIXED — verified 2026-09-04

### Problem
Households are festival-scoped and nothing imports the previous year's list, so the street roster must be rebuilt from scratch each year.

### Current Behavior
Households live at `festivals/{f}/households` (`shared/utils/ganeshPaths.ts:17-35`) and `createFestival` (`services/ganesh/ganeshWrites.ts:696-756`) seeds only members, summary and default categories.

### Expected Behavior
Offer to import the previous festival's households (name, house number, mobile, address) with reset amounts.

### Evidence
`shared/utils/ganeshPaths.ts:17-35`; `services/ganesh/ganeshWrites.ts:696-756`.

### Impact
- **User:** a door-to-door committee re-enters its entire street list annually — the largest single data-entry burden in the product.

### Recommended Fix
Add an "Import households from <previous festival>" step to festival creation that copies identity fields and resets `collectedAmount` and `status`.

### Acceptance Criteria
- [ ] Creating a festival offers to import the previous household list.
- [ ] Imported households start with zero collected and `pending` status.
- [ ] The expected amount defaults to the new festival's household target.
- [ ] Declining leaves the new festival with no households.

### Dependencies
Should land after GS-006, which makes households functional in the first place.

---

## GS-063 — `ContributionMode: "custom"` is unreachable from the UI

**Severity:** MEDIUM
**Category:** CONTRIBUTIONS
**Feature:** Committee Contributions
**Status:** FIXED - 2026-09-04

### Problem
The service implements distinct behaviour for a `"custom"` contribution mode, but both writers hard-code `"same"`, so the mode can never be selected.

### Current Behavior
`ContributionMode` is `"same" | "custom"` (`shared/types/ganesh.ts:5`). `services/ganesh/ganeshWrites.ts:780-784` implements different behaviour per mode. But `app/(ganesh)/admin/setup.tsx:70` and `app/(ganesh)/(tabs)/pandal.tsx:210` both write `"same"` unconditionally. There is also no slab or tier configuration.

Per-person overrides do work, via `member/[id].tsx:332-382` and `effectiveCommitteeTarget` (`shared/utils/ganeshMath.ts:293-306`).

### Expected Behavior
Either expose the mode selector, or remove the dead branch and the type member.

### Evidence
`shared/types/ganesh.ts:5`; `services/ganesh/ganeshWrites.ts:780-784`; `app/(ganesh)/admin/setup.tsx:70`; `app/(ganesh)/(tabs)/pandal.tsx:210`.

### Impact
- **User:** a designed configuration option is unavailable.
- **Maintenance:** an untested code branch that nothing can reach.

### Recommended Fix
Decide whether custom mode is wanted. If yes, add the selector to the setup screen. If no, delete the branch and the type member.

### Acceptance Criteria
- [ ] Either the mode is selectable and its behaviour is exercised, or the dead branch is removed.
- [ ] Per-member overrides continue to work either way.

### Dependencies
None.


### Confirmed (2026-09-03)

`ContributionMode` is still `"same" | "custom"` and nothing sets `"custom"`:
`pandal.tsx` hardcodes `contributionMode: "same"` on save. The variant is dead
weight in the type - either wire per-member targets to it (the mechanism exists
as `setMemberContributionTarget`) or drop it.

### Resolution (2026-09-04)
Removed, not wired - and the branch turned out to be worse than dead.

Had `"custom"` ever been reachable, it read each member's target as
`Number(input.customTargets?.[memberSnap.id] ?? 0)`, so **every member absent
from that map would have had their target silently set to zero**. And unlike the
`"same"` path it did not skip members with `contributionTargetOverridden`, so a
bulk save would have wiped individually agreed targets. A dead branch that
destroys data when woken is not a feature waiting to be enabled.

Nothing was lost by deleting it: per-member targets already exist and are
reachable, through `setMemberContributionTarget` on `member/[id].tsx` and
`effectiveCommitteeTarget`. `"custom"` was a second, redundant route to an
outcome the app already supports properly.

`ContributionMode` is now a one-member union rather than a removed field,
because every stored festival document carries `contributionMode: "same"`. The
`contributionTargetOverridden` skip in `setContributionTargets` is now
unconditional, which is what it always effectively was.

Verified `ContributionMode` and `customTargets` had no other reader anywhere in
the repo before removing them; `typecheck` and `typecheck:shared` both clean.
---

## GS-064 — `useGaneshSyncReporter` duplicates the four largest listeners

**Severity:** MEDIUM
**Category:** PERFORMANCE
**Feature:** Shared real-time data
**Status:** FIXED — verified 2026-09-04

### Problem
To produce a single pending-write integer, the tabs layout subscribes to the four largest collections, which every individual tab then subscribes to again.

### Current Behavior
`hooks/useGaneshSyncReporter.ts:10-21`, mounted at `app/(ganesh)/(tabs)/_layout.tsx:14`, subscribes to collections (400), expenses (400), contributions (400) and activity (40). Each tab's own hook subscribes to the same queries. Firestore dedupes the network target, but each `useGaneshCollection` instance keeps its own full mapped array in JS memory and re-runs `mapDoc` over every document on every snapshot.

### Expected Behavior
The pending count is derived from listeners that already exist.

### Evidence
`hooks/useGaneshSyncReporter.ts:10-21`; `app/(ganesh)/(tabs)/_layout.tsx:14`; `hooks/ganesh/useGaneshCollection.ts`.

### Impact
- **Performance:** opening the dashboard — a screen needing only the summary document and 40 activity rows — pulls and holds up to ~1240 documents twice over. Noticeable memory and cold-start cost on low-end Android, which is the target device.

### Recommended Fix
Lift the counts into a context that the tabs feed from their existing listeners, or use a much smaller `limit` for the counting listeners.

### Acceptance Criteria
- [ ] The pending-write indicator no longer opens duplicate large listeners.
- [ ] The indicator still reflects queued writes accurately.
- [ ] Dashboard cold-start memory measurably improves.

### Dependencies
None.

---

## GS-065 — Households, members, roles and join-request listeners have no `limit`

**Severity:** MEDIUM
**Category:** PERFORMANCE
**Feature:** Households
**Status:** FIXED — 2026-09-04

### Problem
Several collection listeners build unconstrained queries. The household listener is the one that matters, because it grows with every collection drive.

### Current Behavior
No `limitTo` is passed by `hooks/useHouseholds.ts:6-14` (also no `orderBy`), `hooks/usePandalMembers.ts:6-9`, `hooks/useFestivalMembers.ts:6-9`, `hooks/usePandalRoles.ts:6-9`, `hooks/useGaneshCategories.ts:6-10`, `hooks/useFestivals.ts:6-10` or `hooks/useJoinRequests.ts:6-12`.

There is one household document per donor house, loaded on the collections tab (`app/(ganesh)/(tabs)/collections.tsx:33`). A pandal covering a few thousand houses downloads the whole set on every tab open. `useJoinRequests` additionally queries the root `pandalJoinRequests` collection with only a `where` filter and no cap.

For contrast, the other hooks are capped: collections, expenses, contributions and sponsorships at 400; permanent-fund transactions and reimbursements at 200; opening funds at 100; activity and audits at 40–80.

### Expected Behavior
A bounded query with pagination for households.

### Evidence
The hook list above; `app/(ganesh)/(tabs)/collections.tsx:33`.

### Impact
- **Performance:** read cost and cold-start time grow with pandal size, worst on the devices least able to absorb it.

### Recommended Fix
Add `limitTo` to all of them and paginate the household list.

### Acceptance Criteria
- [ ] Every Ganesh listener has an explicit bound.
- [ ] The household list paginates rather than truncating silently.
- [ ] Household-derived statistics remain correct under pagination (see GS-006).

### Dependencies
Related to GS-006, GS-013.


### Resolution (2026-09-04)
Caps added to every listener the ticket named. The five naturally-small ones
(`usePandalMembers` 500, `useFestivalMembers` 500, `usePandalRoles` 200,
`useGaneshCategories` 200, `useFestivals` 100, `useJoinRequests` 300) got bounds
high enough to be unreachable in practice — an upper bound on a runaway query,
not a page size.

`useHouseholds` was treated differently on purpose. It is the only Ganesh
listener that scales with the community rather than the committee, and it is the
list a collector works through door to door, so a bare cap would have been worse
than none: a silently short list reads as "these are all the houses", and the
coverage percentages on `CollectionsList` would be computed over a partial set
while looking authoritative. It is capped at `HOUSEHOLD_LIMIT = 2000` and the
hook returns `truncated`, which `CollectionsList` renders as a saffron-bordered
notice above the coverage strip saying the counts cover only the loaded houses
and that search still finds the rest. Full pagination remains open as a
follow-up; this makes the bound honest in the meantime.

Two judgement calls worth recording:

- No `orderBy` was added to `usePandalMembers`. `joinedAt` is optional on
  `PandalMember` (and `ganeshWrites.ts:1071` sets it from `createdAt`, which can
  be absent), and Firestore excludes documents that lack the ordered field — so
  ordering there would have hidden members rather than sorting them. That is the
  same silent-exclusion defect this group exists to remove.
- No `orderBy` was added to `useJoinRequests` or `useFestivalMembers` either:
  alongside their `where` filter it would require a composite index, and the
  query would fail with `failed-precondition` until that index finished
  building.

The ticket's `app/(ganesh)/(tabs)/collections.tsx:33` reference was stale — the
household list lives in `components/ganesh/funds/CollectionsList.tsx`.
---

## GS-066 — `useSponsorHistory` is an unbounded N+1 with client-side filtering

**Severity:** MEDIUM
**Category:** PERFORMANCE
**Feature:** Sponsors
**Status:** FIXED — 2026-09-04

### Problem
Opening one sponsor's detail page reads every sponsorship of every festival and filters in JavaScript.

### Current Behavior
`hooks/usePandalSponsors.ts:90-101`:

```ts
festivalIds.map(async (festivalId) => {
  const snap = await getDocs(collection(db, root, ...rest));   // whole collection
  return snap.docs.filter((d) => String(d.data().sponsorId ?? "") === sponsorId)
```

One unbounded `getDocs` per festival, no `where("sponsorId","==",sponsorId)`, no `limit`, filtered after the fact. It is also the only one-shot read in an otherwise fully real-time feature (see GS-070's sibling note in the matrix).

Called from `app/(ganesh)/sponsor/[id].tsx:62`.

### Expected Behavior
`query(col, where("sponsorId","==",sponsorId), limit(n))` per festival.

### Evidence
`hooks/usePandalSponsors.ts:73-115`; `app/(ganesh)/sponsor/[id].tsx:62`.

### Impact
- **Performance:** cost and latency scale with the pandal's entire history for a page showing a handful of rows.

### Recommended Fix
Add the `where` clause and a limit, or denormalize a per-sponsor history collection.

### Acceptance Criteria
- [ ] Sponsor history reads only that sponsor's sponsorships.
- [ ] The query is bounded.
- [ ] Cross-year history still displays correctly.

### Dependencies
None.


### Resolution (2026-09-04)
Half of this ticket was already fixed and never updated: the `where("sponsorId",
"==", sponsorId)` it asks for exists as `sponsorHistoryWhere` in
`services/ganesh/ganeshSponsorHistory.ts`, and nothing is filtered in JavaScript.
The quoted `snap.docs.filter(...)` is not current code.

What was genuinely unbounded is now bounded: `limit(MAX_PER_FESTIVAL = 100)` per
festival, and `festivalIds.slice(0, MAX_FESTIVALS = 12)` so the fan-out no longer
grows with the Pandal's whole history. The festival cap is safe because
`useFestivals` orders by `year` descending, so callers pass newest-first — that
dependency is asserted by a test rather than left as a comment.

`limit` is applied without an `orderBy` deliberately: an equality filter alone
needs no composite index, so this shipped without an index build. 100 deals for
one sponsor in one festival does not occur, so the cap stops a runaway query
without truncating a real history.

2 tests added (4 in the file).
---

## GS-067 — Per-asset history is truncated by a pandal-wide 80-document cap

**Severity:** MEDIUM
**Category:** ASSETS
**Feature:** Pandal Assets
**Status:** FIXED — 2026-09-04

### Problem
The asset detail screen filters a pandal-wide audit list client-side, and that list is capped at 80 entries ordered by time — so older assets show no history at all.

### Current Behavior
`hooks/usePandalAssets.ts:18-28` fetches asset audits with `limitTo: 80`, ordered by `at` descending, **not** filtered by `assetId`. `app/(ganesh)/asset/[id].tsx:74-77` then filters with `audits.filter(item => item.assetId === id)`.

Any pandal with more than about 80 total asset events shows "No changes recorded yet." for older assets even though the audit documents exist.

### Expected Behavior
Query per asset.

### Evidence
`hooks/usePandalAssets.ts:18-28`; `app/(ganesh)/asset/[id].tsx:74-77`.

### Impact
- **User:** asset history silently disappears, and the empty state asserts there is none.

### Recommended Fix
Add `where("assetId","==",id)` to a per-asset audit query.

### Acceptance Criteria
- [ ] An asset's full history is shown regardless of pandal-wide event volume.
- [ ] "No changes recorded yet" appears only when there genuinely are none.

### Dependencies
Related to GS-095.


### Resolution (2026-09-04)
`usePandalAssetAuditsFor(pandalId, assetId)` added, querying the audit
collection with `where("assetId", "==", assetId)` ordered by `at` descending,
capped at 200. `app/(ganesh)/asset/[id].tsx` uses it instead of filtering the
Pandal-wide 80-document feed client-side.

This was filed as PERFORMANCE but it is a correctness bug: an asset's audit
trail was silently incomplete while looking complete, and the empty state
asserted "No changes recorded yet" over documents that existed. On a Pandal with
any real asset volume, the older the asset the emptier its history looked.

The composite index on (`assetId` ASC, `at` DESC) was added to
`firestore.indexes.json` and deployed **before** this code, because index builds
are asynchronous and the query would otherwise fail with `failed-precondition`.

The hook always queries locally and never uses the shared slice — the shared one
is Pandal-wide by design and cannot answer a per-asset question.
`usePandalAssetAudits` is unchanged and still feeds `admin/audit.tsx`.
---

## GS-068 — The Firestore persistence fallback cannot work and the cache mode is fabricated

**Severity:** MEDIUM
**Category:** OFFLINE
**Feature:** Offline behaviour
**Status:** OPEN

### Problem
The fallback for a failed persistence init retries the same persistent cache, and the reported cache mode is computed from the platform rather than from what actually happened.

### Current Behavior
`lib/firebase.ts:61-66`:

```ts
} catch {
  // Fallback: in-memory cache if persistence init fails (e.g. storage full)
  return initializeFirestore(firebaseApp, {
    localCache: persistentLocalCache(),   // still persistent
  });
}
```

The comment says in-memory; the code retries `persistentLocalCache`. `memoryLocalCache` is never imported (`lib/firebase.ts:13-19`). If persistence init failed because SQLite is unavailable or storage is full, the fallback fails identically — `getFirebaseClients` catches at line 106 and leaves `db = null`, so there is **no Firestore at all** rather than a degraded in-memory client.

Separately, `firestoreCacheMode` (lines 115-119) is computed purely from `Platform.OS`, reporting `"persistent-sqlite"` on native unconditionally; the declared `"memory"` variant is unreachable. The field is documented as being for diagnostics.

Note the underlying setup is otherwise correct: `initializeFirestore` with `persistentLocalCache` and `persistentSingleTabManager({ forceOwnership: true })` on native, `persistentMultipleTabManager` on web. Offline persistence genuinely is enabled and writes do queue.

### Expected Behavior
The fallback uses `memoryLocalCache`, and the reported mode reflects the mode actually chosen.

### Evidence
`lib/firebase.ts:13-19, 44-66, 106, 115-119`.

### Impact
- **Reliability:** on a device with full storage the app loses Firestore entirely instead of degrading, and the diagnostic that would explain it reports "healthy".

### Recommended Fix
Import and use `memoryLocalCache` in the catch, and track the chosen mode in a variable that `firestoreCacheMode` returns.

### Acceptance Criteria
- [ ] A failed persistence init falls back to an in-memory Firestore rather than to `null`.
- [ ] `firestoreCacheMode` reports the mode actually in use.
- [ ] Normal persistent operation is unchanged.

### Dependencies
None. Applies app-wide, not only to Ganesh.

---

## GS-069 — No cleanup path exists; orphaned files accumulate permanently

**Severity:** MEDIUM
**Category:** STORAGE
**Feature:** Supabase Storage
**Status:** FIXED - 2026-09-04 (one criterion recorded as wont-do)

### Problem
`deleteFile` exists and is never called. Nothing removes storage objects when a record is voided, when a photo is replaced with a different extension, or when the Firestore attach fails after a successful upload.

### Current Behavior
`services/ganesh/storage/storageService.ts:139-152` and its wrapper `removeStoredFile` (`hooks/useGaneshStorage.ts:132-138`) have zero call sites outside their own definitions, verified by grep across `app/`, `components/`, `hooks/` and `services/`.

Gaps: `voidFinancialRecord` (`services/ganesh/ganeshWrites.ts:1844`) removes nothing; replacing a png with a jpg changes the path (`services/ganesh/storage/storagePaths.ts:39`) and orphans the original; and the upload happens before the Firestore link is written (`storageService.ts:107` then `hooks/useGaneshStorage.ts:59`), so a crash or a rejected attach orphans the object permanently.

`commitWrite` compounds this: it resolves as `"queued"` after 1500 ms, so `persistReceipt` marks the photo uploaded even when the attach later fails — a late-failure toast fires, but the file is orphaned and the UI already reported success.

### Expected Behavior
Objects are removed when their referencing record is voided or their path changes, and a failed attach cleans up the uploaded object.

### Evidence
`services/ganesh/storage/storageService.ts:107, 139-152`; `hooks/useGaneshStorage.ts:59, 132-138`; `services/ganesh/storage/storagePaths.ts:39`; `services/ganesh/ganeshWrites.ts:1844`.

### Impact
- **Cost:** unbounded growth of unreferenced files that no UI can surface or delete.
- **Security:** given GS-001, these orphans are also readable by anyone.

### Recommended Fix
Call `removeStoredFile` on void and on replace, and add a best-effort `removeObject` in the catch path when the Firestore attach rejects.

### Acceptance Criteria
- [ ] Voiding a record with a photo removes the stored object.
- [ ] Replacing a photo with a different extension removes the previous object.
- [ ] A failed Firestore attach removes the just-uploaded object.
- [ ] No user-visible regression in photo attachment.

### Resolution - 2026-08-27 (PARTIAL — one criterion deliberately not done)

**Done: replacing a photo removes the one it replaces.** `attachExpenseReceipt`,
`attachContributionPhoto`, `attachAssetPhoto` and `attachSponsorPhoto` now read the record's
current photo before overwriting it and report that previous path back to the caller.
`useGaneshStorage`'s four upload functions pass it to a new `bestEffortCleanup`, which calls
`deleteFile` and swallows any error into a warning log rather than surfacing it — a stray
Storage object is a cost, not something the user who successfully replaced their photo
should ever see a toast about.

That report is gated on `commitWrite` returning `"acked"`, not merely resolving. `commitWrite`
resolves as `"queued"` for an offline write that has not actually reached the server yet
(`lib/firestoreWrite.ts`) — reporting the previous path on that outcome and deleting it
immediately would be wrong if the queued write later fails to land, because the record would
still be pointing at a photo that no longer exists. Waiting for a real ack means offline
replacement leaves the old file in place a while longer (closing the gap once reconnected is
future work), which is the safe direction to be wrong in.

**Done: a failed attach cleans up the just-uploaded object.** Each of the four upload
functions now wraps its attach call in try/catch; on failure it deletes the object it just
put in Storage (also best-effort) and rethrows the original error, so the user still sees
the real failure message.

**Not done, on purpose: voiding does not delete a record's photo.** The ticket's own
Recommended Fix says to call `removeStoredFile` on void. I did not implement that. The
receipt/photo preview on `expense/[id].tsx` renders unconditionally on the record's stored
path — it does **not** check `voided` — because a voided expense's receipt is the evidence
for why it was voided (a duplicate entry, a wrong amount, a mis-scan), not garbage to
discard. Deleting it on void would produce a broken image on exactly the record someone is
most likely to come back and review, and would directly violate this same ticket's fourth
acceptance criterion, "no user-visible regression in photo attachment." Collections have no
photo field, and the only other reachable void path in the app is `household/[id].tsx`
(collections), so the gap in practice is limited to expenses; contributions have no void UI
today (voidFinancialRecord supports the entity type, but nothing in `app/` calls it for one).

**Also not done:** cleanup for a write that fails *after* the grace window
(`commitWrite`'s late-failure path, `lib/firestoreWrite.ts:66-74`) rather than before it. The
try/catch here only catches a rejection from the awaited `attachXxx` call, which per
`commitWrite`'s contract only happens for a failure that arrives before the ~1.5s grace
window elapses. A failure that arrives after — reported instead through `onLateFailure`, a
toast — leaves the newly uploaded object orphaned with no cleanup hook, because
`ganeshWrites.ts` has no visibility into Storage to react to it. This was flagged in the
ticket's own evidence and is not closed by this change.

**Verified:** typecheck and typecheck:shared clean; full suite green (125 files / 1270
tests). No existing test referenced the four attach functions' return type, so nothing else
needed updating.

**Not verified by a test:** the cleanup paths are asynchronous, best-effort, and depend on
Storage state, which the project's test setup does not model — covered by the manual guide
below, not by an automated test.

### Dependencies
Related to GS-001, GS-040.


### Resolution (2026-09-04)
Closed, with one acceptance criterion recorded as **won't do** rather than left
open indefinitely.

**Now done: the late-failure orphan.** This was the real remaining gap. The
2026-08-27 pass wrapped each attach in try/catch, but per `commitWrite`'s
contract that only ever catches a failure arriving *inside* the ~1.5s ack grace
window. A failure after it is delivered through `onLateFailure` and never
rejects, so the catch did not run and the uploaded object stayed in Storage
with no record pointing at it.

`onLateFailure` was already a supported option - the four attach functions
simply never passed one. They now take it and hand it to `commitWrite`, and
`useGaneshStorage` supplies `lateFailureCleanup`, which deletes the just-
uploaded object and **also** calls `reportLateWriteFailure`.

That second half matters and is easy to get wrong: supplying `onLateFailure`
*replaces* `commitWrite`'s own reporter rather than adding to it, so a caller
that only cleans up silences the toast and leaves the user believing the photo
attached. `defaultLateFailure` is now exported as `reportLateWriteFailure` for
exactly this composition, and the contract is asserted by a test rather than
left to a comment.

**Won't do: deleting a photo on void.** The 2026-08-27 pass declined this with
a good reason - a voided expense's receipt is the evidence for *why* it was
voided, `expense/[id].tsx` renders it unconditionally, and deleting it would
produce a broken image on the record someone is most likely to review. That
directly contradicts this ticket's own criterion 4, "no user-visible regression
in photo attachment." Two criteria of one ticket cannot both be satisfied;
recording the conflict and choosing evidence-retention is the answer, not a
permanent PARTIAL.

**Still open, tracked elsewhere:** an offline photo *replacement* leaves the
previous object in place until the write is acked, because reporting the
previous path on a merely-queued outcome could delete a photo the record still
points at. Closing that needs the persisted upload queue in GS-040, which is
where it now belongs.

6 tests added on `commitWrite`'s late-failure contract - the previous pass
shipped these cleanup paths with none, noting the test setup does not model
Storage. It does not, but the *hook contract* they depend on is testable, and
that is where the subtle failure was.
---

## GS-070 — Seed-then-transfer runs as two non-atomic steps with no rollback

**Severity:** MEDIUM
**Category:** FINANCE
**Feature:** Permanent Fund
**Status:** OPEN

### Problem
Seeding the Permanent Fund and immediately allocating part of it to a festival are two separately awaited operations. Each is internally transactional; the pair is not.

### Current Behavior
`app/(ganesh)/add-permanent-fund.tsx:73-87` awaits `seedPermanentFund(...)` and then awaits `transferPermanentToFestival(...)` (see also `services/ganesh/ganeshWrites.ts:349-368`). A failure or app kill between them leaves the Permanent Fund seeded with the full amount and the festival with nothing.

Recovery is then blocked: `app/(ganesh)/add-permanent-fund.tsx:110` refuses to re-run because `fund.total > 0`, forcing the user into the "Adjust" path.

### Expected Behavior
Seed and allocate atomically, or make the flow resumable.

### Evidence
`app/(ganesh)/add-permanent-fund.tsx:73-87, 110`; `services/ganesh/ganeshWrites.ts:349-368`; `services/ganesh/ganeshPermanentFund.ts:131-179, 244-347`.

### Impact
- **Financial correctness:** a half-applied setup that the UI then refuses to complete.

### Recommended Fix
Combine the two into a single transaction, or detect the partial state on load and offer to finish the allocation.

### Acceptance Criteria
- [ ] Seed-plus-allocate either both apply or neither does.
- [ ] A partial state from existing data is detectable and recoverable in-app.

### Dependencies
Related to GS-071.

---

## GS-071 — Multi-batch pandal and festival creation has no rollback

**Severity:** MEDIUM
**Category:** FIRESTORE
**Feature:** Pandal creation
**Status:** OPEN — assessed 2026-09-04

### Problem
Pandal creation issues three sequential batch commits plus two transactions. A failure in a later step leaves a partially created pandal.

### Current Behavior
`services/ganesh/ganeshWrites.ts:259-370` (`createPandalAndFestival`) and `696-756` (`createFestival`). Failure of a later step leaves a pandal with no festival, or a festival with no summary, categories or members.

This is compounded by `commitWrite` (`lib/firestoreWrite.ts:56-90`) resolving as `"queued"` after 1500 ms without a server acknowledgement — so step two fires while step one's rejection is still in flight, and only surfaces later as a toast.

Note the *first* batch is correctly atomic: the pandal document, the invite, the membership index and the creator's admin member document all commit together (`services/ganesh/ganeshWrites.ts:259-301`), so creator-becomes-admin is genuinely atomic. The problem is the steps after it.

### Expected Behavior
Creation either completes fully or leaves nothing behind, and a partial state is detectable and repairable.

### Evidence
`services/ganesh/ganeshWrites.ts:259-301, 259-370, 696-756`; `lib/firestoreWrite.ts:56-90`.

### Impact
- **Data:** a half-created pandal or festival with no in-app repair path.
- **User:** a confusing empty state after what looked like a successful setup.

### Recommended Fix
Where the writes fit within Firestore's limits, merge them into fewer atomic operations. Otherwise, detect the incomplete state on load and offer to finish seeding.

### Acceptance Criteria
- [ ] A failure partway through creation leaves a detectable, repairable state.
- [ ] The app offers to complete an incomplete pandal or festival.
- [ ] Normal creation is unaffected.

### Dependencies
Related to GS-070.

---

## GS-072 — The recompute treats a missing contribution status as `received`

**Severity:** MEDIUM
**Category:** FIRESTORE
**Feature:** Reports
**Status:** FIXED 2026-09-04

### Problem
The rebuild and the UI disagree about what a contribution with no `status` field means.

### Current Behavior
`services/ganesh/ganeshWrites.ts:2039-2040` excludes only `"cancelled"` and `"promised"`, so an absent status counts as **received**. `shared/utils/ganeshContributions.ts:13-19` defaults an absent status to **promised**.

A contribution document with no `status` is therefore invisible-as-promised in the UI but counted as cash by "Recalculate from ledger". All current write paths set `status`, so this bites only legacy or externally written data — but it is exactly the case a rebuild tool must get right.

### Expected Behavior
One definition, shared by both.

### Evidence
`services/ganesh/ganeshWrites.ts:2039-2040`; `shared/utils/ganeshContributions.ts:13-19`.

### Impact
- **Financial correctness:** running the repair tool can silently convert promised money into counted cash.

### Recommended Fix
Have the rebuild use `contributionStatusOf()` rather than its own inline predicate.

### Acceptance Criteria
- [ ] The rebuild and the UI agree on a contribution with no status.
- [ ] A test covers the missing-status case.

### Dependencies
Related to GS-012.


### Confirmed (2026-09-03)

Still present. `recomputeFestivalSummary`'s `received()` predicate is
`notVoided(doc) && status !== 'cancelled' && status !== 'promised'`, so a
contribution document with no `status` at all counts as received and is added
to festival cash. `addContribution` always writes a status, so this only bites
documents written by an older build or by hand - but the recompute is precisely
the tool reached for when totals are already suspect.
---

## GS-073 — Every member, including `viewer`, can read all donor PII

**Severity:** MEDIUM
**Category:** SECURITY
**Feature:** Collections
**Status:** FIXED 2026-09-04 — DEPLOYED

### Problem
Assets and sponsors have dedicated read permissions; festival ledger subcollections do not. Every active member — including `viewer` and `collector` — can read all collections and contributions, and therefore every donor's name, mobile number and address.

### Current Behavior
`firestore.rules:825`: `allow read: if isActivePandalMember() && subcol != 'auditLogs'`. Compare `canReadAssetOf` (`firestore.rules:424-430`) and `canReadSponsorOf` (`363-369`), which do gate on a permission.

Related: `pandalJoinRequests` read is any active member (`firestore.rules:495-497`), so every member can also list applicants' names and phone numbers.

### Expected Behavior
Donor PII is gated by a read permission, consistent with assets and sponsors.

### Evidence
`firestore.rules:363-369, 424-430, 495-497, 825`.

### Impact
- **Security:** the least-privileged role has full access to the pandal's donor database. Arguably by design for a small committee, but it is inconsistent with the rest of the model and should be a deliberate decision.

### Recommended Fix
Introduce `collections.read` / `contributions.read` gating, or document explicitly that the ledger is readable by all members and remove the inconsistency from the permission checklist.

### Acceptance Criteria
- [ ] Donor PII access is either permission-gated or documented as intentionally open to all members.
- [ ] The UI permission checklist matches the decision.

### Dependencies
Related to GS-016, GS-042.

---

## GS-074 — Rules are deployed by hand and the contract test is a hand-written mirror

**Severity:** MEDIUM
**Category:** CODE_QUALITY
**Feature:** Security Rules
**Status:** PARTIAL - 2026-09-04 (emulator harness built; manual deploy unchanged)

### Problem
`firestore.rules` is not deployed by CI, and the only test covering it is a TypeScript re-implementation of the rules rather than an execution of them. It cannot catch the class of defect this audit found most of.

### Current Behavior
`firebase.json` declares the rules file, but `docs/FIREBASE_RULES_DEPLOY.md` states that deploying is a deliberate manual step, and there are no CI workflows that deploy it. The live state is unverifiable from the repo.

`shared/utils/ganeshPermissions.rules.contract.test.ts` is a hand-written mirror of the rules in TypeScript. It is genuinely valuable — 20-plus cases covering role sets, escalation and status transitions — but by construction it cannot catch match-shadowing (GS-005), missing-field dereferences (GS-014), or absent payload validation (GS-004). It will stay green while the deployed rules diverge arbitrarily.

### Expected Behavior
Rules are tested against the actual rules engine, and deployment is either automated or verifiably tracked.

### Evidence
`firebase.json`; `docs/FIREBASE_RULES_DEPLOY.md`; `shared/utils/ganeshPermissions.rules.contract.test.ts`; the header comment at `firestore.rules:3-4`.

### Impact
- **Security:** every rules fix in this backlog is inert until someone remembers to deploy, and nothing verifies that what is deployed matches the file.
- **Reliability:** the test suite gives false confidence about the security model.

### Recommended Fix
Stand up `@firebase/rules-unit-testing` against the real `firestore.rules` with the Firestore emulator, and port the contract-test cases to it plus a case per finding in this backlog. Add a CI job that runs them, and either automate deployment or add a check that the deployed ruleset hash matches the file.

### Acceptance Criteria
- [ ] Emulator-based rules tests run in CI against the real rules file.
- [ ] Each rules ticket in this backlog has a corresponding emulator test.
- [ ] Deployment is automated, or drift between the file and the live rules is detected.

### Dependencies
Supports verification of GS-002 – GS-005, GS-014 – GS-018, GS-037, GS-041, GS-073.


### Resolution (2026-09-04)
Half closed: the emulator harness now exists and the hand-mirror problem is
solved for anything written against it. Manual deployment is unchanged, so this
stays PARTIAL rather than closed.

**Built.** `firestore/*.rules.test.ts` run the real `firestore.rules` through the
real rules engine via `@firebase/rules-unit-testing`, against payloads the app
actually writes. `npm run test:rules` starts a Firestore emulator around the
suite. They are deliberately excluded from `vitest.config.ts` and given their
own `vitest.rules.config.ts`, so `npm test` still passes on a machine with no
emulator; `fileParallelism` is off because the suite shares one emulator and
resets it with `clearFirestore()` between tests.

26 tests: the ledger payloads including every optional field, the GS-004 value
and enum validation, summary forgery, GS-017/GS-083 hard-delete refusal,
GS-073 donor-read gating, and the budget matrix below. Two of them exist only
to prove the harness is really evaluating rules - an unauthenticated write and
a non-member write must fail, or a suite where everything passes proves nothing.

**Why this mattered immediately.** The first run found a live production defect
that no mirror could have caught, now filed as GS-104 and fixed: the summary
write path exceeded Firestore's 1000-expression evaluation cap for members whose
documents predate the denormalized `permissions` array. A mirror test cannot
find that class of bug at all - it has no notion of an evaluation budget - and
it is the second time a mirror passed something the engine would reject
(GS-084 was the first).

**Prerequisite worth recording.** `firebase-tools` 14+ requires JDK 21; this
machine has JDK 17, so the script pins `firebase-tools@13.35.1` for the emulator
only. Deployment still uses the current CLI. Installing JDK 21 would let the pin
be dropped.

**Still open.** `firestore.rules` is deployed by hand - these tests are not in
CI, and nothing prevents a deploy that has not run them. That is the remaining
half of this ticket and the reason it is not closed.
---

## GS-075 — Cash Reconciliation is entirely missing

**Severity:** MEDIUM
**Category:** RECONCILIATION
**Feature:** Cash Reconciliation
**Status:** OPEN — confirmed 2026-09-04

### Problem
There is no way to record physical cash counted against ledger cash, and no variance tracking.

### Current Behavior
**MISSING.** No route, no component, no type, no summary field. A repo-wide grep for `reconcil` in Ganesh code returns nothing — the only matches are credit-card-bill code under `app/(app)/`. `GaneshSummary` (`shared/types/ganesh.ts:340-357`) has no counted-cash or variance field. `firestore.rules:703-846` enumerates every festival subcollection and none is a reconciliation collection.

### Expected Behavior
Per the product brief: record expected cash, actual cash and the difference; capture a reason for the variance and the user who performed the count; make reconciliations visible to admins and auditable; and never let a reconciliation silently alter financial records.

### Evidence
Absence, verified by grep across `app/`, `components/`, `hooks/`, `services/`, `shared/` and `firestore.rules`.

### Impact
- **Financial correctness:** the committee cannot verify that the money in the box matches the ledger — the primary control against loss in a cash-heavy operation.

### Recommended Fix
Design a `reconciliations` subcollection with expected/actual/difference, reason, actor and timestamp; an adjustment record that is explicit rather than a silent edit; and admin visibility. This depends on GS-011, since expected cash cannot be computed without end-to-end payment-method tracking.

### Acceptance Criteria
- [ ] A user can record a cash count with expected, actual and difference.
- [ ] A variance requires a reason.
- [ ] The reconciliation is audited and attributed.
- [ ] A reconciliation never silently mutates existing financial records.
- [ ] Admins can review reconciliation history.

### Dependencies
Depends on GS-011. Related to GS-076.

---

## GS-076 — Daily Collection Sessions are entirely missing

**Severity:** MEDIUM
**Category:** COLLECTIONS
**Feature:** Daily Collection Sessions
**Status:** OPEN — confirmed 2026-09-04

### Problem
There is no concept of a collection round: no session, no starting cash, no running total, no close, no handover.

### Current Behavior
**MISSING.** No `sessions` collection in `shared/utils/ganeshPaths.ts`, no `sessionId` on `GaneshCollection` (`shared/types/ganesh.ts:425-439`), no route, and no session collection in the rules' subcollection enumeration. Collections are individually timestamped only.

### Expected Behavior
Per the brief: create a session with a collector, date and starting cash; link collections to it; show a running total; close the session with a cash handover and reconciliation; support multiple collectors and prevent duplicate collection entry.

### Evidence
Absence, verified against `shared/utils/ganeshPaths.ts`, `shared/types/ganesh.ts:425-439` and `firestore.rules:703-846`.

### Impact
- **Financial correctness:** no way to reconcile what a collector took out against what they handed in — the core accountability control for door-to-door chanda.

### Recommended Fix
Add a `collectionSessions` subcollection with collector, date, starting cash, status and closing figures; add `sessionId` to collections; and provide open/close screens with a running total.

### Acceptance Criteria
- [ ] A collector can open a session with a starting cash figure.
- [ ] Collections recorded during a session are linked to it.
- [ ] The session shows a live running total.
- [ ] Closing a session records the handover and any variance.
- [ ] Session totals reconcile against the linked collection documents.

### Dependencies
Depends on GS-011. Related to GS-075, GS-077.

---

## GS-077 — Collection receipt numbers are entirely missing

**Severity:** MEDIUM
**Category:** COLLECTIONS
**Feature:** Receipt Numbers
**Status:** FIXED — verified 2026-09-04

### Problem
There is no receipt or serial number on a collection. "Receipt" in this codebase only ever means a JPEG attached to an expense.

### Current Behavior
**MISSING.** `GaneshCollection` (`shared/types/ganesh.ts:425-439`) has no `receiptNumber`. The `add-collection.tsx` payload (lines 48-63) has no receipt field. `services/ganesh/ganeshWrites.ts:925-945` writes none. Collections are identified only by a `crypto.randomUUID()` document id.

### Expected Behavior
Per the brief: a unique, stable, year-aware receipt number, generated without duplicates under concurrent collection, stored independently of the Firestore document id, and displayed to the donor.

### Evidence
Absence, verified across the type, the screen and the write path.

### Impact
- **User:** a donor has no receipt reference, which is the normal expectation when handing over chanda.
- **Financial correctness:** no human-readable handle for reconciling a paper counterfoil against the app.

### Recommended Fix
Implement a per-festival counter allocated inside a transaction (or a sharded counter) producing a year-prefixed sequence, stored on the collection document. Note that concurrency safety is the hard part — see GS-010 for the pattern to avoid.

### Acceptance Criteria
- [ ] Every collection receives a unique receipt number.
- [ ] The number is year-aware and human-readable.
- [ ] Concurrent collections from multiple collectors never receive the same number.
- [ ] The number is stable across edits and independent of the document id.
- [ ] The number is displayed on the collection row and detail view.

### Dependencies
Related to GS-076.

---

## GS-078 — Money Purpose is missing for every money movement

**Severity:** MEDIUM
**Category:** FINANCE
**Feature:** Money Purpose
**Status:** OPEN — confirmed 2026-09-04

### Problem
Only sponsorships carry a structured purpose. Every other money movement has free text only.

### Current Behavior
The only structured purpose in the domain is `SponsorshipPurpose` on `GaneshSponsorship` (`shared/types/ganesh.ts:247-248`), surfaced in `add-sponsor.tsx:194` and filtered in `sponsors.tsx:191-195`. Collections, contributions, opening funds, member payments, reimbursements and Permanent Fund movements have only `description` or `notes`.

### Expected Behavior
Per the brief: an optional structured purpose that does not alter cash calculations, is displayed where expected, is manageable as a custom list, and is distinct from category and payment method.

### Evidence
`shared/types/ganesh.ts:247-248`; `app/(ganesh)/add-sponsor.tsx:194`; `sponsors.tsx:191-195`; absence elsewhere.

### Impact
- **User:** money movements cannot be grouped or reported by why they happened.

### Recommended Fix
Add an optional `purpose` field to the money-movement types with an admin-managed list, ensuring it is purely descriptive and never enters a cash calculation.

### Acceptance Criteria
- [ ] Purpose is optional on every money movement.
- [ ] Purpose never affects a cash calculation.
- [ ] Purpose is distinct from category and payment method.
- [ ] Custom purposes are manageable by an admin.
- [ ] Purpose remains attached to its transaction and is shown on detail views.

### Dependencies
Related to GS-011.

---

## GS-079 — No export, no date range, and two "report" rows are plain list links

**Severity:** MEDIUM
**Category:** REPORTING
**Feature:** Reports
**Status:** OPEN

### Problem
The reports area has no export, no filtering, and several rows that present themselves as reports are links to raw list tabs.

### Current Behavior
`app/(ganesh)/report.tsx` and `app/(ganesh)/admin/reports.tsx` render live metric grids and a per-sponsor breakdown. There is no date range, no export or share, no PDF or CSV, no print, no per-collector report and no per-category expense breakdown.

Of the eight rows on `admin/reports.tsx`, "Committee contribution summary" (line 138) and "Reimbursement summary" (line 153) both navigate to the same `/(ganesh)/committee` tab, and "Collection summary" and "Expense summary" navigate to the raw list tabs. There is **no reimbursement report screen at all**.

### Expected Behavior
Reports the committee can present: filterable, exportable, and distinct from the data-entry lists.

### Evidence
`app/(ganesh)/report.tsx`; `app/(ganesh)/admin/reports.tsx:128, 133, 138, 143, 153`.

### Impact
- **User:** the year-end account that a Ganesh committee must present to donors cannot be produced from the app.

### Recommended Fix
Build a genuine reimbursement report; make the summary rows real report views rather than list links; add a date range and a share or export path.

### Acceptance Criteria
- [ ] Each "summary" row leads to a report, not a data-entry list.
- [ ] A reimbursement report exists.
- [ ] Reports can be exported or shared.
- [ ] Figures are accurate under the fixes in GS-013 and GS-039.

### Dependencies
Depends on GS-013, GS-039, GS-050, GS-051.

---

## GS-080 — Local `money()` copies drop the epsilon guard, causing false rejections

**Severity:** MEDIUM
**Category:** FINANCE
**Feature:** Split Funding
**Status:** FIXED 2026-09-04

### Problem
The canonical rounding helper adds `Number.EPSILON` before rounding, with a comment explaining why. Three Ganesh copies omit it, and two validators compare rounded sums with exact equality.

### Current Behavior
`shared/utils/money.ts:7-9` defines `roundMoney(v) = Math.round((v + Number.EPSILON) * 100) / 100`. The copies at `shared/utils/ganeshMath.ts:11-13`, `shared/utils/ganeshContributions.ts:4-6` and `shared/utils/ganeshSponsors.ts:10-12` omit the epsilon.

This matters because two validators use exact equality on rounded sums: `validateExpenseFunding` (`shared/utils/ganeshMath.ts:118`) and `validateSettlement` (line 191). A paise-level split can round the two sides differently and reject a genuinely balanced entry with "God Fund + Personal + Sponsored must equal the total expense."

### Expected Behavior
One shared rounding helper.

### Evidence
`shared/utils/money.ts:7-9`; `shared/utils/ganeshMath.ts:11-13, 118, 191`; `ganeshContributions.ts:4-6`; `ganeshSponsors.ts:10-12`.

### Impact
- **User:** a false rejection on correct input. Low frequency with whole-rupee amounts, but confusing and unactionable when it happens.

### Recommended Fix
Replace the three local copies with `roundMoney` from `shared/utils/money.ts`.

### Acceptance Criteria
- [ ] All Ganesh money rounding uses the shared helper.
- [ ] A paise-level split that genuinely balances is accepted.
- [ ] Existing rounding tests still pass.

### Dependencies
None.

---

## GS-081 — Summary counters are unrounded float accumulators

**Severity:** LOW
**Category:** FINANCE
**Feature:** Reports
**Status:** FIXED 2026-09-04

### Problem
Stored summary components accumulate unrounded floats, so they drift even though the displayed derivation rounds.

### Current Behavior
`bumpSummary` (`services/ganesh/ganeshWrites.ts:200-215`) passes raw values to `increment()`. `recomputeFestivalSummary:2068-2073` builds `transferredToPermanentFund` and `receivedFromPermanentFund` with a bare `reduce` and no `money()`, while every other field in `summarizeLedger` is rounded. `app/(ganesh)/(tabs)/pandal.tsx:52, 64` sums member amounts without rounding.

`availableGodFund` rounds its result, masking the drift in displays, but the stored components drift permanently and comparisons against them are unrounded.

### Expected Behavior
Money values are rounded consistently wherever they are stored or compared.

### Evidence
`services/ganesh/ganeshWrites.ts:200-215, 2068-2073`; `app/(ganesh)/(tabs)/pandal.tsx:52, 64`.

### Impact
- **Financial correctness:** slow drift in stored totals; unrounded comparisons can behave unexpectedly at the paise level.

### Recommended Fix
Round before incrementing and in the two unrounded reduces.

### Acceptance Criteria
- [ ] Stored summary fields are rounded to two decimals.
- [ ] The rebuild and the incremental path produce identical values for the same ledger.

### Dependencies
Related to GS-080.

---

## GS-082 — `expenseCreateAllowed()` guards create but not update

**Severity:** MEDIUM
**Category:** SECURITY
**Feature:** Asset vs Expense
**Status:** FIXED 2026-09-04 — DEPLOYED

### Problem
The rule that couples an asset-purchase expense to a real sibling asset applies only on create. On update a client can freely add an `assetId` or flip `expenseType` to `asset_purchase` with no corresponding asset.

### Current Behavior
`firestore.rules:753-763` defines `expenseCreateAllowed()` and it is referenced only in the `allow create` branch (line 829). The `allow update` branch (lines 835-852) does not call it.

### Expected Behavior
The asset link invariant holds on update as well as create.

### Evidence
`firestore.rules:748-763, 829, 835-852`.

### Impact
- **Data:** an expense can claim to be an asset purchase pointing at a non-existent asset, breaking the asset-versus-expense accounting invariant.

### Recommended Fix
Apply an update-time equivalent that either forbids changing `expenseType`/`assetId` after creation, or re-checks the sibling asset.

### Acceptance Criteria
- [ ] An update that adds an `assetId` with no matching asset is refused.
- [ ] An update that flips `expenseType` to `asset_purchase` without a valid asset is refused.
- [ ] Legitimate expense amount edits still work.

### Dependencies
Related to GS-020, GS-004.

---

## GS-083 — Deleting a pandal or festival orphans every subcollection

**Severity:** LOW
**Category:** SECURITY
**Feature:** Festivals
**Status:** FIXED 2026-09-04 — DEPLOYED

### Problem
Firestore does not cascade deletes, so removing a parent document leaves all its subcollection data as unreachable orphans.

### Current Behavior
`firestore.rules:569` permits the owner to delete a pandal; `firestore.rules:711` permits an admin to delete a festival. Neither client path is exposed in the UI today, but both rules are live. Deleting a pandal orphans `permanentFund` — money that then becomes unreachable.

### Expected Behavior
Deletion cascades, or is replaced with an archive flag.

### Evidence
`firestore.rules:569, 711`.

### Impact
- **Data:** unreachable orphan documents, including Permanent Fund records.

### Recommended Fix
Replace hard delete with an archive flag, or implement a server-side cascade.

### Acceptance Criteria
- [ ] Deleting a pandal or festival leaves no unreachable data.
- [ ] Or deletion is replaced by archiving and the delete rules are removed.

### Dependencies
Related to GS-017.

---

## GS-084 — An admin can write arbitrary fields into another user's membership index

**Severity:** LOW
**Category:** SECURITY
**Feature:** Pandal membership
**Status:** FIXED 2026-09-04 — DEPLOYED

### Problem
The exception that lets a pandal admin stamp a user's membership index validates three fields and permits any others.

### Current Behavior
`firestore.rules:471-477` requires `pandalId`, a string `role`, and a `status` in the allowed set — but does not restrict the key set, so an admin can write arbitrary additional fields into `users/{otherUid}/pandalMemberships/{pandalId}`.

### Expected Behavior
The write is limited to the expected field set.

### Evidence
`firestore.rules:466-479`.

### Impact
- **Security:** bounded — the path is a single document in a subcollection the owner can read and delete — but it is an unnecessary write primitive into another user's personal tree.

### Recommended Fix
Add `request.resource.data.keys().hasOnly([...])` to the admin branch.

### Acceptance Criteria
- [ ] An admin stamping a membership can write only the expected fields.
- [ ] Approving a join request still works.

### Dependencies
None.

---

## GS-085 — Fund transfers have no idempotency key

**Severity:** LOW
**Category:** PERMANENT_FUND
**Feature:** Fund Transfers
**Status:** FIXED - 2026-09-05

### Problem
A user-driven retry after a timeout creates a second transfer.

### Current Behavior
Transfer ids are minted before `runTransaction` (`services/ganesh/ganeshPermanentFund.ts:258-260, 368-369`), so *internal* retries are safe. But a user who taps again after an apparent timeout produces a second, distinct transfer. Balances stay self-consistent — the second transaction re-checks the post-first balance — so this is duplication rather than corruption. The only guard is the Button's `loading`→`disabled` behaviour (`components/ui/Button.tsx:60`).

### Expected Behavior
A retried transfer is recognised as the same transfer.

### Evidence
`services/ganesh/ganeshPermanentFund.ts:258-260, 368-369`; `components/ui/Button.tsx:60`.

### Impact
- **Financial correctness:** a duplicated transfer record requiring manual correction. Balances remain internally consistent.

### Recommended Fix
Derive the transfer id from a client-supplied idempotency key held across retries, so a repeat is a no-op.

### Acceptance Criteria
- [ ] Retrying a timed-out transfer does not create a second one.
- [ ] Two genuinely distinct transfers of the same amount are still both recorded.

### Dependencies
Related to GS-021.


### Resolution (2026-09-05)
Both transfer functions now accept a `clientOpId` and derive the transaction
id from it, so a repeat is recognised inside `runTransaction` and skipped. The
existence check reads through the transaction rather than `getDoc`, so it shares
isolation with the balance read it guards.

The sibling documents (`-opening`, `-festival`) are derived from the same key
instead of being minted separately, so a retry that once got part-way through
cannot leave orphans behind.

`permanent-fund.tsx` holds the key in a `useRef` and **rotates it only on
success**. That is what satisfies both criteria at once: a failed attempt keeps
its key, so the retry is the same transfer; a successful one gets a fresh key,
so two genuinely distinct transfers of the same amount are both recorded.

Omitting the key keeps the old behaviour, so any other caller is unchanged -
`add-permanent-fund.tsx` and `create-festival.tsx` still pass none, and both are
single-shot flows rather than a retryable sheet.

6 tests, covering both criteria plus the no-key path.
---

## GS-086 — `collectorId` is arbitrary and unvalidated

**Severity:** MEDIUM
**Category:** DATA_VALIDATION
**Feature:** Collections
**Status:** FIXED 2026-09-04 — DEPLOYED

### Problem
The "Collected by" attribution can be set to any string, and nothing validates that it names an actual member.

### Current Behavior
`app/(ganesh)/add-collection.tsx:39-61, 100-107` lets the writer pick any member, and `services/ganesh/ganeshWrites.ts:932` writes it through unchecked. The rules validate nothing, so a client can write any string — a non-member's uid or a fabricated id.

### Expected Behavior
`collectorId` names an active member of the pandal.

### Evidence
`app/(ganesh)/add-collection.tsx:39-61, 100-107`; `services/ganesh/ganeshWrites.ts:932`; `firestore.rules:826-834`.

### Impact
- **Financial correctness:** cash-handling attribution — the primary accountability control in a chanda ledger — is unverifiable.

### Recommended Fix
Validate `collectorId` against the festival member list in the rules, or restrict it to the writer's own uid unless they hold a delegation permission.

### Acceptance Criteria
- [ ] A collection naming a non-member as collector is refused.
- [ ] Recording a collection on behalf of another member still works where intended.

### Dependencies
Related to GS-004, GS-041, GS-076.

---

## GS-087 — Two festivals can be created for the same year

**Severity:** LOW
**Category:** FESTIVAL
**Feature:** Festivals
**Status:** FIXED — verified 2026-09-04

### Problem
Nothing enforces uniqueness of `(pandalId, year)`.

### Current Behavior
`app/(ganesh)/create-festival.tsx:41-87` and `services/ganesh/ganeshWrites.ts:696-756` validate only `year >= 2000`. Note that even that check is absent from `createFestival` — it lives only in `updateFestivalDetails` (GS-041).

### Expected Behavior
One festival per year per pandal, or an explicit confirmation.

### Evidence
`app/(ganesh)/create-festival.tsx:41-87`; `services/ganesh/ganeshWrites.ts:696-756`.

### Impact
- **User:** duplicate festivals split a year's ledger in two, with the session pointing at one of them.

### Recommended Fix
Check for an existing festival with the same year before creating, and warn or refuse. Add the `year >= 2000` check to the create path.

### Acceptance Criteria
- [ ] Creating a second festival for an existing year warns or is refused.
- [ ] `createFestival` validates the year.

### Dependencies
Related to GS-041, GS-047.

---

## GS-088 — Duplicate pandals are unconstrained and the code fallback is unchecked

**Severity:** LOW
**Category:** SECURITY
**Feature:** Pandal creation
**Status:** FIXED 2026-09-04

### Problem
Nothing prevents creating multiple pandals with the same name and area, and the invite-code generator's last-resort fallback skips its own uniqueness check.

### Current Behavior
`services/ganesh/ganeshWrites.ts:226-371` and `app/(ganesh)/setup.tsx:46-89` perform no existence check on name plus area, and `firestore.rules:564-567` does not prevent it. The only guard against a double-tap is the local `busy` flag (`setup.tsx:43, 68, 87`).

`uniquePandalCode` (`services/ganesh/ganeshWrites.ts:217-224`) tries eight times, then falls back to `generatePandalCode() + generatePandalCode().slice(0,2)` **without** a uniqueness check. If that collides, `pandalBatch.set(doc(db, "pandalInvites", code))` becomes an update on an existing document and is denied by `firestore.rules:486-490`, failing the whole creation. That is a loud failure rather than a silent collision, which is acceptable — but the fallback should still be checked.

### Expected Behavior
Duplicate creation is at least warned about, and the code fallback is verified unique.

### Evidence
`services/ganesh/ganeshWrites.ts:217-224, 226-371`; `app/(ganesh)/setup.tsx:43, 46-89`; `firestore.rules:486-490, 564-567`.

### Impact
- **User:** a committee can end up with two pandals and split its data across them.

### Recommended Fix
Warn on a name-plus-area match before creating, and check the fallback code for uniqueness.

### Acceptance Criteria
- [ ] Creating a pandal matching an existing name and area prompts for confirmation.
- [ ] The fallback invite code is verified unique before use.

### Dependencies
Related to GS-043.

---

## GS-089 — "Cancelled" is offered as a creation status

**Severity:** LOW
**Category:** CONTRIBUTIONS
**Feature:** In-Kind
**Status:** FIXED - 2026-09-04

### Problem
A contribution can be created already cancelled, which has no real-world meaning.

### Current Behavior
`app/(ganesh)/add-contribution.tsx:32-36` lists `cancelled` in `STATUS_OPTIONS`. `addContribution` accepts it and the rules place no constraint on create-time status.

### Expected Behavior
Only `promised` and `received` are creatable; cancellation is a transition.

### Evidence
`app/(ganesh)/add-contribution.tsx:32-36`.

### Impact
- **Data:** pollutes `cancelledValue` on the reports with entries that never existed as promises.

### Recommended Fix
Remove `cancelled` from the creation options, and reject it on create in the rules.

### Acceptance Criteria
- [ ] A contribution cannot be created in the cancelled state.
- [ ] Cancelling a promised contribution still works.

### Dependencies
Related to GS-037.


### Resolution (2026-09-04)
`cancelled` removed from `STATUS_OPTIONS` in `add-contribution.tsx`, and
refused server-side by a new `contributionNotBornCancelled()` in
`firestore.rules` (**deployed**). Both halves, because the client is not the
only writer.

Checked before forbidding it that nothing legitimate creates a cancelled row:
`cancelContribution` and `cancelSponsorship` both `update` an existing document,
so the only source was the stale option.

Why it mattered beyond tidiness: those rows landed in the report's "Cancelled"
figure, which is on the document a committee reads aloud to donors - money shown
as cancelled that was never given and never withdrawn.

Contract-test mirror updated and 1 test added (81 in that file).
---

## GS-090 — Sponsorship-kind value is hidden from the contributions tab metrics

**Severity:** LOW
**Category:** CONTRIBUTIONS
**Feature:** In-Kind
**Status:** FIXED - 2026-09-04

### Problem
`summarizeContributions` computes a sponsored-received figure that the contributions tab never displays.

### Current Behavior
`shared/utils/ganeshContributions.ts:95, 107` computes `sponsoredReceived`, but `app/(ganesh)/(tabs)/contributions.tsx:210-217` renders only cash and in-kind received and promised. A received sponsorship-kind contribution appears in the list rows but in none of the four metrics.

### Expected Behavior
Every value represented in the list is represented in the header metrics.

### Evidence
`shared/utils/ganeshContributions.ts:95, 107`; `app/(ganesh)/(tabs)/contributions.tsx:210-217`.

### Impact
- **User:** the header does not account for all the rows beneath it.

### Recommended Fix
Add a sponsored-received tile, or fold it into the in-kind figure with a clear label.

### Acceptance Criteria
- [ ] The contributions tab metrics account for sponsorship-kind contributions.

### Dependencies
Related to GS-051.


### Resolution (2026-09-04)
The header was worse than the ticket describes. It renders three tiles -
Received, Promised, Pending - and *Received showed cash only* while *Promised
combined cash and in-kind*. So receiving a promised item made Promised fall with
nothing rising to meet it: the value visibly left the header. `inKindReceived`
was as absent as `sponsoredReceived`.

Fixed by putting the non-cash received total (`inKindReceived +
sponsoredReceived`) on the Received tile's meta line - "plus X in kind" - not by
adding it to the headline figure and not by adding a fourth tile.

Two reasons for that shape. The headline is cash in the God Fund, and folding
donated goods into it would overstate what the Pandal can actually spend, which
is the same conflation GS-050 and GS-051 were about. And three tiles already
fill a phone row.

No double counting: a *cash* sponsorship is mirrored into the ledger as a
`kind: "money"` contribution and so is already inside `cashReceived`;
`sponsoredReceived` only ever holds `kind: "sponsorship"` rows.
---

## GS-091 — Committee overpayment is indistinguishable from exact payment

**Severity:** LOW
**Category:** CONTRIBUTIONS
**Feature:** Committee Contributions
**Status:** FIXED - 2026-09-04

### Problem
A member who pays more than their target is displayed identically to one who paid exactly.

### Current Behavior
`shared/utils/ganeshMath.ts:273-277` (`memberRemainingContribution`) clamps at zero and `committeePayStatus` returns `paid`. `app/(ganesh)/add-member-payment.tsx:127-152` accepts any amount with no warning. The excess *is* correctly banked in `committeeContributions`, so this is presentational only.

### Expected Behavior
Overpayment is visible.

### Evidence
`shared/utils/ganeshMath.ts:273-291`; `app/(ganesh)/add-member-payment.tsx:127-152`.

### Impact
- **User:** the committee cannot see who has contributed above their share.

### Recommended Fix
Show the excess on the committee tab and the member detail screen.

### Acceptance Criteria
- [ ] A member who paid above target is visibly distinguished.
- [ ] Ledger totals are unchanged.

### Dependencies
None.


### Resolution (2026-09-04)
`memberExcessContribution` added to `ganeshMath.ts` beside
`memberRemainingContribution`, and surfaced in both places the ticket asked for:

- Committee tab: `X above share` on the member row's footer line.
- Member detail: the Due tile becomes **Above share** and shows the excess.
  That tile reads 0 when someone has overpaid - true, but saying nothing, and
  identical to a member who paid to the rupee - so it was the right slot to
  reuse rather than adding a fourth tile.

Display only. `memberRemainingContribution` still clamps at zero and
`committeePayStatus` still returns `paid`, so no ledger total, status or sort
order changed - the excess was always banked correctly in
`committeeContributions`, it was just invisible in the one direction a committee
would want to see it.
---

## GS-092 — Every sponsorship audit records `action: "edited"`

**Severity:** LOW
**Category:** SPONSORS
**Feature:** Audit Trail
**Status:** FIXED - 2026-09-04

### Problem
The sponsorship audit helper hard-codes a single action, so creation, receipt and cancellation are indistinguishable in the audit log.

### Current Behavior
`services/ganesh/ganeshSponsors.ts:119-131` hard-codes `action: "edited"`, including for the "Sponsorship created" event (lines 505-509). `app/(ganesh)/admin/audit.tsx:70-71` therefore renders every sponsorship event as "X edited a sponsorship".

### Expected Behavior
The audit records the actual action.

### Evidence
`services/ganesh/ganeshSponsors.ts:119-131, 505-509`; `app/(ganesh)/admin/audit.tsx:70-71`.

### Impact
- **User:** sponsorship history in the audit log is uninformative.

### Recommended Fix
Pass the real action through to the audit helper.

### Acceptance Criteria
- [ ] Sponsorship creation, receipt and cancellation are distinguishable in the audit log.

### Dependencies
Related to GS-052.


### Resolution (2026-09-04)
`festivalAudit` took its action from a hard-coded `"edited"`. All 8 call sites
now pass their real verb, and `action` is a **required** positional parameter
rather than an optional one defaulting to `"edited"` - so a new call site has to
state its verb instead of silently inheriting the wrong one.

`AuditAction` needed widening: the union had no verb for the sponsorship
lifecycle, which is why "edited" was reachable as a default in the first place.
Added `promised`, `confirmed`, `received`, `cancelled`. Deliberately *not*
mapped onto existing verbs: cancelling is not voiding - voiding reverses a
recorded fact, cancelling withdraws a promise that was never banked.

Checked before widening that the rules place no enum constraint on `action`
(they don't), so the new values are not denied at the server, and that
`AuditAction` is Ganesh-only with three consumers - no Expense or Nutrition
impact.

`admin/audit.tsx` renders the four new verbs, without which the generic fallback
would have read "X received sponsorship". It also reclassifies `received` and
`cancelled` from the Festival filter to **Money**: those move festival money or
withdraw a promise of it, and while every sponsorship event was written as
"edited" the Money filter showed no sponsorship activity at all. Creation,
promise and confirmation stay under Festival - nothing has moved yet.

Historical rows keep `action: "edited"` and will still render as "edited a
sponsorship". Not backfilled: what those events actually were is not recoverable
from the stored document, and inventing a verb for them would be worse than an
honest vague one.

5 tests added, driving the real write functions rather than the helper - the
defect was never in `festivalAudit`, it was that no call site passed a verb.
---

## GS-093 — `assignedCollectorId` and `notes` are dead fields on households

**Severity:** LOW
**Category:** COLLECTIONS
**Feature:** Households
**Status:** FIXED - 2026-09-04

### Problem
Two household fields are declared and accepted by the service but no screen ever sets them, so collector assignment for door-to-door rounds does not exist.

### Current Behavior
Declared at `shared/types/ganesh.ts:416-417` and accepted by `updateHousehold` (`services/ganesh/ganeshWrites.ts:1018-1019`). `app/(ganesh)/household/[id].tsx:63-88` exposes only expected amount and status.

### Expected Behavior
Either expose collector assignment in the UI, or remove the fields.

### Evidence
`shared/types/ganesh.ts:416-417`; `services/ganesh/ganeshWrites.ts:1018-1019`; `app/(ganesh)/household/[id].tsx:63-88`.

### Impact
- **User:** a designed capability — assigning streets to collectors — is unavailable.

### Recommended Fix
Expose assignment on the household screen, or delete the fields.

### Acceptance Criteria
- [ ] Either a household can be assigned to a collector, or the dead fields are removed.

### Dependencies
Related to GS-006, GS-076.


### Resolution (2026-09-04)
Exposed rather than deleted. The acceptance criterion allowed either, and
removing a designed capability is the larger decision of the two; the data model
was built for dividing streets between collectors and nothing was wrong with it
except that no screen reached it.

On `household/[id].tsx`, both behind the existing `collections.update`
permission:

- **Assigned collector** - the same `FilterChips` pattern as "Collected by" on
  `add-collection.tsx`, with an Unassigned sentinel that writes `null` to clear.
- **Notes** - a multiline input with its own save. `updateHousehold` already
  wrote `notes: input.notes`, but typed it `string | undefined`, so the note
  could be set and never cleared; widened to `string | null` since
  `omitUndefined` drops undefined and keeps null. Read-only roles see the note
  as text.

An assignment nobody can see is not a capability, so it also appears on the
household row in `CollectionsList` as "For <name>", and is matched by the search
box so a collector can pull up their own houses. A dedicated "my houses" filter
chip belongs with the Daily Collection Sessions work (GS-076), not here - that
boundary is recorded in a comment at the search predicate.

No rules change needed: households have no key allowlist.
---

## GS-094 — The payment-method filter ignores the search box

**Severity:** LOW
**Category:** UX
**Feature:** Collections
**Status:** CLOSED - already fixed (verified 2026-09-04)

### Problem
Selecting a cash or UPI filter returns before the search term is applied, so search and filter cannot be combined.

### Current Behavior
`app/(ganesh)/(tabs)/collections.tsx:60` returns before the `needle` check.

### Expected Behavior
Filter and search compose.

### Evidence
`app/(ganesh)/(tabs)/collections.tsx:60`.

### Impact
- **User:** cannot search within a filtered view.

### Recommended Fix
Apply both predicates.

### Acceptance Criteria
- [ ] Search and payment-method filter can be used together.

### Dependencies
None.


### Resolution (2026-09-04)
Already fixed - stale ticket, no code changed.

`visibleCollections` in `components/ganesh/funds/CollectionsList.tsx` applies
both predicates: `if (isEntryView && row.paymentMethod !== filter) return
false;` and only then the `needle` check. Search and the payment-method filter
compose, across donor name, house number, mobile, receipt number and collector
name.

The ticket cites `app/(ganesh)/(tabs)/collections.tsx:60`. That screen was
refactored into `CollectionsList` and the cited line no longer exists - the same
stale path GS-065 was carrying.
---

## GS-095 — Asset detail resolves from a 400-document list and shows a misleading message

**Severity:** LOW
**Category:** ASSETS
**Feature:** Pandal Assets
**Status:** FIXED — 2026-09-04

### Problem
The asset detail screen finds its asset inside a capped list rather than reading it by id, so past 400 assets it claims the asset belongs to another pandal.

### Current Behavior
`hooks/usePandalAssets.ts:13` caps at 400 and `app/(ganesh)/asset/[id].tsx:49` uses `assets.find(...)`. Beyond the cap the screen renders "Asset not found… it belongs to another Pandal" (`asset/[id].tsx:116-127`). The same pattern appears in `app/(ganesh)/contribution/[id].tsx:71` for the linked-asset card.

### Expected Behavior
Read the asset by id.

### Evidence
`hooks/usePandalAssets.ts:13`; `app/(ganesh)/asset/[id].tsx:49, 116-127`; `contribution/[id].tsx:71`.

### Impact
- **User:** an existing asset is reported as belonging to a different pandal.

### Recommended Fix
Fetch the asset document directly by id on the detail screen.

### Acceptance Criteria
- [ ] An asset detail page loads regardless of how many assets the pandal has.
- [ ] The "another Pandal" message appears only when it is true.

### Dependencies
Related to GS-067.


### Resolution (2026-09-04)
`usePandalAsset(pandalId, assetId)` added, reading the asset by id via a
`documentId()` equality query rather than `assets.find(...)` over the 400-cap
list. Implemented as a query rather than a new doc-subscribe primitive so it
inherits `useGaneshCollection`'s error handling, retry and read logging
unchanged.

Both call sites named in the ticket are fixed: `asset/[id].tsx` and the
linked-asset card in `contribution/[id].tsx` (where the card simply vanished
from a contribution that did have an asset).

One consequence needed handling: the asset no longer arrives from an
already-loaded list, so the first render has no asset. Without a gate the screen
would flash "Asset not found" on every open — trading a rare false message for a
constant one. The not-found branch now shows a loading state while the query is
in flight, and its wording drops the removed-from-view hedge.
---

## GS-096 — Signed URLs live 30 minutes and the cache map never evicts

**Severity:** LOW
**Category:** STORAGE
**Feature:** Supabase Storage
**Status:** PARTIAL - 2026-09-05 (cache bounded; expiry already fine; batch minting needs Edge Function work)

### Problem
Signed URLs are long-lived, minted one per row, and cached in an unbounded module-level map.

### Current Behavior
`services/ganesh/storage/supabaseStorage.ts:38` defaults `expiresIn` to 30 minutes; `services/ganesh/storage/storageService.ts:118, 132-136` caches each URL for 25 minutes in a `Map` with no eviction and no size bound, living for the process lifetime. Each `GaneshSignedPreview` mount fires its own request (`components/ganesh/GaneshSignedPreview.tsx:19-31`); Supabase's batch `createSignedUrls` is not used.

### Expected Behavior
Short expiry for thumbnails, a bounded cache, and batch minting for list views.

### Evidence
`services/ganesh/storage/supabaseStorage.ts:38`; `storageService.ts:118, 132-136`; `components/ganesh/GaneshSignedPreview.tsx:19-31`.

### Impact
- **Security:** a URL leaked via screenshot or log grants 30 minutes of unauthenticated read. Academic next to GS-001, which grants the same access permanently.
- **Performance:** a slow memory leak in a long-lived session; one request per visible row.

### Recommended Fix
Reduce thumbnail expiry, bound the cache with an LRU or periodic sweep, and use batch signed-URL creation for lists.

### Acceptance Criteria
- [ ] Thumbnail URLs expire in five minutes or less.
- [ ] The URL cache is bounded.
- [ ] List views mint URLs in batches.

### Dependencies
Depends on GS-001.


### Resolution (2026-09-05)
Two of three criteria met; the third is recorded as needing server work.

**Criterion 1 was already met, and the ticket's premise is stale.** It says
`expiresIn` defaults to 30 minutes with a 25-minute cache. Since the GS-001
lockdown, download URLs are minted by the `ganesh-files` Edge Function with
`DOWNLOAD_URL_TTL_SECONDS = 60 * 5`, and the client cache is 4 minutes -
deliberately a minute short of the grant, so it can never hand out a link that
looks valid but has expired server-side. The stated impact, "a leaked URL grants
30 minutes of unauthenticated read", is now 5 minutes and behind a Firebase
token check.

**Criterion 2 is now met.** The cache `Map` had no eviction and no size bound,
so a long-lived session grew it once per distinct file ever previewed and never
shrank. It now sweeps expired entries on write and caps at 300 live entries,
evicting the soonest-to-expire. A sweep suffices because entries live 4 minutes,
so almost everything in there is stale almost all of the time; the cap is the
backstop for the one case a sweep cannot help - more than 300 distinct files
previewed inside a single 4-minute window.

**Criterion 3 is not done.** Batch minting would need a new batch action on the
`ganesh-files` Edge Function plus a Supabase deploy, which is server work rather
than a client fix. Each `GaneshSignedPreview` still mints its own URL. Recorded
here rather than silently dropped.
---

## GS-097 — Each upload reads the image into memory three times

**Severity:** LOW
**Category:** PERFORMANCE
**Feature:** Supabase Storage
**Status:** FIXED - 2026-09-05

### Problem
The full image is materialised as an ArrayBuffer up to three times per upload.

### Current Behavior
`bytesFromUri` does `fetch(uri).arrayBuffer()` (`services/ganesh/storage/imagePrepare.ts:18-22`). `prepareGaneshImage` calls it once if the picker gave no `fileSize` (line 34), again after compression to measure the result (line 54), and `uploadObject` calls it a third time for the upload payload (`services/ganesh/storage/supabaseStorage.ts:27`).

### Expected Behavior
Read once and carry the buffer through.

### Evidence
`services/ganesh/storage/imagePrepare.ts:18-22, 34, 54`; `services/ganesh/storage/supabaseStorage.ts:27`.

### Impact
- **Performance:** a transient allocation spike of roughly 15 MB per upload on low-end Android; occasional jank or out-of-memory. Correctness is unaffected.

### Recommended Fix
Return the ArrayBuffer from `prepareGaneshImage` and pass it to `uploadObject`.

### Acceptance Criteria
- [ ] An upload reads the file once.
- [ ] Size validation and compression still work.

### Dependencies
None.


### Resolution (2026-09-05)
`prepareGaneshImage` now reads the file **once on every path**, and carries the
bytes on its result so `uploadObject` reuses them instead of re-fetching the
URI.

Getting to one read took a second change beyond threading the buffer.
`shouldCompressGaneshImage` returns true whenever either dimension exceeds
`RECEIPT_MAX_EDGE`, regardless of size - so when the picker reports large
dimensions, the original's size cannot change the decision and measuring it was
pure waste. That read is now skipped entirely. The four paths:

| picker gave fileSize | compression | reads before | reads now |
| --- | --- | ---: | ---: |
| yes | no | 1 | 1 |
| no | no | 2 | 1 |
| yes | yes | 2 | 1 |
| no | yes | 3 | 1 |

`bytes` is optional on `PreparedGaneshImage` on purpose: an image whose size the
picker reported and which needs no compression is never read before upload, and
must not be read just to populate the field.

**A latent bug fixed in passing.** The webp-to-jpeg extension decision used
`size !== originalSize` to ask "was this re-encoded?". A compression landing on
the identical byte count would answer no, leaving a file saved as JPEG labelled
`.webp`. Replaced with an explicit `compressed` flag.
---

## GS-098 — Dead `ganeshStorage.ts` barrel and a decoy block in `storage.rules`

**Severity:** LOW
**Category:** CODE_QUALITY
**Feature:** Supabase Storage
**Status:** FIXED - 2026-09-05

### Problem
Two pieces of dead code, one of which actively misleads a security reviewer.

### Current Behavior
`services/ganesh/ganeshStorage.ts` is a pure re-export barrel with zero importers — every consumer imports `@/services/ganesh/storage/storageService` directly.

`storage.rules:12-22` defines a `pandals/{pandalId}/festivals/{festivalId}/**` rule with a Firestore-backed `isPandalMember()` check for **Firebase** Storage. No Ganesh code touches Firebase Storage; the only consumer is `lib/apkUpdate.ts:49` reading `/releases`. All Ganesh files live in Supabase.

### Expected Behavior
Dead code removed.

### Evidence
`services/ganesh/ganeshStorage.ts`; `storage.rules:12-22`; `lib/apkUpdate.ts:49`.

### Impact
- **Reliability:** the dead rule is the dangerous one — it is a membership-scoped rule that *looks* like the Ganesh access control and reads as reassurance to anyone auditing this feature. The real enforcement point is `supabase/ganesh-files.policies.sql`, which has no membership check at all (GS-001). Deleting the block removes a decoy.

### Recommended Fix
Delete both.

### Acceptance Criteria
- [ ] `services/ganesh/ganeshStorage.ts` is removed and nothing breaks.
- [ ] The unused pandal block in `storage.rules` is removed.
- [ ] The APK release rule is untouched.

### Dependencies
Related to GS-001.


### Resolution (2026-09-05)
Both deleted. `services/ganesh/ganeshStorage.ts` is gone - it was a pure
re-export barrel with zero importers, verified before removal - and the
`pandals/{pandalId}/festivals/{festivalId}/**` block is out of `storage.rules`,
replaced by a comment explaining why there is deliberately no Ganesh rule there.

**The decoy was worse than the ticket knew.** Attempting to deploy the change
revealed that **Firebase Storage has never been provisioned on
`expenseapp-27f94`**:

```
Error: Firebase Storage has not been set up on project 'expenseapp-27f94'.
```

So `storage.rules` has never been deployed and currently cannot be. The block
was not merely unused - it was a membership-scoped access rule, in a rules file
that has never been in force, for a service the project does not have. Anyone
auditing Ganesh file access would have found it and been reassured by something
that was never even loaded. The real enforcement point is the `ganesh-files`
Edge Function plus `supabase/ganesh-files.policies.sql` (GS-001).

The `/releases` rule is untouched. Its consumer, `lib/apkUpdate.ts`, treats
Firebase Storage as optional and falls through to the GitHub Release URL when
`getFirebaseStorage()` returns nothing - which is what actually runs today - so
nothing depends on this file being deployed.

**Nothing to deploy.** Recorded because the natural assumption on reading the
diff is that a storage-rules change needs one.
---

## GS-099 — Pushing a tab route from the admin stack unwinds the stack

**Severity:** LOW
**Category:** NAVIGATION
**Feature:** Admin Dashboard
**Status:** OPEN

### Problem
Admin cross-links to tab routes pop the admin screen instead of pushing on top of it.

### Current Behavior
`app/(ganesh)/admin/index.tsx:332, 356, 361, 366` and `admin/reports.tsx:128, 133, 138, 143, 153` push tab routes. `(tabs)` is a *sibling* `Stack.Screen` to `admin` in `app/(ganesh)/_layout.tsx:89-90` and is already below `admin` in the stack, so navigating to it unwinds rather than pushes.

Admin → "Collections" → Back therefore exits to the Home tab rather than returning to Admin.

**Status:** LIKELY — inferred from the router structure; worth confirming on a device.

### Expected Behavior
Back returns to the Admin Dashboard.

### Evidence
`app/(ganesh)/admin/index.tsx:332, 356, 361, 366`; `admin/reports.tsx:128-153`; `app/(ganesh)/_layout.tsx:89-90`.

### Impact
- **User:** an admin browsing the dashboard loses their place on every cross-link.

### Recommended Fix
Either present the target as a modal or a pushed detail route from within the admin stack, or accept the unwind and remove the cross-links.

### Acceptance Criteria
- [ ] Navigating from Admin to a list and pressing Back returns to Admin.
- [ ] Verified on a device.

### Dependencies
Related to GS-055.

---

## GS-100 — Every Ganesh href is cast `as never`, disabling typed routes

**Severity:** LOW
**Category:** CODE_QUALITY
**Feature:** Navigation
**Status:** OPEN — confirmed 2026-09-04

### Problem
Every navigation call in the feature casts its href to `never`, so Expo Router's typed-route checking is disabled at every call site.

### Current Behavior
For example `app/(ganesh)/admin/index.tsx:223-395` uses `push("/(ganesh)/x" as never)` throughout, and the dynamic `needs[].href` strings (lines 70-156) are plain `string`.

Note that all 41 destinations currently resolve — navigation integrity was verified as clean. The point is that this holds by manual discipline rather than by the compiler.

### Expected Behavior
Typed `Href` values so a route rename is a compile error.

### Evidence
`app/(ganesh)/admin/index.tsx:70-156, 223-395`, and the same pattern across the feature.

### Impact
- **Reliability:** a route rename or move silently produces a runtime no-op instead of a build failure. This is the systemic risk behind the currently clean navigation.

### Recommended Fix
Type the href constants properly and remove the casts, starting with the dynamic `needs[].href` strings.

### Acceptance Criteria
- [ ] Ganesh navigation targets are typed.
- [ ] Renaming a route produces a type error.
- [ ] No behavioural change.

### Dependencies
None.

---

## GS-101 — No unsaved-changes guard on long forms

**Severity:** LOW
**Category:** UX
**Feature:** Expenses
**Status:** FIXED - 2026-09-05

### Problem
Leaving a partially completed form discards the entry silently.

### Current Behavior
There is no `useAndroidBackHandler` or `BackHandler` usage anywhere in the feature, and no unsaved-changes prompt on any form. Leaving `add-expense.tsx` mid-entry — a form with roughly 20 fields — discards everything.

### Expected Behavior
A confirmation prompt when leaving a form with unsaved input.

### Evidence
Absence across `app/(ganesh)/**`; form length at `app/(ganesh)/add-expense.tsx`, `add-sponsor.tsx`.

### Impact
- **User:** lost data entry on the longest forms in the product, on a phone where an accidental back gesture is easy.

### Recommended Fix
Add a dirty-state check and a confirmation prompt on the long add-screens.

### Acceptance Criteria
- [ ] Leaving a dirty form prompts for confirmation.
- [ ] Leaving a pristine form does not.

### Dependencies
Related to GS-033.


### Resolution (2026-09-05)
`hooks/useUnsavedChangesGuard.ts` added and wired into the two longest forms,
`add-expense.tsx` (~20 fields) and `add-sponsor.tsx`.

Done as a hook rather than per screen because there are two ways out and the
header button can only intercept one of them:

- The header back button, through `confirmLeave`.
- The Android hardware back button and the iOS swipe gesture, through
  navigation's `beforeRemove` event - the more likely accident of the two, and
  the one no screen-level handler catches.

The listener is registered only while the form is dirty, so a pristine form is
not intercepted at all - no prompt, and nothing in the way of someone who opened
the screen by mistake, which is criterion 2.

Dirtiness counts typed text and a picked receipt only. The chips that start with
a value - funding, payment method, category, sponsor type, deal type, purpose,
status - are excluded, or merely opening the screen would arm the prompt. On
`add-expense` the guard also stands down once the ledger row is saved: there is
nothing left to lose at that point, and the receipt upload has its own retry.
---

## GS-102 — `EXPO_PUBLIC_GEMINI_API_KEY` is bundled into the client

**Severity:** LOW
**Category:** CODE_QUALITY
**Feature:** Platform (outside Ganesh scope)
**Status:** OPEN — confirmed 2026-09-04, needs a proxy

### Problem
A billable API credential is inlined into the release bundle.

### Current Behavior
`lib/env.ts:28` and `.env.example:41` define `EXPO_PUBLIC_GEMINI_API_KEY`. The `EXPO_PUBLIC_` prefix causes Metro to inline it into the release bundle. Unlike the Firebase apiKey — which legitimately is a public identifier — a Gemini key is a spendable credential.

### Expected Behavior
Billable credentials are held server-side and reached through a proxy.

### Evidence
`lib/env.ts:28`; `.env.example:41`.

### Impact
- **Cost:** anyone can extract the key and spend against the account.

This belongs to the nutrition feature, not Ganesh. It is recorded here because it surfaced during the environment-variable review; it should be triaged into whichever backlog owns that feature.

### Recommended Fix
Proxy Gemini calls through a backend function and remove the client-side key.

### Acceptance Criteria
- [ ] No billable API key is present in the client bundle.
- [ ] The nutrition feature still works.

### Dependencies
Outside Ganesh scope — route to the owning backlog.

---

## GS-103 — Festival member increment writes may be rejected when the document carries `createdBy`

**Severity:** MEDIUM
**Category:** FIRESTORE
**Feature:** Committee Contributions
**Status:** FIXED 2026-09-04

### Problem
The increment writes to festival member documents never set `updatedBy`. If the target document carries `createdBy`, the rules require `updatedBy == request.auth.uid`, and the merge preserves whoever wrote it last — so a *different* actor's write is rejected.

### Current Behavior
The `increment` writes to `festivals/{id}/members/{uid}` for `contributionPaid`, `personalExpenses`, `pendingReimbursement` and `reimbursed` (`services/ganesh/ganeshWrites.ts:1142-1153, 1501-1508, 1732-1739, 1821-1828, 1922-1972`) are `set(..., {merge: true})` payloads that never set `updatedBy`.

`firestore.rules:841-852` applies `ganeshIdentityUpdate()` when the existing document has a `createdBy` key. Only `setMemberContributionTarget` adds `createdBy` (`services/ganesh/ganeshWrites.ts:837`, on first creation). For such documents, a second actor's contribution, expense or reimbursement write fails unless they also hold `canCloseOrUpdateFestival()`.

**Status:** LIKELY, not confirmed. Seeded member documents — the common case — have no `createdBy`, so this only affects members whose contribution target was set individually.

### Expected Behavior
Ledger side-effect writes to member documents succeed regardless of who created the document.

### Evidence
`firestore.rules:841-852`; `services/ganesh/ganeshWrites.ts:837, 1142-1153, 1501-1508, 1732-1739, 1821-1828, 1922-1972`.

### Impact
- **User:** for members with an individually set contribution target, another committee member recording their payment or expense may fail with a permission error.

### Recommended Fix
Set `updatedBy: actor.uid` on all member increment writes, or stop writing `createdBy` on festival member documents since they are derived records rather than user-authored ones.

### Acceptance Criteria
- [ ] Reproduce the scenario against the emulator to confirm or dismiss it.
- [ ] If confirmed, a second actor can record a contribution against a member whose target was individually set.
- [ ] Member counters continue to update correctly.

### Dependencies
Verification depends on GS-074.

---

# Security Findings

Every finding below has a ticket. Severity reflects exploitability given the deployed architecture.

## Authentication weaknesses
- **GS-045** (MEDIUM) — the Ganesh gate writes real PII into the duress decoy tree, defeating duress mode for this feature.
- **GS-046** (MEDIUM) — the login screen states an isolation boundary between Ganesh Seva and Expense Tracker that does not exist; the workspace switch needs no re-authentication.
- **GS-044** (MEDIUM) — the Ganesh session survives sign-out; a second user on the device inherits the previous user's context. No data leak — reads are still rule-gated.

**Verified clean:** existing Firebase sessions are correctly reused with no second OTP; unauthenticated users cannot reach any pandal data (every Ganesh rule path begins with `signedIn()` and `GaneshGate` redirects).

## Authorization weaknesses
- **GS-002** (CRITICAL) — open-join self-create accepts an arbitrary `permissions` array, and the rules read that array to authorize everything. Full ledger and Permanent Fund control for any signed-in user, on any pandal with open join mode.
- **GS-016** (HIGH) — `members.*` / `roles.*` / `settings.update` are grantable in the UI and ignored by the rules; `audit.read` is inverted against `festival.update`.
- **GS-015** (HIGH) — `adminCount` is unpinned on pandal update and unchecked on member create, so the last-admin protection can be bypassed and a pandal left with no administrator.
- **GS-017** (HIGH) — a removed founder retains permanent delete rights over the pandal; no ownership transfer exists.
- **GS-037** (HIGH) — `contributions.receive` is bypassable by setting `status: 'received'` at creation time.
- **GS-073** (MEDIUM) — every member including `viewer` can read all donor PII; inconsistent with the permission gating applied to assets and sponsors.
- **GS-084** (LOW) — an admin can write arbitrary fields into another user's membership index.

**Verified correct:** self-promotion to admin is blocked in both the client and the rules; `canManageMembersOf` deliberately ignores the permissions array so no custom role can become admin; multi-role effective-permission merging is correct; role permission edits do propagate to assigned members' cached arrays.

## Firestore rule weaknesses
- **GS-004** (CRITICAL) — no payload validation on any festival subcollection; the `summary` document, which is the sole source of every displayed balance, is directly forgeable by any member with `collections.create`.
- **GS-005** (CRITICAL) — the wildcard match ORs with the explicit ones, so `fundTransfers` and `auditLogs` are mutable and deletable despite `allow update, delete: if false`.
- **GS-014** (HIGH) — `pandalAfter().adminCount` is dereferenced without the guard applied to `currentAdminCount()`, denying every member write on pandals predating the field.
- **GS-018** (HIGH) — closed festivals remain mutable and ledger records are hard-deletable.
- **GS-041** (HIGH) — the full client-versus-server validation matrix; several hazards are checked by neither side.
- **GS-082** (MEDIUM) — the asset-link invariant is enforced on create but not on update.
- **GS-042**, **GS-043** (MEDIUM) — join requests are unbounded and undeletable; invites can be minted for another pandal.
- **GS-083** (LOW) — deletion does not cascade, orphaning subcollections including Permanent Fund records.
- **GS-074** (MEDIUM) — the rules are deployed by hand and tested only by a hand-written TypeScript mirror that cannot catch any of the above classes.

## Role escalation risks
- **GS-002** is the only complete escalation path found: enumerate pandals via **GS-003**, find one with `joinMode: 'open'`, self-create a member document with a full permissions array. No approval, no admin involvement.
- **GS-015** is a privilege-*destruction* path rather than escalation: an admin can orphan the pandal.

## Data exposure
- **GS-003** (CRITICAL) — `pandalInvites` is fully listable, disclosing every pandal's id, name and join code.
- **GS-001** (CRITICAL) — every pandal's stored files are readable by anyone holding the bundled publishable key.
- **GS-073** (MEDIUM) — donor names, mobiles and addresses are readable by every member role.
- **GS-016** — join-request applicant names and phone numbers are readable by every active member from the SDK, though the UI gates them.
- **GS-096** (LOW) — signed URLs grant 30 minutes of unauthenticated read to a specific object.

## Storage security
- **GS-001** (CRITICAL) — the RLS policies have no membership predicate and grant `anon` insert, select, update and delete.
- **GS-036** (HIGH) — no server-side size or MIME enforcement; arbitrary file types and sizes are accepted.
- **GS-098** (LOW) — a dead membership-scoped block in `storage.rules` reads as the Ganesh access control and is not.

**Verified clean:** no `service_role` key anywhere in client code, `.env.example`, `app.json` or `eas.json` — and `services/ganesh/storage/storageSecurity.test.ts` enforces its absence in CI. No `getPublicUrl` usage. Path traversal is properly handled and tested in `storagePaths.ts`.

## Client-trust issues
The recurring theme, and the single most important architectural point in this audit: **the rules trust data the client wrote.**
- The member `permissions` array is client-written and rule-read (GS-002).
- The `summary` document is client-written and drives every balance and the spend check (GS-004).
- The reimbursement ceiling is client-supplied (GS-008).
- The God Fund balance check reads a cached document outside a transaction (GS-010).
- The festival closing balance is client-computed and never re-derived server-side (GS-007).
- `collectorId` is client-chosen and unvalidated (GS-086).

---

# Financial Integrity Findings

## Wrong balances
- **GS-010** — the God Fund can go negative through concurrent or offline expense creation; the check is a non-transactional cached read.
- **GS-008** — reimbursements have no solvency check at all and can drive the fund negative.
- **GS-009** — `pendingReimbursements` goes negative after void-then-reimburse, permanently blocking the member and understating the fund.
- **GS-022** — cash left in a closed festival appears in no aggregate anywhere.
- **GS-039** — total festival spend is understated by the entire sponsored portion of every expense.
- **GS-011** — no festival-level Cash/UPI/Bank split exists, and `PermanentFundSummary.total` has no invariant tying it to its four parts.

## Missing transactions
- **GS-021** — Permanent Fund transfers and settlement closes write no audit entry; the audit screen renders a `"transferred"` action nothing ever writes.
- **GS-053** — household edits, category creation, pandal profile edits and the full summary recompute are unaudited.
- **GS-020** — voiding an asset purchase leaves the asset in inventory with no audit note.

## Duplicate transactions
- **GS-028** — the duplicate-household dialog's Continue can be double-tapped, writing two collections and incrementing `chanda` twice.
- **GS-027** — the collection Void button can be double-tapped, decrementing `chanda` twice for one collection.
- **GS-006** — every collection creates a duplicate household, so household statistics double-count houses.
- **GS-085** — a retried fund transfer creates a second transfer record.
- **GS-059** — offline committee payments bypass the guard that prevents double-entry from two phones.
- **GS-050** — sponsor cash is displayed under two "Cash received" headings, under a note claiming they are separate.

## Incorrect reimbursements
- **GS-008**, **GS-009**, **GS-024** — no server-side cap, negative pending balances, and per-member counters that the repair tool never rebuilds.

## Incorrect transfers
- **GS-023** — transfer in and transfer out can resolve different festivals when more than one is open.
- **GS-070** — seed-then-allocate is two non-atomic steps and the UI then refuses to complete a half-applied setup.

## Incorrect settlement
- **GS-007** — a festival can be closed on an unloaded ₹0 summary, irreversibly, with nothing transferred.
- **GS-018**, **GS-019** — a closed, settled festival remains editable, breaking reconciliation against the Permanent Fund after the fact.
- The settlement metric grid omits `transferredToPermanentFund`, so the six visible rows do not sum to the displayed closing cash whenever a mid-festival return occurred (part of GS-007's fix scope; `app/(ganesh)/close-festival.tsx:93-105` versus `shared/utils/ganeshMath.ts:24-32`).

## Cash / UPI / Bank mismatches
- **GS-011** — the payment method is missing entirely from expenses, direct contributions and committee payments, and is stored as free text in one case. `Cash + UPI + Bank = Total` cannot be verified anywhere, and the only place the four-way split is displayed maintains its total independently of its parts.

## Concurrent write risks
- **GS-010** — God Fund spend: read-then-write outside a transaction.
- **GS-008** — reimbursement: client-supplied cap, no transaction, no floor.
- **GS-038** — household `collectedAmount` written as an absolute value on void; status derived from a stale read on both add and update.
- **GS-012** — the recompute overwrites the summary non-atomically, erasing concurrent writes.
- **GS-027** — the double-void guard is a non-transactional read.

**Verified safe:** the Permanent Fund is the model to copy — every mutation runs inside `runTransaction` with a negative-balance guard and an online gate. The normal summary write path uses `increment()` with merge, which is atomic and commutative. All mutations use client-generated ids on deterministic refs, so offline replay is idempotent — no duplicate-write risk was found on reconnect.

---

# Test / Build Results

```
TypeScript (npm run typecheck)        : PASSED — 0 errors
TypeScript shared (typecheck:shared)  : PASSED — 0 errors
Unit tests (npm test)                 : PASSED — 125 files, 1221 tests, 0 failures
ESLint                                : NOT RUN — no `lint` script exists in package.json
Expo build                            : NOT RUN
Firestore rules emulator tests        : NOT RUN — none exist (GS-074)
Device / simulator run                : NOT RUN
```

Notes:
- `node_modules` was absent from this worktree. It was installed to run the above; `package-lock.json` was reverted afterwards and the working tree left clean.
- The install synced `package-lock.json`'s version field from `4.1.2` to `4.1.7`, matching `package.json`. That drift is pre-existing; the change was reverted here, but it is worth a separate housekeeping fix.
- **No test failures were found, and no ticket in this backlog was raised from a failing test.** Every finding came from reading the code and the rules.
- Ganesh test coverage is real and worth preserving: `ganeshMath.test.ts`, `ganeshContributions.test.ts`, `ganeshSponsors.test.ts`, `ganeshAssets.test.ts`, `ganeshAssetPurchase.test.ts`, `ganeshPermissions.test.ts`, `ganeshIdentity.test.ts`, and the four storage test files. The gap is that none of it exercises the service layer, the screens, or the actual Firestore rules — which is exactly where this audit found its defects.

---

# Dependencies

```
GS-001  blocks  GS-036, GS-069, GS-096
GS-003  blocks  GS-002, GS-042
GS-004  pairs with  GS-041, GS-074
GS-011  blocks  GS-075, GS-076
GS-012  blocks  GS-024
GS-013  blocks  GS-079
GS-014  blocks  GS-015, and verification of GS-016
GS-006  blocks  GS-062
GS-018  pairs with  GS-019
GS-032  blocks proper fixes for  GS-007, GS-025, GS-026, GS-034
GS-039  blocks  GS-079
GS-050, GS-051  block  GS-079
GS-074  supports verification of  GS-002, GS-003, GS-004, GS-005, GS-014,
                                  GS-015, GS-016, GS-017, GS-018, GS-037,
                                  GS-041, GS-073, GS-103
```

Suggested pairings so related rule changes ship and deploy together:
- **Rules bundle A (authorization):** GS-002, GS-003, GS-015, GS-037, GS-043
- **Rules bundle B (validation):** GS-004, GS-041, GS-082, GS-086
- **Rules bundle C (immutability):** GS-005, GS-018, GS-019, GS-083
- **Rules bundle D (repair):** GS-014 plus the `adminCount` backfill
- **Transaction bundle:** GS-008, GS-010, GS-038 — one pattern applied three times

Every rules bundle requires the manual deploy step in `docs/FIREBASE_RULES_DEPLOY.md`, and ideally GS-074 first so the changes are provable.

---

# Unverified / Needs Investigation

Recorded honestly — these were not confirmed and must not be treated as findings.

1. **Supabase bucket `public` flag.** `supabase/ganesh-files.policies.sql:2` only *comments* that the bucket must stay private. The flag is set in the Supabase dashboard, and there is no migration or CI check asserting it. **If the bucket is public, even the signed-URL layer is bypassed.** Verify manually; covered by GS-001's acceptance criteria.

2. **Whether any production pandal lacks `adminCount` (GS-014).** The rules defect is CONFIRMED; whether real data triggers it depends on whether any pandal predates `898b06f`. Check the production collection before deciding the fix's urgency. This is the most likely explanation for the reported "not working" symptom, so verify it first.

3. **Whether the deployed Firestore rules match `firestore.rules`.** CI does not deploy them and nothing records what is live. Every rules finding in this document describes the file, not necessarily production. Confirm the live ruleset before acting.

4. **GS-103** — festival member increment writes rejected when the document carries `createdBy`. Marked LIKELY. Requires an emulator run against a member document created by `setMemberContributionTarget`.

5. **GS-099** — admin-to-tab navigation unwinding the stack. Inferred from the router structure; needs a device to confirm.

6. **No device or simulator testing was performed.** The manual flow list in the brief — login, create pandal, approve member, add collection, split expense, reimbursement, permanent fund transfer, settlement, role assignment — was audited by reading the code end to end, not by executing it. Several findings (GS-007, GS-025, GS-026, GS-033) predict specific runtime behaviour that a device pass would confirm quickly and cheaply. **Recommend a device pass before starting fixes**, both to confirm these and to catch anything static review cannot see.

7. **Concurrency findings were derived by reading the write paths**, not by executing concurrent clients. The unsafe patterns (read-then-write outside a transaction) are CONFIRMED as code; the specific race outcomes described are the logical consequence and were not reproduced.

8. **Performance findings are structural, not measured.** No profiling was run. Document counts and query shapes are read from the code; the actual impact on a low-end device is unmeasured.

---

*End of audit. 103 tickets. No application code was modified.*




---

## GS-031 / GS-032 resolution notes (2026-09-03)

### GS-031 - all eight closed

The ticket said nine; one (the Pandal tab's "Save targets") was closed with
GS-025. The remaining eight were verified live and each now logs through
`lib/errors.ts` and tells the user what failed:

| Call site | Why it mattered |
| --- | --- |
| `admin/settings.tsx` join mode x2 | Who may join the Pandal is a security setting; a silent failure leaves the admin believing open join is off when it is not |
| `household/[id].tsx` expected amount | Also gained the empty-field guard - an empty box parses to 0, and `deriveHouseholdStatus` turns expected 0 with anything collected into "paid", the same wipe GS-026 described |
| `household/[id].tsx` status | Sticky visit statuses silently failing to save |
| `member/[id].tsx` suspend / restore / remove | The worst of the set: an admin believes a person's access is gone when it is not |
| `report.tsx` recalculate | Rewrites every total on the festival, and legitimately refuses when the summary changed mid-read. That refusal was invisible. Now confirms first and reports the outcome |

Since GS-029 made the write wrappers `async`, these `void` calls had become
unhandled promise rejections rather than merely unreported ones.

### GS-032 - fixed where a false zero is presented as fact

Eight of the ten screens ignored `loading` and `error`. Fixed by harm rather
than uniformly, using the `ListStateView` pattern `funds.tsx` already
established:

- **`report.tsx`** - the whole report is gated. This is read aloud at meetings,
  so zeros meaning "not loaded" are the most damaging false certainty in the
  app. The error state says explicitly not to read the report out yet.
- **`(tabs)/index.tsx`** - the funds card is gated; seva and quick actions stay
  usable while totals load.
- **`add-expense.tsx`** - a regression introduced by the God Fund location work
  in this same session: the "Paid from" chips read balances from the summary, so
  a cold open labelled every one "Cash / UPI / Bank / Other - Rs 0". Now shows
  the plain label until the figures are real, and the empty-location steering
  waits for load.
- **`admin/reports.tsx`** - totals gated.
- **`(tabs)/committee.tsx`** - one stat, so it shows a dash rather than zero.

**Deliberately not changed:** `components/ganesh/funds/CollectionsList.tsx` and
`ExpensesList.tsx` each show one summary-derived figure in a list header, where
a momentary zero is materially less harmful than a report that states the Pandal
holds nothing; and `admin/index.tsx`, whose loading gate is **GS-034**'s subject
and belongs with that ticket rather than being half-changed here. Status is
therefore MOSTLY FIXED, not FIXED.

### GS-015 - already fixed, verified 2026-09-03

Both holes are guarded: `adminCountDeltaBounded()` pins the delta to +/-1 with a
floor of 1 on pandal update, and `createKeepsAdminCount()` covers the member
create bypass. The ticket had been left at PARTIAL.


---

## GS-030 / GS-034 / GS-035 / GS-040 resolution notes (2026-09-03)

### GS-030 - late write failures now go through lib/errors.ts

`defaultLateFailure` called `console.error` and `toast.error` directly with
fixed copy, so a permission denial and a lost connection read identically and
neither was captured with the redaction and context the rest of the app uses.
It now uses `logError` plus `friendlyErrorMessage`, and names the record: "Your
expense was not saved after all. <reason>". This is the worst moment to be
vague - the user was told it saved and has already navigated away, so this is
the only notice they get.

### GS-034 - the dashboard gate now covers every money source

It covered four of ten: pandals, festivals, members, requests. Summary,
permanent fund, assets, contributions, sponsorships and households were all
ungated, so tiles rendered zeros as settled facts and "Needs attention" raised
false alarms on every cold open - telling an admin either that nothing needs
doing or that everything does. All six are now in the gate and in the error
fallback. Each is "still loading AND nothing to show yet", so a warm cache
renders immediately rather than flashing a skeleton on every visit.

### GS-035 - a refusal now says what actually happened

Every festival-subcollection write requires `festivalOpen()`, and since GS-017
an archived Pandal is frozen too. Both surface as `permission-denied`, which
`lib/errors.ts` maps to "You don't have access to this. Sign in again or ask
the owner for access." Wrong twice over: the user's access is fine, and it sends
them to an admin over a non-problem.

Fixed at the single choke point every Ganesh write already passes through -
`run()` in `useGaneshWrites`. It inspects the state the client already has
(shared provider data, so no extra listener) and rethrows a plain Error whose
own message `friendlyErrorMessage` will surface: the archive message if the
Pandal is archived, the closed-festival message if the festival is closed, and
otherwise an honest "your role may have changed, or the festival may have just
been closed - reopen the screen", which does not guess at a cause.

### GS-040 - PARTIAL, and deliberately so

There is no queue, exactly as filed. Building a real one is larger than the
ticket implies, for two reasons that are not obvious from the description:

1. **The local file does not survive.** `prepareGaneshImage` writes the
   compressed image through `ImageManipulator`, which lands in a cache
   location. Android clears cache dirs freely, so a persisted queue entry would
   frequently point at a file that no longer exists. A real queue must first
   copy the image into the document directory and then own its lifecycle -
   deleting on success and on abandonment, or a committee phone slowly fills
   with orphaned receipts.
2. **Uploading is not the whole job.** `uploadExpenseReceipt` uploads and then
   calls `attachExpenseReceipt`, with rollback if the attach fails. A queue
   entry therefore has to replay a *Firestore write*, and cope with the record
   having been voided or deleted while the photo sat in the queue.

What was actually wrong today is narrower: the label `"Photo/Receipt - Waiting
for connection"` promised a background upload that does not exist. The in-screen
retry is real - the save keeps the user on the screen (`if (uploaded) back()`) -
but a user who taps back loses the photo silently.

So the promise was made honest rather than half-kept: the status reads "not
uploaded yet", with an explicit note that it will upload only while the screen
stays open, that there is no background upload, and that leaving means adding it
again from the record. The failed state says the same. Applies to all four
screens through the shared uploader.

**Left to do:** the persisted queue itself, with the two constraints above as
its real scope.

---

## Group A resolution notes (2026-09-04)

Seven access-control tickets, all verified live against current code first, all
rules-layer except GS-088. `firestore.rules` deployed to `expenseapp-27f94`.

**GS-073 — donor PII.** Every festival subcollection read was
`isActivePandalMember()`, so a `viewer` could read every household's name,
mobile number and address. `collections.read` and `contributions.read` already
existed in the permission registry and the **UI already gated on them**
(`funds.tsx`, `people.tsx`, `admin/index.tsx`) — only the rules never enforced
them. Added `canReadCollectionsOf` / `canReadContributionsOf`, mirroring the
`canReadAssetOf` / `canReadSponsorOf` pattern including its
`!hasPermissionsField` legacy fallback, so a pre-RBAC member document does not
lose access on deploy day. `households` is gated with `collections` because it
carries the same PII — the ticket did not mention it.

Viewer no longer holds those two permissions; every other role keeps them, so
nothing an existing build does starts failing except the case being closed.
Three screens read contributions without gating, which would have shown zeros
meaning "no access": `report.tsx`'s promised-vs-received and
`member/[id].tsx`'s Festival payments are now gated; `admin/reports.tsx` sits
behind AdminGate so only admins reach it.

**GS-042 — join-request flood.** The document id is now pinned to
`{pandalId}__{uid}`, which the client already wrote by convention and nothing
enforced, so one account could mint unlimited requests carrying
attacker-controlled `displayName` and `phone`. `allow delete: if false` meant a
flooded queue was permanent; an admin of the target pandal can now dismiss, and
a requester can withdraw their own. The read side was already gated by GS-016.

**GS-043 — invite squatting.** Create now requires
`canManageMembersOf(request.resource.data.pandalId)`. Anyone could previously
mint `pandalInvites/<code>` carrying another committee's `pandalId` and an
arbitrary name.

**GS-082 — asset link on update.** `expenseCreateAllowed()` was referenced
only from `allow create`, so an update could add an `assetId` or flip
`expenseType` to `asset_purchase` with no sibling asset, breaking the split
that `assetPurchaseAmount` and the report both rely on. Now on both.

**GS-083 — festival delete.** Refused outright, for the same reason the
pandal document refuses one (GS-017): Firestore does not cascade, so it would
leave every collection, expense and contribution alive but unreachable, and the
rules that reach them call `pandalData()`. This was filed LOW while the
identical pandal-side problem was HIGH.

**GS-084 — membership index.** The admin stamp validated three fields and
permitted any others, making it an arbitrary write primitive into another
user's personal tree. Key set now pinned.

**GS-088 — code fallback.** `uniquePandalCode`'s last-resort return skipped
the uniqueness check its eight attempts exist to perform. It now retries eight
times with the check and throws rather than returning an unverified code.
The duplicate-pandal-name half is **not** addressed — that needs a product
decision on whether two committees may share a name.

7 contract-test mirrors added; there is no emulator in CI (GS-074).

### Correction

An early edit placed the GS-042 id guard in the **vaults** match block by
mistake — a `replace` on `allow create: if signedIn()` hit the first
occurrence in the file, which belongs to the Expense app. The rules compiler
caught it as `Invalid variable name: requestId`. Reverted and re-anchored
before any deploy. Two edits in this session silently no-matched on whitespace
or an em-dash, so each change is now verified present rather than assumed.

---

## Group F resolution notes (2026-09-04)

### GS-080 — the ticket named the wrong cause, and the real one is worse

The ticket said three `money()` copies drop `Number.EPSILON` and that this
causes false rejections. Two of those three do not exist: `ganeshContributions`
and `ganeshSponsors` import `money` from `ganeshMath`, so there was one Ganesh
implementation, not three.

More importantly, **the epsilon was never the cause.** `Number.EPSILON` is
relative to 1.0, so for a figure like 8.165 it sits far below that value's own
float spacing and changes nothing. Measured: adding it altered the result for
**0 of 500,000** randomised two-decimal splits, and made the false-rejection
count very slightly *worse* on three-decimal input.

The real cause is that `validateExpenseFunding` rounded each component to paise
**independently** and then demanded the three rounded parts equal the rounded
whole. They frequently do not. Over 400,000 randomised balanced three-decimal
splits:

| Comparison | Balanced entries falsely rejected |
| --- | ---: |
| Round each component, then exact equality (as shipped) | **136,817** (~1 in 3) |
| Sum the raw values, round once | **0** |
| Half-paise tolerance on raw values | 0 |

Both validators now sum the raw inputs and round once. Rounding-the-sum was
chosen over a tolerance because it keeps exact equality rather than introducing
a fuzzy margin, and it still refuses an entry that is off by a genuine paise
(verified: 0 wrong acceptances in 200,000 trials).

`money()` also now delegates to `roundMoney` so there is genuinely one
implementation — worth doing for consistency with the canonical helper that
documents its own reasoning, but recorded here as hygiene, not as the fix.

Reachability: two-decimal input was always immune. This bit anyone typing three
decimals into an amount field, which nothing prevents.

### GS-045 — real PII in the duress tree

Confirmed. `app/(ganesh)/_layout.tsx` used `useAuth().user`, which under duress
mode is the decoy proxy with uid `<real uid>_duress`, and passed it to
`upsertGaneshProfile` — which writes `displayName`, `email`, `phone` and
`photoURL`. Duress mode exists so a person under coercion can show a plausible
decoy; filling that decoy with their real name, email and phone defeats it.

Now uses `realUser`, matching every other Ganesh consumer. `user` is retained
for the `if (!user)` gate, which is about session presence, where the duress
proxy is the correct value.

### GS-081 — rounded before storage

`bumpSummary` passed raw values to `increment()`, and the recompute's two fund
transfer totals were built with a bare `reduce`. `availableGodFund` rounds its
result, which hid the drift rather than preventing it, and comparisons against
the stored components were unrounded. All three now round.

### GS-086 — a floor under the collector attribution

The service side was already fixed and the ticket was stale on that point:
`resolveCollectorId` validates the candidate is a member and is not removed or
suspended, falling back to the actor otherwise. The rules validated nothing, so
a crafted client could still write a fabricated id.

Added an `exists` check on the named member. `exists` only, deliberately: one
document read rather than the two an active-status check costs, and the festival
wildcard already spends several against the per-evaluation budget. The service
layer remains what enforces *active* membership; this is the floor beneath it.

---

## Group H resolution notes (2026-09-04)

### GS-103 — FIXED. Its own "LIKELY, not confirmed" resolves to confirmed

`firestore.rules` applies `ganeshIdentityUpdate()` once a festival member
document carries `createdBy`, and that requires `updatedBy == request.auth.uid`.
None of the member-counter increment writes set `updatedBy`. So on any member
whose contribution target had been set individually — the only path that
writes `createdBy` — a **second** actor's contribution, expense or
reimbursement write was refused outright. Recording a payment worked for one
committee member and failed for another, with no stated reason.

`updatedBy: actor.uid` added at all eight member-counter payloads.
`bumpReceivedContribution` had no access to the actor, so it now takes an
`actorId`.

### GS-072 — FIXED. Two definitions of "received", now one

The recompute rolled its own predicate — "not cancelled and not promised" —
which counts a contribution with **no status at all** as received, while
`contributionStatusOf` defaults an absent status to *promised*. A statusless
document was invisible-as-promised throughout the UI and became cash the moment
anyone pressed "Recalculate from ledger". It now calls the shared `isReceived`.
2 regression tests.

### GS-077 — ALREADY FIXED, ticket was stale

Filed as "MISSING. There is no receipt or serial number on a collection."
`receiptNumber` is on `GaneshCollection`, `add-collection.tsx` displays it, and
`ganeshWrites.ts` carries 13 references including sequence allocation,
`formatCollectionReceipt` and `assignPendingCollectionReceipts` for the offline
path. Tenth stale ticket found this session.

### GS-102 — CONFIRMED, and it needs a server

`EXPO_PUBLIC_GEMINI_API_KEY` is still inlined by Metro into every release
bundle (`lib/env.ts:28`), and consumed by `services/nutritionAiService.ts:42`.
Unlike the Firebase apiKey, which is a genuine public identifier, a Gemini key
is **spendable** — anyone who unzips the APK can bill the account.

Left open deliberately. The only real fix is to hold the credential server-side
and proxy the call, which means a new deployable (the `ganesh-files` Edge
Function is the precedent), a client change, and secret management. That is its
own piece of work, and it is a Nutrition concern rather than a Ganesh one.
Recording it here with the mechanism confirmed so it can be scheduled honestly
rather than sitting at LOW/CODE_QUALITY, which understates it.

### GS-071 — ASSESSED, not fixed

Confirmed as described: creation runs several sequential commits and a later
failure leaves a pandal with no festival, or a festival with no summary or
categories. The ticket is right that the *first* batch is correctly atomic —
pandal document, invite, membership index and the creator's admin member all
commit together, so creator-becomes-admin cannot half-happen.

Not fixed, because "leaves nothing behind" is not achievable here: the steps
span multiple documents beyond one batch's reach and Firestore has no
cross-batch rollback. The achievable goal is the ticket's second clause —
detectable and repairable — and `setup.tsx` already detects the main partial
state ("This Pandal has no festival yet"). A proper repair path is a separate
piece of design work, not a fix to slip into a group.

### Correction to Group A, found and deployed today

The GS-084 key allowlist I deployed yesterday omitted **`joinedAt`**, which is
exactly what `stampPandalMembershipIndex` writes when an admin stamps another
user's index (`setPandalAdmin`, `updatePandalMember`). That branch is the only
reason the allowlist exists, so the rule I shipped to close a write primitive
would have **denied every admin role change on another person's index**. Found
while reading the creation path for GS-071, fixed, contract mirror updated, and
deployed. The first deploy attempt failed on a transient upload error and was
retried.

The lesson is the same one this session keeps teaching: I verified the *rule*
compiled and never checked it against the payload the app actually sends.

---

## Group B resolution notes (2026-09-04)

### GS-050 — the report said the opposite of the truth

Receiving a cash sponsorship writes a money contribution and bumps
`otherCashContributions`, which feeds `availableGodFund`. So sponsor cash **is**
in the God Fund and is already inside `contributionTotals.cashReceived`. The
report showed it again under a second "Cash received" heading, beneath a
subtitle reading "Separate from Closing / God Fund" — the reverse of what the
ledger does.

The sponsor figure is now labelled "Of which from sponsors", and the subtitle
says plainly that sponsor cash is already counted above and that only
directly-paid expenses sit outside the God Fund. Same correction applied to
`admin/reports.tsx`, which carried the identical text.

### GS-051 — two helpers, two answers, one screen

`summarizeSponsorships` handled `cash` and in-kind explicitly, so a
`sponsoringType: "expense"` deal fell through every branch and was counted
**nowhere**. `breakdownSponsors` used `else current.received += value`, so the
same deal **was** counted, as cash received. The per-sponsor rows on
`report.tsx` therefore did not sum to the total printed above them, and
`sponsor/[id].tsx` contradicted the report's own row for that sponsor.

Fixed by giving the case its own bucket rather than forcing it into cash or
in-kind: `expenseReceived` / `promisedExpense` on the totals, `expensePaid` on
each breakdown row. That matches the reasoning already applied to
`summary.sponsoredExpenseAmount` (GS-039) — a sponsor paying an expense
directly is real spending the Pandal benefited from, but no cash entered the
festival, so it must not be added to cash received. 4 tests, one of which
asserts the rows and the totals now agree.

### GS-052 — two of four audit trails were invisible

`admin/audit.tsx` merged `useMemberAudits` and `useFestivalAuditLogs` only.
`usePandalAssetAudits` and `usePandalSponsorAudits` both already existed and are
both readable under `audit.read`, but asset disposals, quantity write-downs and
sponsor edits appeared nowhere Pandal-wide — the asset ones only on an
individual asset's detail screen, the sponsor ones not at all.

All four now merge, with a new "Property" filter to separate them from money and
membership, and both hooks included in the loading and error gates. This matters
more since GS-053 added six new trails.

### GS-057 — one screen left, not five

The ticket listed five money screens with no closed-festival guard. The
`useFestivalWriteLock` work for GS-017 covered seven, and `add-sponsor` has its
own `closed` check, so only `add-asset` remained. Guarded.

---

## Stale-ticket sweep (2026-09-04)

All 37 then-open MEDIUM/LOW tickets were read and checked against current code.
Result: **6 closed as already fixed, 17 confirmed still real, 14 not verified.**

### Closed — already fixed, ticket never updated

| Ticket | Evidence |
| --- | --- |
| GS-047 — restored session never validated | `(tabs)/_layout.tsx` checks `hasActivePandal`, resolves through `resolveSessionFestival`, and calls `clearSession()` when the pandal is gone |
| GS-048 — previous-festival rows linger after a switch | `useGaneshCollection` calls `setItems([])` when its `subscribeKey` changes, and that key contains the path, so a festival switch clears |
| GS-060 — sponsor profile editing blocked by a closed festival | `sponsor/[id].tsx` has no `closed` reference at all now, and `updateSponsor` does not call `requireOpenFestival` — only the sponsorship *state* changes do, correctly |
| GS-062 — household list not carried forward | `mapHouseholdForNewFestival` is used inside `createFestival` |
| GS-064 — useGaneshSyncReporter duplicates four listeners | It opens none: it reads `pendingCount` off the shared `useGaneshData()` provider |
| GS-087 — two festivals for one year | `yearTakenByAnotherFestival` guards `createFestival`, backed by the `festivalYears` sentinel and `planFestivalYearClaim` |

### Confirmed still real

GS-058 (`displayStatus` is exposed by the hook and rendered nowhere) ·
GS-061 (`createFestival` seeds `DEFAULT_GANESH_CATEGORIES` only, so custom
categories are lost) · GS-074 (rules still
deployed by hand and the contract test is still a hand-written mirror — this
session added 14 more mirrors to it) · GS-075, GS-076, GS-078 (genuinely
missing features) · GS-085 (no `clientOpId` anywhere in
`ganeshPermanentFund`) · GS-089 (`{ id: "cancelled" }` is offered as a creation
status) · GS-092 (three `action: "edited"` writes; the union has no status
verbs) · GS-093 (`assignedCollectorId` is written by `updateHousehold` and read
by nothing) · GS-097 · GS-098 (dead
`ganeshStorage.ts` barrel) · GS-100 (113 `as never` casts)

Four of those confirmed-real ones — GS-065, GS-066, GS-067 and GS-095, the
query-bounds group — were fixed on 2026-09-04 and are no longer open. GS-066's
own description was half stale even after being "confirmed": the `where` clause
it asks for already existed.

### Not verified

GS-044 (already recorded as partially mitigated), GS-046, GS-054, GS-055,
GS-068, GS-070, GS-079, GS-090, GS-091, GS-094, GS-096, GS-099, GS-101. Each
needs more than a grep — mostly UI behaviour or a claim about a whole
subsystem. They stay OPEN and unverified rather than being marked either way.

### Why this pass was worth running

Counting the six above, **seventeen of the tickets checked across this session
were already fixed, misfiled, or wrong about their own mechanism.** Three named
a cause that measurement disproved (GS-080's epsilon, GS-041's enum coverage,
GS-057's five screens). The backlog's own numbers were the least reliable thing
in it, which is why every group in this session started by verifying rather
than by reading.