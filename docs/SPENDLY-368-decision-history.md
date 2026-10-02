# SPENDLY-368 — Decision history, timeline and search

**Ticket:** [SPENDLY-368](https://kesavach.atlassian.net/browse/SPENDLY-368) (Story)
**Epic:** [SPENDLY-361](https://kesavach.atlassian.net/browse/SPENDLY-361) — see [epic record](SPENDLY-361-financial-decision-journal.md)
**Branch:** `feature/SPENDLY-368-decision-history`, cut from the epic branch after 367 and merged back with approval.
**Depends on:** 362–367
**Scope:** Spendly only. No rules or data-model changes.

---

## 1. What users see

`/decisions` is now the full history:

* **Search:** covers the title, category, the options (including the one chosen), linked records' labels, constraints, the goal and the rationale. Every word must match, ignoring case.
* **Quick chips:** All, Drafts, Open (considering, decided or tracking), Reviewed & closed, Archived.
* **Filters & sort sheet:**
  * sort by date decided (the default), last updated, date started, or title;
  * filter by category;
  * filter by review state: due, scheduled, none, or reviewed;
  * filter by outcome: recorded or awaiting;
  * **Include archived decisions**.
* **Timeline:** grouped by month with a count, newest first, by when each decision was made (or started, for drafts). Sorting by title gives a flat list.
* **Rows:** show the category, the chosen option, *Decided* or *Started* with a date, and *Outcome recorded* or *Awaiting outcome*.
* **States:** loading, error with retry, a first-time empty state, a "No decisions match" empty state with **Clear search and filters**, and the offline banner. **Coming up** stays at the top unless a search is active.

## 2. Design

### 2.1 Archived and closed stay discoverable
Closed decisions are in the default list. Archived decisions are hidden by default but appear in any of these cases:
* the user picks the **Archived** chip;
* the user turns on **Include archived** in the sheet;
* **any search** matches them.

So nothing is ever lost.

### 2.2 Chronology
The timeline orders by `decidedAtMs`, falling back to `createdAtMs`. Ties break by id, so the order is stable. Month headers are derived from the same date, so the grouping can't disagree with the order.

### 2.3 Performance
`decisionSearchText` builds each decision's search string once per revision and caches it, so typing re-matches strings instead of rebuilding them. A test filters and searches 20,000 decisions well within the 1.5 s budget, and the second, cached query is no slower. The list uses FlashList with `getItemType` for headers and rows. The search box sits outside the list, so typing doesn't remount it.

### 2.4 Access scope
Search only ever runs on the decisions passed in. Those come from the signed-in user's own `users/{uid}/decisions` listener, which the 362 rules restrict to the owner and the duress twin, and the emulator tests deny everyone else. There is no server or collection-group search. The cache is keyed by decision id and is never read for a decision that isn't passed in.

## 3. Files

| File | What |
|---|---|
| `shared/utils/decisionHistory.ts` (+test, 11) | Search text and cache, query matching, filters, review/outcome state, sorting, month timeline |
| `app/(app)/decisions/index.tsx` | Search, chips, filter sheet, timeline |
| `components/decisions/DecisionRow.tsx` | Decided/started date and outcome status |

## 4. Validation

* `npm test`: 299 files / 4689 tests.
* `typecheck` and `typecheck:shared`: clean.
* **Not yet checked on a device.**

## 5. Manual testing guide

1. Create decisions in different months, and archive one.
2. Search for a word from an option or a linked record's name. The decision should appear, including the archived one.
3. Tap **Archived**: only archived decisions show. Tap **All**: they're hidden again.
4. Open **Filters**, choose *Review due* and *Awaiting outcome*, and check that the count on the button matches the list.
5. Sort by **Title**: the month headers disappear. Sort by **Date decided**: they come back in chronological order.
6. Search for nonsense. "No decisions match" should appear, and **Clear search and filters** should restore the list.
