# KAN-39 — Contributions, In-kind & Sponsors

| Field | Value |
| --- | --- |
| Jira | [KAN-39](https://kesavach.atlassian.net/browse/KAN-39) |
| Feature | 06 — Contributions, In-kind & Sponsors |
| Type | Feature |
| Status | In Progress |
| Priority | Medium |
| Project | KAN (Ganesh seva) |
| Parent | [KAN-33](https://kesavach.atlassian.net/browse/KAN-33) |

This file is the implementation brief for this ticket. Do not treat UI permission checks as the security boundary. Firestore Rules (and trusted backend writes) are.

## Ticket

Gap-close on the existing contributions + sponsors pipeline. Do not invent a second income ledger, a `Partially Received` status, or `promisedAmount` / `receivedAmount` on one row.

One contribution row is one event. Promised never enters cash. In-kind never enters God Fund. Household Chanda stays on collections (KAN-37).

## Live schema

| Ticket name | Actual path |
| --- | --- |
| Contribution | `pandals/{pandalId}/festivals/{festivalId}/contributions/{contributionId}` |
| Sponsor | `pandals/{pandalId}/sponsors/{sponsorId}` |
| Sponsorship deal | `pandals/{pandalId}/festivals/{festivalId}/sponsorships/{sponsorshipId}` |
| Festival summary | `pandals/{pandalId}/festivals/{festivalId}/summary/totals` |

Status stays `promised` \| `received` \| `cancelled`. Kind stays `money` \| `item` \| `service` \| `sponsorship`. Committee cash is `isCommitteeContribution` + `contributorMemberId`. Sponsor cash receive already mirrors a contribution via `appendReceivedContribution`.

No new collections, indexes, status enums, or stored formulas. List filters stay in memory (existing contribution listener cap).

## Canonical operations

| Concern | Implementation |
| --- | --- |
| Create / receive / cancel | existing `addContribution`, `receiveContribution`, `cancelContribution` |
| Void received cash | existing `voidFinancialRecord({ entityType: "contribution" })` — permission stays `expenses.void` |
| Committee vs other cash | `isCommitteeContribution` written from add-contribution money chips and `add-member-payment` |
| Cash vs not-cash | Received money → `committeeContributions` / `otherCashContributions`. Promised and in-kind estimated value never enter `availableGodFund` |
| In-kind → asset | Optional `addAsAsset` already on add + receive |
| Sponsor list amount | `sponsorListAmounts` — received cash + in-kind; promised leftover is `amountMeta` |
| Totals | Ledger is source of truth; Netlify `ganesh-summary` writes `summary/totals` |
| Idempotency | `clientOpId` as document id |

## Existing code to start from

- `shared/types/ganesh.ts`
- `shared/utils/ganeshContributions.ts`
- `shared/utils/ganeshSponsors.ts`
- `services/ganesh/ganeshWrites.ts`
- `hooks/useGaneshWrites.ts`
- `app/(ganesh)/add-contribution.tsx`
- `app/(ganesh)/add-member-payment.tsx`
- `app/(ganesh)/contribution/[id].tsx`
- `app/(ganesh)/sponsors.tsx`
- `components/ganesh/funds/ContributionsList.tsx`

## How to implement

1. Keep one contribution row per event. Do not add `Partially Received`.
2. Contribution detail voids received rows with `voidFinancialRecord`. Confirm copy distinguishes cash (and committee paid) from in-kind.
3. Add-contribution money path: Committee / Other cash chips. Committee uses the member picker and sets `isCommitteeContribution` + `contributorMemberId`. Keep `add-member-payment` as the member-profile shortcut.
4. Contributions list: source chips (All / Committee / Other cash / Via sponsor). Sponsor-mirror rows are labelled. Money **Mark received** opens detail for payment method. In-kind one-tap receive stays.
5. Sponsor list amount is received (cash + in-kind). Promised leftover is `Promised ₹X` in `amountMeta`.

## Implementation status

- [x] Inspected existing code
- [x] Void received contribution from detail
- [x] Committee vs Other cash on add-contribution
- [x] List source chips + money receive opens detail
- [x] Sponsor list received vs promised leftover
- [x] Tests added
- [ ] Manual verification
- [ ] Jira KAN-39 updated after merge

## After merge

No Firestore rules deploy is needed unless a later change adds a payload or enum. Summary rebuild stays on Netlify `ganesh-summary` (KAN-36).

## Manual testing guide

No new install is required if `npx expo start` is already running; hot reload picks the client up.

1. Combined build: Expense Tracker still lists personal expenses after sign-in. Nutrition is unchanged.
2. Add a promised money contribution as **Other cash**. Funds God Fund / Home Available do not change.
3. Open that row and **Mark received** as UPI. God Fund increases. List **Mark received** on money must open this screen, not hard-code cash.
4. Treasurer with `expenses.void` voids that received cash. God Fund returns. The row stays in history as Voided.
5. Add money as **Committee**, pick a member. Received cash increases that member's `contributionPaid`. Void reverses both God Fund and committee paid.
6. Add / receive an item. God Fund unchanged. Optional **Also add as Pandal asset** still creates inventory only.
7. Contributions list: Committee / Other cash / Via sponsor chips. A sponsor-mirror cash row is labelled **Via sponsor deal**.
8. Sponsors list: a promised ₹8,000 deal does not appear as the row amount. After receive, the row shows received; leftover promised stays in `Promised ₹X`.
9. Viewer cannot receive, cancel, or void. Closed festival can still read lists.
10. Double-tap Save on add-contribution: one row (`clientOpId`).

## Leftovers

- Partial promise fulfillment / `Partially Received` status
- Personal-expense → contribution-record conversion (KAN-38 leftover)
- [KAN-40](https://kesavach.atlassian.net/browse/KAN-40) assets / document vault
- [KAN-42](https://kesavach.atlassian.net/browse/KAN-42) settlement / Permanent Fund
- Dedicated `contributions.void` permission
- Structured in-kind purpose/unit fields
- Pagination beyond the existing contribution listener cap
