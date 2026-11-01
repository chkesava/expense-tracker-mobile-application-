import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { onlineManager, useQuery } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';

import { logWarning } from '@/lib/errors';
import { isAbortError } from '@/lib/fetchWithTimeout';
import { hydrateStockQuoteCache, isStockQuoteCacheHydrated, peekStockQuotes, rememberStockQuotes } from '@/lib/stockQuoteCache';
import { fetchStockQuotes, MarketDataError } from '@/services/marketDataService';
import type { StockQuotesDTO } from '@/shared/types/market';
import { marketStateAt, overviewErrorCopy, overviewFreshSeconds } from '@/shared/utils/marketOverview';
import { QUOTES_POLL_MS, STOCK_QUOTES_SCHEMA_VERSION, quoteRows, quoteSymbolsParam, quotesLabel, type QuoteRow } from '@/shared/utils/stockQuotes';

/** True once this device's saved quotes have been read (once per app session). */
export function useStockQuoteCacheReady(): boolean {
  const [ready, setReady] = useState(isStockQuoteCacheHydrated);
  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    void hydrateStockQuoteCache().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);
  return ready;
}

function useIsOnline(): boolean {
  return useSyncExternalStore(
    (onChange) => onlineManager.subscribe(onChange),
    () => onlineManager.isOnline(),
    () => true
  );
}

const NO_RETRY = new Set(['THROTTLED', 'MALFORMED', 'BAD_REQUEST']);

export type WatchlistQuotesState = {
  query: ReturnType<typeof useQuery<StockQuotesDTO | null>>;
  /** One row per symbol, in the order given — never fewer (a failure keeps the stock). */
  rows: QuoteRow[];
  isOffline: boolean;
  label: string | null;
  errorMessage: string | null;
};

/**
 * Prices for one watchlist (SPENDLY-624, story SPENDLY-656).
 *
 * - One request per list, never one per row: /api/stock-quotes, up to 50
 *   symbols. Keyed by the sorted symbol set, so reordering doesn't refetch.
 * - Polls every minute only while the market trades and the screen is
 *   focused. Saved quotes from this device fill rows the live answer lacks,
 *   labelled as saved. No Firestore here.
 */
export function useWatchlistQuotes(symbols: readonly string[], { enabled = true }: { enabled?: boolean } = {}): WatchlistQuotesState {
  const isFocused = useIsFocused();
  const isOnline = useIsOnline();
  const param = quoteSymbolsParam(symbols);

  const query = useQuery<StockQuotesDTO | null>({
    queryKey: ['stock-quotes', STOCK_QUOTES_SCHEMA_VERSION, param],
    queryFn: async ({ signal }) => {
      try {
        const dto = await fetchStockQuotes(param ? param.split(',') : [], { signal });
        if (dto) void rememberStockQuotes(dto);
        return dto;
      } catch (error) {
        if (!isAbortError(error) || !signal.aborted) {
          logWarning('portfolio.watchlistQuotes', error, {
            code: error instanceof MarketDataError ? error.code : undefined,
            count: symbols.length,
          });
        }
        throw error;
      }
    },
    enabled: enabled && isFocused && param !== '',
    staleTime: (q) => (q.state.data ? overviewFreshSeconds(q.state.data.status, Date.now()) * 1000 : 0),
    refetchInterval: (q) =>
      isFocused && q.state.data && marketStateAt(q.state.data.status, Date.now()) === 'open' ? QUOTES_POLL_MS : false,
    refetchIntervalInBackground: false,
    placeholderData: (previous) => previous,
    retry: (failureCount, error) =>
      failureCount < 1 && !(error instanceof MarketDataError && error.code && NO_RETRY.has(error.code)),
  });

  const live = query.data;
  const rows = useMemo(() => quoteRows(symbols, live, peekStockQuotes(symbols)), [symbols, live]);
  const isOffline = !isOnline;
  const errorCode = query.error instanceof MarketDataError ? query.error.code : undefined;
  return {
    query,
    rows,
    isOffline,
    label: quotesLabel(live, rows, Date.now(), { offline: isOffline }),
    errorMessage: query.error ? overviewErrorCopy(errorCode) : null,
  };
}
