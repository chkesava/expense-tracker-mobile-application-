import AsyncStorage from "@react-native-async-storage/async-storage";
import type { FirebaseApp } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  // @ts-expect-error RN Auth exports this; web typings omit it
  getReactNativePersistence,
  type Auth,
} from "firebase/auth";

/**
 * Native Auth must use AsyncStorage persistence or Firebase warns
 * and sessions stay in-memory only.
 */
export function createAuth(firebaseApp: FirebaseApp): Auth {
  try {
    return initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    // Auth already initialized (Fast Refresh) — safe; no second warn if persistence was set.
    return getAuth(firebaseApp);
  }
}
