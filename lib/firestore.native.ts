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
 */
import {
  arrayRemove as nativeArrayRemove,
  arrayUnion as nativeArrayUnion,
} from "@react-native-firebase/firestore";

import { NATIVE_ARRAY_ELEMENTS_KEY } from "@/lib/firestoreNativeKeys";

export * from "@react-native-firebase/firestore";

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
