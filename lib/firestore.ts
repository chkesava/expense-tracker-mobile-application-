/**
 * SPENDLY-635 — the one Firestore import path for app code.
 *
 * Every module imports Firestore from `@/lib/firestore`, never from
 * `firebase/firestore` directly (`lib/firebaseImportGuard.test.ts`). This
 * file is the web/vitest side (Firebase JS SDK); Android/iOS resolve
 * `firestore.native.ts` (`@react-native-firebase/firestore`, SPENDLY-638) for
 * a durable on-device cache.
 *
 * Exceptions: the rules tests (`firestore/*.rules.test.ts`) and Node scripts
 * talk to the emulator with the web SDK, and `vi.mock("firebase/firestore")`
 * in tests still applies because this module re-exports it.
 *
 * SPENDLY-588: `onSnapshot`, `getDoc` and `getDocs` go through the read meter
 * (`lib/firestoreReadMeter.ts`). Outside dev/perf builds, and always under
 * vitest, they are the SDK's own functions.
 */
import * as sdk from "firebase/firestore";

import { meterReads, sdkExport } from "@/lib/firestoreReadMeter";

export * from "firebase/firestore";

const reads = meterReads({
  onSnapshot: sdkExport(sdk, "onSnapshot"),
  getDoc: sdkExport(sdk, "getDoc"),
  getDocs: sdkExport(sdk, "getDocs"),
});

export const onSnapshot = reads.onSnapshot;
export const getDoc = reads.getDoc;
export const getDocs = reads.getDocs;
