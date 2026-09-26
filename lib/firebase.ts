/**
 * Firebase Auth + Firestore bootstrap for Expo.
 *
 * Offline strategy:
 * - Auth (native): AsyncStorage via createAuth.native.ts
 * - Auth (web): browser persistence via createAuth.web.ts
 * - Firestore (web): IndexedDB persistentLocalCache (multi-tab), genuinely durable
 * - Firestore (native): requested persistent, **delivered memory** — see below
 *
 * The native line used to claim "SQLite persistentLocalCache (survives app
 * restart)". It does not, and SPENDLY-1 traced the consequences. The Firebase
 * JS SDK's persistent cache is IndexedDB-only; React Native has no IndexedDB,
 * so the SDK logs "Falling back to memory cache" and carries on. Critically
 * that fallback happens lazily inside `ensureOfflineComponents` on **first
 * use**, not inside `initializeFirestore`, so the `try/catch` below never fires
 * and the mode we record here was reported as durable while being memory-only.
 *
 * Until SPENDLY-23 / AUTH-05 the native line claimed SQLite persistence
 * while the JS SDK silently fell back to memory. Native writes now go
 * through `commitMutations` (AsyncStorage outbox) before they may report
 * `queued`. Web IndexedDB is still genuinely durable.
 * `createDb` reports the truth to `setWriteQueueDurable` for any remaining
 * `commitWrite` callers that have not been moved onto the outbox.
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, type Auth } from "firebase/auth";
import {
  clearIndexedDbPersistence,
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  persistentSingleTabManager,
  terminate,
  waitForPendingWrites,
  type Firestore,
} from "firebase/firestore";
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";
import { getFunctions, type Functions } from "firebase/functions";
import { Platform } from "react-native";

import { initializeFirebaseAppCheck } from "./appCheck";
import { createAuth } from "./createAuth";
import {
  FIREBASE_EMULATOR_PORTS,
  LOCAL_TEST_PROJECT_ID,
  env,
  isFirebaseEnvConfigured,
  isLocalTestMode,
} from "./env";
import { logWarning } from "./errors";
import { setWriteQueueDurable } from "./firestoreWrite";

export type FirebaseClients = {
  configured: boolean;
  app: FirebaseApp | null;
  auth: Auth | null;
  db: Firestore | null;
  error: string | null;
  /** Human-readable offline cache mode for diagnostics */
  firestoreCacheMode:
    | "persistent-indexeddb"
    /** Persistence was requested but the RN bundle downgrades it to memory. */
    | "memory-fallback-native"
    | "memory"
    | "default"
    | "uninitialized";
  /** Auth persistence mode for Phase 1 verification */
  authPersistence: "async-storage" | "browser" | "none" | "uninitialized";
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;
let functions: Functions | null = null;
let initError: string | null = null;
let cacheMode: FirebaseClients["firestoreCacheMode"] = "uninitialized";

function createApp(): FirebaseApp {
  if (getApps().length > 0) return getApp();
  if (isLocalTestMode()) {
    // SPENDLY-175: a local test build never loads the production config. The
    // `demo-` project does not exist in Google's cloud, so even a build that
    // somehow missed the emulator could not read or write real data.
    return initializeApp({
      apiKey: "demo-api-key",
      authDomain: `${LOCAL_TEST_PROJECT_ID}.firebaseapp.com`,
      projectId: LOCAL_TEST_PROJECT_ID,
      storageBucket: `${LOCAL_TEST_PROJECT_ID}.appspot.com`,
      messagingSenderId: "0",
      appId: "demo",
    });
  }
  return initializeApp({
    apiKey: env.firebase.apiKey,
    authDomain: env.firebase.authDomain,
    projectId: env.firebase.projectId,
    storageBucket: env.firebase.storageBucket,
    messagingSenderId: env.firebase.messagingSenderId,
    appId: env.firebase.appId,
  });
}

function createDb(firebaseApp: FirebaseApp): Firestore {
  const instance = createDbInstance(firebaseApp);
  // Every instance, including the one recreated after logout, must be pointed
  // at the emulator before its first read.
  if (isLocalTestMode()) {
    connectFirestoreEmulator(instance, env.firebaseEmulatorHost, FIREBASE_EMULATOR_PORTS.firestore);
  }
  return instance;
}

function createDbInstance(firebaseApp: FirebaseApp): Firestore {
  try {
    if (Platform.OS === "web") {
      // Web: IndexedDB persistence with multi-tab support
      const instance = initializeFirestore(firebaseApp, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      });
      cacheMode = "persistent-indexeddb";
      setWriteQueueDurable(true);
      return instance;
    }
    // Native (iOS/Android): persistence is *requested* and silently downgraded
    // to memory by the SDK on first use — there is no IndexedDB to back it, and
    // the JS SDK ships no SQLite backend. The request is kept so this starts
    // working for free if that ever changes, but nothing may assume durability
    // from it. Writes do NOT survive a force-stop (KAN-112).
    const instance = initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({
        tabManager: persistentSingleTabManager({ forceOwnership: true }),
      }),
    });
    cacheMode = "memory-fallback-native";
    setWriteQueueDurable(false);
    return instance;
  } catch {
    // Fallback: in-memory cache if persistence init fails (e.g. storage full)
    const instance = initializeFirestore(firebaseApp, {
      localCache: memoryLocalCache(),
    });
    cacheMode = "memory";
    setWriteQueueDurable(false);
    return instance;
  }
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
      app = createApp();
      const testMode = isLocalTestMode();
      // App Check attests to the production project; the emulator needs none.
      if (!testMode) initializeFirebaseAppCheck(app);
      auth = createAuth(app);
      if (testMode) {
        const host = env.firebaseEmulatorHost;
        connectAuthEmulator(auth, `http://${host}:${FIREBASE_EMULATOR_PORTS.auth}`, {
          disableWarnings: true,
        });
        console.info(`[firebase] LOCAL EMULATOR MODE (${host}), project ${LOCAL_TEST_PROJECT_ID}`);
      }
      db = createDb(app);
      storage = getStorage(app);
      if (testMode) {
        connectStorageEmulator(storage, env.firebaseEmulatorHost, FIREBASE_EMULATOR_PORTS.storage);
      }
      // Same region the Ganesh functions are deployed to (functions/src/index.ts).
      functions = getFunctions(app, "asia-south1");
      initError = null;
    } catch (e) {
      initError = e instanceof Error ? e.message : String(e);
      app = null;
      auth = null;
      db = null;
      storage = null;
      functions = null;
    }
  } else if (!db) {
    // Recreate after logout terminated the previous instance (AUTH-03).
    try {
      db = createDb(app);
      initError = null;
    } catch (e) {
      initError = e instanceof Error ? e.message : String(e);
      db = null;
    }
  }

  const reportedCacheMode: FirebaseClients["firestoreCacheMode"] = !db
    ? "uninitialized"
    : cacheMode;

  const authPersistence: FirebaseClients["authPersistence"] = !auth
    ? "uninitialized"
    : Platform.OS === "web"
      ? "browser"
      : "async-storage";

  return {
    configured: true,
    app,
    auth,
    db,
    error: initError,
    firestoreCacheMode: reportedCacheMode,
    authPersistence,
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

/**
 * Callable functions. Unused for Ganesh summary (KAN-36 uses the Netlify
 * `ganesh-summary` function). Kept for any future Firebase callables.
 */
export function getFirebaseFunctions(): Functions | null {
  getFirebaseClients();
  return functions;
}

const PENDING_WRITES_TIMEOUT_MS = 8000;

/**
 * Stop listeners and drop the local cache so the next account cannot read
 * the previous user's ledger from IndexedDB (web) or the in-memory cache
 * (native, same JS session).
 *
 * The terminated instance cannot be reused; `getFirestoreDb()` creates a
 * new one. On web, a reload after this is the surest way to drop React
 * state that still holds snapshot data.
 */
export async function recycleFirestoreAfterLogout(): Promise<void> {
  if (!db) return;
  const instance = db;
  db = null;
  cacheMode = "uninitialized";
  setWriteQueueDurable(false);
  try {
    await terminate(instance);
  } catch (error) {
    logWarning("firebase.terminate", error);
  }
  if (Platform.OS === "web") {
    try {
      await clearIndexedDbPersistence(instance);
    } catch (error) {
      // failed-precondition when another tab still holds the database.
      logWarning("firebase.clearIndexedDbPersistence", error);
    }
  }
}

export async function waitForPendingWritesOrTimeout(database: Firestore): Promise<void> {
  try {
    await Promise.race([
      waitForPendingWrites(database),
      new Promise<void>((_, reject) => {
        setTimeout(
          () => reject(new Error("waitForPendingWrites timed out")),
          PENDING_WRITES_TIMEOUT_MS
        );
      }),
    ]);
  } catch (error) {
    logWarning("firebase.waitForPendingWrites", error);
  }
}
