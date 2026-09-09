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
| Derived totals | Netlify `ganesh-summary` → `rebuildFestivalSummary` in `functions/src/summary.ts` |
| God Fund formula | `availableGodFund` in `shared/utils/ganeshMath.ts` |
| Dashboard | `FestivalFinancialDashboard` + Home `PandalOverview` (unchanged) |

## Existing code to start from

- `shared/utils/ganeshPaths.ts`
- `shared/utils/ganeshSummaryMigrate.ts`
- `shared/utils/ganeshMath.ts`
- `netlify/functions/ganesh-summary.ts`
- `functions/src/summary.ts`
- `app/(ganesh)/(tabs)/funds.tsx`
- `firestore/ganeshSummaryOwnership.rules.test.ts`

## How to implement

1. One summary document. All listeners and allocator writes go through `summaryDoc()`.
2. Repair copies the higher `nextReceiptNumber` / `nextContributionNumber` from `current` onto `totals`. Do not delete `current`.
3. Keep God Fund vs Personal Money, Permanent Fund, promised vs received, and in-kind exclusion as they are.
4. Rebuild derived totals on Netlify (free tier), not Firebase Cloud Functions. After a ledger write the app POSTs to `/.netlify/functions/ganesh-summary` with the user's ID token. The function verifies membership and writes `summary/totals` with the Admin SDK.

## Implementation status

- [x] Inspected existing code
- [x] `summaryDoc()` unified on `totals`
- [x] Idempotent `current` → `totals` allocator merge
- [x] Tests added
- [x] Netlify function added (replaces Cloud Functions / Blaze)
- [x] Deploy Web (Netlify) Action copies `FIREBASE_SERVICE_ACCOUNT` from GitHub secrets
- [x] Pin CJS `jose` so `ganesh-summary` can load under Netlify (firebase-admin → jwks-rsa)
- [ ] After this fix merges: run **Deploy Web (Netlify)** once
- [ ] Manual verification
- [ ] Jira KAN-36 updated after merge

## After merge (you do this)

Do **not** click Deploy in the Netlify dashboard. Continuous Deployment stays off. A Netlify UI build would publish the old `netlify.toml` site and drop `/expense`, `/ganesh`, and `ganesh-summary`.

1. Merge [PR 74](https://github.com/chkesava/expense-tracker-mobile-application-/pull/74) to `main`.
2. GitHub → **Actions** → **Deploy Web (Netlify)** → **Run workflow** → branch `main`.
3. Wait until it is green. The Action builds the four web apps, bundles `ganesh-summary`, writes `FIREBASE_SERVICE_ACCOUNT` onto the spendly-share site from the GitHub secret, and deploys.
4. Confirm https://spendly-share.netlify.app/.netlify/functions/ganesh-summary answers (POST without a token should be **401**, not a `jose` / `ERR_REQUIRE_ESM` crash, and not 404).
5. Open Ganesh Seva Home on a festival that already has collections or contributions. Pandal Overview Available / Received should fill in after the automatic rebuild (no need to add another collection).
6. Add a cash collection and check Home Available / Funds God Fund increase by that amount (not promised, not in-kind).
7. Do not enable Blaze or deploy Firebase Cloud Functions for this ticket.

No new Expo install if `npx expo start` is already running. A store/APK release is only needed later so installed testers get the client that calls Netlify.

## Manual testing guide

No new install is required if `npx expo start` is already running; hot reload picks the client path change up. After merge, run **Deploy Web (Netlify)** once so the function is live.

1. Combined build: Expense Tracker still lists personal expenses after sign-in.
2. Open Home on a festival that already has Recent Activity but ₹0 Available. Totals should fill in without adding another collection.
3. Ganesh Seva: add a cash collection. Home Available and Funds God Fund increase by that amount (not promised, not in-kind).
4. Add a personal-only expense: God Fund unchanged; pending reimbursement increases.
5. Promised contribution: dashboard promised tile moves; Available does not.
6. Permanent Fund donation: PF screen changes; festival God Fund does not.
7. Close-festival remaining figure matches Funds God Fund.
8. If a festival still has only `summary/current`, Admin repair (or the setup banner) copies allocators onto `totals`. Receipt numbering does not restart.
9. Recalculate from ledger (reports) updates Home/Funds without a second collection.

## Leftovers

- [KAN-37](https://kesavach.atlassian.net/browse/KAN-37) household / collection coverage — in progress, see [KAN-37-collections-households-coverage.md](./KAN-37-collections-households-coverage.md)
- [KAN-44](https://kesavach.atlassian.net/browse/KAN-44) Street as a first-class entity
- [KAN-53](https://kesavach.atlassian.net/browse/KAN-53) Dedicated offline field-collection mode
- [KAN-38](https://kesavach.atlassian.net/browse/KAN-38) expense-spec UX leftovers
- [KAN-42](https://kesavach.atlassian.net/browse/KAN-42) settlement / Permanent Fund transfer product polish
- Budget vs actual by category
- Per-line money-in drill-down filters
- Per-subcollection `hasOnly` allowlist (rules expression budget)
- Expense Tracker / Nutrition financial screens
