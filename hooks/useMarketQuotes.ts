import { useQueries } from '@tanstack/react-query';
import { InstrumentType, MarketQuote } from '@/shared/features/portfolio/types';
import { fetchMarketQuote } from '@/services/marketDataService';

export function useMarketQuotes(symbols: Array<{ symbol: string; instrumentType: InstrumentType }>) {
  const results = useQueries({
    queries: symbols.map((s) => ({
      queryKey: ['market-quote', s.symbol, s.instrumentType],
      // `signal` cancels the in-flight quote when the screen unmounts or the
      // poll is superseded, instead of leaving it to resolve into nothing.
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        fetchMarketQuote(s.symbol, s.instrumentType, { signal }),
      staleTime: 60_000,
      refetchInterval: 60_000,
      refetchIntervalInBackground: false,
      retry: 1,
    })),
  });

  const quotes = new Map<string, MarketQuote>();
  let isLoading = false;

  results.forEach((result, index) => {
    if (result.isLoading) isLoading = true;
    if (result.data) {
      quotes.set(symbols[index].symbol, result.data);
    }
  });

  return { quotes, isLoading };
}
