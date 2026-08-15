import type { User } from "firebase/auth";

import { friendlyErrorMessage } from "./errors";

/**
 * Map Firebase (or unknown) errors to a user-facing string.
 *
 * Delegates to `friendlyErrorMessage`, which resolves `auth/*` codes to plain
 * language. Previously this returned `error.message` verbatim, which surfaced
 * strings like `Firebase: Error (auth/invalid-credential).` in a toast.
 */
export function authErrorMessage(error: unknown, fallback: string): string {
  return friendlyErrorMessage(error, fallback);
}

/**
 * Proxied Firebase user whose `uid` is `${real.uid}_duress`.
 * Keeps other User fields/prototype behavior for Auth consumers.
 */
export function createDuressUser(real: User): User {
  const duressUser = Object.create(real) as User;
  Object.defineProperty(duressUser, "uid", {
    get: () => `${real.uid}_duress`,
    enumerable: true,
  });
  return duressUser;
}
