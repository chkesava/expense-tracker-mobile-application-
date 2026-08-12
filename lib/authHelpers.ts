import type { User } from "firebase/auth";

/** Map Firebase (or unknown) errors to a user-facing string. */
export function authErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: string }).message || fallback);
  }
  return fallback;
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
