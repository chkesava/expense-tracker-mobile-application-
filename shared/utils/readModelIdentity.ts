import { isDuressUid } from "./duress";

/**
 * SPENDLY-505 — identity for the Supabase read model (ADR §7, option 1).
 *
 * Supabase third-party auth accepts the app's Firebase ID token, but maps it
 * to the `authenticated` Postgres role only when the token carries the custom
 * claim `role: "authenticated"`. Without Blaze no auth trigger can set it, so
 * the Netlify function `readmodel-claims` sets it once per user, and the app
 * then refreshes its token. Row access itself is decided by RLS
 * (supabase-readmodel migration 20261022000000).
 */

/** The custom claim value Supabase maps to the `authenticated` role. */
export const READ_MODEL_ROLE = "authenticated";

/** Firebase rejects custom claims payloads larger than this (bytes of JSON). */
export const MAX_CUSTOM_CLAIMS_BYTES = 1000;

export function readModelClaimsFunctionUrl(origin: string): string {
  const base = origin.replace(/\/$/, "");
  return base ? `${base}/.netlify/functions/readmodel-claims` : "";
}

/** True when decoded token claims already map to the `authenticated` role. */
export function hasReadModelRole(claims: Record<string, unknown> | null | undefined): boolean {
  return claims?.role === READ_MODEL_ROLE;
}

/**
 * The custom claims to store so the user gets the role, keeping every claim
 * they already have. Null when nothing needs writing (idempotent).
 */
export function claimsWithReadModelRole(
  existing: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (hasReadModelRole(existing)) return null;
  const next = { ...(existing ?? {}), role: READ_MODEL_ROLE };
  // Firebase's limit is bytes of the serialized JSON, not UTF-16 characters.
  if (new TextEncoder().encode(JSON.stringify(next)).length > MAX_CUSTOM_CLAIMS_BYTES) {
    throw new Error("Custom claims would exceed Firebase's 1000-byte limit.");
  }
  return next;
}

/** `Bearer <token>` → token, or "" for anything else. */
export function bearerToken(authorization: string | null | undefined): string {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization ?? "");
  return match ? match[1] : "";
}

export type ReadModelAccess =
  | "ok"
  /** EXPO_PUBLIC_READMODEL_SUPABASE_* not set in this build. */
  | "not-configured"
  /** Local test build: only the Firebase emulator may be reached. */
  | "test-mode"
  | "signed-out"
  /**
   * A duress session runs under the real Firebase user, so its token would
   * read the real rows. It gets no read-model access; screens use Firestore,
   * which already points at the decoy tree.
   */
  | "duress";

/**
 * Whether the app may use the read model for this session. `uid` is the Auth
 * context user (the duress proxy's uid in a duress session), never realUser.
 */
export function readModelAccess(input: {
  configured: boolean;
  localTestMode: boolean;
  uid: string | null | undefined;
}): ReadModelAccess {
  if (!input.configured) return "not-configured";
  if (input.localTestMode) return "test-mode";
  if (!input.uid) return "signed-out";
  if (isDuressUid(input.uid)) return "duress";
  return "ok";
}
