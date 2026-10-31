import { useEffect, useState, useSyncExternalStore } from 'react';
import { onlineManager, useQuery } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';

import { logWarning } from '@/lib/errors';
import { isAbortError } from '@/lib/fetchWithTimeout';
import {
  hydrateMarketOverviewCache,
  isMarketOverviewCacheHydrated,
  peekMarketOverview,
  rememberMarketOverview,
} from '@/lib/marketOverviewCache';
import { fetchMarketOverview, MarketDataError } from '@/services/marketDataService';
import type { MarketOverviewDTO } from '@/shared/types/market';
import {
  MARKET_OVERVIEW_SCHEMA_VERSION,
  classifyFreshness,
  freshnessLabel,
  overviewErrorCopy,
  overviewPollMs,
  overviewStaleMs,
  type OverviewFreshness,
} from '@/shared/utils/marketOverview';

/** True once the on-device market overview copy has been read (once per app session). */
export function useMarketOverviewCacheReady(): boolean {
  const [ready, setReady] = useState(isMarketOverviewCacheHydrated);
  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    void hydrateMarketOverviewCache().then(() => {
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

export type MarketOverviewState = {
  query: ReturnType<typeof useQuery<MarketOverviewDTO | null>>;
  data: MarketOverviewDTO | null | undefined;
  /** The device is offline (React Query has paused fetching). */
  isOffline: boolean;
  /** `data` is the on-device copy and has not been refreshed since mount. */
  fromSnapshot: boolean;
  freshness: OverviewFreshness | null;
  /** Status-strip line, e.g. "Market closed · as of 15:30 IST". */
  label: string | null;
  /** Copy for the last failed load, or null. Data may still be showing. */
  errorMessage: string | null;
};

/**
 * The Markets tab payload (SPENDLY-622, story SPENDLY-644).
 *
 * - Source is /api/market-overview only. No Firestore read happens here.
 * - The last good copy is kept on the device and drawn at once, labelled with
 *   its own as-of time; it is refetched as soon as it is stale. Mount this
 *   only after `useMarketOverviewCacheReady()` so that copy is loaded.
 * - Polls every minute only while the market trades and the screen is
 *   focused. Open or closed is worked out against the device clock, so a
 *   cached "open" stops polling when the session ends.
 */
export function useMarketOverview({ enabled = true }: { enabled?: boolean } = {}): MarketOverviewState {
  const isFocused = useIsFocused();
  const isOnline = useIsOnline();
  const now = Date.now();
  const snapshot = peekMarketOverview();

  const query = useQuery<MarketOverviewDTO | null>({
    queryKey: ['market-overview', MARKET_OVERVIEW_SCHEMA_VERSION],
    queryFn: async ({ signal }) => {
      try {
        const dto = await fetchMarketOverview({ signal });
        if (dto) void rememberMarketOverview(dto);
        return dto;
      } catch (error) {
        if (!isAbortError(error) || !signal.aborted) {
          logWarning('portfolio.marketOverview', error, {
            code: error instanceof MarketDataError ? error.code : undefined,
          });
        }
        throw error;
      }
    },
    enabled: enabled && isFocused,
    initialData: () => snapshot,
    initialDataUpdatedAt: () => (snapshot ? Date.parse(snapshot.fetchedAt) : undefined),
    staleTime: (q) => overviewStaleMs(q.state.data, Date.now()),
    refetchInterval: (q) => (isFocused ? overviewPollMs(q.state.data, Date.now()) : false),
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
    freshness: data ? classifyFreshness(data, now) : null,
    label: data ? freshnessLabel(data, now, { offline: isOffline }) : null,
    errorMessage: query.error ? overviewErrorCopy(errorCode) : null,
  };
}
