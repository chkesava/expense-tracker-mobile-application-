# SPENDLY-190: Merchant-aware category and subcategory intelligence

**Ticket:** [SPENDLY-190](https://kesavach.atlassian.net/browse/SPENDLY-190)  
**Epic:** [SPENDLY-186](SPENDLY-186-merchant-intelligence.md)  
**Branch:** `feature/SPENDLY-190-merchant-categories`  
**Scope:** merchant category suggestions in the shared layer and new expense form. No historical migration, automatic reclassification, Firestore change, SMS change, or transaction-field enrichment.

## What was delivered

`shared/utils/merchantCategory.ts` converts a merchant resolution into a category suggestion only when:

- the merchant is resolved with `high` or `medium` confidence;
- the merchant supplies both category and subcategory;
- the pair exists in the current category taxonomy.

The suggestion carries merchant id/name, confidence, resolver method, match explanation, version, and `provenance: "merchant"`. Low-confidence and unknown resolutions safely return no merchant suggestion.

`ExpenseForm` now checks merchant-aware suggestions after explicit user categorization rules and before the existing note-keyword fallback. The existing `categoryTouched` gate remains authoritative, so manually selected categories are not overwritten. Edit forms remain untouched, preventing historical categories from being silently reclassified. No amount, account, date, direction, or source transaction is modified by merchant intelligence.

## Validation

```text
npm test
npm run typecheck:shared
npx tsc -p tsconfig.json --noEmit
```

## Manual Testing Guide

1. Start Spendly Test against the Firebase emulator and open the new expense form.
2. Enter a note such as `Swiggy`. Confirm the category suggestion becomes `Food & Groceries › Food Delivery` and the suggestion badge identifies it as auto-suggested.
3. Tap the category picker and select a different category/subcategory. Change the note to another known merchant. Confirm the manually selected category stays unchanged and the suggestion badge clears.
4. Enter an unknown merchant or a person-to-person name. Confirm no unsupported merchant category is applied; the existing note-based fallback remains available.
5. Edit an existing expense that has a category, even if its note is a known merchant. Confirm its saved category is not silently changed.
6. Save a new expense and verify the stored row still contains only its existing amount, date, account, direction/category fields and note; no merchant field is added.
7. Run the automated validation commands above.

**Commands needed:** run `npm test`, `npm run typecheck:shared`, and `npx tsc -p tsconfig.json --noEmit`. Run `npx expo start` only if the local development server is not already running; no native rebuild is needed.

