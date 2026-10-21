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
| **State Bank of India** (savings) | ₹49,654.96 | **₹23,654.96** | Two transfers to Hand Cash, **₹24,000 on 29 Jul** and **₹2,000 on 12 Aug**, never reached the stored balance. The 9 Oct rebuild used the pre-436 script, which read a non-existent `transfers` collection and so saw no transfers. Rebuilt = opening ₹29,999.96 + income ₹33,000 − expenses ₹9,334 − card payment ₹4,011 − transfers ₹26,000 | **The user's real balance is ₹562** (2026-10-20). Neither the stored nor the rebuilt value is right: about ₹23,093 of SBI activity was never recorded. **Do not apply the rebuild.** Instead the user re-baselines (below) |
| **Hand Cash** | ₹0 | **₹26,000** | The receiving side of the same two transfers. Its baseline is 29 Jul with opening ₹0, so both transfers count | **The user's real cash is ₹2,792** (2026-10-20). About ₹23,208 of cash spending was never recorded. **Do not apply the rebuild.** Re-baseline instead |
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

### SBI and Hand Cash: re-baseline instead of rebuild (user's real balances, 2026-10-20)

A rebuild can only recompute from recorded rows. When real-world money moved without being recorded, the supported fix is the account's **opening balance as of a date** (`openingBalance` + `balanceAsOfDate`, the "balance as of" fields in the account editor):

| Account | Set opening balance | As of | Effect |
|---|---|---|---|
| State Bank of India | **₹562** | 2026-10-20 | Rows dated before it are treated as inside the opening balance. The stored value and every later rebuild = ₹562 + activity after that date |
| Hand Cash | **₹2,792** | 2026-10-20 | Same |

The user does this in the app (account editor → balance and "as of" date). After that, dry-run 2 must show **no** variance for either account. It is recorded here so the apply never "corrects" them back to the ledger values.

## Found during the dry-run: live dashboard write gaps (not fixed by 495)

These paths change spending without updating the month's dashboard summary, so the dashboard drifts again after any rebuild until they are fixed:

1. **Recurring / EMI due-posts.** `services/subscriptions/duePost.ts` creates the expense with no dashboard op. This is why 2026-10 is ₹3,800 short; about ₹10,651 of that month's spend is due-posts.
2. **Merging a category into another.** `hooks/useCategories.ts` re-labels expenses but leaves `categoryTotals` on the old category.
3. **Deleting a split.** `hooks/useSplits.ts` soft-deletes the linked expenses without a dashboard decrement.

**Now fixed** in [SPENDLY-563](https://kesavach.atlassian.net/browse/SPENDLY-563), which blocks this task. It also fixes a split delete refunding an already-deleted expense twice.

## Dry-run 2: 2026-10-20 (production, read-only, from `main` with 563)

`rebuild-domain-summaries.ts --excludeAccountId=<Axis>`: 24 users, 0 blocked. The output is **identical to dry-run 1**, except that the Axis card is now reported as `[Excluded] (has variance, left as is)`.

`--excludeAccountId=` is new in `scripts/lib/rebuildRunner.ts` (comma-separated, tested). It lets the rebuild skip an account a human still has to decide on, without hand-picking users.

## Required order before any `--apply`

1. ~~Fix the three dashboard write gaps~~: SPENDLY-563, built; merge to `main` before the release.
2. **Release the app.** The user plans a major release for 2026-10-21. Phones on old builds keep writing the pre-495/496/497/563 shapes.
2a. The user re-baselines SBI (₹562) and Hand Cash (₹2,792) as of the release date.
3. Dry-run 2, from `main` after the release.
4. The user approves item by item, especially SBI, Hand Cash and Axis.
5. `--apply`, one script at a time.
6. ~~Dry-run 3~~: done 2026-10-21 (below).
7. Comment on SPENDLY-436, 417 and 419.

## Dry-run 3: 2026-10-21 (production, read-only, after the apply)

24 users, 0 blocked:

| | Dry-run 2 | Dry-run 3 |
|---|---|---|
| `[OK]` (accounts, dashboards) | 15 | **25** |
| `[Variance]` | 34 | **1** (Axis) |
| `[Excluded]` | 1 (Axis) | 0 (no exclusion passed) |

- All 24 dashboard month docs are now right.
- EPF is unchanged at ₹45,671.11.
- **The only remaining difference is the Axis card**: ₹146 stored vs ₹0 recomputed, plus two stale derived fields. It is left as is until the user says whether one of the two ₹299 payments (2 and 3 Sep) is a duplicate.

The SPENDLY-503 baseline was re-run after the apply (`docs/SPENDLY-503-baseline-summary-production-2026-10-21.md`): 26 accounts, 25 match, 1 variance (Axis). This is the same as before the apply, as expected, because the apply changed no balances.

## Rollback

The dry-run output above records every before value. A wrong apply is reversed with an approved one-off script that writes those values back. No deletes beyond the stray dotted field and the stale derived card fields.
