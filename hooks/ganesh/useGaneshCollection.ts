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

export function useGaneshCollection<T>(
  path: string[] | null,
  mapDoc: (id: string, data: DocumentData, pendingWrite: boolean) => T,
  options?: {
    orderByField?: string;
    orderDirection?: "asc" | "desc";
    limitTo?: number;
    extra?: QueryConstraint[];
    enabled?: boolean;
  }
) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<LoadFailure | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  const pathKey = path?.join("/") ?? "";
  const enabled = options?.enabled !== false && Boolean(path);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!db || !path || !enabled) {
      setItems([]);
      setLoading(false);
      setPendingCount(0);
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

    setLoading(true);
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        let pending = 0;
        const next = snapshot.docs.map((docSnap) => {
          if (docSnap.metadata.hasPendingWrites) pending += 1;
          return mapDoc(docSnap.id, docSnap.data(), docSnap.metadata.hasPendingWrites);
        });
        setItems(next);
        setPendingCount(pending);
        setError(null);
        setLoading(false);
      },
      snapshotErrorHandler(`snapshot.ganesh.${pathKey}`, (failure) => {
        setError(failure);
        setLoading(false);
      }, "Couldn't load Ganesh data.")
    );
    return unsubscribe;
  }, [enabled, pathKey, options?.orderByField, options?.orderDirection, options?.limitTo]);

  return { items, loading, error, pendingCount };
}
