# SPENDLY-192: Merchant profile, grouping and search

**Ticket:** [SPENDLY-192](https://kesavach.atlassian.net/browse/SPENDLY-192)  
**Epic:** [SPENDLY-186](SPENDLY-186-merchant-intelligence.md)  
**Branch:** `feature/SPENDLY-192-merchant-profile`  
**Scope:** canonical merchant profiles derived from current expense/income data, grouped totals, period filtering, recent transactions, trend points, recurring indication, and safe navigation. No source transaction writes, external provider, or dashboard rebuild.

## What was delivered

`shared/utils/merchantGrouping.ts` resolves expense and income source text in one batch and groups rows by canonical merchant identity. Unknown text receives a stable `unknown:` profile key so it remains searchable without being falsely promoted to a known merchant. The summary includes signed period spend, transaction count, recent rows, trend points, confidence, category data, and the existing recurring-cadence classifier.

`/merchants/[id]` is a lightweight profile screen reachable from a supported transaction's correction sheet. It shows the merchant name, category/subcategory when available, confidence wording, period totals for 30 days, 90 days, or all time, recent transactions, trend data, and a recurring indicator. Transaction navigation returns to the originating detail context through the existing transaction route.

`getTopMerchantVendors` provides canonical merchant grouping for future analytics consumers while leaving the existing exact-note `getTopVendors` behavior unchanged.

## Validation

```text
npm test
npm run typecheck:shared
npx tsc -p tsconfig.json --noEmit
```

## Manual Testing Guide

1. Start the app with `npx expo start` if it is not already running and sign in with test data.
2. Open a supported transaction, tap Merchant, and choose View merchant profile.
3. Confirm the profile name, category/confidence note, total, transaction count, recent transactions, and trend are present.
4. Switch between Last 30 days, Last 90 days, and All time. Confirm totals and visible transactions change consistently.
5. Tap a recent transaction and confirm it opens the original transaction detail screen; press back and confirm it returns to the profile.
6. Use two transactions with the same canonical merchant and confirm they share one profile and combined total.
7. Use an unknown merchant and confirm its cleaned safe display remains available without verified metadata or a remote logo.
8. Use three suitably spaced same-merchant transactions and confirm the recurring indicator appears only when the existing cadence classifier detects it.
9. Confirm no expense or income document gains a merchant field.

**Commands needed:** `npx expo start` only if the development server is not already running. Automated validation uses the three commands above. No native rebuild is needed for this JavaScript-only change.
