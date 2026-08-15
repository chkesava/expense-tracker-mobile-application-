import { useQueries } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';
import { InstrumentType, MarketQuote } from '@/shared/features/portfolio/types';
import { fetchMarketQuote } from '@/services/marketDataService';

export function useMarketQuotes(symbols: Array<{ symbol: string; instrumentType: InstrumentType }>) {
  // Consumers (dashboard, portfolio, SIP, holdings widgets) can stay mounted
  // in the navigation stack after the user moves away — without this, the
  // 60s poll below keeps firing network requests for every symbol
  // indefinitely in the background.
  const isFocused = useIsFocused();

  const results = useQueries({
    queries: symbols.map((s) => ({
      queryKey: ['market-quote', s.symbol, s.instrumentType],
      queryFn: () => fetchMarketQuote(s.symbol, s.instrumentType),
      staleTime: 60_000,
      refetchInterval: isFocused ? 60_000 : false,
      enabled: isFocused,
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
