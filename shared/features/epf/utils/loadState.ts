/**
 * Combining several listeners into one load state — KAN-73.
 *
 * EPF screens compose two or three Firestore listeners and then render a
 * financial figure derived from all of them. Before this, each screen picked
 * which loading flags and which errors to consume by hand, and several picked
 * a subset:
 *
 * - `EpfBalanceTab` never read `transfersError`, so a failed transfers listener
 *   rendered a balance silently missing every transfer.
 * - `EpfTransfersList` read neither `interestLoading` nor `interestError`, so
 *   transferable balance was computed without interest.
 * - Both `EpfBalanceTab` and `EpfDashboard` picked an error with `a ?? b`,
 *   discarding the second one.
 *
 * The rule for a financial figure is that a partial failure is a failure: it is
 * better to show an error than a confident wrong number. Passing every source
 * to one function makes consuming a subset impossible rather than merely
 * discouraged.
 */

/**
 * Generic over the failure type so this does not have to know whether a caller
 * uses `Error` or the app's `LoadFailure` shape.
 */
export interface EpfLoadSource<E> {
  loading: boolean;
  error?: E | null;
  retry?: () => void;
}

export interface EpfLoadState<E> {
  /** Any source still loading. */
  loading: boolean;
  /** The first error, for a single-error UI. `null` when every source is fine. */
  error: E | null;
  /** Every error, in source order — nothing is discarded. */
  errors: E[];
  /** Retries every source that offers a retry. */
  retryAll: () => void;
}

export function combineEpfLoad<E>(sources: readonly EpfLoadSource<E>[]): EpfLoadState<E> {
  const errors = sources
    .map((source) => source.error)
    .filter((error): error is E => error != null);

  return {
    loading: sources.some((source) => source.loading),
    error: errors[0] ?? null,
    errors,
    retryAll: () => {
      for (const source of sources) source.retry?.();
    },
  };
}
