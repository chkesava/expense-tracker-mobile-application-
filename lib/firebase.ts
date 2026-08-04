/**
 * Firebase Auth + Firestore bootstrap for Expo.
 *
 * Offline strategy (Phase 1):
 * - Web: IndexedDB persistentLocalCache (parity with Vite app).
 * - Native: memoryLocalCache — durable RN offline requires either
 *   @react-native-firebase/firestore or an IndexedDB polyfill in a later phase.
 * Auth session persistence (AsyncStorage) is deferred to Phase 2 with Authentication UI.
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { Platform } from "react-native";

import { env, isFirebaseEnvConfigured } from "./env";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let initError: string | null = null;

function createApp(): FirebaseApp {
  if (getApps().length > 0) return getApp();
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
  try {
    if (Platform.OS === "web") {
      return initializeFirestore(firebaseApp, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      });
    }
    return initializeFirestore(firebaseApp, {
      localCache: memoryLocalCache(),
    });
  } catch {
    return getFirestore(firebaseApp);
  }
}

export type FirebaseClients = {
  configured: boolean;
  app: FirebaseApp | null;
  auth: Auth | null;
  db: Firestore | null;
  error: string | null;
  /** Human-readable offline cache mode for diagnostics */
  firestoreCacheMode: "persistent-indexeddb" | "memory" | "default" | "uninitialized";
};

export function getFirebaseClients(): FirebaseClients {
  if (!isFirebaseEnvConfigured()) {
    return {
      configured: false,
      app: null,
      auth: null,
      db: null,
      error: "Missing EXPO_PUBLIC_FIREBASE_* environment variables",
      firestoreCacheMode: "uninitialized",
    };
  }

  if (!app) {
    try {
      app = createApp();
      auth = getAuth(app);
      db = createDb(app);
      initError = null;
    } catch (e) {
      initError = e instanceof Error ? e.message : String(e);
      app = null;
      auth = null;
      db = null;
    }
  }

  const cacheMode: FirebaseClients["firestoreCacheMode"] = !db
    ? "uninitialized"
    : Platform.OS === "web"
      ? "persistent-indexeddb"
      : "memory";

  return {
    configured: true,
    app,
    auth,
    db,
    error: initError,
    firestoreCacheMode: cacheMode,
  };
}

/** Convenience accessors — null when env is incomplete or init failed. */
export function getFirebaseAuth(): Auth | null {
  return getFirebaseClients().auth;
}

export function getFirestoreDb(): Firestore | null {
  return getFirebaseClients().db;
}
