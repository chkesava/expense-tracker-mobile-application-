# SPENDLY-420: Separate Stock Profile from Holding and persist every BUY transaction

## State

Implemented, pending user review and merge to the epic branch. Production migration (`scripts/backfill-stock-profiles.js`) not yet run.

## Scope decision

The ticket's original motivating complaint ("holding shows 40 shares but Order History only has 30") was already fixed by SPENDLY-419 (`createHoldingWithCash` now always writes a `portfolioTransactions` BUY row). This story is purely the identity/profile data-model separation.

To honor the ticket's own non-goal ("no redesign of the entire Investments UI") and minimize risk to live user data, `Holding` keeps its existing denormalized identity fields (`symbol`, `yahooSymbol`, `name`, `exchange`, `instrumentType`, `sector`, `logoUrl`) — the same way `portfolioTransactions`/`investmentCashTransactions` already denormalize `symbol` onto themselves. The new `stockProfiles` collection becomes the **authoritative, reusable** identity source (what "select/create" and "reuse" resolve against) and the mechanism that prevents duplicate holdings for the same instrument, without requiring every UI component that reads `Holding.symbol`/`.name`/etc. to change. This is a materially smaller, lower-risk change than stripping identity off `Holding` and joining it back in at render time, while still fully satisfying every acceptance criterion.

## What changed

- `shared/features/portfolio/types/index.ts`: new `StockProfile` interface; `Holding` gains `profileId?: string`; `PortfolioTransaction` gains `profileId?: string`.
- `shared/features/portfolio/utils/stockProfile.ts` (new): `stockProfileMatchKey` (ISIN → yahooSymbol → exchange+symbol), `stockProfileId` (deterministic FNV-1a hash, same construction as `shared/utils/cashbackId.ts`), `resolveStockProfileId`, `planStockProfileUpserts` (dedupes a batch of identities to one upsert per unique instrument).
- `services/portfolio/investmentCash.ts`:
  - `createHoldingWithCash` now stages a `stockProfiles/{profileId}` upsert in the same batch and stamps `profileId` onto the holding and its BUY transaction row.
  - `executeMockBuy` gains an optional `fundingSource` (default `investment_cash`, same as `createHoldingWithCash`) so a subsequent buy into an existing holding can also be recorded as externally funded — skipping the cash entry/afford-check exactly like `createHoldingWithCash` does for a first buy. Both `executeMockBuy`/`executeMockSell` now stamp `profileId` onto their transaction rows.
  - `overwriteHoldingsPreservingIds` (CSV import) now upserts one profile per unique instrument across the whole import (via `planStockProfileUpserts`) and stamps `profileId` onto every created/updated holding.
- `hooks/usePortfolio.ts`: `addHolding` now resolves the submitted identity's profile id and checks whether the user already holds that instrument (by `profileId`, falling back to recomputing it from the holding's own identity fields for not-yet-migrated holdings). If found, it routes into `executeMockBuy` against the existing holding (a true "subsequent buy": appends a transaction, updates qty/avg-price, reuses the profile) instead of creating a second holding for the same stock. `AddHoldingModal.tsx` is unchanged — this routing is transparent to the UI.
- `firestore.rules`: new `stockProfiles/{id}` collection with `stockProfileWellFormed()` (requires `symbol`/`yahooSymbol`/`name`/`exchange`/`instrumentType`; `status` optional). `holdingWellFormed()` is unchanged — `profileId` is not required there, so holdings written before this migration keep working.
- `scripts/backfill-stock-profiles.js` (new): one-time backfill for existing holdings — writes the missing `stockProfiles` docs and `holdings.profileId`, never touches quantity/averageBuyPrice/broker or any `portfolioTransactions`/`investmentCashTransactions` doc. Dry-run by default.

## Non-goals honored

No search/autocomplete UI (reuse/create already works off the same free-text symbol+exchange fields via the deterministic profile id — no new UX needed). No FIFO/lot-based cost basis. No change to `shared/features/portfolio/utils/portfolioMetrics.ts`'s calculation path. No change to the Holding/Stock Profile data model beyond adding `profileId` — existing holdings keep their cached identity fields.

## Tests

- `shared/features/portfolio/utils/stockProfile.test.ts` (new, 11 tests): match-key precedence, id determinism/uniqueness, and profile-upsert dedup across duplicate CSV rows.
- `services/portfolio/investmentCash.test.ts` (extended): `createHoldingWithCash` writes a profile and stamps `profileId`; the same instrument across two calls resolves to the same profile id (no duplicate); two different instruments get different ids; `executeMockBuy` with default funding still deducts cash as before (regression guard), with `fundingSource: "external"` skips the cash entry/balance change entirely, and stamps `profileId` onto its transaction row; CSV import (`overwriteHoldingsPreservingIds`) writes one profile per matched holding and dedupes two new rows of the same instrument into one profile write.
- `firestore/personalData.rules.test.ts` (extended): owner creates a well-formed stock profile; missing required fields rejected; an invalid exchange/instrument type rejected; a stranger denied create/read.

## Manual Testing Guide

1. On the Firebase emulator (Spendly Test / Local Test Mode — never production): add a new holding via "Add Holding". Confirm a `stockProfiles` doc is created alongside the holding and its BUY transaction, and the holding carries `profileId`.
2. Add the **same** stock again (same symbol+exchange) with a different quantity/price. Confirm no second holding is created — the existing holding's quantity/average price update, a second BUY transaction appears in Order History, and no second `stockProfiles` doc is written (same `profileId`).
3. Repeat step 2 with "Already own it" (external funding). Confirm the Investment Cash balance is unchanged and no cash entry is written, but the BUY transaction and qty/avg update still happen.
4. Import a CSV with two rows for the same instrument (e.g. two lots). Confirm one `stockProfiles` doc and two holdings (or one updated holding, depending on existing data) are written, never two profiles.
5. Reopen the app; confirm everything persisted and renders unchanged (no UI regression — `HoldingCard`, `HoldingDetailModal`, `PortfolioSummaryCard` all still show symbol/name/exchange correctly, since `Holding` still carries those fields directly).
6. Run `node scripts/backfill-stock-profiles.js` against the emulator against seeded pre-migration holdings (no `profileId`); confirm it reports the right profile/holding counts and, after `--apply`, every holding has a `profileId` and quantity/averageBuyPrice are unchanged. Re-run and confirm it reports everything already migrated and writes nothing.

## Commands

```text
npx vitest run shared/features/portfolio/utils/stockProfile.test.ts
npx vitest run services/portfolio/investmentCash.test.ts
npm test
npm run typecheck:shared
npx tsc -p tsconfig.json --noEmit
npm run test:rules
```

Production migration (after a dry-run report and explicit go-ahead — shared Firebase project, no staging):

```text
node scripts/backfill-stock-profiles.js            # dry run
node scripts/backfill-stock-profiles.js --apply     # write
```
