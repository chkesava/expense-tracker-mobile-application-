import type { User } from "firebase/auth";

import { duressUid } from "@/shared/utils/duress";

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
 * Fields that must not survive into duress mode — SPENDLY-22 (AUTH-04).
 *
 * `Object.create(real)` inherits everything it does not override, so the proxy
 * used to carry the real `displayName` and `email` straight through. They were
 * rendered on the Spendly profile and side drawer, on Nutrition's profile
 * screen, and — worse — stamped onto split and payment-request documents
 * *created inside the duress tree*. A duress vault that shows the victim's
 * name and address defeats the entire feature.
 */
const DURESS_MASKED_FIELDS = [
  "displayName",
  "email",
  "photoURL",
  "phoneNumber",
] as const;

/**
 * Proxied Firebase user whose `uid` is `${real.uid}_duress`.
 *
 * Still `Object.create(real)`, deliberately: consumers may call `User`
 * prototype methods such as `getIdToken`, and a plain object would break them
 * at a distance. Identity is shadowed with own getters instead.
 */
/** Token refresh keeps the same uid — listeners must not remount. */
export function shouldIgnoreAuthUidChange(
  observedUid: string | null | undefined,
  nextUid: string | null
): boolean {
  return observedUid === nextUid;
}

export function createDuressUser(real: User): User {
  const duressUser = Object.create(real) as User;
  Object.defineProperty(duressUser, "uid", {
    get: () => duressUid(real.uid),
    enumerable: true,
  });
  for (const field of DURESS_MASKED_FIELDS) {
    Object.defineProperty(duressUser, field, {
      get: () => null,
      enumerable: true,
    });
  }
  // A duress session is not a verified identity and has no linked providers.
  Object.defineProperty(duressUser, "emailVerified", {
    get: () => false,
    enumerable: true,
  });
  Object.defineProperty(duressUser, "providerData", {
    get: () => [],
    enumerable: true,
  });
  return duressUser;
}
