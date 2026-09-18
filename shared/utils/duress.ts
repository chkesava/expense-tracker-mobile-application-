/**
 * The duress-uid convention, in one place — SPENDLY-20.
 *
 * Duress mode proxies the signed-in user as `${uid}_duress` so the decoy tree
 * lives under a sibling document and can never bleed into the real one
 * (BUG-004, `lib/duressPath.contract.test.ts`). The suffix was a bare string
 * literal in `lib/authHelpers.ts` and four `services/sms/*` guards; the EPF
 * cron needs the same rule server-side to stop sweeping decoy trees, and a
 * sixth copy of a security-relevant literal is not something to add.
 *
 * Deliberately zero-import: this module is pulled into the Netlify CJS bundle
 * by `scripts/bundle-netlify-fns.js`, and anything ESM-only reaching that
 * bundle reproduces the KAN-36 `ERR_REQUIRE_ESM` crash. `lib/authHelpers.ts`
 * could not be reused for exactly that reason — it imports `firebase/auth`.
 *
 * `firestore.rules` carries its own literal (`request.auth.uid + '_duress'`)
 * and cannot import this; the contract test pins the two together.
 */

/** Appended to the real uid to address the duress tree. */
export const DURESS_UID_SUFFIX = "_duress";

/** The duress uid for a real uid. */
export function duressUid(realUid: string): string {
  return `${realUid}${DURESS_UID_SUFFIX}`;
}

/**
 * Whether a uid addresses a duress tree.
 *
 * A suffix test, not a substring one: `abc_duressx` is somebody's real uid.
 */
export function isDuressUid(uid: string | null | undefined): boolean {
  return typeof uid === "string" && uid.endsWith(DURESS_UID_SUFFIX);
}
