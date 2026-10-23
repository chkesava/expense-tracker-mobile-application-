import type { SupabaseClient } from "@supabase/supabase-js";

import {
  hasReadModelRole,
  readModelAccess,
  readModelClaimsFunctionUrl,
  type ReadModelAccess,
} from "@/shared/utils/readModelIdentity";

/**
 * SPENDLY-505 — the Supabase client for the read model.
 *
 * Every request carries the signed-in user's Firebase ID token (supabase-js
 * `accessToken`), which Supabase verifies against Firebase; RLS then returns
 * only that uid's rows. There is no Supabase session and no key beyond the
 * publishable one.
 *
 * `connect` returns null whenever the read model must not or cannot be used:
 * not configured, a local test build, signed out, a duress session, or the
 * role claim could not be obtained. Callers (the SPENDLY-511 read path) treat
 * null as "use Firestore".
 */

/** The subset of a Firebase `User` this needs. Pass the Auth context `user`. */
export type ReadModelUser = {
  uid: string;
  getIdToken(forceRefresh?: boolean): Promise<string>;
  getIdTokenResult(forceRefresh?: boolean): Promise<{ claims: Record<string, unknown> }>;
};

export type ReadModelConnectorDeps = {
  configured: boolean;
  localTestMode: boolean;
  url: string;
  publishableKey: string;
  /** Origin hosting the Netlify functions. */
  origin: string;
  fetch: (url: string, init: { method: string; headers: Record<string, string> }) => Promise<{ ok: boolean }>;
  createClient: (
    url: string,
    key: string,
    options: { accessToken: () => Promise<string | null> }
  ) => SupabaseClient;
  log?: (event: string, detail: unknown) => void;
};

export type ReadModelConnection = { access: ReadModelAccess | "no-role"; client: SupabaseClient | null };

export function createReadModelConnector(deps: ReadModelConnectorDeps) {
  let cached: { uid: string; client: SupabaseClient } | null = null;

  /** Ensures the token carries the role claim, asking the server once if not. */
  async function ensureRole(user: ReadModelUser): Promise<boolean> {
    if (hasReadModelRole((await user.getIdTokenResult()).claims)) return true;
    const url = readModelClaimsFunctionUrl(deps.origin);
    if (!url) return false;
    const token = await user.getIdToken();
    const response = await deps.fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    if (!response.ok) return false;
    // The claim is only in tokens minted after it was set.
    return hasReadModelRole((await user.getIdTokenResult(true)).claims);
  }

  async function connect(user: ReadModelUser | null): Promise<ReadModelConnection> {
    const access = readModelAccess({
      configured: deps.configured,
      localTestMode: deps.localTestMode,
      uid: user?.uid,
    });
    if (access !== "ok" || !user) {
      cached = null;
      return { access, client: null };
    }
    if (cached?.uid === user.uid) return { access, client: cached.client };

    let hasRole = false;
    try {
      hasRole = await ensureRole(user);
    } catch (error) {
      deps.log?.("readModel.claims", error);
    }
    if (!hasRole) return { access: "no-role", client: null };

    const client = deps.createClient(deps.url, deps.publishableKey, {
      // Firebase refreshes an expiring token itself; a revoked or signed-out
      // user's token stops working within its lifetime (at most one hour).
      accessToken: () => user.getIdToken(),
    });
    cached = { uid: user.uid, client };
    return { access, client };
  }

  return { connect };
}

let defaultConnector: ReturnType<typeof createReadModelConnector> | null = null;

/** The app's read-model connection for the Auth context `user`. */
export async function connectReadModel(user: ReadModelUser | null): Promise<ReadModelConnection> {
  if (!defaultConnector) {
    const [{ env, isLocalTestMode, isReadModelEnvConfigured }, { createClient }, { getPublicAppOrigin }, { assertNetworkAllowed }, { logError }] =
      await Promise.all([
        import("@/lib/env"),
        import("@supabase/supabase-js"),
        import("@/shared/utils/paymentRequestUrl"),
        import("@/lib/networkGuard"),
        import("@/lib/errors"),
      ]);
    defaultConnector = createReadModelConnector({
      configured: isReadModelEnvConfigured(),
      localTestMode: isLocalTestMode(),
      url: env.readModel.url,
      publishableKey: env.readModel.publishableKey,
      origin: getPublicAppOrigin(),
      fetch: (url, init) => {
        assertNetworkAllowed(url);
        return fetch(url, init);
      },
      // With `accessToken`, supabase-js keeps no session of its own.
      createClient: (url, key, options) => createClient(url, key, { accessToken: options.accessToken }),
      log: (event, detail) => logError(event, detail),
    });
  }
  return defaultConnector.connect(user);
}
