import { useEffect, useRef } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";

/**
 * Opens a list item's existing detail modal from an `?id=` route param
 * (SPENDLY-181), so calendar events can deep-link to one borrowing,
 * receivable or investment. Runs once per id after the data is ready, then
 * clears the param so going back doesn't reopen it.
 */
export function useOpenFromRouteParam(ready: boolean, open: (id: string) => boolean) {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!id || !ready || handled.current === id) return;
    handled.current = id;
    open(id);
    router.setParams({ id: undefined });
    // `open` is recreated by callers each render; the id guard makes this run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, ready]);
}
