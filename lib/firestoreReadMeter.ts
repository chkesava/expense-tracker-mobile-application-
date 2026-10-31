/**
 * SPENDLY-588 — meters every Firestore read the app makes, for the read
 * inventory (`shared/utils/readInventory.ts`).
 *
 * `@/lib/firestore` (web) and `lib/firestore.native.ts` replace `onSnapshot`,
 * `getDoc` and `getDocs` with `meterReads(...)` of the SDK's own functions.
 * Every app module already imports Firestore from there (SPENDLY-635), so
 * nothing else needs instrumenting.
 *
 * Only in dev and perf builds (`__DEV__` or `EXPO_PUBLIC_PERF_MARKS=1`), never under vitest:
 * otherwise `meterReads` returns the SDK functions themselves, so production
 * behaviour is unchanged by construction. A metering failure never reaches
 * the caller.
 *
 * Read in the console (web) or the debugger (native):
 * `spendlyReadInventory.table()`, `.rows()`, `.reset()`.
 */
import { createReadInventory, formatReadInventory, type ReadInventoryKind } from "@/shared/utils/readInventory";

// Same rule as `lib/perf.ts`, without importing it: `@/lib/firestore` is in
// the shared typecheck (tsconfig.shared.json), which has no React Native globals.
declare const __DEV__: boolean | undefined;
const PERF_BUILD =
  (typeof __DEV__ !== "undefined" && __DEV__ === true) || process.env.EXPO_PUBLIC_PERF_MARKS === "1";

export const readInventory = createReadInventory();

export function readInventoryTable(): string {
  return formatReadInventory(readInventory.rows(), readInventory.totals(), readInventory.sinceMs());
}

export function isReadMeterEnabled(): boolean {
  if (typeof process !== "undefined" && process.env?.VITEST) return false;
  return PERF_BUILD;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- the SDKs' overloads differ per platform */

/** The path a reference or query reads, when the SDK exposes it. */
export function refPath(ref: any): string | null {
  try {
    if (!ref) return null;
    if (typeof ref.path === "string") return ref.path;
    // Web SDK query: the internal query keeps the collection path.
    const webPath = ref._query?.path;
    if (webPath && typeof webPath.canonicalString === "function") {
      const p = webPath.canonicalString();
      if (p) return p;
    }
    if (typeof ref._query?.collectionGroup === "string") return ref._query.collectionGroup;
    // Native SDK query.
    const nativePath = ref._collectionPath?.relativeName;
    if (typeof nativePath === "string") return nativePath;
  } catch {
    // fall through
  }
  return null;
}

function snapshotFacts(snap: any): { kind: ReadInventoryKind; size: number; changes: number; fromCache: boolean; hasPendingWrites: boolean } {
  const isQuery = typeof snap?.docChanges === "function";
  const size = isQuery ? (snap.size ?? snap.docs?.length ?? 0) : snap?.exists?.() === false || snap?.exists === false ? 0 : 1;
  return {
    kind: isQuery ? "query" : "doc",
    size,
    changes: isQuery ? snap.docChanges().length : 0,
    fromCache: snap?.metadata?.fromCache === true,
    hasPendingWrites: snap?.metadata?.hasPendingWrites === true,
  };
}

function firstDocParentPath(snap: any): string | null {
  try {
    const parent = snap?.docs?.[0]?.ref?.parent;
    return typeof parent?.path === "string" ? parent.path : null;
  } catch {
    return null;
  }
}

function isObserver(value: any): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    (typeof value.next === "function" || typeof value.error === "function" || typeof value.complete === "function")
  );
}

function safely(fn: () => void): void {
  try {
    fn();
  } catch {
    // metering must never break a read
  }
}

/**
 * `sdk[name]`, or undefined when a test's `vi.mock("firebase/firestore", …)`
 * factory doesn't define it (vitest throws on reading a missing mock export).
 */
export function sdkExport<T extends object, K extends keyof T>(sdk: T, name: K): T[K] {
  try {
    return sdk[name];
  } catch {
    return undefined as T[K];
  }
}

type SdkReads<S, D, Q> = { onSnapshot: S; getDoc: D; getDocs: Q };

/** The SDK's read functions, metered when the meter is enabled. */
export function meterReads<S, D, Q>(sdk: SdkReads<S, D, Q>, enabled: boolean = isReadMeterEnabled()): SdkReads<S, D, Q> {
  if (!enabled) return sdk;

  const onSnapshot = ((ref: any, ...rest: any[]) => {
    let id = 0;
    safely(() => {
      id = readInventory.attach(refPath(ref));
    });
    const record = (snap: any) =>
      safely(() => {
        if (refPath(ref) === null) readInventory.rekey(id, firstDocParentPath(snap));
        readInventory.snapshot(id, snapshotFacts(snap));
      });
    // Forms: (ref, observer) | (ref, options, observer) | (ref, onNext, ...) | (ref, options, onNext, ...)
    const i = typeof rest[0] === "function" || isObserver(rest[0]) ? 0 : 1;
    const args = [...rest];
    if (typeof args[i] === "function") {
      const onNext = args[i];
      args[i] = (snap: any) => {
        record(snap);
        return onNext(snap);
      };
    } else if (isObserver(args[i]) && typeof args[i].next === "function") {
      const observer = args[i];
      args[i] = {
        ...observer,
        next: (snap: any) => {
          record(snap);
          return observer.next(snap);
        },
      };
    }
    const unsubscribe = (sdk.onSnapshot as any)(ref, ...args);
    return () => {
      safely(() => readInventory.detach(id));
      return unsubscribe();
    };
  }) as unknown as S;

  const getDoc = (async (ref: any, ...rest: any[]) => {
    const snap = await (sdk.getDoc as any)(ref, ...rest);
    safely(() => readInventory.get(refPath(ref), "doc", 1, snap?.metadata?.fromCache === true));
    return snap;
  }) as unknown as D;

  const getDocs = (async (query: any, ...rest: any[]) => {
    const snap = await (sdk.getDocs as any)(query, ...rest);
    safely(() =>
      readInventory.get(
        refPath(query) ?? firstDocParentPath(snap),
        "query",
        snap?.size ?? snap?.docs?.length ?? 0,
        snap?.metadata?.fromCache === true
      )
    );
    return snap;
  }) as unknown as Q;

  return { onSnapshot, getDoc, getDocs };
}
