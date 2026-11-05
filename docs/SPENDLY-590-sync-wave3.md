# SPENDLY-590 — Wave 3 in the read model

| | |
|---|---|
| Epic | SPENDLY-586 (plan v2) |
| Branch | `feature/SPENDLY-590-sync-wave3` |
| Migration | `supabase-readmodel/supabase/migrations/20261101000000_readmodel_wave3.sql` |

## What is synced

| Table | Firestore | Typed columns (everything else stays in `doc`) |
|---|---|---|
| `investments` | `users/{uid}/investments` | name, kind, principal, start and maturity dates, rate, linked account, units, purchase and current NAV, status, closed date |
| `holdings` | `…/holdings` | profile id, symbol, Yahoo symbol, name, exchange, instrument type, quantity, average buy price, purchase date |
| `portfolio_transactions` | `…/portfolioTransactions` | holding and profile id, symbol, type, quantity, price (signed on `ADJUSTMENT` rows), fees, date, order status |
| `investment_cash_transactions` | `…/investmentCashTransactions` | type, amount, direction, date, holding id, symbol, quantity, price, account and account-entry ids, reverses id, source |
| `portfolio_settings` | `…/portfolioSettings` | initial investment, **stored** cash balance, has-existing-holdings, onboarding complete |
| `epf_profile` | `…/epfProfile` | active establishment id only. The UAN and name stay in `doc`, so they never get an indexable column |
| `epf_establishments` | `…/epfEstablishments` | profile id, employer, joined and left dates, employment status, archived, EPS member |
| `epf_contributions` | `…/epfContributions` | establishment, month, wage, the shares, total, EPF credit, status, source, EPS eligible, credit date and amount |
| `epf_contribution_events` | `…/epfContributionEvents` | contribution and establishment id, month, `from_status`/`to_status` (from `from`/`to`), amount, actor, at |
| `epf_transfers` | `…/epfTransfers` | source and destination establishment, amount, date, status, reversal links |
| `epf_transfer_events` | `…/epfTransferEvents` | transfer id, `from_status`/`to_status`, amount, actor, at |
| `epf_interest_entries` | `…/epfInterestEntries` | establishment, financial year, rate, basis, **stored** opening and closing balances, interest |
| `epf_reconciliations` | `…/epfReconciliations` | establishment, date, actual and calculated balance, adjustment |
| `epf_wage_history` | `…/epfWageHistory` | establishment, effective-from month, wage, EPS eligible, `created_at` (from `createdAtMs`) |

**A new field type, `decimal`:**
- what it holds: quantities, prices, NAVs and rates;
- SQL type: `numeric(24,8)`;
- parity: compared at 8 places. Money stays `numeric(18,2)` at 2 places, which would hide a drift in a fractional quantity.

Stored values (cash balance, interest balances, contribution totals) are **copies** (R4.1). Nothing recomputes them in SQL.

**Not synced:**
- `financialSummaries`, including the EPF summary (592);
- `holdingAdjustments` and `portfolioReconciliationAudits` (audit trails no screen reads from the read model);
- watchlists and SIP (591).

**epf-cron's writes:** they use the Admin SDK, which doesn't pass through the push. They reach the read model on the nightly run.

## The R2 contract

- **The migration:**
  - 14 tables with the contract columns, plus 669's `written_by`/`client_written_at`;
  - `(uid, doc_id)` keys and `(uid, …)` indexes;
  - RLS owner-read plus `grant select`;
  - the restated `readmodel_sync_table_ok`, `readmodel_client_table_ok`, `readmodel_purge_user`, `readmodel_live_counts` and `v_data_quality`.
- **`TableSpec`s** in `shared/utils/readModel/mapping.ts`. The sync, the push and the client outbox derive from them.
- **The writers.** The 671 guard only matched literal collection names, but EPF and the portfolio use constants (`EPF_CONTRIBUTIONS_COLLECTION`, `HOLDINGS_COLLECTION`). The guard now resolves any `const NAME = "<synced collection>"`, and that found 8 writers. All are routed:
  - `hooks/useInvestments.ts`: add, update, delete;
  - `hooks/usePortfolio.ts`: holding metadata edit, settings save;
  - `services/portfolio/holdingAdjustments.ts`: both adjustment batches, via `trackedBatch`;
  - `hooks/useEpf.ts`: profile save. The establishment writes go through the current-employment lock transaction, which notes the profile and establishment through `noteTransactionWrites`; plain archive and delete use `noteDirectWrites`;
  - `hooks/useEpfContributions.ts`, `hooks/useEpfInterest.ts`: every batch, via `trackedBatch`;
  - `hooks/useEpfTransfers.ts`: create and confirm are batches. Complete, fail and reverse are transactions, using `noteTransactionWrites`;
  - `hooks/useEpfWageHistory.ts`: add, remove.

  Trades and cash already went through `services/portfolio/investmentCash.ts` (671).
- **Tests:**
  - the SQL tests: `assert_security` (32 policies), `rls_behaviour` (31 tables), `purge` (65 rows), `client_apply` (every allowlisted table), `golden.sql` regenerated;
  - the mapping tests: decimal precision, a signed adjustment price, NAVs, cash balance unmapped-not-dropped, EPF contributions, events (`from`/`to`), wage history (`createdAtMs`), the UAN kept out of typed columns;
  - parity: decimal at 8 places;
  - the push, sync-core and verify lists. The sync-core incremental read bound now scales with the number of tables.
- **The nightly read budget:** about +60 documents a night, from the 503 production baseline:
  - `investmentCashTransactions` 17, `portfolioTransactions` 16, `epfContributions` 13, `holdings` 4, `portfolioSettings` 3, `epfEstablishments` 3, `epfInterestEntries` 2, `investments` 1, `epfTransfers` 1;
  - the event, profile, reconciliation and wage-history collections are small and weren't inventoried.

  That is set against the full run's ~4.1K of 6K.

## Results

- **Local `postgres:17`, as CI runs it:** every migration plus every SQL test file passes (assert_security ×2, rls_behaviour, sync_functions, purge, verify, views, golden, push, client_apply).
- `npm test` (524 files) and `tsc`: pass.

## Production (needs the user's approval)

1. **The migration:** additive (empty new tables, functions restated). Production dry run plus approval, then apply.
2. **The backfill:** the first nightly full run after the epic reaches main. **Before that**, run a `mode=full`, `dry_run=true` sync for the report, then get approval (R7.2).
3. **The 14 clean parity days** for these tables start then.
