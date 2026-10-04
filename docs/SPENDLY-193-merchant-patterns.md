# SPENDLY-193: Merchant spending patterns and insights

**Ticket:** [SPENDLY-193](https://kesavach.atlassian.net/browse/SPENDLY-193)  
**Epic:** [SPENDLY-186](SPENDLY-186-merchant-intelligence.md)  
**Branch:** `feature/SPENDLY-193-merchant-patterns`  
**Scope:** pure, user-history-only merchant observations. No peer benchmarks, risk scoring, external provider, or source transaction writes.

## What was delivered

`shared/utils/merchantInsights.ts` computes merchant patterns from already-resolved ledger items. It:

- removes duplicate transaction ids before calculating signals;
- uses explicit current and optional comparison windows;
- reports totals, average transaction, monthly spend buckets, and month-over-month change;
- reuses the existing recurring cadence classifier with minimum-history gates;
- suppresses strong pattern claims when fewer than three rows are available; and
- emits observation wording such as “Observed higher spend…” rather than accusations or advice.

The merchant profile displays these observations without changing the underlying ledger. Expensive work remains pure and is calculated from memoized profile data at the screen boundary, so no listener or write path is added.

## Validation

```text
npm test
npm run typecheck:shared
npx tsc -p tsconfig.json --noEmit
```

All three commands pass. The application suite passes 297 files / 4,677 tests.

## Manual Testing Guide

1. Start the app with `npx expo start` if it is not already running.
2. Open a merchant profile with fewer than three transactions. Confirm it says there is not enough history for a reliable pattern.
3. Open a profile with repeated transactions across multiple months. Confirm monthly trend data and transaction totals reconcile with the visible rows.
4. Use a profile with three transactions spaced like a recurring cadence. Confirm the language says “possible” and does not call it a confirmed subscription.
5. Compare a current period against a previous period and verify the observation says higher/lower spend without saying the user is overspending.
6. Repeat a source transaction in the fixture data and confirm duplicate ids do not inflate totals or frequency.
7. Apply a merchant correction, reopen the profile, and confirm future grouping uses the corrected identity.
8. Confirm the screen remains responsive with a large history and that no expense/income document is modified.

**Commands needed:** `npx expo start` only if the development server is not already running. Automated verification uses the three commands above. No native rebuild is needed for this shared pure-utility/UI change.
