/**
 * Firebase Auth + Firestore bootstrap for Expo.
 *
 * Offline strategy:
 * - Auth (native): AsyncStorage via createAuth.native.ts
 * - Auth (web): browser persistence via createAuth.web.ts
 * - Firestore (web): IndexedDB persistentLocalCache (multi-tab)
 * - Firestore (native): SQLite persistentLocalCache (survives app restart)
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import type { Auth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  persistentSingleTabManager,
  type Firestore,
} from "firebase/firestore";
import { Platform } from "react-native";

import { createAuth } from "./createAuth";
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
      // Web: IndexedDB persistence with multi-tab support
      return initializeFirestore(firebaseApp, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      });
    }
    // Native (iOS/Android): SQLite-backed persistent cache
    // Survives app restarts. Writes queued offline replay automatically.
    return initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({
        tabManager: persistentSingleTabManager({ forceOwnership: true }),
      }),
    });
  } catch {
    // Fallback: in-memory cache if persistence init fails (e.g. storage full)
    return initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache(),
    });
  }
}

export type FirebaseClients = {
  configured: boolean;
  app: FirebaseApp | null;
  auth: Auth | null;
  db: Firestore | null;
  error: string | null;
  /** Human-readable offline cache mode for diagnostics */
  firestoreCacheMode:
    | "persistent-indexeddb"
    | "persistent-sqlite"
    | "memory"
    | "default"
    | "uninitialized";
  /** Auth persistence mode for Phase 1 verification */
  authPersistence: "async-storage" | "browser" | "none" | "uninitialized";
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
      authPersistence: "uninitialized",
    };
  }

  if (!app) {
    try {
      app = createApp();
      auth = createAuth(app);
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
      : "persistent-sqlite";

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
    firestoreCacheMode: cacheMode,
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
