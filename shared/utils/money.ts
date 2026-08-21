/**
 * Rounds to the nearest cent. Every balance/usage figure is a running sum of
 * many decimal amounts (float addition/subtraction accumulates epsilon-level
 * residue, e.g. 0.1 + 0.2 !== 0.3) — without this, exact comparisons like
 * `outstanding === 0` can stay false for a bill that's genuinely fully paid.
 */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
