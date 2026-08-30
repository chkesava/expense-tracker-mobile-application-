import { useEffect, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
  type Query,
  type QueryConstraint,
} from "firebase/firestore";

import { snapshotErrorHandler, type LoadFailure } from "@/lib/firestoreErrors";
import { getFirestoreDb } from "@/lib/firebase";
import { forgetSnapshotPath, logQuerySnapshot } from "@/lib/firestoreReadDebug";

export function useGaneshCollection<T>(
  path: string[] | null,
  mapDoc: (id: string, data: DocumentData, pendingWrite: boolean) => T,
  options?: {
    orderByField?: string;
    orderDirection?: "asc" | "desc";
    limitTo?: number;
    extra?: QueryConstraint[];
    extraKey?: string;
    enabled?: boolean;
  }
) {
  const [items, setItems] = useState<T[]>([]);
  const [error, setError] = useState<LoadFailure | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [retryToken, setRetryToken] = useState(0);
  const [hydratedKey, setHydratedKey] = useState("");

  const pathKey = path?.join("/") ?? "";
  const extraKey = options?.extraKey ?? "";
  const enabled = options?.enabled !== false && Boolean(path);
  const subscribeKey = `${pathKey}|${extraKey}|${retryToken}`;
  const loading = enabled && hydratedKey !== subscribeKey;

  useEffect(() => {
    const db = getFirestoreDb();
    if (!db || !path || !enabled) {
      setItems([]);
      setPendingCount(0);
      setHydratedKey("");
      return;
    }

    const [root, ...rest] = path;
    const constraints: QueryConstraint[] = [...(options?.extra ?? [])];
    if (options?.orderByField) {
      constraints.push(orderBy(options.orderByField, options.orderDirection ?? "desc"));
    }
    if (options?.limitTo) constraints.push(limit(options.limitTo));
    const q: Query = constraints.length
      ? query(collection(db, root, ...rest), ...constraints)
      : collection(db, root, ...rest);

    setItems([]);
    setPendingCount(0);
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        logQuerySnapshot(pathKey, snapshot);
        let pending = 0;
        const next = snapshot.docs.map((docSnap) => {
          if (docSnap.metadata.hasPendingWrites) pending += 1;
          return mapDoc(docSnap.id, docSnap.data(), docSnap.metadata.hasPendingWrites);
        });
        setItems(next);
        setPendingCount(pending);
        setError(null);
        setHydratedKey(subscribeKey);
      },
      snapshotErrorHandler(`snapshot.ganesh.${pathKey}`, (failure) => {
        setError(failure);
        setHydratedKey(subscribeKey);
      }, "Couldn't load Ganesh data.")
    );
    return () => {
      forgetSnapshotPath(pathKey);
      unsubscribe();
    };
  }, [
    enabled,
    pathKey,
    extraKey,
    options?.orderByField,
    options?.orderDirection,
    options?.limitTo,
    retryToken,
    subscribeKey,
  ]);

  return {
    items,
    loading,
    error,
    pendingCount,
    retry: () => setRetryToken((token) => token + 1),
  };
}
