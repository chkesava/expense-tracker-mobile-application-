# Phase 18 — Spending Spaces

A Space groups expenses that belong to one real-world situation — a hospital
stay, a wedding, a house renovation — without changing what those expenses are.

## What a Space is not

A Space **never owns money**. It creates no transaction, holds no balance and
duplicates nothing. It is a label on existing expenses, and every number it
shows is derived by filtering on `spaceId`. Removing a Space from an expense
simply removes that expense from the Space's totals; the expense itself, its
category, its account and every existing report are untouched.

This also means Spaces and Borrowings never interact. Grouping an expense into
"Brother Hospital" says nothing about how that spending was funded.

## Data model

`shared/types/space.ts` defines a `Space` with `name`, an optional
`description`, `color`, an optional `budget`, optional `startDate` / `endDate`
and a `status` of `ACTIVE` or `ARCHIVED`. It lives in `users/{uid}/spaces`.

`Expense` gains one optional field:

```ts
spaceId?: string | null;
```

The create path in `services/ledger/createLedgerTransaction.ts` omits the key
entirely when it is unset, because `addDoc` rejects `undefined`:

```ts
...(payload.spaceId ? { spaceId: payload.spaceId } : {}),
```

So an expense with no Space is byte-identical to what the app wrote before this
feature existed, and **no data migration runs**. The edit path is the one place
that writes an explicit `null`, because clearing a Space has to actually remove
the assignment.

`Expense.budgetGroupId` already existed but was dead — declared and never read
or written. It was left alone rather than silently repurposed.

## The math

`shared/utils/spaceMath.ts` is pure and unit tested. `summarizeSpace` returns
total spent, expense count, budget remaining (which can go negative) and the
progress tier. `buildSpaceCategoryBreakdown` reuses the existing `category`
field for analytics. `summarizeSpaces` rolls everything up and also reports how
many expenses have no Space at all.

Budget tiers at 75, 90 and 100 percent are **informational only**. Nothing in
the app blocks or warns you out of spending over a Space budget.

## UI

A new **Spaces** tab in the Ledger Hub, with `SpacesList`, `SpaceCard`,
`SpaceFormModal` and `SpaceDetailModal` (spend total, expense count, budget
progress, category breakdown, and a searchable, filterable, sortable list of the
Space's expenses).

Expenses reach a Space three ways:

1. **At entry.** `ExpenseForm` gains one optional Space picker, following the
   existing Tags pattern. No existing field, validation path or submit branch
   changed. An archived Space stays visible on the expenses it is already on but
   is not offered for new ones.
2. **In bulk.** Long-pressing a row in `ExpenseList` enters selection mode;
   *Add to Space* commits a chunked `writeBatch` that sets only `spaceId`.
   Re-assigning an already-assigned expense is idempotent.
3. **One at a time.** The transaction detail sheet shows the current Space and
   offers *Change Space* and *Remove*.

Deleting a Space unlinks its expenses first, mirroring `useTrips`. The expenses
survive; only the grouping goes away.

## Manual Testing Guide

**Commands needed:** none. `npx expo start` hot-reload covers all of it.

1. **Create a Space.** Ledger Hub → **Spaces** → **+**. Name it *Brother
   Hospital*, pick a colour, set a budget of *30000*. Save. It appears with
   0 spent.
2. **Assign at entry.** Add a new expense of *4000* in *Health*. Before saving,
   pick *Brother Hospital* in the **Space (optional)** row. Save.
3. **Verify nothing else moved.** The expense appears in the normal expense list
   as usual, the account balance dropped by 4000, and this month's Health
   category total went up by 4000 — exactly as it would with no Space involved.
4. **Bulk assign.** Long-press an existing expense in the expense list to enter
   selection mode, tap two or three more, then **Add to Space** → *Brother
   Hospital*. The counter matches what you selected and the list returns to
   normal afterwards.
5. **Check the totals.** Open the Space. Total spent equals the sum of the
   assigned expenses, the count matches, budget remaining is 30000 minus the
   total, and the category breakdown adds up to 100 percent.
6. **Idempotency.** Assign one of those same expenses to the Space a second
   time. The total does not change and no duplicate row appears.
7. **Change and remove.** Tap a single expense to open its detail sheet. It
   names the current Space. Use **Change Space** to move it to another Space,
   then **Remove**. The expense stays in the expense list both times; only the
   Space totals change.
8. **Over budget.** Assign enough expenses to exceed 30000. The Space shows a
   negative remaining amount and an over-budget state — and still lets you keep
   spending, because the budget is informational.
9. **Archive.** Archive the Space. It stops being offered in the `ExpenseForm`
   picker for new expenses, but an expense already assigned to it still shows it
   when you edit that expense.
10. **Delete unlinks.** Delete a Space that has expenses. The Space disappears;
    **every one of its expenses is still in the expense list** with its amount,
    category and account intact, now with no Space.
11. **Regression sweep.** Add an expense with **no** Space and add an income.
    Both behave exactly as before, and neither is affected by any Space.
