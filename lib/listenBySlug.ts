/**
 * Public /payment/:slug and /split/:slug listeners.
 *
 * New documents use the slug as the document id, so a `get` is enough and
 * `list` can stay closed to anonymous clients (SPENDLY-36). Documents minted
 * before that change still have auto-ids; while the old rules are live the
 * query fallback still finds them. After the backfill + rules deploy the
 * query is denied and only slug-id docs resolve.
 */

import {
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";

export function listenBySlugWithQueryFallback(
  db: Firestore,
  collectionName: string,
  slug: string,
  handlers: {
    onDoc: (id: string, data: DocumentData) => void;
    onMissing: () => void;
    onError: (error: unknown) => void;
  }
): Unsubscribe {
  let queryUnsub: Unsubscribe | undefined;
  let startedQuery = false;
  let stopped = false;

  const unsubGet = onSnapshot(
    doc(db, collectionName, slug),
    (snap) => {
      if (stopped) return;
      if (snap.exists()) {
        if (queryUnsub) {
          queryUnsub();
          queryUnsub = undefined;
        }
        handlers.onDoc(snap.id, snap.data());
        return;
      }
      if (startedQuery) return;
      startedQuery = true;
      queryUnsub = onSnapshot(
        query(
          collection(db, collectionName),
          where("slug", "==", slug),
          limit(1)
        ),
        (qsnap) => {
          if (stopped) return;
          if (qsnap.empty) {
            handlers.onMissing();
            return;
          }
          const hit = qsnap.docs[0];
          handlers.onDoc(hit.id, hit.data());
        },
        handlers.onError
      );
    },
    handlers.onError
  );

  return () => {
    stopped = true;
    unsubGet();
    if (queryUnsub) queryUnsub();
  };
}
