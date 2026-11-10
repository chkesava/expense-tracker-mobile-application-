# SPENDLY-710: Exportable tax-readiness summary (PDF and CSV)

**Epic:** SPENDLY-288 ([tracker](SPENDLY-288-tax-itr-readiness.md), [plan](SPENDLY-288-plan.md) §12, decision D4).

**Branch:** `feature/SPENDLY-710-readiness-export`, from the epic branch.

**Invariant:** the export keeps facts, calculations and open items apart. It never implies the return is ready to file, and it never shows a full TAN or any PAN.

## What the user sees

**Tax center → "Export summary (PDF or CSV)"** (below the progress), with a choice of:
- PDF, to read or share (share sheet on a phone; print / "Save as PDF" on web);
- CSV, for a spreadsheet (UTF-8 with BOM; text cells guarded against formulas).

Both carry real figures; ghost mode hides amounts on screen, not in a file the user asked for, as the goals export does.

**Document (`shared/features/tax/utils/summaryExport.ts`, pure)**
- **Header:** the year (e.g. "FY 2025-26 · AY 2026-27"), the generation date, the rule version, and a status line:
  - "Ready to review: nothing required is open. Not a filed return.", or
  - "Not ready: N required items open, M items in total. See 'Unresolved'."
- **Disclaimer:** the estimate one ("not your final tax or refund, and not advice").
- **1. Facts:** what was recorded, grouped as Income, Deductions and exemptions, and Tax paid. Each row has its record and its source (Spendly records, added by you, Form 16, TDS certificate, challan, statement). A TAN appears only masked, inside the record name.
- **2. Calculations:** capital gains (calculated, with their source), then both regimes step by step with each step's basis, the comparison sentence, and the assumptions. A regime with no estimate shows why, with no number.
- **3. Unresolved:** every open or put-off checklist item, ordered Needed, then Put off, then Worth a look.

**File name:** `spendly-tax-summary-{fy}.pdf` / `.csv`.

## Snapshot (R4.3a)

- **When:** each export writes `taxSnapshots/{fy}__{ms}` (reason `export`) with the rule version, the input hash, the outputs of both regimes, and the unresolved count (`estimateSnapshotPayload`, SPENDLY-295).
- **Order:** the file is delivered first. The snapshot follows, so a slow or offline check never holds up the file.
- **Check before writing** (`services/tax/taxSummaryExport.ts`): Firestore (server data) must confirm every estimate input the on-device copy served (`copyAgreesWithFirestore`). Inputs read from Firestore need no check.

| Input | Server read | Compared as |
|---|---|---|
| `taxEntries`, `taxReviews` | `fy == {fy}` | windowed |
| `taxProfiles` | the year's document | windowed |
| `incomes` | `date` inside the year | windowed |
| `epfContributions` | `month` inside the year | windowed |
| `investments`, `holdings`, `portfolioTransactions` | the whole collection | exact |

- **If the server can't confirm** (cache data, offline, a difference), no snapshot is written and the user is told the export isn't saved to their history.
- **A year without rules** gets no snapshot.
- **Snapshots are create-only** with their own id, so a later rule version never rewrites one (SPENDLY-709 rules and `CREATE_ONLY_SEGMENTS`).
- **Write path:** `saveTaxSnapshot` → `commitMutations`, dual-written. No new collection, field, rule, index or migration.

**Traceability:**
- **Facts:** the record name and source.
- **Calculations:** each step's basis and the rule version.
- **Snapshot:** the input hash.
- **Input traces:** Form 16 and TDS traces now carry the masked TAN, so a figure can be matched to its certificate without exposing the identifier.

## Tests

| File | Covers |
|---|---|
| `summaryExport.test.ts` | Facts / calculations / unresolved kept apart (gains never listed as facts); sources on facts; both regimes' steps and the rule version; assumptions; TAN never in full in CSV or HTML, masked tail present; partial year lists open items and never says ready to file or filed; complete year "Ready to review … Not a filed return"; put-off items stay listed; no-estimate regime explains why; CSV formula guard (with the guarded value present), raw numbers, section order; file name |
| `taxSummaryExport.test.ts` | No extra reads when inputs came from Firestore, and the snapshot written with the right id and outputs; copy-served inputs read on the server, bounded to the year, compared windowed or exact; nothing written on cache data or a difference; nothing written for a year without rules |
