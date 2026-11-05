import { useCallback, useEffect, useMemo, useState } from "react";

import { logWarning } from "@/lib/errors";
import { isLocalTestMode, isReadModelEnvConfigured } from "@/lib/env";
import { getAppLocalCopy } from "@/lib/readModelLocal/appCopy";
import { createCollectionSource, type QueryOptions, type SourceDoc } from "@/lib/readModelLocal/readSource";
import { useAuth } from "@/providers/AuthProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import { effectiveCollectionMode, type CollectionMode } from "@/shared/utils/readModel/collectionMode";
import { localCopyEnabled } from "@/shared/utils/readModelMode";

/**
 * SPENDLY-673 — a provider's read switch for one collection.
 *
 * ```ts
 * const source = useReadModelSource("creditCardBills");
 * useEffect(() => {
 *   if (source.mode === "supabase") return source.subscribe(apply);   // no Firestore listener
 *   const unsub = onSnapshot(q, (snap) => {
 *     const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
 *     apply(docs);
 *     if (source.mode === "shadow") void source.shadow(docs);
 *   });
 *   return unsub;
 * }, [..., source.mode]);
 * ```
 *
 * `apply` is the provider's existing mapping. In `firestore` mode nothing
 * changes. A failure on the copy falls back to Firestore for the session
 * (`mode` changes, so the provider's effect re-runs with its listener).
 */
const fellBack = new Set<string>();

export function resetReadModelSourceFallbacksForTests() {
  fellBack.clear();
}

export function useReadModelSource(collection: string, options?: { copy?: boolean }) {
  const { settings } = useSystemSettings();
  const { user, isDuress } = useAuth();
  const [copyState, setCopyState] = useState(() => getAppLocalCopy()?.status().state ?? "off");
  const [fallbackTick, setFallbackTick] = useState(0);

  useEffect(() => {
    const copy = getAppLocalCopy();
    if (!copy) return;
    setCopyState(copy.status().state);
    return copy.onState(setCopyState);
  }, []);

  const decision = effectiveCollectionMode({
    setting: settings.readModel,
    collection,
    envConfigured: isReadModelEnvConfigured(),
    localTestMode: isLocalTestMode(),
    duress: isDuress,
    signedIn: !!user,
    localCopyOn: localCopyEnabled(settings.readModel),
    copyState,
    fellBack: fellBack.has(collection),
  });
  void fallbackTick;

  const source = useMemo(
    () => createCollectionSource({ collection, copy: getAppLocalCopy, log: (event, detail) => logWarning(event, detail) }),
    [collection]
  );

  const subscribe = useCallback(
    (onDocs: (docs: SourceDoc[]) => void, options?: QueryOptions) =>
      source.subscribe(
        onDocs,
        (error) => {
          logWarning(`readModel.fallback.${collection}`, error);
          fellBack.add(collection);
          setFallbackTick((n) => n + 1);
        },
        options
      ),
    [source, collection]
  );

  // SPENDLY-598 (R4.3a): `copy: false` is for an instance whose data drives a
  // write: it may compare (shadow) but always reads Firestore.
  const mode: CollectionMode =
    options?.copy === false && decision.mode === "supabase" ? "firestore" : (decision.mode as CollectionMode);

  return {
    mode,
    configured: decision.configured,
    reason: decision.reason,
    subscribe,
    shadow: source.shadow,
  };
}

/**
 * SPENDLY-597: only the effective mode of a collection, for code that must
 * know where its inputs come from (the bill pass, R4.3a) without reading them.
 */
export function useReadModelMode(collection: string): CollectionMode {
  return useReadModelSource(collection).mode;
}

/**
 * SPENDLY-599: the effective modes of several collections at once, for a
 * writer computed over many inputs (the net-worth snapshot, R4.3a).
 */
export function useReadModelModes(collections: readonly string[]): Record<string, CollectionMode> {
  const { settings } = useSystemSettings();
  const { user, isDuress } = useAuth();
  const [copyState, setCopyState] = useState(() => getAppLocalCopy()?.status().state ?? "off");

  useEffect(() => {
    const copy = getAppLocalCopy();
    if (!copy) return;
    setCopyState(copy.status().state);
    return copy.onState(setCopyState);
  }, []);

  const modes: Record<string, CollectionMode> = {};
  for (const collection of collections) {
    modes[collection] = effectiveCollectionMode({
      setting: settings.readModel,
      collection,
      envConfigured: isReadModelEnvConfigured(),
      localTestMode: isLocalTestMode(),
      duress: isDuress,
      signedIn: !!user,
      localCopyOn: localCopyEnabled(settings.readModel),
      copyState,
      fellBack: fellBack.has(collection),
    }).mode as CollectionMode;
  }
  return modes;
}
