# KAN-37 — Collections, Households & Coverage

| Field | Value |
| --- | --- |
| Jira | [KAN-37](https://kesavach.atlassian.net/browse/KAN-37) |
| Feature | 04 — Collections, Households & Coverage |
| Type | Feature |
| Status | In Progress |
| Priority | Medium |
| Project | KAN (Ganesh seva) |
| Parent | [KAN-33](https://kesavach.atlassian.net/browse/KAN-33) |

This file is the implementation brief for this ticket. Do not treat UI permission checks as the security boundary. Firestore Rules (and trusted backend writes) are.

## Ticket

Gap-close on the existing chanda pipeline. Do not invent a second collection system, a Street entity, or a dedicated offline field mode.

Household promises and door visits are operational states on the household document. Collections remain received cash and are the only input to `summary.chanda` / God Fund (KAN-36).

## Live schema

| Ticket name | Actual path |
| --- | --- |
| Household | `pandals/{pandalId}/festivals/{festivalId}/households/{householdId}` |
| Collection | `pandals/{pandalId}/festivals/{festivalId}/collections/{collectionId}` |
| Festival summary | `pandals/{pandalId}/festivals/{festivalId}/summary/totals` |

No Visit subcollection. No `pandals/{id}/streets`. Area/street is free-text `household.area`. No new composite indexes; list filters stay in memory (household cap 2000).

## Household status

| Code | Chip | Meaning |
| --- | --- | --- |
| `pending` | Not visited | Seeded house, no door outcome and ₹0 collected |
| `visited` | Visited | Door opened, no cash, no promise |
| `promised` | Promised | Will pay later. `promisedAmount` is operational only |
| `partial` | Partial | Collected cash below expected |
| `paid` | Paid | Collected cash meets or exceeds expected |
| `not_available` | Follow-up | Come back later |
| `not_interested` | Not interested | Declined |

Sticky visit outcomes apply only while `collectedAmount === 0`. Cash clears them via `deriveHouseholdStatus`.

## Canonical operations

| Concern | Implementation |
| --- | --- |
| Create household | `createHousehold` in `services/ganesh/ganeshWrites.ts` (`collections.update`) |
| Record visit | `recordVisit` — household update only, no collection row (`collections.create`) |
| Record cash | existing `addCollection` + `clientOpId` doc id |
| Coverage | `buildFinancialOverview().collections` |
| Status labels | `householdStatusLabel` / `deriveHouseholdStatus` in `shared/utils/ganeshMath.ts` |

Collector id is still resolved with `resolveCollectorId`. Never trust client `pandalId`.

Idempotency: a retried Save uses the same `clientOpId` as the collection document id. Offline writes skip receipt allocation and toast as saved on the device.

## Existing code to start from

- `shared/types/ganesh.ts`
- `shared/utils/ganeshMath.ts`
- `shared/utils/ganeshFinancialOverview.ts`
- `services/ganesh/ganeshWrites.ts`
- `hooks/useGaneshWrites.ts`
- `components/ganesh/funds/CollectionsList.tsx`
- `app/(ganesh)/add-collection.tsx`
- `app/(ganesh)/add-household.tsx`
- `firestore.rules` household status enum

## How to implement

1. Extend `HouseholdStatus` with `visited` and `promised`. Relabel `not_available` as Follow-up in UI.
2. Add `promisedAmount`, `lastVisitAt`, `followUpAt` on `Household`.
3. `createHousehold` seeds status `pending`. `recordVisit` refuses if the house already has cash.
4. Coverage strip shows received vs promised vs visit %. Promised never enters `summary.chanda`.
5. Field entry: search/select household → amount → payment method → save. Visit chips on the selected house. Stay on screen after save.
6. Filters: status, area (street as text), collector.

## Implementation status

- [x] Inspected existing code
- [x] Status model + rules enum
- [x] `createHousehold` / `recordVisit`
- [x] Coverage + list filters
- [x] Fast field entry
- [x] Tests added
- [ ] Manual verification
- [ ] Jira KAN-37 updated after merge

## Manual testing guide

No new install is required if `npx expo start` is already running; hot reload picks the client up.

1. Combined build: Expense Tracker still lists personal expenses after sign-in. Nutrition is unchanged.
2. Ganesh Seva, collector role: Collections empty state offers **Add household**. Add a house with no mobile. Status is Not visited.
3. Open Add collection, search that house, tap **Visited**. No new collection row. Coverage visit % moves. God Fund / Available unchanged.
4. On the same house tap **Promised** with amount ₹500. Coverage promised tile moves. Available / `summary.chanda` unchanged.
5. Save a cash collection for that house. Status becomes Partial or Paid. Promised amount no longer counts. Home Available and Funds God Fund increase by the cash amount.
6. Record a second payment against the same house (partial → paid). One household row, not two.
7. Double-tap Save on a collection: one row, same receipt / same `clientOpId`.
8. Airplane mode: save a collection. Toast says it is on the device. Sync chip is not “synced”. Going online assigns a receipt and does not duplicate the amount.
9. Filter chips: Not visited / Visited / Promised / Follow-up / area / collector all narrow the household list.
10. Viewer role still cannot open Collections (household PII).

## Leftovers

- [KAN-44](https://kesavach.atlassian.net/browse/KAN-44) Street as a first-class entity and street rounds
- [KAN-53](https://kesavach.atlassian.net/browse/KAN-53) Dedicated offline field-collection mode
- [KAN-41](https://kesavach.atlassian.net/browse/KAN-41) Session / cash handover polish
- [KAN-30](https://kesavach.atlassian.net/browse/KAN-30) Field-level household PII masking
- Server-side coverage aggregates and composite indexes (pagination beyond 2000 houses)
