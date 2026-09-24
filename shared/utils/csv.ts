/**
 * The one CSV writer — SPENDLY-113.
 *
 * Five modules had grown their own copy of this (account statements, the
 * Ganesh report, the credit-card cycle, prasadam, and the legacy transactions
 * export), with three different line endings between them and — more to the
 * point — **no formula-injection guard in any of them**. This is that one
 * writer; the copies delegate here.
 *
 * ## Text cells and number cells are different things
 *
 * `csvField` is for text a person typed and `csvNumber` is for money and
 * counts. The split is not stylistic: it is what makes the injection guard
 * safe. A guard that inspected every cell would have to decide whether `-250`
 * is a negative amount or the start of a formula, and it would get that wrong
 * in one direction or the other. Because every money cell goes through
 * `csvNumber`, which never enters the guard, the question is never asked.
 */

/** RFC-4180 §2.1. Excel on Windows is the reader this file is written for. */
export const CSV_LINE_ENDING = "\r\n";

/**
 * Characters that make a spreadsheet treat a cell as a formula.
 *
 * `=`, `+`, `-` and `@` are the obvious four. Tab, CR and LF are here because
 * the formula engine consumes them as leading whitespace and then evaluates
 * what follows — so a guard that checked only `=` would be walked straight
 * past by `"\t=cmd|'/c calc'!A1"`.
 */
const FORMULA_LEAD = /^[=+\-@\t\r\n]/;

/** Anything that must be quoted for a CSV parser to read the cell back whole. */
const NEEDS_QUOTING = /[",\n\r]/;

function quote(text: string): string {
  return `"${text.replace(/"/g, '""')}"`;
}

/** A cell that is entirely a number, whatever its sign or decimals. */
function isNumericText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === "") return false;
  return Number.isFinite(Number(trimmed));
}

/**
 * One text cell: injection-guarded, then RFC-4180 quoted.
 *
 * A dangerous cell is neutralised by prefixing `'` and force-quoting, so
 * `=SUM(A1:A9)` is written as `"'=SUM(A1:A9)"`. Excel shows the literal text,
 * and **not one character of what the user typed is lost** — which is the
 * whole reason for prefixing rather than stripping the `=`. An export whose
 * promise is fidelity cannot quietly edit the data on the way out.
 *
 * A cell that is simply a number is passed through unguarded, so a note that
 * literally reads `-250`, or a category named `+1`, stays what it is.
 */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (text === "") return "";

  if (FORMULA_LEAD.test(text) && !isNumericText(text)) {
    return quote(`'${text}`);
  }
  return NEEDS_QUOTING.test(text) ? quote(text) : text;
}

/**
 * One numeric cell — a raw number, never formatted and never guarded.
 *
 * Blank rather than `0` for a missing value: an empty cell says "not this side
 * of the ledger", where a zero says "nothing moved", and a debit column full of
 * invented zeroes is a different statement from the one the user has.
 */
export function csvNumber(value: number | undefined | null): string {
  if (value === null || value === undefined) return "";
  if (!Number.isFinite(value)) return "";
  return String(value);
}

/** One row. Cells already stringified by `csvNumber` pass through unchanged. */
export function csvRow(cells: readonly unknown[]): string {
  return cells.map(csvField).join(",");
}

/**
 * Join finished lines. A `""` entry is a deliberate blank separator row
 * between blocks, so it is kept rather than filtered out.
 */
export function joinCsvLines(lines: readonly string[]): string {
  return lines.join(CSV_LINE_ENDING);
}
