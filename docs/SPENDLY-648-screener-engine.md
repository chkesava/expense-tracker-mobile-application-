# SPENDLY-648: Screener filter and sort engine

- **Feature:** SPENDLY-623 (Stock Screener), story 2 of 5. See the [tracker](SPENDLY-623-stock-screener.md) and [plan](SPENDLY-623-plan.md) §3.3.
- **Branch:** `feature/SPENDLY-648-screener-engine`, cut from `feature/SPENDLY-623-stock-screener` at `49095c36`.
- **State:** Built and tested; awaiting approval to merge into the feature branch.

## What changed
| File | Change |
|---|---|
| `shared/utils/screener.ts` (new) | Pure engine: field catalogue, validation, AND matching, missing-value counting, sort, paging, sector list, chip text and presets. |
| `shared/utils/screener.test.ts` (new) | 26 tests. |
| `lib/stockHistoryFirebaseFree.test.ts` | Adds the engine to the Firebase-free guard. |

## Behaviour
- **Fields (`SCREENER_FIELDS`):**
  - Seven are available: price, change today, % from the 52-week high, % above the 52-week low, 1-year return, the 52-week high and the 52-week low. Each says what it means and that it comes from daily closes, which may be delayed.
  - **Market cap and P/E** are listed but unavailable, with the reason: a licensed fundamentals source is needed. **Volume** is unavailable too: the feed only gives it one stock at a time.
  - The UI (651) shows these three disabled, with the reason.
- **Validation (`validateScreen`):** returns a normalised screen or every error, each tied to a field. It rejects:
  - an unavailable field or sort;
  - a range with no bounds, a non-number, or a minimum above its maximum;
  - a value outside what the field can be: a negative price, or a stock above its own 52-week high;
  - the same field filtered twice;
  - an empty sector name.
  
  Sectors are de-duplicated and sorted.
- **Matching (`applyScreen`):**
  - All filters must match (AND), and bounds are inclusive.
  - **Unpriced stocks never match** and are counted (`unpriced`).
  - A stock with **no value** for a filtered field is excluded and counted per field (`excludedForMissing`), so the UI can say "1 stock has no 52-week data". It's counted only when the missing value alone kept the stock out, not when it failed another filter anyway.
- **Sorting:** by any available field or by name, ascending or descending. **Missing values go last in both directions**, ties break by symbol, and the input array is never changed.
- **Other helpers:**
  - `paginate`: 50 rows per page, clamped to the valid range.
  - `sectorsIn`: the sectors of priced stocks, with counts.
  - `activeFilterCount`.
  - `describeRange` and `describeScreen`: chip text such as "Change today ≥ 2%", "Price ₹100–₹1,500", "2 sectors" or "NIFTY 50 only".
- **Presets:** Near 52-week high (within 5%), Up 2% or more today, 30% or more below the 52-week high, and NIFTY 50 today. They're ordinary screens, and they pass validation.

## Difference from the plan
The plan listed a "By sector" preset. Sector choice belongs in the filter sheet, where every sector is listed, so it isn't a preset.

## Validation
- `screener.test.ts`: 26 tests passed.
- Full `npm test`: **491 files, 6,660 tests passed** on the first run. `npm run typecheck:shared` and `npx tsc -p tsconfig.json --noEmit` both exited 0.
- `test:rules` was not run, because no rules changed.
