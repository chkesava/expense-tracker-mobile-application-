/**
 * SPENDLY-748 — the session cache for the Journal's month-on-demand reads.
 *
 * One load per (collection, month) for the session: a second call while the
 * first is in flight, or after it succeeded, returns the same promise and
 * reads nothing. A failed load is forgotten, so the next call (the screen's
 * retry) reads again. `reset` drops everything (sign-out / user switch), so a
 * month cached for one user is never trusted for the next.
 *
 * The loader itself is `readJournalMonth` (the read switch and the Firestore
 * fallback); this module only decides whether it runs.
 */
export type JournalMonthCache = {
  /** Resolves true once `monthKey` is loaded, false when the load failed. */
  load(monthKey: string, loader: () => Promise<void>, onError?: (error: unknown) => void): Promise<boolean>;
  /** Months whose load has succeeded. */
  loaded(): Set<string>;
  reset(): void;
};

export function createJournalMonthCache(): JournalMonthCache {
  let generation = 0;
  const loads = new Map<string, Promise<boolean>>();
  const done = new Set<string>();

  return {
    load(monthKey, loader, onError) {
      const existing = loads.get(monthKey);
      if (existing) return existing;
      const startedIn = generation;
      const promise = loader().then(
        () => {
          if (startedIn === generation) done.add(monthKey);
          return startedIn === generation;
        },
        (error: unknown) => {
          if (startedIn === generation && loads.get(monthKey) === promise) loads.delete(monthKey);
          onError?.(error);
          return false;
        }
      );
      loads.set(monthKey, promise);
      return promise;
    },
    loaded: () => new Set(done),
    reset() {
      generation += 1;
      loads.clear();
      done.clear();
    },
  };
}
