# KAN-36 — Financial Dashboard & Fund Architecture

| Field | Value |
| --- | --- |
| Jira | [KAN-36](https://kesavach.atlassian.net/browse/KAN-36) |
| Feature | 03 — Financial Dashboard & Fund Architecture |
| Type | Feature |
| Status | In Progress |
| Priority | Medium |
| Project | KAN (Ganesh seva) |
| Parent | [KAN-33](https://kesavach.atlassian.net/browse/KAN-33) |

This file is the implementation brief for this ticket. Do not treat UI permission checks as the security boundary. Firestore Rules (and trusted backend writes) are.

## Ticket

Gap-close on the existing fund model. Do not rebuild the Funds dashboard, invent a second financial service, or change stored formulas. The live bug is that the app read `summary/current` while Cloud Functions wrote `summary/totals`.

## Live schema

| Ticket name | Actual path |
| --- | --- |
| Festival summary | `pandals/{pandalId}/festivals/{festivalId}/summary/totals` |
| Leftover client id | `…/summary/current` — not deleted; repair copies allocators onto `totals` |
| Permanent Fund | `pandals/{pandalId}/permanentFund/current` |
| Festival ledger | `…/{collections,contributions,expenses,reimbursements,fundTransfers,openingFunds}` |

No new composite indexes. No Expense Tracker / `users/{uid}` rule changes.

## Canonical operations

| Concern | Implementation |
| --- | --- |
| Path helper | `summaryDoc()` → `summary/totals` |
| Leftover path | `legacySummaryDoc()` → `summary/current` (repair only) |
| Allocator merge | `planSummaryAllocatorMerge` / `repairPandalSetup` |
| Derived totals | `functions/src/summary.ts` (`ganeshLedgerSummary`, `ganeshFestivalSummarySeed`, `recomputeGaneshSummary`) |
| God Fund formula | `availableGodFund` in `shared/utils/ganeshMath.ts` |
| Dashboard | `FestivalFinancialDashboard` + Home `PandalOverview` (unchanged) |

## Existing code to start from

- `shared/utils/ganeshPaths.ts`
- `shared/utils/ganeshSummaryMigrate.ts`
- `shared/utils/ganeshMath.ts`
- `functions/src/summary.ts`
- `app/(ganesh)/(tabs)/funds.tsx`
- `firestore/ganeshSummaryOwnership.rules.test.ts`

## How to implement

1. One summary document. All listeners and allocator writes go through `summaryDoc()`.
2. Repair copies the higher `nextReceiptNumber` / `nextContributionNumber` from `current` onto `totals`. Do not delete `current`.
3. Keep God Fund vs Personal Money, Permanent Fund, promised vs received, and in-kind exclusion as they are.
4. Deploy Ganesh Cloud Functions to `expenseapp-27f94` so a ledger write rebuilds `totals`. Do not deploy Expense/Nutrition functions or indexes.

## Implementation status

- [x] Inspected existing code
- [x] `summaryDoc()` unified on `totals`
- [x] Idempotent `current` → `totals` allocator merge
- [x] Tests added
- [ ] Ganesh Cloud Functions deployed — blocked: `expenseapp-27f94` is not on Blaze, so `cloudfunctions.googleapis.com` cannot be enabled
- [ ] Manual verification
- [ ] Jira KAN-36 updated after merge

## Manual testing guide

No new install is required if `npx expo start` is already running; hot reload picks the client path change up. Functions deploy is required before production Home/Funds stay live.

1. Combined build: Expense Tracker still lists personal expenses after sign-in.
2. Ganesh Seva: add a cash collection. Home Available and Funds God Fund increase by that amount (not promised, not in-kind).
3. Add a personal-only expense: God Fund unchanged; pending reimbursement increases.
4. Promised contribution: dashboard promised tile moves; Available does not.
5. Permanent Fund donation: PF screen changes; festival God Fund does not.
6. Close-festival remaining figure matches Funds God Fund.
7. If a festival still has only `summary/current`, Admin repair (or the setup banner) copies allocators onto `totals`. Receipt numbering does not restart.

## Leftovers

- [KAN-37](https://kesavach.atlassian.net/browse/KAN-37) household / collection coverage
- [KAN-38](https://kesavach.atlassian.net/browse/KAN-38) expense-spec UX leftovers
- [KAN-42](https://kesavach.atlassian.net/browse/KAN-42) settlement / Permanent Fund transfer product polish
- Budget vs actual by category
- Per-line money-in drill-down filters
- Per-subcollection `hasOnly` allowlist (rules expression budget)
- Expense Tracker / Nutrition financial screens
- Enable Blaze on `expenseapp-27f94`, then `npx firebase deploy --only functions --project expenseapp-27f94` so Home/Funds stay live after the path change
