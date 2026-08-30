import { useLayoutEffect } from "react";
import type { DocumentData, QueryConstraint } from "firebase/firestore";

import { useGaneshCollection } from "@/hooks/ganesh/useGaneshCollection";
import type { LoadFailure } from "@/lib/firestoreErrors";

type SharedSlice<T> = {
  items: T[];
  loading: boolean;
  error: LoadFailure | null;
  pendingCount?: number;
  retry?: () => void;
};

export function useSharedOrLocalCollection<T>(options: {
  useShared: boolean;
  requestShared?: () => void;
  shared: SharedSlice<T>;
  path: string[] | null;
  mapDoc: (id: string, data: DocumentData, pendingWrite: boolean) => T;
  query?: {
    orderByField?: string;
    orderDirection?: "asc" | "desc";
    limitTo?: number;
    extra?: QueryConstraint[];
    extraKey?: string;
  };
}) {
  const { useShared, requestShared, shared, path, mapDoc, query: queryOptions } = options;

  useLayoutEffect(() => {
    if (useShared) requestShared?.();
  }, [useShared, requestShared]);

  const local = useGaneshCollection(useShared ? null : path, mapDoc, {
    ...queryOptions,
    enabled: !useShared && Boolean(path),
  });

  if (useShared) {
    return {
      items: shared.items,
      loading: shared.loading,
      error: shared.error,
      pendingCount: shared.pendingCount ?? 0,
      retry: shared.retry ?? (() => undefined),
    };
  }
  return local;
}
