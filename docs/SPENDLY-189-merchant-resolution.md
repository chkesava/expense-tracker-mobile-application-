# SPENDLY-189: Deterministic merchant resolution and confidence

**Ticket:** [SPENDLY-189](https://kesavach.atlassian.net/browse/SPENDLY-189)  
**Epic:** [SPENDLY-186](SPENDLY-186-merchant-intelligence.md)  
**Branch:** `feature/SPENDLY-189-merchant-resolution`  
**Scope:** pure shared resolution logic and tests. No UI, Firestore, rules, SMS changes, or transaction writes.

## What was delivered

`shared/utils/merchantResolve.ts` resolves a `MerchantSourceText` in a fixed, auditable order:

1. transaction override;
2. alias override;
3. exact cleaned registry alias (`high`);
4. deterministic VPA-local, descriptor-detail, or token-boundary prefix rule (`medium`);
5. a category-aware contextual token guess (`low`).

Anything unsupported remains `unknown` and displays the cleaned source text, or `Unknown merchant` when there is no safe name. Every result carries its original raw text, normalized key, rail, method, match explanation, and resolver version. Conflicting registry aliases are treated as unresolved rather than silently choosing a potentially wrong high-confidence merchant.

`resolveMerchants` performs one batch pass with a memo cache. It accepts overrides as data only; it does not read Firestore or mutate source transactions.

## Safety and false-positive coverage

- No merchant is written onto expense or income documents.
- `services/sms/*`, Ganesh files, and Nutrition files are unchanged.
- There are no network calls or enrichment providers.
- Tests cover look-alikes and truncation, including Reliance Digital vs. Reliance, HP Gas vs. HPCL, and person-to-person names.

## Validation

Run:

```text
npm test
npm run typecheck:shared
npx tsc -p tsconfig.json --noEmit
```

## Manual Testing Guide

This story is shared pure logic and has no user-facing screen. No device interaction is required for acceptance.

1. From the repository root, run `npm test` and confirm the merchant resolver, normalizer, registry, and model tests pass.
2. Run `npm run typecheck:shared` and confirm it exits successfully.
3. Run `npx tsc -p tsconfig.json --noEmit` and confirm it exits successfully.
4. If manually exercising the app, use **Spendly Test** with the Firebase emulator only. Confirm existing transaction details and source notes remain unchanged; this story does not add a merchant field or write path.

**Commands needed:** the three validation commands above. `npx expo start` is not needed because this story has no UI or native changes.

