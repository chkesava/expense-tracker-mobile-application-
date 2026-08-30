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
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  persistentSingleTabManager,
  type Firestore,
} from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { Platform } from "react-native";

import { createAuth } from "./createAuth";
import { env, isFirebaseEnvConfigured } from "./env";

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

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;
let initError: string | null = null;
let cacheMode: FirebaseClients["firestoreCacheMode"] = "uninitialized";

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
      const instance = initializeFirestore(firebaseApp, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      });
      cacheMode = "persistent-indexeddb";
      return instance;
    }
    // Native (iOS/Android): SQLite-backed persistent cache
    // Survives app restarts. Writes queued offline replay automatically.
    const instance = initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({
        tabManager: persistentSingleTabManager({ forceOwnership: true }),
      }),
    });
    cacheMode = "persistent-sqlite";
    return instance;
  } catch {
    // Fallback: in-memory cache if persistence init fails (e.g. storage full)
    const instance = initializeFirestore(firebaseApp, {
      localCache: memoryLocalCache(),
    });
    cacheMode = "memory";
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
      auth = createAuth(app);
      db = createDb(app);
      storage = getStorage(app);
      initError = null;
    } catch (e) {
      initError = e instanceof Error ? e.message : String(e);
      app = null;
      auth = null;
      db = null;
      storage = null;
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
