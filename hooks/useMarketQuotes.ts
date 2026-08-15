import { useQueries } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';
import { InstrumentType, MarketQuote } from '@/shared/features/portfolio/types';
import { fetchMarketQuote } from '@/services/marketDataService';
import { friendlyErrorMessage } from '@/lib/errors';

export function useMarketQuotes(symbols: Array<{ symbol: string; instrumentType: InstrumentType }>) {
  // Consumers (dashboard, portfolio, SIP, holdings widgets) can stay mounted
  // in the navigation stack after the user moves away — without this, the
  // 60s poll below keeps firing network requests for every symbol
  // indefinitely in the background.
  const isFocused = useIsFocused();

  const results = useQueries({
    queries: symbols.map((s) => ({
      queryKey: ['market-quote', s.symbol, s.instrumentType],
      // `signal` cancels the in-flight quote when the screen unmounts or the
      // poll is superseded, instead of leaving it to resolve into nothing.
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        fetchMarketQuote(s.symbol, s.instrumentType, { signal }),
      staleTime: 60_000,
      refetchInterval: isFocused ? 60_000 : false,
      refetchIntervalInBackground: false,
      enabled: isFocused,
      retry: 2,
      retryDelay: (attempt: number) => Math.min(1_000 * 2 ** attempt, 8_000),
    })),
  });

  const quotes = new Map<string, MarketQuote>();
  let isLoading = false;
  let failedCount = 0;
  let firstError: unknown = null;

  results.forEach((result, index) => {
    if (result.isLoading) isLoading = true;
    if (result.isError) {
      failedCount += 1;
      firstError = firstError ?? result.error;
    }
    if (result.data) {
      quotes.set(symbols[index].symbol, result.data);
    }
  });

  return {
    quotes,
    isLoading,
    /** True when at least one quote could not be fetched — prices shown are stale. */
    isError: failedCount > 0,
    failedCount,
    /** Safe to render; describes why prices may be out of date. */
    errorMessage: firstError
      ? friendlyErrorMessage(firstError, 'Live prices are unavailable right now.')
      : null,
    refetch: () => {
      results.forEach((result) => void result.refetch());
    },
  };
}
