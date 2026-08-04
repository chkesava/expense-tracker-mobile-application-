/**
 * Fallback for TypeScript resolution (Metro picks .native / .web at runtime).
 * Defaults to the native AsyncStorage path used by Expo Go / Android / iOS.
 */
export { createAuth } from "./createAuth.native";
