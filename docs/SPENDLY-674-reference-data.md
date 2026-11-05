# SPENDLY-674 (N6): reference data read through the switch

| | |
|---|---|
| Epic | SPENDLY-586 (plan v2) |
| Branch | `feature/SPENDLY-674-reference-data` |
| Migration | none (all synced by 589–591) |

The collections the app reads at launch that aren't money. Each one has a switch, `readModel.<collection>`, that goes firestore (the default), then shadow for **7 days**, then supabase.

## What reads through the switch

| Collection | Where | Firestore mode (unchanged) | Supabase mode |
|---|---|---|---|
| `categories` | `ExpenseReferenceDataProvider` | The revision mechanism of SPENDLY-660 (`meta/categories` + the Firestore cache) | The copy, and realtime replaces the revision listener. Writers keep bumping the revision, so a fallback to Firestore stays correct |
| `spaces` | `ExpenseReferenceDataProvider` | One read per session, refreshed on foreground if stale | The copy, live |
| `categorizationRules` | `ExpenseReferenceDataProvider` | One read per session, refreshed on foreground if stale | The copy, live. Only foreground suggestions read them: the user confirms every category |
| `calendarReminders` | `useCalendarReminders` | The listener | The copy (588 F2: the duplicate launch listener goes away) |

## Writers (R4.3a)

`useCategories` renames, deletes and merges categories by rewriting expenses and categories from the lists on screen.

- **Categories from the copy:** each of these writes reads the categories from Firestore once (`categoriesForWrite`).
- **Expenses from the copy:** they're never treated as the whole history (`expensesInMemory`). The existing Firestore query path (SPENDLY-98) finds the rows to rewrite, and that includes the dashboard relabels of SPENDLY-563.

## Stays on Firestore

- **The `users/{uid}` settings document.** It holds the privacy PIN, duress and lock fields, which are never copied (591 part C). So its listener stays whichever way the switch is set. Reading the theme fields from the copy too would add a second source without saving a read.
  - **Theme and palette (677) still come from that listener and Firestore's durable on-device cache (633).** So there's no flash of the default palette at launch, and offline keeps the last palette.
- **`merchantOverrides`:** one-off service reads when a screen opens (`listMerchantOverrides`), with no listener to replace.
- **`recurringDismissals`:** the recurring sync writes from them, so they keep Firestore (R4.3a).

## Tests

`lib/readModelLocal/providerSwitch.test.ts`:
- **Integrated collections:** the four collections above, each with the same safe-switch checks: the Firestore path kept, the copy only in supabase mode, compares only in shadow mode, and re-runs on a mode change.
- **Writer pins:** category writers use `expensesInMemory` and never `expensesComplete ?` directly, and read categories from Firestore in copy mode for rename, delete and merge.
- **Categories:** in supabase mode they come from the copy, and the revision listener stays for firestore mode.
- **Not-yet reasons** for `merchantOverrides`, `recurringDismissals` and `userSettings`.

## Results

- `npx vitest run`: 538 files, 7,658 tests pass.
- `npx tsc --noEmit -p .` passes.
- `npm run test:rules` passes.

## After the epic reaches main

- **Shadow:** 7 days with zero differences per collection, then supabase, with the user's approval.
- **Launch reads:** measure them with the 588 meter, before and after.
- **Palette:** check on a device in supabase mode that it doesn't flash. The settings listener is unchanged, so this is a regression check.
