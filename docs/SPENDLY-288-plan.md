# SPENDLY-288 plan: Tax & ITR Readiness Center

**Status:** approved by the user on 2026-11-07 with D1–D9 as recommended. New Jira issues:
- **NEW-T1** = SPENDLY-709;
- **NEW-T2** = SPENDLY-710;
- **D6** = SPENDLY-711, which blocks 298.

**Epic branch:** `feature/SPENDLY-288-tax-itr-readiness`, cut from `main` at `b5837d18`.

**Worktree:** `C:\dev\worktrees\spendly-288`.

**Jira:** epic SPENDLY-288, stories SPENDLY-289 to 299 (all To Do). It relates to SPENDLY-324 (Salary Intelligence, To Do, not built).

**Rules followed:** `CLAUDE.md`, `docs/AGENT_WORKFLOW.md`, `docs/READ_MODEL_RULES.md`. Every new collection is dual-written to Firestore and Supabase, and that work is planned into the story that creates the collection.

---

## 1. What exists today (inspected on b5837d18)

| Area | What's there | Reuse |
|---|---|---|
| FY helper | `shared/utils/financialYear.ts`: `financialYearOfMonth("2025-06") → "2025-26"`, `financialYearLabel`, `financialYearBounds`, `financialYearMonths`, `compareFinancialYears`. Used only by EPF. | Canonical FY key. Add AY / tax-year helpers and a date-to-FY helper next to it. |
| Tax code | None: no AY, TDS, Form 16, 80C, PAN or capital-gains code. | Everything is new. |
| Incomes | `Income` (`shared/types/expense.ts:483`) has `amount`, `source`, `date`, `month`, `accountId?`, soft delete. `INCOME_SOURCES` includes Salary, Bonus, Freelance, Business Income, Rental Income, Interest, Dividend, Pension and others. Writer: `services/ledger/createLedgerTransaction.ts`. | Derived tax income candidates, keyed by income id. **Bank salary credits are net pay, not gross salary.** |
| EPF | `EpfContribution` has an `employeeShare` / `employerShare` split, keyed `{est}_{YYYY-MM}`. `EpfInterestEntry` is keyed per FY. `groupContributionsByFinancialYear`. | Employee share is a deduction candidate (old regime). |
| FD / savings interest | `computeInterestValuation` (`shared/utils/investmentInterest.ts`) returns a dated `schedule` of credits. | Accrued interest per FY as a *calculated* candidate. |
| Portfolio | `portfolioTransactions` hold BUY/SELL/BONUS/SPLIT with date, quantity, price and fees. `SipTransaction` rows are buy lots. There is no lot, FIFO or realized-gain helper. Holdings created at onboarding or by CSV import may have no BUY history. | Capital gains need a new pure lot engine. Missing cost basis is surfaced, never guessed. |
| "Derived + only corrections stored" | Fee intelligence: `feeReviews/{kind}__{id}`, review always wins, `sourceAmount` snapshot gives `source_changed`, bounded `history[]`. Merchant intelligence: `merchantOverrides`. | The exact pattern for tax reviews. |
| Calendar (176, Done) | Pure adapters in `shared/utils/calendarSources.ts`, ids `source:refId:date`, de-duplication in `queryCalendar`. `REMINDER_CATEGORIES` already has `"tax"`. Local notifications planner `calendarNotifications.ts` (`DUE_NOTIFY_SOURCES`). The inbox is separate (`remindersInbox.ts`). | Add a `"tax"` source the way fees (320) did. Derived events, no stored events. |
| Push (222) | **Not on main.** Its stories sit on `feature/SPENDLY-222-push-notifications`. | 297 uses the local calendar notifications on main. Push is a later add-on. |
| Secure files | `spendly-files` Edge Function, owner types `accounts` and `goals` only, 10 MB, pdf/jpeg/png/webp. `accountDocuments` metadata (pending → ready). Client `services/accounts/spendlyFilesClient.ts`. | Add a `tax` owner type. |
| Privacy | Ghost mode (`ghostMoney`, `<Amount ghostable>`), app PIN (`PrivacyLock`, `pinVault`), per-goal lock (`lib/goalLockSession.ts`), `maskIdentifier` (EPF). | Tax-center lock and masking. |
| Feature flag | `shared/utils/saveGoalsFlag.ts` pattern (`enableX`, `enableXFor[]`, dev always on) through `useSystemSettings`. | `taxCenterEnabled`. |
| Export | `services/export/fileDelivery.ts`; the 611 / 113 exports. | Summary export. |
| Read-model checklist | Group Funds (685) is the latest full precedent: `TableSpec` in `mapping.ts`, migration with RLS + ping triggers + `readmodel_client_table_ok` + `readmodel_purge_user` restated, SQL test lists, `SWITCHED_COLLECTIONS`, guard lists, `firestore.indexes.json` field overrides (128 of 200 used). | Followed item by item in story T1. |

## 2. Drift and risks found during planning

1. **The roadmap file is missing.** `.claude/spendly_epic_execution_roadmap.md` doesn't exist in any checkout, so this epic is placed from Jira and the repo alone.
2. **India changed its income-tax law.** The Income-tax Act 2025 is due to replace the 1961 Act from 1 April 2026 and uses "tax year" instead of "previous year / assessment year". FY 2026-27 is the first year under it. Section numbers (80C, 80D, 87A and so on) change too. The model must carry the terminology **per year**, so labels can't be mixed (289 AC). This must be checked against the official text in 289; nothing is taken from memory.
3. **Salary in Spendly is net pay.** Bank salary credits are take-home pay. Gross salary, exemptions and TDS come only from Form 16. Summing salary credits as "salary income" would understate it. They are shown as evidence to reconcile against, never as the taxable figure.
4. **Document attachment is needed before the document story.** The ACs of 291, 292 and 294 ask for document attachment, but the vault is story 298, so 298 has to move earlier (§4).
5. **Account deletion leaves stored files behind.** `delete-account` erases Firestore and the read model but not the `spendly-files` objects (existing gap, noted after 606). Tax documents (Form 16, AIS) are the most sensitive files the app would hold. See decision D6.
6. **Older interest and dividend rows may be mislabelled.** A legacy category migration (`categoryTaxonomy.ts` ~L1047) mapped Income › Interest and Income › Dividend to "Cashback / Refund". 290 must check whether `Income.source` still says Interest or Dividend on old rows before relying on it.
7. **Portfolio cost basis has gaps.** Holdings created at onboarding or by CSV overwrite may have no BUY rows, and `datePurchased` is optional. 293 reports "cost basis missing" for these instead of computing a gain.
8. **Migration timestamps collide with 222.** 222's branch already holds `20261107…_devices` and `20261108…_notifications`. This epic's migration uses a later timestamp. Each migration restates the allowlist and purge function lists, so whichever epic reaches main second must include the other's tables in its restatement.
9. **Salary Intelligence (324) is not built.** 290 doesn't build salary detection. It maps by `Income.source` plus user corrections, and 324 can feed it later.

## 3. Architecture (applies to every story)

### Derived vs stored
- **Derived at runtime, never stored:**
  - tax income candidates from `incomes`, EPF, FD interest and dividend incomes;
  - capital-gain rows from portfolio and SIP transactions;
  - checklist items, calendar deadlines and calculations.
- **Stored:** only what the user says or supplies:
  - entries for facts Spendly can't know (Form 16 values, TDS rows, AIS/26AS values, deductions, tax payments, manual income, manual capital-gain rows);
  - reviews (confirm, exclude, recategorize, replace, defer) of derived items;
  - a per-FY profile;
  - document metadata;
  - an explicit snapshot when the user marks a year reviewed or exports.
- **Ledger:** nothing writes the ledger. A manual tax income entry is a tax fact, not a Spendly income, and never moves a balance. This avoids a parallel ledger and duplicate records.
- **Overrides:** a user's correction always wins. Spendly never silently overwrites it. If the source behind a review changes, the item becomes `needs_review` with reason `source_changed` (fee precedent).

### New Firestore collections (all under `users/{uid}`, all synced to Supabase)

| Collection | Doc id | Contents | Notes |
|---|---|---|---|
| `taxProfiles` | `{fy}`, e.g. `2025-26` | residential status, age band, employer count, regime noted by user (informational) | one per FY |
| `taxEntries` | client-generated id | `kind`: `income`, `form16`, `tds`, `ais_value`, `deduction`, `capital_gain`, `tax_payment`; `fy`, `amount`, `date`, kind fields, `documentIds[]`, `dedupeKey`, `revision`, bounded `history[]`, `deletedAt` | soft delete (R1.3) |
| `taxReviews` | `{fy}__{sourceKind}__{sourceId}` (deterministic, so no duplicates) | `decision` (confirm, exclude, recategorize, replace, defer, resolve), `taxCategory?`, `replacedBy?`, `sourceAmount`, `engineVersion`, `revision`, `history[]` | covers derived items and checklist items |
| `taxDocuments` | client-generated id | `fy`, `category`, `name`, `storagePath`, `mimeType`, `sizeBytes`, `status` pending/ready, linked entry ids | metadata only; the binary goes to `spendly-files` (R1.1 exception) |
| `taxSnapshots` | `{fy}__{createdAtMs}` | `ruleVersion`, input hash, outputs and source refs, frozen | append-only (`CREATE_ONLY_SEGMENTS`) |

**Rules for every collection:**
- a strict validated rule: `isOwner`, `hasOnly` / `hasAll`, pinned `createdAtMs`, kept out of the catch-all list;
- emulator tests and a TS↔rules contract test;
- writes go through `commitMutations` and stamp `createdAt`/`updatedAt` (Timestamps) plus `createdAtMs`/`updatedAtMs`, which go in `EXTRA_CHANGE_FIELDS`.

**Read model:** one migration for the five tables with:
- the contract columns and RLS (owner-only SELECT);
- ping triggers;
- the `rm_client_apply` allowlist and the purge, restated;
- the SQL test lists;
- index overrides (about 20 more, 148 of 200);
- sync and parity coverage.

**Typed columns:** `fy`, `kind`, `amount`, `date`, `status` / `decision`, `category`. Everything else stays in `doc`.

### Reading
- **Tax screens:**
  - read the five collections through `useReadModelSource("<collection>")` (Firestore by default, with the fallback; no listener in `supabase` mode);
  - add each collection to `SWITCHED_COLLECTIONS`, `providerSwitch.test.ts` `INTEGRATED` and `listenersOff.test.ts` `MIGRATED`.
- **Bounded queries:** Firestore queries filter `where("fy","==",fy)`. Listeners mount only for the section on screen (SPENDLY-406).
- **Existing inputs:** incomes, EPF, investments and portfolio come through their existing providers and hooks, which already have read switches. Nothing re-reads them directly.
- **Writers that compute from reads (R4.3a):**
  - a review stores `sourceAmount`;
  - a snapshot stores computed outputs.

  Both are computed from provider data, which may be the copy. Before writing, both verify their inputs on Firestore (`copyAgreesWithFirestore`), or that hook instance stays on Firestore with `copy: false`. This is tested.
- **Money from Supabase:** only rows, with totals computed by the TypeScript engine. No SQL aggregate.

### Pure logic location
`shared/features/tax/`, following the EPF layout:
- `types/`;
- `data/`: versioned rule tables, deadline tables, category metadata;
- `utils/`: FY/AY, provenance, de-duplication, mapping, reconciliation, lots, engine, readiness.

All of it is free of React Native imports and gets vitest tests next to it.

**Money:**
- stored in rupees with 2 decimals, like the rest of the app;
- the engine works in integer paise and uses `roundMoney` (`shared/utils/money.ts`) at the edges;
- tax rounding rules are applied explicitly;
- a missing amount makes a total unknown (`null`), never 0.

### Facts vs calculations vs guidance
Every figure carries a `TaxProvenance`:
- `origin`: `spendly_derived`, `user_entered`, `document` or `calculated`;
- `sourceRef`;
- the period;
- `engineVersion` or `ruleVersion`.

**Item states:** `missing`, `pending`, `matched`, `needs_review`, `user_confirmed`, plus `deferred` for checklist items.

**On screen:** the UI shows three visibly separate bands: **Facts**, **Calculations (informational)** and **To do**.

### Privacy
- **PAN:** the user's PAN is never stored.
- **TAN:** a deductor's TAN is stored, because reconciliation matches on it. It is masked in lists, exports and notifications.
- **Notifications:** notification text has no amounts and no identifiers.
- **Ghost mode:** applies to every tax amount.
- **Lock:** the tax center asks for the app PIN once per session if a PIN is set. This reuses the `goalLockSession` pattern; it is not a new lock system.
- **Password-protected PDFs:** they are stored as uploaded. The app never asks for or stores their password.

### Gating and navigation
- **Flag:** `taxCenterEnabled` (`enableTaxCenter`, `enableTaxCenterFor[]` in `system_settings/global`; dev builds always on). It gates screens only.
- **Routes:**
  - `/tax`, with `/tax/[fy]/income`, `/tds`, `/deductions`, `/capital-gains`, `/payments`, `/documents` and `/estimate`;
  - registered in `_layout.tsx`, `SUB_SCREEN_PREFIXES`/`SUB_SCREEN_ROUTES` and `RESTORABLE_ROUTES`, with tests.
- **Entry points:** a drawer item (`CORE_NAV_ITEMS`) and an entry card on Insights, next to Fees and Decisions.

### Products
Expense only. No Ganesh or Nutrition files change.

## 4. Proposed story order

The order follows the dependencies, not the key numbers. Two new stories are proposed (D1, D4).

| # | Story | Depends on |
|---|---|---|
| 1 | **289** FY/AY + tax domain model (pure) | none |
| 2 | **NEW-T1** Tax persistence, dual write + read model | 289 |
| 3 | **290** Income aggregation + tax center shell | T1 |
| 4 | **298** Tax document center (vault + attach) | T1, 290 shell |
| 5 | **291** TDS / Form 16 / AIS-26AS reconciliation | 290, 298 |
| 6 | **292** Deductions tracker | 290, 298 |
| 7 | **294** Tax payments | 290, 298 |
| 8 | **293** Capital gains lots + classification | 290 |
| 9 | **295** Calculation engine + regime comparison | 290–294 |
| 10 | **296** Readiness dashboard + checklist | 295 |
| 11 | **297** Calendar deadlines + reminders | 294, 296 |
| 12 | **NEW-T2** Exportable readiness summary | 295, 296, 298 |
| 13 | **299** QA, privacy, accuracy, rollout | all |

Each story follows `AGENT_WORKFLOW.md` §3:
- it gets its own branch from the epic branch, its own doc, and a tracker update;
- I stop for approval before merging and again before the next story;
- after every UI story I stop for your UI review (local Expo web with demo data).

## 5. Stories

### 1. SPENDLY-289: FY/AY model and tax data contract (pure, no Firestore)
- **Files:**
  - `shared/features/tax/types/*`;
  - `shared/features/tax/utils/{taxYear,provenance,validation,dedupe,ids}.ts`;
  - `shared/features/tax/data/taxYears.ts`;
  - `shared/utils/financialYear.ts`, additive only: `financialYearOfDate` and `assessmentYearOf`.
- **What it builds:**
  - **Year model:** `TaxYear` holds `fy`, `ay | null`, `regimeOfLaw` (`ITA1961` or `ITA2025`) and a label set. FY ≤ 2025-26 displays as "FY 2025-26 · AY 2026-27"; FY ≥ 2026-27 displays as "Tax year 2026-27". One `taxYearLabel()` function is the only way screens render a year.
  - **Types:** entry, review, profile, document and snapshot types and their write builders (`taxWritePlanToOps`), with `schemaVersion: 1`.
  - **Provenance:** `TaxProvenance` and `TaxItemState`.
  - **Validation:** dates inside the FY, amounts ≥ 0 with 2 decimals, required fields per kind, ownership (uid path), and `dedupeKey` per kind:
    - TDS: TAN + section + amount + quarter;
    - payment: BSR + challan serial + date;
    - capital gain: asset + sell date + quantity.
- **Invariant:** no value is ever inferred to fill a gap; missing stays `null` with state `missing`.
- **Tests:**
  - FY/AY boundaries: 31 Mar / 1 Apr, IST dates, the 2025-26 → 2026-27 terminology switch;
  - representative records for each kind;
  - duplicates;
  - an override stays distinguishable from a derived value.
- **Doc:** `docs/SPENDLY-289-tax-model.md`, with the Income-tax Act 2025 terminology check and its official source.

### 2. NEW-T1: Tax persistence, dual write and read model
- **Files:**
  - `firestore.rules` (five blocks plus the header list);
  - `firestore/tax.rules.test.ts`;
  - `shared/features/tax/utils/taxWrites.rules.contract.test.ts`;
  - `services/tax/taxStore.ts` (`commitMutations` only);
  - `lib/commitMutations.ts` (`CREATE_ONLY_SEGMENTS` += `/taxSnapshots/`);
  - `shared/utils/readModel/mapping.ts` (5 `TableSpec`s plus `EXTRA_CHANGE_FIELDS`);
  - `shared/utils/readModel/collectionMode.ts` (`SWITCHED_COLLECTIONS`);
  - `supabase-readmodel/supabase/migrations/2026111x000000_readmodel_tax.sql`, timestamped after 222's;
  - `supabase-readmodel/tests/{assert_security,rls_behaviour,purge,client_apply}.sql`;
  - `scripts/readmodelSyncCore.test.ts`, `readmodelVerify.test.ts`, `readmodel-identity-check.ts`;
  - `shared/utils/readModel/pushRefs.test.ts`, `mapping.test.ts`;
  - `firestore.indexes.json` (field overrides, plus the composite `fy` + `createdAtMs` per collection);
  - `hooks/useTax*.ts` (switch-aware readers);
  - guard lists in `providerSwitch.test.ts` and `listenersOff.test.ts`;
  - `docs/READ_MODEL_RULES.md` (synced list, 55 → 60).
- **Invariants:**
  - Firestore first, Supabase only through `rm_client_apply`;
  - every write stamps both timestamps;
  - reviews are deterministic ids (idempotent);
  - snapshots are append-only;
  - entries use soft delete;
  - account deletion covers the new rows (Firestore by the generic tree delete, Supabase by the purge).
- **Tests:**
  - rules emulator (`npm run test:rules`);
  - contract;
  - store tests asserting `createdAt`/`updatedAt`;
  - all read-model guards green and covering the new code;
  - SQL suite (`readmodel-schema.yml`); drills re-run.
- **Production (after merge, each needing approval):** deploy rules and indexes (diff first), then the Supabase migration (dry run first).

### 3. SPENDLY-290: Income aggregation and tax center shell (UI story)
- **Files:**
  - `shared/features/tax/utils/incomeMapping.ts`;
  - `hooks/useTaxIncome.ts`;
  - `app/(app)/tax/index.tsx`, `app/(app)/tax/[fy]/income.tsx`;
  - `components/tax/*`;
  - navigation, route-restoration and layout registration;
  - the flag files (`shared/utils/taxCenterFlag.ts`, `hooks/useTaxCenterEnabled.ts`, `SystemSettingsProvider` type).
- **Mapping:**
  - `Income.source` maps to a tax head: Salary, Bonus and Pension go to *salary (bank credits, evidence)*; Interest to *other sources: interest*; Dividend to *dividend*; Rental Income to *house property*; Freelance and Business Income to *business/profession, unsupported for calculation in v1*; Cashback, Refund, Reimbursement and Gift go to *excluded by default* (gift is flagged).
  - FD and savings accrued interest per FY comes from `computeInterestValuation` (origin `calculated`).
  - Per-FY inclusion uses the income `date` (IST).
- **User actions:** correct a category, exclude, add a manual income entry (`taxEntries` kind `income`), or replace derived items with an entry (e.g. an interest certificate total replaces the derived bank interest, with no double count).
- **De-duplication:** each derived item is counted at most once, under exactly one head; a `replacedBy` review removes it from totals.
- **Partial data:** if `incomesComplete` is false, or a source is still loading, the section shows "Incomplete" and the total is unknown.
- **Shell:** FY selector, empty state, and sections that later stories fill in.
- **Tests:** mapping table, FY boundaries, duplicate sources, replace / exclude, legacy-label check (§2.6).

### 4. SPENDLY-298 (part 1): Tax document center (UI story)
- **Files:**
  - `supabase/functions/spendly-files/handler.ts` (+ tests): owner type `tax`, path `users/{uid}/tax/{docId}/{file}`, owner doc `users/{uid}/taxDocuments/{docId}`;
  - `shared/utils/accountDocuments.ts` (path grammar);
  - `services/tax/taxDocumentStore.ts` (pending → upload → ready, retry, delete object then metadata, as `accountDocumentsStore` does);
  - `app/(app)/tax/[fy]/documents.tsx`;
  - `components/tax/TaxDocumentPicker.tsx` (the attach component 291, 292 and 294 use).
- **Categories:** Form 16, Form 16A, AIS, TIS, 26AS, investment proof, interest certificate, capital-gains statement, tax-payment receipt, other.
- **Behaviour:**
  - each document is linked to an FY and a category;
  - uploads run in the background, so the UI is never blocked;
  - a failed upload stays `pending` with Retry (15-minute stale rule).
- **Production:** an Edge Function deploy (with approval).
- **Account deletion:** depends on D6.
- **Tests:** handler path and ownership; store state machine; deletion order.

### 5. SPENDLY-291: TDS, Form 16/16A and AIS/TIS/26AS reconciliation (UI story)
- **Files:**
  - `shared/features/tax/utils/tdsReconcile.ts`;
  - `app/(app)/tax/[fy]/tds.tsx`;
  - `components/tax/Tds*`.
- **Capture (manual entry):**
  - Form 16 per employer: gross salary, exemptions, standard deduction, TDS, TAN;
  - Form 16A and TDS rows by deductor and section;
  - AIS/TIS/26AS values.
- **Matching:** deterministic, by TAN + section + FY, with a tolerance of ₹0 (exact) unless the user confirms. States: `matched`, `mismatch`, `missing_in_26AS`, `missing_in_records`, `needs_review`.
- **Display:** a mismatch shows the field, both amounts and the variance. Salary bank credits are shown next to Form 16 net pay as evidence only.
- **Duplicates:** detected by `dedupeKey` and shown as a warning; the user can mark "not a duplicate". Confirmed corrections are kept through `revision` / `history`.
- **Masking:** TAN is masked in lists.
- **Tests:** match, mismatch, missing, duplicate and correction-survives cases.

### 6. SPENDLY-292: Deductions and tax-saving tracker (UI story)
- **Files:**
  - `shared/features/tax/data/deductionCategories.ts`, versioned per tax year, with the section label for each law;
  - `shared/features/tax/utils/deductions.ts`;
  - `app/(app)/tax/[fy]/deductions.tsx`.
- **Source candidates:** the EPF employee share for the FY, plus investments, linked by a review (no copy of the amount), so there's no double counting.
- **Entries:** user-entered deductions (`taxEntries` kind `deduction`), with a proof status: attached, missing or not needed.
- **States:** `claimed`, `unclaimed`, `needs_review`. Every eligibility-sensitive category (HRA, home-loan interest, 80D parents and the like) shows "Confirm you're eligible". There are no product suggestions.
- **Tests:** FY scoping, link without double count, edit and remove, traceable inputs.

### 7. SPENDLY-294: Advance-tax and self-assessment payments (UI story)
- **Files:**
  - `shared/features/tax/utils/taxPayments.ts`;
  - `app/(app)/tax/[fy]/payments.tsx`.
- **Entries:** `taxEntries` kind `tax_payment`, with a type (advance or self-assessment), date, amount, BSR / challan serial / CIN, explicit FY/AY, a document, and a reconciliation state against the 26AS tax-paid values from 291.
- **Candidates:** Spendly expenses with subcategory `income_tax` are offered as candidates to link (a review, no copy).
- **Checks:** duplicate detection; a total traceable to its records; a missing reference shows `needs_review`.
- **Tests:** add, edit, remove; duplicates; FY association; linking an expense doesn't double count.

### 8. SPENDLY-293: Capital-gains lots and classification (UI story)
- **Files:**
  - `shared/features/tax/utils/capitalGainLots.ts` (FIFO per instrument over BUY / SIP buys, SELL, BONUS, SPLIT, fees in cost);
  - `shared/features/tax/data/capitalGainRules.ts` (effective-dated holding-period and asset-class rules, e.g. the 23 Jul 2024 change; values verified from official sources in this story);
  - `app/(app)/tax/[fy]/capital-gains.tsx`.
- **Rows:** each sale gives rows of acquisition date, cost, sale value, holding days, and a classification (`short_term` / `long_term` / `unsupported`). Every row links back to its source transactions.
- **Missing data:** missing cost or date gives a `cost_basis_missing` row with no gain.
- **Manual input:** a user can add manual rows, or a broker-statement total per asset class (D7). Duplicates are detected.
- **Separation:** source values and calculated fields sit in separate columns.
- **Tests:** representative cases (partial sells, splits and bonus, a lot held across the boundary, missing history, crypto as unsupported), plus duplicates and retained corrections.

### 9. SPENDLY-295: Calculation engine and old-vs-new regime comparison
- **Files:**
  - `shared/features/tax/data/taxRules/fy2025_26.ts` (and later years), each with `ruleVersion`, an official citation and effective dates;
  - `shared/features/tax/utils/{assembleInput,computeTax,compareRegimes}.ts`;
  - `app/(app)/tax/[fy]/estimate.tsx`.
- **Engine:**
  - a pure `computeTax(input, rules)`: slabs, standard deduction, deductions by regime, special-rate capital gains, rebate (with its limits on special-rate income), surcharge with marginal relief, cess, and statutory rounding;
  - output: liability, minus TDS and payments, giving balance or refund. Every line carries its inputs and `ruleVersion`.
- **Unsupported cases:** they give `status: "unsupported"` with reasons and **no number**. In v1 that covers business/presumptive income, losses carried forward, NRI status, agricultural income, foreign assets and VDA set-off.
- **Partial data:** gives `status: "partial"` with the missing items listed.
- **Snapshots:** written only when the user marks the year reviewed or exports. A later rule change never rewrites them; they show their own `ruleVersion`.
- **Labels:** "Informational estimate" on every output.
- **Tests:**
  - fixtures of worked examples per supported year, checked against the Income Tax Department's official calculator, with the expected values and their source recorded in the fixture;
  - boundaries (rebate edge, surcharge thresholds, rounding);
  - determinism (same input, same output).

### 10. SPENDLY-296: Readiness dashboard and filing checklist (UI story)
- **Files:**
  - `shared/features/tax/utils/readiness.ts` (derived checklist items, progress);
  - `app/(app)/tax/index.tsx` (full dashboard);
  - `components/tax/Readiness*`.
- **Sections:** FY selector; progress; and status cards for income, TDS, deductions, capital gains, payments and estimate. Each card links to its screen.
- **Checklist:** missing, uncertain and to-review items; the user can **resolve** or **defer** an item (a `taxReviews` checklist decision).
- **Progress:** it never reads "ready" while a required item is missing. The top label is "Ready to review", never "Filed".
- **States:** empty, partial, loading, offline and error, all designed. Totals are traceable through tap-through. Accessibility: labels and roles, 48 dp targets.
- **Tests:** readiness rules for empty, partial and complete years; progress never 100% with a missing required item; defer / resolve round trip.

### 11. SPENDLY-297: Calendar deadlines and reminders
- **Files:**
  - `shared/features/tax/data/taxDeadlines.ts` (versioned per year: advance-tax instalments, ITR due date, belated/revised date, Form 16 availability);
  - `shared/types/calendar.ts` (`"tax"` source);
  - `shared/utils/calendarSources.ts` (`taxEvents`);
  - `shared/utils/calendarQuery.ts` (`SOURCE_ORDER`, collect);
  - `hooks/useFinancialCalendar.ts`;
  - `calendarActions.ts`, `calendarMonth.ts`;
  - `shared/utils/remindersInbox.ts`;
  - `shared/utils/calendarNotifications.ts` (tax gated by the new prefs);
  - `shared/types/settings.ts` (`CalendarNotificationSettings.taxEnabled`, `taxDaysBefore`) and `components/settings/CalendarNotificationSettings.tsx`;
  - users-doc rules if they validate that map.
- **Events:**
  - derived, never stored, with stable ids `tax:{deadlineId}:{date}`, so there are no duplicates;
  - an advance-tax instalment becomes `completed` when a payment from 294 covers it;
  - a document reminder (e.g. Form 16 after its due date) fires only while that document is missing.
- **User reminders:** user-made reminders keep using `calendarReminders` with category `tax`. There is no second reminder system.
- **Notifications:** they respect the permission state and quiet hours through the existing scheduler. The text has no amounts. They fit inside the existing cap of 30 calendar notifications.
- **Push:** when 222 lands, tax events can ride its fan-out (a follow-up, not a blocker).
- **Tests:** no duplicates across sources, lifecycle (a payment completes an event), prefs off means nothing scheduled, year switch.

### 12. NEW-T2: Exportable tax-readiness summary
- **Files:**
  - `shared/features/tax/utils/summaryExport.ts` (pure builder);
  - an export action on the dashboard through `services/export/fileDelivery.ts` (PDF and CSV).
- **Sections:** Facts (with sources), Calculations (with `ruleVersion` and assumptions) and Unresolved items.
- **Masking:** TAN masked, no PAN.
- **Snapshot:** exporting writes a snapshot (295) and checks its inputs on Firestore first (R4.3a).
- **Tests:** the sections are separated, masking, a partial year marks the unresolved items.

### 13. SPENDLY-299: QA, privacy, accuracy and rollout
- **Coverage:**
  - an end-to-end FY journey on Spendly Test (emulator) with demo data;
  - a calculation regression suite;
  - reconciliation, deduction and capital-gains edge cases;
  - calendar duplicate tests;
  - document privacy and deletion;
  - offline and partial states;
  - accessibility and Android performance (FlashList, no listeners mounted off-screen);
  - a cross-FY and cross-user leakage check: rules tests plus the RLS drills.
- **Docs:** `docs/SPENDLY-288-rollout.md` covers:
  - flag steps (per-uid first, then everyone);
  - rollback (flag off; data stays);
  - the post-merge checklist (rules, indexes, migration, Edge Function, release);
  - known limitations shown in the app.
- **Analytics:** none exists in the Expense app, so none is added (stated as a limitation).

## 6. Decisions I need from you

| # | Question | My recommendation |
|---|---|---|
| D1 | Split the pure model (289) from persistence and the read model? | **Yes:** create **NEW-T1**. Persistence and dual write must stay in one story (CLAUDE.md), and 289 stays pure and reviewable. |
| D2 | First supported year(s) for the calculation engine | **FY 2025-26 (AY 2026-27)** fully. The model supports FY 2026-27 ("tax year", new Act) from day one; its rules are added once the 2026 rates are verified from official sources. |
| D3 | Five new synced collections (`taxProfiles`, `taxEntries`, `taxReviews`, `taxDocuments`, `taxSnapshots`) | **Approve** (one migration). |
| D4 | Move the document center (298) earlier and split the export into **NEW-T2** | **Yes.** Otherwise 291, 292 and 294 can't meet their attachment ACs. |
| D5 | Identifiers | **Never store the user's PAN**; store the deductor's TAN (needed for matching), masked in lists and exports. |
| D6 | Stored files left behind on account deletion (existing gap) | **Fix before 298 ships:** a separate ticket so `delete-account` removes `spendly-files` objects under `users/{uid}/`. Tax documents shouldn't outlive the account. |
| D7 | Capital gains when Spendly lacks BUY history | Show `cost_basis_missing`. Let the user enter rows or a **broker-statement total per asset class**, which then replaces the derived rows for that class (no double count). |
| D8 | Tax-center PIN gate | **Yes**, once per session when an app PIN is set, reusing the goal-lock session pattern. |
| D9 | Feature flag `taxCenterEnabled` | **Yes**, same shape as Save Goals. |

## 7. Validation for every story
```
npx vitest run <changed tests>          # focused first
npm test
npm run typecheck:shared
npx tsc -p tsconfig.json --noEmit
npm run test:rules                      # T1 and any rules change
git diff --stat feature/SPENDLY-288-tax-itr-readiness
```
- **SQL suite and drills:** run when `supabase-readmodel/` changes (T1).
- **PR Checks:** I watch the PR Checks workflow after each push.

## 8. Production steps (none run without your approval)
1. Firestore rules and indexes deploy (T1; diff live first).
2. Supabase read-model migration (T1; dry run, then apply).
3. `spendly-files` Edge Function deploy (298).
4. Expense release after the epic reaches main. No web deploy is triggered by me.
