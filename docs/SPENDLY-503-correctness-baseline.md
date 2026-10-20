# SPENDLY-503: financial correctness baseline

[SPENDLY-503](https://kesavach.atlassian.net/browse/SPENDLY-503) is the trusted reference that SPENDLY-494's shadow validation compares the read model against.

## What it is

| Piece | Where |
|---|---|
| Baseline builder (pure) | `shared/utils/financialBaseline.ts`, `buildUserBaseline(rows, today)` |
| Golden fixture | `shared/__fixtures__/readModel/fullLedger.ts`: one synthetic user covering every flow kind (transfers both ways, cashback, partial bill payment, voided payment, card refund, soft delete, restore, cross-month edit, borrowing with interest, receivable, EPF with FY interest, a holding with a reversal, investment cash) |
| Reference snapshot | `shared/utils/__snapshots__/financialBaseline.test.ts.snap` |
| Read-only script | `scripts/readmodel-baseline.ts` |

For each user the baseline holds:
- the document count of each of the 25 Wave 1–3 collections, with deleted/voided rows counted apart (`isActiveLedgerRow` + `voidedAt`);
- active-row sums by month and by account;
- stored vs recomputed balance per account and card, through `recomputeFinancialState` (SPENDLY-499);
- open card bills;
- the EPF closing balance;
- `composeNetWorth` without quotes, on the stored balances (what the app shows) and on the recomputed ones.

## Privacy

The repository is public. The script writes the per-user report (account names, amounts) to `docs/private/`, which is git-ignored, and labels users with a sha256 prefix, never the uid. Only an aggregate summary with no names, amounts or uids is committed.

## Results

**Emulator seed** (`docs/SPENDLY-503-baseline-summary-emulator-2026-10-20.md`): 1 user, 4 accounts. All 4 show "nothing stored", because the seed writes no materialized balances. The script ran end to end.

**Production, 2026-10-20** (`docs/SPENDLY-503-baseline-summary-production-2026-10-20.md`): 24 users, 0 read failures, 26 accounts.
- **25 match** the reference exactly. This is after SPENDLY-500 re-baselined SBI (₹562) and Hand Cash (₹2,792).
- **1 variance, explained:** the Axis card shows ₹146 stored vs ₹0 recomputed. This is the open SPENDLY-500 question about two ₹299 payments on 2 and 3 Sep, a possible duplicate. It is excluded from the rebuild until the user answers.
- Net worth on stored balances differs from net worth on recomputed balances for 1 user, the same Axis user.

**The baseline was taken before the SPENDLY-500 bulk `--apply`.** That apply writes only:
- status flags;
- stale derived card fields;
- dashboard summaries.

None of these are balances, so the balance baseline above is what it will be after the apply. Re-run the script after the apply:
`GOOGLE_APPLICATION_CREDENTIALS=<key> npx tsx scripts/readmodel-baseline.ts --production`

## Tests

| Test | Proves |
|---|---|
| `shared/utils/financialBaseline.test.ts` (8) | Snapshot; no variance on a clean ledger; inactive rows counted apart and not summed; a cross-month edit is booked to its month; money conserved across transfers; card open statement and EPF; net worth on stored vs recomputed balances; markdown has no uid |
| `scripts/readmodelBaseline.test.ts` (4) | Neither file makes a Firestore write call; uid hashing; the summary has no names or amounts |

Results:
- Focused tests: 12/12 pass.
- `tsc --noEmit`: passes.
- `typecheck:shared`: passes.

**Not done:** comparing against the app's screens in Spendly Test on a device (the ticket's manual check).
