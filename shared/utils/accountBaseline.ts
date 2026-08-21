/**
 * Opening-balance snapshot date. Empty / null means the full ledger counts.
 *
 * Account-edit used to stamp "today" whenever new identity fields were saved.
 * A today/future baseline hides every older transaction, so it is ignored.
 */
export function effectiveBalanceAsOfDate(
  baseline: string | null | undefined,
  _ledgerDates: readonly string[],
  today: string
): string | undefined {
  const date = (baseline || "").trim() || undefined;
  if (!date) return undefined;
  if (date >= today) return undefined;
  return date;
}

/** True when a stored baseline would hide history (today or later). */
export function isAccidentalBalanceBaseline(
  baseline: string | null | undefined,
  today: string
): boolean {
  const date = (baseline || "").trim();
  return Boolean(date && date >= today);
}
