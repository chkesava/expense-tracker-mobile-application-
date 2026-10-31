import { useEffect, useState, useSyncExternalStore } from 'react';
import { onlineManager, useQuery } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';

import { logWarning } from '@/lib/errors';
import { isAbortError } from '@/lib/fetchWithTimeout';
import {
  hydrateScreenerUniverseCache,
  isScreenerUniverseCacheHydrated,
  peekScreenerUniverse,
  rememberScreenerUniverse,
} from '@/lib/screenerUniverseCache';
import { fetchScreenerUniverse, MarketDataError } from '@/services/marketDataService';
import type { ScreenerUniverseDTO } from '@/shared/types/market';
import { overviewErrorCopy, type OverviewFreshness } from '@/shared/utils/marketOverview';
import {
  SCREENER_SCHEMA_VERSION,
  screenerFreshness,
  screenerFreshnessLabel,
  screenerPollMs,
  screenerStaleMs,
} from '@/shared/utils/screenerUniverse';

/** True once the on-device screener copy has been read (once per app session). */
export function useScreenerUniverseCacheReady(): boolean {
  const [ready, setReady] = useState(isScreenerUniverseCacheHydrated);
  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    void hydrateScreenerUniverseCache().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);
  return ready;
}

/** React Query's online state, which `lib/queryNetworkBinding.ts` ties to NetInfo. */
function useIsOnline(): boolean {
  return useSyncExternalStore(
    (onChange) => onlineManager.subscribe(onChange),
    () => onlineManager.isOnline(),
    () => true
  );
}

/** Codes where an immediate retry cannot help. */
const NO_RETRY = new Set(['THROTTLED', 'MALFORMED', 'BAD_REQUEST']);

export type ScreenerUniverseState = {
  query: ReturnType<typeof useQuery<ScreenerUniverseDTO | null>>;
  data: ScreenerUniverseDTO | null | undefined;
  isOffline: boolean;
  /** `data` is the on-device copy and has not been refreshed since mount. */
  fromSnapshot: boolean;
  freshness: OverviewFreshness | null;
  /** Header line, e.g. "Market closed · closing prices of 30 Oct". */
  label: string | null;
  /** Copy for the last failed load, or null. Data may still be showing. */
  errorMessage: string | null;
};

/**
 * The stock screener's NIFTY 500 rows (SPENDLY-623, story SPENDLY-650).
 *
 * - Source is /api/screener-universe only. No Firestore read happens here.
 * - The last good universe is kept on the device and drawn at once, labelled
 *   with its own time; it is refetched as soon as it is stale. Mount this
 *   only after `useScreenerUniverseCacheReady()` so that copy is loaded.
 * - Polls every 5 minutes only while the market trades and the screen is
 *   focused. Filtering and sorting happen on the device (shared/utils/screener).
 */
export function useScreenerUniverse({ enabled = true }: { enabled?: boolean } = {}): ScreenerUniverseState {
  const isFocused = useIsFocused();
  const isOnline = useIsOnline();
  const now = Date.now();
  const snapshot = peekScreenerUniverse();

  const query = useQuery<ScreenerUniverseDTO | null>({
    queryKey: ['screener-universe', SCREENER_SCHEMA_VERSION],
    queryFn: async ({ signal }) => {
      try {
        const dto = await fetchScreenerUniverse({ signal });
        if (dto) void rememberScreenerUniverse(dto);
        return dto;
      } catch (error) {
        if (!isAbortError(error) || !signal.aborted) {
          logWarning('portfolio.screenerUniverse', error, {
            code: error instanceof MarketDataError ? error.code : undefined,
          });
        }
        throw error;
      }
    },
    enabled: enabled && isFocused,
    initialData: () => snapshot,
    initialDataUpdatedAt: () => (snapshot ? Date.parse(snapshot.fetchedAt) : undefined),
    staleTime: (q) => screenerStaleMs(q.state.data, Date.now()),
    refetchInterval: (q) => (isFocused ? screenerPollMs(q.state.data, Date.now()) : false),
    refetchIntervalInBackground: false,
    retry: (failureCount, error) =>
      failureCount < 1 && !(error instanceof MarketDataError && error.code && NO_RETRY.has(error.code)),
  });

  const data = query.data;
  const isOffline = !isOnline;
  const errorCode = query.error instanceof MarketDataError ? query.error.code : undefined;
  return {
    query,
    data,
    isOffline,
    fromSnapshot: !!data && !query.isFetchedAfterMount,
    freshness: data ? screenerFreshness(data, now) : null,
    label: data ? screenerFreshnessLabel(data, now, { offline: isOffline }) : null,
    errorMessage: query.error ? overviewErrorCopy(errorCode) : null,
  };
}
