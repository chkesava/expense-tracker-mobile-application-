# KAN-35 — Pandal & Festival Management

| Field | Value |
| --- | --- |
| Jira | [KAN-35](https://kesavach.atlassian.net/browse/KAN-35) |
| Feature | 02 — Pandal & Festival Management |
| Type | Feature |
| Status | In Progress |
| Priority | Medium |
| Project | KAN (Ganesh seva) |
| Parent | [KAN-33](https://kesavach.atlassian.net/browse/KAN-33) |

This file is the implementation brief for this ticket. Do not treat UI permission checks as the security boundary. Firestore Rules (and trusted backend writes) are.

## Ticket

Gap-close on the existing Pandal/Festival layer. Do not rebuild create/switch/persist, invent a stored `planning` status, add `openingFundSnapshot`, or create a top-level `festivals/` collection.

## Live schema

| Ticket name | Actual path |
| --- | --- |
| Pandal | `pandals/{pandalId}` |
| Festival | `pandals/{pandalId}/festivals/{festivalId}` |
| Year uniqueness | `pandals/{pandalId}/festivalYears/{year}` — append-only `{ festivalId, year }` |
| Festival books | `pandals/{pandalId}/festivals/{festivalId}/{collections,expenses,…}` |
| Opening money | `…/openingFunds` (not a field on the festival doc) |
| Permanent Fund | `pandals/{pandalId}/permanentFund/current` |
| Session | AsyncStorage `@ganesh_session:{uid}` — IDs only, not a security grant |

Stored festival status is `open | closed`. UI labels `upcoming | active | closed` are derived from dates in `shared/utils/ganeshFestivalStatus.ts`.

No new composite indexes.

## Canonical operations

Authoritative writes: `services/ganesh/ganeshWrites.ts` via `hooks/useGaneshWrites.ts`.

| Ticket name | Implementation |
| --- | --- |
| `createFestival` | `createFestival` + `commitFestivalAndYearClaim` |
| `updateFestival` | `updateFestivalDetails` — name/dates only; **year is immutable** |
| `listFestivals` | `useFestivals` → `festivalsCol(pandalId)` |
| `getFestival` | live festival doc; session stores ids only |
| `setCurrentFestival` / `getCurrentFestival` | `GaneshSessionProvider.setSession` / session + live doc |
| `closeFestival` | `closeFestival` (+ optional PF transfer) — rules require close shape |
| `getFestivalHistory` | same festival list; closed years are readable |

## Existing code to start from

- `services/ganesh/ganeshWrites.ts`
- `shared/utils/ganeshFestivalYear.ts`
- `providers/GaneshSessionProvider.tsx`
- `components/ganesh/chrome/FestivalSwitcher.tsx`
- `app/(ganesh)/admin/festivals.tsx`
- `firestore.rules` — `match /festivals/{festivalId}`

## How to implement

1. Reuse the current Pandal/Festival path model and session. Do not invent a server "current festival" pointer.
2. Keep Expense Tracker and Nutrition Tracker authorization unchanged.
3. Enforce year immutability and close/reopen shapes in Rules first, then match the UI.
4. Claim a missing `festivalYears/{year}` through `seedFirstFestival` / repair, not a second writer.
5. If `firestore.rules` change, follow `docs/FIREBASE_RULES_DEPLOY.md`.

## Implementation status

- [x] Inspected existing code
- [x] Security boundary implemented (Rules / trusted write)
- [x] Client UX updated
- [x] Tests added
- [ ] Manual verification
- [ ] Jira KAN-35 updated after merge

## Manual testing guide

No new install is required if `npx expo start` is already running; hot reload picks this up. After a rules change, deploy is still manual (`docs/FIREBASE_RULES_DEPLOY.md`) against Firebase project `expenseapp-27f94`.

1. Combined build: open Welcome, pick Expense Tracker, sign in. Confirm Finance still opens without a second OTP.
2. Switch app to Ganesh Seva. Confirm you are not asked for another OTP.
3. Create a festival for a new year. Creating the same year again is blocked.
4. Admin → Festivals: change name/dates and save. Year field is not editable.
5. Switch festival in the header. Home, Funds, and Seva show that year. Restart the app: same festival.
6. Close the festival. Add expense/collection is denied. Reopen with `festival.close`: writes work again.

## Leftovers

- [KAN-25](https://kesavach.atlassian.net/browse/KAN-25) full 2026/2027 × two-pandal isolation matrix
- [KAN-42](https://kesavach.atlassian.net/browse/KAN-42) settlement UX / Permanent Fund transfer product work
- [KAN-19](https://kesavach.atlassian.net/browse/KAN-19) record-locking matrix
- Separate `festival.reopen` permission (reopen keeps using `festival.close`)
- In-app pandal switcher (setup-only today)
- Stored `planning` / festival archive
- `summary/current` vs `summary/totals` (KAN-36)
