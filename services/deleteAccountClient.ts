/**
 * Driving the account-deletion function to completion — SPENDLY-7 (AUTH-06).
 *
 * The function does one phase per invocation because Netlify's synchronous
 * timeout cannot cover a whole account, so someone has to loop. That someone is
 * here.
 *
 * Every phase is idempotent and delete-if-present, which is what makes retrying
 * safe: a call that times out mid-phase has still deleted whatever it got to,
 * and the next call picks up from the state it left rather than from a cursor
 * it has to be trusted with.
 */

import {
  DELETE_CONFIRM_TOKEN,
  deleteAccountFunctionUrl,
  EMPTY_DELETE_COUNTS,
  type DeleteAccountResponse,
  type DeletePhase,
} from "@/shared/utils/deleteAccountRemote";
import { getPublicAppOrigin } from "@/shared/utils/paymentRequestUrl";
import { assertNetworkAllowed } from "@/lib/networkGuard";

/** Guard against a server that never reports `done`. */
const MAX_CALLS = 60;
/** Consecutive failures tolerated before giving up. */
const MAX_RETRIES_PER_PHASE = 3;

export class ReauthRequiredError extends Error {
  constructor() {
    super("Confirm it is you first.");
    this.name = "ReauthRequiredError";
  }
}

type DeletePayload = DeleteAccountResponse & { error?: string; code?: string };

export type DeleteAccountDeps = {
  /** Injected so the loop is testable without Firebase or a network. */
  fetchFn?: typeof fetch;
  idToken?: () => Promise<string>;
  origin?: string;
};

async function defaultIdToken(): Promise<string> {
  const { getFirebaseAuth } = await import("@/lib/firebase");
  const user = getFirebaseAuth()?.currentUser;
  if (!user) throw new Error("Sign in first.");
  // Forced: the cached token still carries the pre-re-auth `auth_time`, and
  // that claim is what the server checks.
  return user.getIdToken(true);
}

/**
 * Run every phase, reporting progress as it goes.
 *
 * Resolves only when the server says `done`. Throws {@link ReauthRequiredError}
 * when the login went stale mid-run, so the caller can send the user back to
 * the re-auth step rather than showing a generic failure.
 */
export async function runAccountDeletion(
  onProgress: (response: DeleteAccountResponse) => void,
  deps: DeleteAccountDeps = {},
): Promise<DeleteAccountResponse> {
  const url = deleteAccountFunctionUrl(deps.origin ?? getPublicAppOrigin());
  if (!url) {
    throw new Error("Cannot reach the server. Deleting an account needs a connection.");
  }
  const doFetch = deps.fetchFn ?? fetch;
  // Deleting an account runs firebase-admin against production: never from a
  // local test build (SPENDLY-175).
  assertNetworkAllowed(url);
  const getToken = deps.idToken ?? defaultIdToken;

  let phase: DeletePhase = "shared";
  let cursor: string | null = null;
  let retries = 0;
  let calls = 0;

  // Accumulated across phases: each response reports only its own invocation.
  let totals: DeleteAccountResponse = {
    done: false,
    phase,
    cursor: null,
    deleted: { ...EMPTY_DELETE_COUNTS },
    orphanedPandals: [],
    skippedSharedVaults: [],
    failedPaths: [],
    elapsedMs: 0,
  };

  while (calls < MAX_CALLS) {
    calls += 1;
    let payload: DeletePayload | null = null;
    let status = 0;

    try {
      const token = await getToken();
      const response = await doFetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirm: DELETE_CONFIRM_TOKEN, phase, cursor }),
      });
      status = response.status;
      payload = (await response.json().catch(() => ({}))) as DeletePayload;
    } catch {
      // Network-level failure; fall through to the retry budget below.
      payload = null;
    }

    if (status === 401 && payload?.code === "reauth-required") {
      // Not retryable: only the user can fix this, by confirming again.
      throw new ReauthRequiredError();
    }

    if (status !== 200 || !payload) {
      retries += 1;
      if (retries > MAX_RETRIES_PER_PHASE) {
        // The reassurance leads, always. On a failed deletion the first thing
        // someone needs to know is that they still have an account; the
        // server's own message is context after that, not instead of it.
        const detail = payload?.error ? ` (${payload.error})` : "";
        throw new Error(
          `Deletion stopped during "${phase}". Your account is still active — try again in a few minutes.${detail}`,
        );
      }
      continue;
    }

    retries = 0;
    totals = {
      ...payload,
      deleted: {
        splits: totals.deleted.splits + (payload.deleted?.splits ?? 0),
        paymentRequests:
          totals.deleted.paymentRequests + (payload.deleted?.paymentRequests ?? 0),
        splitPublicShares:
          totals.deleted.splitPublicShares + (payload.deleted?.splitPublicShares ?? 0),
        vaults: totals.deleted.vaults + (payload.deleted?.vaults ?? 0),
        userCollections:
          totals.deleted.userCollections + (payload.deleted?.userCollections ?? 0),
        memberships: totals.deleted.memberships + (payload.deleted?.memberships ?? 0),
      },
      orphanedPandals: [
        ...totals.orphanedPandals,
        ...(payload.orphanedPandals ?? []),
      ],
      skippedSharedVaults: [
        ...totals.skippedSharedVaults,
        ...(payload.skippedSharedVaults ?? []),
      ],
      failedPaths: [...totals.failedPaths, ...(payload.failedPaths ?? [])],
      elapsedMs: totals.elapsedMs + (payload.elapsedMs ?? 0),
    };
    onProgress(totals);

    if (payload.done) return totals;
    phase = payload.phase;
    cursor = payload.cursor ?? null;
  }

  throw new Error(
    "Deletion did not finish. Your account is still active — try again in a few minutes.",
  );
}
