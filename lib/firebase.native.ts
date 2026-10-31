/**
 * SPENDLY-638 — Firebase on Android/iOS runs on the native SDKs
 * (`@react-native-firebase/*`). Metro picks this file on native; web and the
 * vitest suite use `lib/firebase.ts` (Firebase JS SDK), which also holds the
 * shared `FirebaseClients` type. Same exports, same behaviour contract.
 *
 * What changes on native:
 * - Firestore keeps a durable on-device cache and a write queue that survives
 *   a force-stop (the JS SDK only had memory here — see `lib/firebase.ts`).
 * - Auth, Firestore and Storage share the native sign-in, so the rules see
 *   `request.auth`. The default app is configured from `google-services.json`
 *   (Spendly Test: `google-services.localtest.json`, demo project only).
 * - Functions is not created: the app makes no callable requests (SPENDLY-637).
 *
 * The native modules are typed as the JS SDK's types at this boundary, the
 * same contract the adapters keep (`lib/*AdapterContract.test.ts`).
 */

import { getApp } from "@react-native-firebase/app";
import { connectAuthEmulator, getAuth } from "@react-native-firebase/auth";
import {
  clearIndexedDbPersistence,
  connectFirestoreEmulator,
  getFirestore,
  terminate,
  waitForPendingWrites,
} from "@react-native-firebase/firestore";
import { connectStorageEmulator, getStorage } from "@react-native-firebase/storage";
import type { FirebaseApp } from "firebase/app";
import type { Functions } from "firebase/functions";

import type { Auth } from "@/lib/auth";
import type { Firestore } from "@/lib/firestore";
import type { FirebaseStorage } from "@/lib/storage";

import { initializeFirebaseAppCheck } from "./appCheck";
import {
  FIREBASE_EMULATOR_PORTS,
  LOCAL_TEST_PROJECT_ID,
  env,
  isFirebaseEnvConfigured,
  isLocalTestMode,
} from "./env";
import { logWarning } from "./errors";
import type { FirebaseClients } from "./firebase";
import { setWriteQueueDurable } from "./firestoreWrite";
import { perfEnd, perfStart } from "./perf";

export type { FirebaseClients } from "./firebase";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;
let initError: string | null = null;
let firestoreEmulatorConnected = false;
/**
 * Set while sign-out terminates the instance and deletes its cache. Clearing
 * fails (`failed-precondition`) if anything starts Firestore again first —
 * on the device a settings listener re-subscribed within milliseconds — so
 * no new instance is created until the clear has finished.
 */
let recycling: Promise<void> | null = null;

function createDb(): Firestore {
  const instance = getFirestore(getApp());
  // Point every instance at the emulator before its first read, including the
  // one created after sign-out's `terminate` (the native module forgets the
  // setting then — see patches/@react-native-firebase+firestore+24.0.0.patch).
  if (isLocalTestMode() && !firestoreEmulatorConnected) {
    connectFirestoreEmulator(instance, env.firebaseEmulatorHost, FIREBASE_EMULATOR_PORTS.firestore);
    firestoreEmulatorConnected = true;
  }
  // The native SDK persists queued writes to disk.
  setWriteQueueDurable(true);
  return instance as unknown as Firestore;
}

export function getFirebaseClients(): FirebaseClients {
  if (!isFirebaseEnvConfigured()) {
    return {
      configured: false,
      app: null,
      auth: null,
      db: null,
      error: "Missing EXPO_PUBLIC_FIREBASE_* environment variables",
      firestoreCacheMode: "uninitialized",
      authPersistence: "uninitialized",
    };
  }

  if (!app) {
    try {
      perfStart("firebase_init");
      const nativeApp = getApp();
      app = nativeApp as unknown as FirebaseApp;
      const testMode = isLocalTestMode();
      // App Check attests to the production project; the emulator needs none.
      if (!testMode) initializeFirebaseAppCheck(app);
      const nativeAuth = getAuth(nativeApp);
      if (testMode) {
        const host = env.firebaseEmulatorHost;
        connectAuthEmulator(nativeAuth, `http://${host}:${FIREBASE_EMULATOR_PORTS.auth}`);
        console.info(`[firebase] LOCAL EMULATOR MODE (${host}), project ${LOCAL_TEST_PROJECT_ID}, native SDK`);
      }
      auth = nativeAuth as unknown as Auth;
      db = createDb();
      const nativeStorage = getStorage(nativeApp);
      if (testMode) {
        connectStorageEmulator(nativeStorage, env.firebaseEmulatorHost, FIREBASE_EMULATOR_PORTS.storage);
      }
      storage = nativeStorage as unknown as FirebaseStorage;
      initError = null;
      perfEnd("firebase_init", { success: true, sdk: "native" });
    } catch (e) {
      perfEnd("firebase_init", { success: false, reason: String(e) });
      initError = e instanceof Error ? e.message : String(e);
      app = null;
      auth = null;
      db = null;
      storage = null;
    }
  } else if (!db && !recycling) {
    // Recreate after logout terminated the previous instance (AUTH-03).
    try {
      db = createDb();
      initError = null;
    } catch (e) {
      initError = e instanceof Error ? e.message : String(e);
      db = null;
    }
  }

  return {
    configured: true,
    app,
    auth,
    db,
    error: initError,
    firestoreCacheMode: db ? "persistent-native" : "uninitialized",
    authPersistence: auth ? "native" : "uninitialized",
  };
}

/** Convenience accessors — null when env is incomplete or init failed. */
export function getFirebaseAuth(): Auth | null {
  return getFirebaseClients().auth;
}

export function getFirestoreDb(): Firestore | null {
  return getFirebaseClients().db;
}

export function getFirebaseStorage(): FirebaseStorage | null {
  getFirebaseClients();
  return storage;
}

/** No callable functions on native: the app makes none (SPENDLY-637). */
export function getFirebaseFunctions(): Functions | null {
  return null;
}

const PENDING_WRITES_TIMEOUT_MS = 8000;

/**
 * Stop listeners and delete the on-device cache so the next account on this
 * phone cannot read the previous user's data (SPENDLY-638). Callers flush
 * pending writes first (`waitForPendingWritesOrTimeout`). The next
 * `getFirestoreDb()` starts a fresh instance.
 */
export async function recycleFirestoreAfterLogout(): Promise<void> {
  if (!db || recycling) return recycling ?? undefined;
  const instance = db as unknown as Parameters<typeof terminate>[0];
  db = null;
  setWriteQueueDurable(false);
  recycling = (async () => {
    try {
      await terminate(instance);
    } catch (error) {
      logWarning("firebase.terminate", error);
    }
    try {
      // Deletes the on-device cache (native storage despite the name).
      await clearIndexedDbPersistence(instance);
    } catch (error) {
      logWarning("firebase.clearPersistence", error);
    }
    // The next instance is a new one and needs the emulator again.
    firestoreEmulatorConnected = false;
  })();
  try {
    await recycling;
  } finally {
    recycling = null;
  }
}

export async function waitForPendingWritesOrTimeout(database: Firestore): Promise<void> {
  try {
    await Promise.race([
      waitForPendingWrites(database as unknown as Parameters<typeof waitForPendingWrites>[0]),
      new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error("waitForPendingWrites timed out")), PENDING_WRITES_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    logWarning("firebase.waitForPendingWrites", error);
  }
}
