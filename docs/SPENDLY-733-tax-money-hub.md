# SPENDLY-733: Tax & ITR as a Money hub section

**Epic:** SPENDLY-288 ([tracker](SPENDLY-288-tax-itr-readiness.md)). Requested by the owner during the manual test, 2026-11-09.

**Branch:** `feature/SPENDLY-733-tax-money-hub`, from the epic branch.

**Invariant:** navigation only. No change to tax data, reads, writes or rules. The dashboard still reads only while it's shown (SPENDLY-406), and only while the tax center flag is on.

## What changed

- **Money hub:** a new **Tax & ITR** section in its own "Tax" group, next to Group Funds and the others. It appears in the tab row and in "All sections", only while `taxCenterEnabled` is on (`visibleLedgerSections` in `shared/config/navigation.ts`).
- **The section shows the readiness dashboard inline** (`components/tax/TaxCenterHub.tsx`): year chips, the progress label, the section rows, the checklist, the export and "What Spendly doesn't cover". The year is kept in the URL (`/ledger?tab=tax&fy=2025-26`), so a shared or restored link reopens it.
- **Year screens** (`/tax/{fy}/income`, `/tds`, `/deductions`, `/capital-gains`, `/payments`, `/estimate`, `/documents`) are unchanged stack screens; back returns to the Money hub.
- **`/tax` and `/tax?fy=…`** (calendar events, older links) redirect to the Money hub section, keeping the year. With the flag off they open the hub's default section, and a hub left on Tax falls back to the Journal.
- **Insights → Analytics** no longer has the tax card (`TaxEntryCard` removed).

## How to get there

**Money** (bottom bar, or the side menu on desktop) → **Tax & ITR** in the section tabs. Or **All sections** → **Tax** → **Tax & ITR readiness**.

## Tests

| File | Covers |
|---|---|
| `shared/config/navigation.test.ts` | Every hub tab in exactly one real group (now including Tax); Tax & ITR listed only while the flag is on; year screens pop back to the hub |
