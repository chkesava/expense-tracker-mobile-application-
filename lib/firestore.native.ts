/**
 * SPENDLY-638 — Firestore on Android/iOS is the native SDK
 * (`@react-native-firebase/firestore`), which keeps a durable on-device cache
 * and a write queue that survives a force-stop. Web and vitest resolve
 * `lib/firestore.ts` (the JS SDK) instead; type-checking always sees that
 * file, and `lib/firestoreAdapterContract.test.ts` keeps the two in step.
 *
 * One addition: the native `arrayUnion` / `arrayRemove` store their elements
 * already serialised for the bridge, so the write outbox
 * (`lib/firestoreSentinel.ts`) could not read them back. These wrappers keep
 * the plain elements on a non-enumerable property for it.
 *
 * SPENDLY-588: `onSnapshot`, `getDoc` and `getDocs` go through the read meter
 * (`lib/firestoreReadMeter.ts`), which is a no-op outside dev/perf builds.
 */
import {
  arrayRemove as nativeArrayRemove,
  arrayUnion as nativeArrayUnion,
  getDoc as nativeGetDoc,
  getDocs as nativeGetDocs,
  onSnapshot as nativeOnSnapshot,
} from "@react-native-firebase/firestore";

import { NATIVE_ARRAY_ELEMENTS_KEY } from "@/lib/firestoreNativeKeys";
import { meterReads } from "@/lib/firestoreReadMeter";

export * from "@react-native-firebase/firestore";

const reads = meterReads({ onSnapshot: nativeOnSnapshot, getDoc: nativeGetDoc, getDocs: nativeGetDocs });

export const onSnapshot = reads.onSnapshot;
export const getDoc = reads.getDoc;
export const getDocs = reads.getDocs;

function keepElements<T extends object>(fieldValue: T, elements: unknown[]): T {
  Object.defineProperty(fieldValue, NATIVE_ARRAY_ELEMENTS_KEY, {
    value: [...elements],
    enumerable: false,
  });
  return fieldValue;
}

export function arrayUnion(...elements: unknown[]) {
  return keepElements(nativeArrayUnion(...elements), elements);
}

export function arrayRemove(...elements: unknown[]) {
  return keepElements(nativeArrayRemove(...elements), elements);
}
