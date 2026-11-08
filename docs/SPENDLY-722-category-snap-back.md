# SPENDLY-722 — Web: changing a transaction's category snaps back

Bug. Ships in the SPENDLY-718 PR (branch `feature/SPENDLY-718-desktop-dashboard`), at the user's request.

## Symptom
On web (desktop and phone), in **Add Transaction → Category → Change**, a newly picked category goes straight back to the previous category or subcategory.

## Reproduction
Expo web against the emulator demo user, with Playwright:
1. Open Add expense and tap **Change**, then **Shopping & Clothing**. The form shows *Shopping & Clothing › Accessories*.
2. With the picker still open, the accounts list refreshes. On the deployed site this comes from a read-model sync or realtime update; here it was simulated by touching one account doc through the emulator REST API.
3. The form resets to *Food & Groceries*. It then flips between *Shopping & Clothing › Accessories* and *Food & Groceries › Vegetables* about every 130 ms: over 50 flips in 8 s, with no end.

The emulator is quiet, so an untouched session never shows it. On the deployed web app the accounts list re-emits far more often:
- in read-model mode, `readSource.subscribe` reloads on every copy `onChange` for the accounts table;
- otherwise, through Firestore snapshots.

## Root causes
1. **`components/ExpenseForm.tsx`.** The set-up effect listed `accounts` in its dependencies. Every new accounts array re-ran the "new transaction" reset, which wiped the open form back to its defaults: category, subcategory, amount, note, tags and account.
2. **`components/categories/CategoryPicker.tsx`.** The "auto-validate subcategory" effect validated against the picker's *draft* parent (`selectedParentName`), which updates one render after the `category` prop. After any outside category change it re-sent `(draft parent, first subcategory)`, while the prop-sync effect moved the draft to the new prop. The two then corrected each other indefinitely.

## Fix
| File | Change |
|---|---|
| `shared/utils/categorySelection.ts` | `reconcileSubcategory(sub, names)` fixes only the subcategory of the committed parent. `defaultAccountId(current, ids)` keeps a valid choice, otherwise falls back to the first account |
| `components/categories/CategoryPicker.tsx` | Validates against the **committed** `category` prop and never changes the parent. The draft parent stays display-only |
| `components/ExpenseForm.tsx` | The reset runs only when the form opens or its target changes (`editingExpense`, `editingIncome`, `initialType`, default category, timezone). A separate effect fills the default account and keeps the user's choice across refreshes |
| `shared/utils/categorySelection.test.ts` | 8 tests, including "settles after one correction" and "keeps the choice on refresh" |

There is no data, write-path, schema or read-model change.

## Verification
Playwright, Expo web against the emulator, after the fix:
- **Add, 1440px:** pick Shopping & Clothing, refresh accounts, pick Footwear. 0 flips in 8 s; the form holds *Shopping & Clothing › Footwear*.
- **Edit, 1440px:** pick Transport & Vehicles, refresh accounts, pick Petrol, save. The form holds and the save succeeds.
- **Add, 390px:** pick Education, refresh accounts. 0 flips; the form holds.
- **Default account:** a new expense still preselects the first account (HDFC Savings).
- **Tests:** `npx vitest run shared/utils/categorySelection.test.ts` → 8/8. Typecheck and the full suite results are in the PR.

## Also noticed (not fixed here)
At phone width the category picker opens with the parent list scrolled. The first few parents (Bills, Travel, Shopping, Food) were not reachable in the Playwright run. This is a separate layout issue, worth its own ticket if confirmed on a real phone browser.
