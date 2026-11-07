/**
 * SPENDLY-697: `settledAt` is stamped once, when a split first becomes
 * settled, so the push job can tell the other participants. Re-saving an
 * already-settled split, or a split that isn't settled, adds nothing.
 */
export function settledAtPatch(wasSettled: boolean | undefined, nowSettled: boolean, nowMs: number): { settledAt?: number } {
  return nowSettled && !wasSettled ? { settledAt: nowMs } : {};
}
