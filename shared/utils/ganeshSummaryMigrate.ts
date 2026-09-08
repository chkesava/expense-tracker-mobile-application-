/**
 * Move festival summary allocators from the pre-KAN-36 `summary/current`
 * document onto the canonical `summary/totals` document.
 *
 * Derived money fields stay with the Cloud Function rebuild. Clients may only
 * write `nextReceiptNumber`, `nextContributionNumber`, and `updatedAt`.
 */

export type SummaryAllocatorSnapshot = {
  nextReceiptNumber?: unknown;
  nextContributionNumber?: unknown;
};

export type SummaryAllocators = {
  nextReceiptNumber: number;
  nextContributionNumber: number;
};

function allocatorNumber(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export function emptySummaryAllocators(): SummaryAllocators {
  return { nextReceiptNumber: 0, nextContributionNumber: 0 };
}

export function mergeSummaryAllocators(
  totals: SummaryAllocatorSnapshot | null | undefined,
  legacy: SummaryAllocatorSnapshot | null | undefined
): SummaryAllocators {
  return {
    nextReceiptNumber: Math.max(
      allocatorNumber(totals?.nextReceiptNumber),
      allocatorNumber(legacy?.nextReceiptNumber)
    ),
    nextContributionNumber: Math.max(
      allocatorNumber(totals?.nextContributionNumber),
      allocatorNumber(legacy?.nextContributionNumber)
    ),
  };
}

/**
 * Payload to write onto `summary/totals`, or null when the live document
 * already holds the higher allocators (or neither document exists).
 *
 * A missing `totals` with a present `current` copies the legacy allocators.
 * Both present keeps the max of each field so receipt numbering never rewinds.
 */
export function planSummaryAllocatorMerge(
  totals: SummaryAllocatorSnapshot | null | undefined,
  legacy: SummaryAllocatorSnapshot | null | undefined
): SummaryAllocators | null {
  const totalsExists = totals != null;
  const legacyExists = legacy != null;
  if (!totalsExists && !legacyExists) return null;

  const merged = mergeSummaryAllocators(totals, legacy);
  if (!totalsExists) return merged;
  if (
    allocatorNumber(totals.nextReceiptNumber) < merged.nextReceiptNumber ||
    allocatorNumber(totals.nextContributionNumber) < merged.nextContributionNumber
  ) {
    return merged;
  }
  return null;
}

/** True when `current` has an allocator the live `totals` document lacks. */
export function legacySummaryNeedsMerge(
  totals: SummaryAllocatorSnapshot | null | undefined,
  legacy: SummaryAllocatorSnapshot | null | undefined
): boolean {
  return planSummaryAllocatorMerge(totals, legacy) != null && legacy != null;
}
