# SPENDLY-191: Merchant corrections and personalization

**Ticket:** [SPENDLY-191](https://kesavach.atlassian.net/browse/SPENDLY-191)  
**Epic:** [SPENDLY-186](SPENDLY-186-merchant-intelligence.md)  
**Branch:** `feature/SPENDLY-191-merchant-corrections`  
**Scope:** user-scoped merchant, category, subcategory, confirmation, rejection, and reset corrections. No ledger migration, merchant fields on expense/income documents, SMS changes, global registry edits, or external enrichment.

## What was delivered

`services/merchant/merchantOverrideStore.ts` persists deterministic user-scoped overrides through the existing durable mutation queue. Transaction overrides can confirm, rename, reject, categorize, or reset a single transaction. Alias overrides let a user reuse a correction for the same normalized source text. Validation is shared with the merchant model and the document id is derived from the override kind and reference key.

`MerchantCorrectionSheet` is available from the transaction detail merchant row. It supports:

- confirming a trusted merchant;
- saving a canonical merchant or personal merchant name;
- saving an alias correction for future matching;
- rejecting a suggestion for the transaction;
- correcting category and subcategory together; and
- resetting an existing transaction or alias correction.

The detail screen loads only the signed-in user's overrides and passes them into the deterministic resolver. Low-confidence results are presented as a possibility and are never forced into a correction. Expense and income documents remain unchanged; the correction is stored separately under the user.

Firestore rules add an owner-only `users/{uid}/merchantOverrides/{id}` collection with an explicit allowlist, bounded strings, mutually exclusive merchant/custom-name validation, immutable identity fields, and cross-user isolation. Unknown personal collections remain denied.

## Validation

```text
npm test
npm run typecheck:shared
npx tsc -p tsconfig.json --noEmit
npm run test:rules
```

All four commands pass. The application suite passes 295 files / 4,673 tests, and the rules suite passes 16 files / 472 tests.

## Manual Testing Guide

1. Start the app with `npx expo start` if it is not already running and sign in as a test user.
2. Open a transaction detail screen with a recognizable merchant source. Confirm the merchant row shows the resolved name; a low-confidence result is prefixed with “might be”.
3. Open the merchant row, choose a category/subcategory, and save a correction. Reopen the sheet and confirm the correction is shown.
4. Use “Always use this for this source” on a source with an alias. Open another transaction with the same normalized source text and confirm the alias is used.
5. Use “Not this merchant” and confirm the current transaction is shown as rejected/unknown rather than forcing the prior suggestion.
6. Reset the transaction or alias correction. Confirm the resolver returns to the underlying registry/rule result.
7. Sign in as a second test user and confirm the first user's correction is not visible or applied.
8. Verify the original expense/income document still has no merchant field or merchant write.

**Commands needed:** `npx expo start` only when the development server is not already running. For automated verification, run the four validation commands above. No native rebuild is needed for this JavaScript/UI and Firestore-rules change.

## Post-merge shipping

Follow `docs/AFTER_MERGE_CHECKLIST.md` after the epic reaches `main`. In particular, publish the app before deploying the new Firestore rules for native users, then deploy the rules and run the web/Android release workflows as applicable. Do not deploy indexes unless the live index set has been compared with `firestore.indexes.json`.
