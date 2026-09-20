/**
 * HTTP contract for account deletion — SPENDLY-7 (AUTH-06).
 *
 * Google Play requires an in-app path to delete an account. Deleting one here
 * means deleting a `users/{uid}` tree with ~45 subcollections, the `_duress`
 * decoy tree beside it, every shared document the person created, and their
 * membership of every Pandal — none of which a client can do, because
 * `firestore.rules` rightly refuses most of it. So an Admin SDK function does
 * the work and this module is the contract between the two halves.
 *
 * Cloud Functions need Blaze and this project is on Spark (KAN-67), so the
 * trusted writer lives on Netlify, like `ganesh-draw` and `epf-cron`.
 *
 * ## Why this is phased
 *
 * Netlify's synchronous functions have a low timeout and `recursiveDelete` has
 * no cursor. A big account cannot be deleted in one call, so the function does
 * one {@link DeletePhase} per invocation and the client loops. Every phase is
 * idempotent and delete-if-present, so a call that dies halfway is an ordinary
 * retry rather than a corrupted half-state.
 */

/**
 * The order deletion happens in. **`auth` is deliberately last.**
 *
 * Once the Firebase Auth user is gone the client can never mint another ID
 * token, so the function can never again be authorised to finish the job — any
 * residue would be orphaned permanently with no operator-free way to reach it.
 * Every earlier phase, if it fails, leaves a still-signed-in user who can press
 * the button again and resume.
 *
 * `shared` is first for the opposite reason: those are the only documents
 * *other people* can see. If deletion stalls forever after phase one, the
 * friend-visible splits carrying this person's name, photo and UPI id are gone
 * and only their own private data remains — which is the right way round.
 */
export const DELETE_PHASES = [
  "shared",
  "ganesh",
  "user-tree",
  "duress-tree",
  "auth",
  "complete",
] as const;

export type DeletePhase = (typeof DELETE_PHASES)[number];

/**
 * How stale a login may be and still authorise a deletion.
 *
 * Checked server-side against `auth_time` in the verified ID token, which
 * Firebase stamps when a credential is presented and a client cannot forge.
 * `lib/reauthenticate.ts` is the UX that makes this passable; this is what
 * actually enforces it.
 */
export const REAUTH_MAX_AGE_SEC = 300;

/** Literal a caller must send. A stray retry cannot start a deletion on its own. */
export const DELETE_CONFIRM_TOKEN = "DELETE";

export type DeleteAccountRequest = {
  confirm: typeof DELETE_CONFIRM_TOKEN;
  /** Omitted on the first call. */
  phase?: DeletePhase;
  /** Phase-local resume point. */
  cursor?: string | null;
};

export type DeleteCounts = {
  splits: number;
  paymentRequests: number;
  splitPublicShares: number;
  vaults: number;
  userCollections: number;
  memberships: number;
};

export type DeleteAccountResponse = {
  done: boolean;
  /** The phase to send back next. `complete` when `done`. */
  phase: DeletePhase;
  cursor: string | null;
  deleted: DeleteCounts;
  /** Pandals left with no admin because this person was the last one. */
  orphanedPandals: string[];
  /** Vaults skipped because someone else is still a member. */
  skippedSharedVaults: string[];
  /** Documents that could not be deleted after retries. */
  failedPaths: string[];
  elapsedMs: number;
};

export const EMPTY_DELETE_COUNTS: DeleteCounts = {
  splits: 0,
  paymentRequests: 0,
  splitPublicShares: 0,
  vaults: 0,
  userCollections: 0,
  memberships: 0,
};

export function deleteAccountFunctionUrl(origin: string): string {
  const base = origin.replace(/\/$/, "");
  return base ? `${base}/.netlify/functions/delete-account` : "";
}

/** The phase that follows this one. The whole ordering, in one pure place. */
export function nextDeletePhase(phase: DeletePhase): DeletePhase {
  const index = DELETE_PHASES.indexOf(phase);
  if (index < 0 || index >= DELETE_PHASES.length - 1) return "complete";
  return DELETE_PHASES[index + 1];
}

export function isDeletePhase(value: unknown): value is DeletePhase {
  return (
    typeof value === "string" &&
    (DELETE_PHASES as readonly string[]).includes(value)
  );
}

/**
 * Whether a login is recent enough to authorise deletion.
 *
 * `authTimeSec` comes from the verified token. A missing or zero value fails —
 * an absent claim must never read as "fresh". A clock skew that puts the login
 * slightly in the future is treated as fresh rather than rejected, since that
 * is a server/device clock artefact and not evidence of staleness.
 */
export function isReauthFresh(
  authTimeSec: number | undefined,
  nowMs: number,
  maxAgeSec: number = REAUTH_MAX_AGE_SEC,
): boolean {
  if (typeof authTimeSec !== "number" || !Number.isFinite(authTimeSec)) {
    return false;
  }
  if (authTimeSec <= 0) return false;
  const ageSec = Math.floor(nowMs / 1000) - authTimeSec;
  if (ageSec < 0) return true;
  return ageSec <= maxAgeSec;
}

export type ParsedDeleteRequest =
  | { ok: true; phase: DeletePhase; cursor: string | null }
  | { ok: false; error: string };

/**
 * Validate an incoming request.
 *
 * The confirmation token is required on **every** call, resumes included: a
 * proxy or client retry must not be able to begin a deletion by itself.
 */
export function parseDeleteRequest(body: unknown): ParsedDeleteRequest {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid request body." };
  }
  const input = body as Partial<DeleteAccountRequest>;
  if (input.confirm !== DELETE_CONFIRM_TOKEN) {
    return { ok: false, error: "Missing confirmation." };
  }
  if (input.phase !== undefined && !isDeletePhase(input.phase)) {
    return { ok: false, error: "Unknown phase." };
  }
  const cursor =
    typeof input.cursor === "string" && input.cursor ? input.cursor : null;
  return { ok: true, phase: input.phase ?? "shared", cursor };
}

/** What the user is told while a phase runs. */
export function deletePhaseLabel(phase: DeletePhase): string {
  switch (phase) {
    case "shared":
      return "Removing shared data…";
    case "ganesh":
      return "Leaving Pandals…";
    case "user-tree":
      return "Deleting your data…";
    case "duress-tree":
      return "Deleting hidden data…";
    case "auth":
      return "Closing your account…";
    case "complete":
      return "Done.";
  }
}
