# SPENDLY-500: production financial reconciliation

[SPENDLY-500](https://kesavach.atlassian.net/browse/SPENDLY-500) carries the production repair left over from SPENDLY-436, 417 and 419, using the fixed rebuild logic from 495, 496, 497 and 499 (all on `main` at `1995db9`).

**Status: dry-run done; no `--apply` has run.** Applying needs the user's approval, item by item, after the release below.

## Dry-run 1: 2026-10-20 (production, read-only)

Run from `main` `1995db9` with the user's service account. Nothing was written. User ids are omitted; accounts are named.

| Script | Result |
|---|---|
| `scripts/rebuild-domain-summaries.ts` (accounts, EPF, dashboards) | 24 users read, **0 blocked** (every source read succeeded). **7 users** have something to change |
| `scripts/reconcile-credit-card-bill-payments.js` (SPENDLY-417) | **0 users affected:** no status fixes, no duplicate bills |
| `scripts/reconcile-portfolio-holdings.js` (SPENDLY-419) | **0 users affected:** no missing BUY/SELL rows |

**Step 1 of the ticket (did an apply run after 2026-10-10?).** The affected accounts show `balanceLastRebuiltAt = 2026-10-09T10:10:57Z`, so the last rebuild ran **before** the SPENDLY-436 fix. The HDFC repair recorded under SPENDLY-523 (2026-10-15) did not touch these accounts.

### Account balances: 11 account writes

| Account | Stored | Rebuilt | Explanation | Proposed action |
|---|---|---|---|---|
| **State Bank of India** (savings) | ₹49,654.96 | **₹23,654.96** | Two transfers to Hand Cash, **₹24,000 on 29 Jul** and **₹2,000 on 12 Aug**, never reached the stored balance. The 9 Oct rebuild used the pre-436 script, which read a non-existent `transfers` collection and so saw no transfers. Rebuilt = opening ₹29,999.96 + income ₹33,000 − expenses ₹9,334 − card payment ₹4,011 − transfers ₹26,000 | **Needs the user to confirm** the real SBI balance |
| **Hand Cash** | ₹0 | **₹26,000** | The receiving side of the same two transfers. Its baseline is 29 Jul with opening ₹0, so both transfers count | **Needs the user to confirm** the real cash in hand |
| **Axis Credit Card** | ₹146 | ₹0 | Charges ₹299 (2 Sep) and ₹146 (11 Oct); payments **₹299 on 2 Sep and ₹299 on 3 Sep**. If both payments are real, the card is ₹153 in credit; the ledger sets that aside (497 rule) and shows ₹0 owed. If the 3 Sep payment is a duplicate entry, the real amount owed is ₹146 and the rebuild would be wrong | **Ambiguous: excluded from the apply** (ticket rule) until the user confirms whether ₹299 was paid twice |
| One card (another user) | ₹13,977.539999… | ₹13,977.54 | Floating-point dust only | Apply (no money change) |
| 9 cards (several users) | — | — | Stale stored `unbilledSpend` / `availableCredit` (no longer read since 497) | Clear (no visible change) |

### Dashboard summaries: 24 month docs across 5 users

- **Nearly all are the new subcategory keys.** 495 now stores `parent::sub` alongside each parent category, and older months only had parents. Month totals don't change.
- **One month is short: 2026-10**, for one user. Stored ₹28,315.04 against rebuilt **₹32,115.04** (+₹3,800, 3 transactions). The cause is a **live write gap**, explained below.
- **One month missing:** a missing summary doc (₹1,000, 1 transaction) will be created.
- **One stray literal `"categoryTotals.*"` field** (the pre-495 bug) will be deleted.

### EPF

The stored and rebuilt EPF balance are both **₹45,671.11**. There is no change.

## Found during the dry-run: live dashboard write gaps (not fixed by 495)

These paths change spending without updating the month's dashboard summary, so the dashboard drifts again after any rebuild until they are fixed:

1. **Recurring / EMI due-posts.** `services/subscriptions/duePost.ts` creates the expense with no dashboard op. This is why 2026-10 is ₹3,800 short; about ₹10,651 of that month's spend is due-posts.
2. **Merging a category into another.** `hooks/useCategories.ts` re-labels expenses but leaves `categoryTotals` on the old category.
3. **Deleting a split.** `hooks/useSplits.ts` soft-deletes the linked expenses without a dashboard decrement.

**Proposal:** fix these as a follow-up ticket **before** the production apply.

## Required order before any `--apply`

1. Fix the three dashboard write gaps above (a follow-up ticket).
2. **Release the app.** Phones on old builds keep writing the pre-495/496/497 shapes.
3. Dry-run 2, from `main` after the release.
4. The user approves item by item, especially SBI, Hand Cash and Axis.
5. `--apply`, one script at a time.
6. Dry-run 3, which must show zero variance (Axis is left flagged unless resolved).
7. Comment on SPENDLY-436, 417 and 419.

## Rollback

The dry-run output above records every before value. A wrong apply is reversed with an approved one-off script that writes those values back. No deletes beyond the stray dotted field and the stale derived card fields.
