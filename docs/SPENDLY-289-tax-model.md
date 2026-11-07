# SPENDLY-289: FY/AY tax model and tax-readiness data contract

**Epic:** SPENDLY-288 ([tracker](SPENDLY-288-tax-itr-readiness.md), [plan](SPENDLY-288-plan.md)).

**Branch:** `feature/SPENDLY-289-tax-model`, from `feature/SPENDLY-288-tax-itr-readiness`.

**Scope:** pure model only. There's no Firestore, rules, store or UI here; those come in SPENDLY-709 (persistence and read model) and the later stories. Tax-rate calculation is SPENDLY-295.

## Files

| File | What it holds |
|---|---|
| `shared/features/tax/types/index.ts` | The canonical model: years, provenance, item states, income heads and categories, the 7 entry kinds, reviews, profile, documents, snapshots, `TaxDerivedItem`, `TaxLine` |
| `shared/features/tax/data/taxYears.ts` | Which law governs which year (`ITA2025_FIRST_FY = "2026-27"`), the first year offered |
| `shared/features/tax/data/categories.ts` | Income category → head, display labels |
| `shared/features/tax/utils/taxYear.ts` | FY key check, FY↔AY, law per year, date bounds, `taxYearLabel` (the only way to name a year), selectable and default years |
| `shared/features/tax/utils/ids.ts` | Collection names, derived doc ids (`taxReviewDocId`, `taxSnapshotDocId`), ownership checks for doc and storage paths |
| `shared/features/tax/utils/validation.ts` | Validation of entries (per kind), reviews, profiles, documents |
| `shared/features/tax/utils/dedupe.ts` | Duplicate keys and duplicate groups |
| `shared/features/tax/utils/lines.ts` | Derived item + review → `TaxLine`; entry → `TaxLine`; `sumTaxLines` |
| `shared/features/tax/utils/builders.ts` | `buildTaxEntry`, `softDeleteTaxEntry`, `buildTaxReview`, `buildTaxProfile` (normalise, validate, revision, history) |
| `shared/features/tax/utils/testRecords.ts` | Representative Indian records for tests |
| `shared/utils/financialYear.ts` | Additive `financialYearOfDate` |

## Financial year, assessment year, tax year

- **Year key:** a year is keyed `"2025-26"` (April 2025 to March 2026). This is the same key the EPF code already uses (`shared/utils/financialYear.ts`).
- **Law:** the **Income-tax Act, 2025** (Act No. 30 of 2025, assent 21 August 2025) came into force on **1 April 2026**. It replaces "previous year" and "assessment year" with one **tax year**. Income up to 31 March 2026 stays under the 1961 Act.

| Year | Law | AY | `taxYearLabel(fy)` | `taxYearLabel(fy, "short")` |
|---|---|---|---|---|
| 2025-26 | ITA1961 | 2026-27 | FY 2025-26 · AY 2026-27 | FY 2025-26 |
| 2026-27 | ITA2025 | none | Tax year 2026-27 | Tax year 2026-27 |

- **Labels:** screens must name years only through `taxYearLabel`, so FY/AY wording can't be mixed or inferred differently on two screens.
- **Date to year:** a date goes to a year through `financialYearOfDate`. Date keys are local, so 31 March and 1 April never cross the boundary.
- **Year picker:** the tax center offers years from `2024-25` up to the current year. It opens on the year that ended last, which is the one usually being filed.

**Sources** (checked 2026-11-07; please confirm against the official text when convenient):
- [Income-tax Act, 2025 (Wikipedia, citing the e-Gazette, Act No. 30 of 2025)](https://en.wikipedia.org/wiki/Income-tax_Act,_2025)
- [ClearTax: Income Tax Act 2025](https://cleartax.in/s/income-tax-act-2025)
- [ClearTax: changes from 1 April 2026](https://cleartax.in/s/income-tax-changes-from-april-2026)

Section numbers also change under the 2025 Act. That's why a TDS section is free text with a shape check rather than a fixed list, and why deduction categories (SPENDLY-292) are versioned per year.

## Derived vs stored

- **Derived** (`TaxDerivedItem`): computed at runtime from incomes, EPF, FD interest and portfolio sales. Never stored.
- **Stored** (all under `users/{uid}`, persisted by SPENDLY-709):

| Collection | Id | Purpose |
|---|---|---|
| `taxProfiles` | `{fy}` | residential status, **age band** (never a birth date), employer count, the regime the user notes |
| `taxEntries` | client id | facts Spendly can't know: `income`, `form16`, `tds`, `ais_value`, `deduction`, `capital_gain`, `tax_payment` |
| `taxReviews` | `{fy}__{sourceKind}__{sourceId}` | the user's decision about one derived item or checklist item; one per item per year |
| `taxDocuments` | client id | document metadata; the file is at `users/{uid}/tax/{id}/{fileName}` in `spendly-files` |
| `taxSnapshots` | `{fy}__{createdAtMs}` | a frozen calculation, append-only |

- **No ledger writes:** nothing here writes the ledger. A manual tax income is a tax fact, not a Spendly income.
- **PAN:** the user's PAN is never part of the model.
- **TAN:** a deductor's TAN is kept, because reconciliation matches on it.

## Provenance, overrides and partial data

- **Provenance:** every figure carries a `TaxProvenance`:
  - `origin` is `spendly_derived`, `user_entered`, `document` or `calculated` (calculated is never a fact);
  - `fy`, `sourceRef` and the period;
  - `engineVersion` or `ruleVersion`.
- **States:** `missing`, `pending`, `matched`, `needs_review`, `user_confirmed`. Checklist items can also be `deferred`.
- **Overrides:** `resolveDerivedLine` applies a review, and the review always wins. The line keeps `override`, holding what Spendly derived (`derivedValue`, `derivedCategory`) and the decision, so a manual value is always distinguishable from a derived one.
- **A source that changes:** if the source amount moved after the user decided, the item becomes `needs_review` (`source_changed`). The old decision stays visible but is **not** applied (the fee-review precedent).
- **A replacement that's deleted:** a `replace` whose replacing entry is deleted counts the derived value again and asks the user.
- **Partial data:** a missing value is `null` with state `missing`. `sumTaxLines` returns `null` (unknown) if any counted line is `null`; it is never 0 and never a partial sum. It refuses to add lines from two years.

## Validation

`validateTaxEntry` and the other validators return every issue (`{field, code}`), and the builders refuse to produce a document while any issue remains. Firestore rules (SPENDLY-709) mirror the structure; dates against year boundaries can only be checked here.

**Amounts:**
- rupees, 0 or more, at most ₹99,99,99,999.99, and exactly a paise value; the builders round first;
- positive where 0 means nothing happened: income, TDS, gross salary, payments, deductions;
- an unknown amount must be stated as `null`; leaving it out is an error.

**Dates:**
- real `YYYY-MM-DD` dates;
- income dates, the Form 16 period, the sale date and advance-tax dates lie inside the year;
- self-assessment tax is on or after the year's start;
- acquisition comes before sale, and a period is in order;
- with `todayKey`, payment and sale dates can't be in the future.

**Identifiers:**
- TAN (`AAAA99999A`), BSR (7 digits), challan serial (5), CIN (20), ISIN;
- the TDS section is free text with a shape check.

**Ownership:**
- doc paths are only `users/{uid}/tax*/{id}`;
- a document's storage path is only `users/{uid}/tax/{itsId}/{file}`.

**Kind-specific rules:**
- a capital-gain statement total can't carry per-sale fields (quantity, acquisition date), which would be invented;
- `defer` and `resolve` apply only to checklist items, and those carry no amount;
- `recategorize` needs a category, and `replace` needs an entry.

**Limits:** text lengths, at most 20 document links, at most 20 history states.

**Duplicates** (`taxEntryDedupeKey`, per year and kind):

| Kind | Key |
|---|---|
| Form 16 | TAN (else employer) + period |
| TDS | TAN (else deductor) + section + quarter + TDS amount |
| AIS / 26AS | statement + category + TAN (else source) + section + amount |
| Payment | BSR + challan + date, else type + date + amount |
| Capital gain | ISIN (else name) + sale date + quantity + sale value; statement total: one per asset class |
| Deduction | category + linked source, else category + amount |

A duplicate is a warning. The user can keep a copy (`duplicateConfirmed`), and nothing is merged or removed automatically.

## Corrections

- **Revisions:** each build bumps `revision`.
- **History:** a correction stores the previous values of the changed fields in `history`, keeping at most 20 states, oldest first.
- **Fixed year and kind:** an entry's year and kind never change; a fact for another year is a new entry.
- **Deletes:** a delete is a soft delete (`deletedAt`, ISO). It is recorded in history, drops the entry out of every total, and can't be edited afterwards.

## Tests

`npx vitest run shared/features/tax shared/utils/financialYear.test.ts` runs 95 tests:
- FY/AY boundaries: 31 March and 1 April, the century turn, the 2025-26 to 2026-27 change of law and labels;
- representative records of all seven kinds;
- amount, date and identifier rules;
- duplicates;
- overrides, `source_changed`, replace-then-delete;
- `null` totals and the cross-year guard;
- history bounds and soft delete.

## Firebase compatibility (for SPENDLY-709)

- **Undefined values:** the builders never emit `undefined`.
- **Ids:** they are Firestore-safe (`isValidTaxIdSegment`).
- **Timestamps:** `createdAtMs` is set on create and kept on update. The Firestore `createdAt`/`updatedAt` timestamps are added by the write plan in 709, because these builders stay pure.
- **Soft delete:** it uses the same `deletedAt` (ISO) as ledger rows, so the read-model `soft_deleted_at` mapping can follow the existing pattern.
