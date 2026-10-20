# SPENDLY-497: credit-card fields that drifted between rebuilds

[SPENDLY-497](https://kesavach.atlassian.net/browse/SPENDLY-497) is a standalone bug, P0-3 in the 2026-10-11 audit. It is the third item of the correctness track (495 → 496 → 497 → 499 → 500 → 503).

Branch: `fix/SPENDLY-497-credit-card-materialized-fields`, cut from `main` `a36e3d8`.

## User decisions (2026-10-20)

1. **Cycle numbers are calculated live.** This covers used this cycle, statement due, cashback this cycle and oldest open bill. The stored copies are no longer read.
2. **Refunds, transfers and adjustments on a card count everywhere.** That means the stored total, the rebuild, statements and analytics.
3. **Early payments keep the old safe rule.** A payment made before its statement closes does not pay that statement. This keeps the reported Slice fix: there, a payment for an older statement the app only partly knew about must not stamp the new statement as paid.

   The ledger now **reports** that set-aside credit (`unappliedCredit`), and a rebuild leaves a stored total that differs only by it. It no longer raises the stored total.

## Field contract (after this change)

| Field (`accounts/{id}`) | Stored or derived | Writer | Read by |
|---|---|---|---|
| `currentOutstanding` | **Stored**: a running sum | `buildAccountBalanceOps` (`increment`) on every card write. Rebuilds correct real drift only | Account hero total, card list, Pay Bill, net worth, runway, accounts list |
| unbilled / used this cycle | **Derived** | — | `useCreditCardLiveUsage` → `computeOutstandingCredit` |
| `statementDue` | **Derived** | — | same |
| `cashbackThisCycle` | **Derived** | — | same |
| `oldestOpenRemaining` / `oldestOpenBillId` | **Derived** | — | same (Pay Bill default amount and target) |
| `availableCredit` | **Derived**: limit − live unbilled | — | account screen, card list |
| `openCycleStart`, `nextDueDate` | **Derived** (`getOpenBillingCycle`) | — | already live before this change |
| `paidThisCycle` | Derived (no reader) | — | — |
| legacy stored copies of the derived fields above | **Cleared** by a rebuild | `planCardRebuild` → `deleteField` | none |
| `summaryReconciliationStatus` | Stored flag | Set to `needs_reconciliation` on a first-touch seed. **Now reset to `healthy` by a rebuild** (nothing reset it before). Cashback **no longer** sets it, because the reason (a split the delta model couldn't express) is gone | card list banner |
| `creditCardBills.amountPaid` / `paymentIds` | Stored | **Payments:** `increment` + `arrayUnion` (`billPayment.ts`). **Allocation pass:** absolute values, now through a **compare-and-set transaction** (`billAllocationBasisUnchanged`). It writes only if the bill still holds the state its patch was computed from; otherwise it skips, and the next pass recomputes | bill screens, status derivation |

## What changed, by audit item

| Audit item | Fix |
|---|---|
| 1. `unbilledSpend` never maintained on expenses | The stored field is no longer written (`isUnbilled` removed from `buildAccountBalanceOps` and its callers) and no longer read. It is derived live |
| 2. Rebuild-only fields | All derived live. Rebuilds clear the stale stored copies |
| 3. Write and read classify cards differently | `isCreditCardAccount` in `shared/utils/accountKind.ts`: the account type's name decides, as `getAccountKind` does on every screen; `accountTypeId` is only the fallback. `fetchAccountTypes` now reads the type doc (cache first). The old write rule also matched "credit" in the account's own name |
| 4. Rebuild ignored incomes, entries and transfers that the write path applies | `CardMovementInput` plus `cardMovementLedgerRows`: refunds and credits become non-cashback payment rows, debits become spend. They're used by `computeOutstandingCredit`, every rebuild, analytics, the balance preview and the live hook. **Not** by bill allocation, so synthetic ids never reach `paymentIds` |
| 5. `amountPaid` written two incompatible ways | The compare-and-set transaction described above |

The new and changed files are `shared/utils/creditCardLedger.ts`, `shared/utils/accountBalance.ts`, `shared/utils/accountKind.ts`, `shared/utils/reconciliation.ts` (`planCardRebuild`, `DERIVED_CARD_FIELDS`), `hooks/useCreditCardLiveUsage.ts` (new), the three card screens, `providers/CreditCardBillsProvider.tsx`, `services/ledger/fetchAccountTypes.ts`, `services/ledger/rebuildFinancialSummaries.ts`, and both rebuild scripts.

## Tests

| Test | What it proves |
|---|---|
| `shared/utils/creditCardMovements.test.ts` (13) | The movement mapping; a refund lowers what is owed and is not "paid"; **cashback is counted once**; an early payment is set aside and reported. **A property test:** 40 runs of 40 chronological spends, payments, refunds, debits and transfers, with and without a bill day. The stored total always equals the ledger total minus the set-aside credit, and the ledger's statement + unbilled + cancelled always equals its total. Also: the card rule, `planCardRebuild` (including leaving a set-aside difference alone) and the allocation compare-and-set guard |
| `shared/utils/balanceMutations.test.ts` | Card writes move only `currentOutstanding`: no `unbilledSpend`, no flag |
| Existing ledger suites (incl. the reported Slice scenario and SPENDLY-95 cashback) | Unchanged and passing |

Results:
- `npm test`: 382 files, 5,717 tests, all passing.
- `typecheck:shared`: passes.
- `npx tsc -p tsconfig.json --noEmit`: passes.
- `npx tsc -p scripts/tsconfig.json --noEmit`: passes.
- `verify-performance-budgets`: passes.

**Not run:**
- Device or Spendly Test QA: card spend → statement → partial payment → cashback → void, comparing the card list, account screen, Pay Bill and analytics.
- `test:rules`, because the rules are unchanged. The allocation transaction reads and updates `creditCardBills`, which the owner may already do.

## Notes and risks

- **Live numbers depend on loaded data.** They are computed from the expenses the app has loaded (the newest 300 by default). A card with more than about 300 expenses inside one open cycle could under-count until older pages load. Card analytics already has this limit (`expensesComplete`).
- **Displayed numbers may not add up.** The stored total and the live split can disagree by `unappliedCredit` (an early payment, or spend the app never recorded). The total shown is the stored one.
- **Production.** Old stored copies of the cycle fields stay on account docs, unused, until a reviewed rebuild clears them (SPENDLY-500). The rebuild also resets stale `needs_reconciliation` banners.
