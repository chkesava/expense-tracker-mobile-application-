/**
 * SPENDLY-508 — erase an account from the Supabase read model during account
 * deletion (the `readmodel` phase of delete-account, before Auth is deleted).
 *
 * Calls `readmodel_purge_user(uid)` (migration 20261024000000) through
 * PostgREST with the service-role key, which lives only in this site's
 * environment. The purge is idempotent; it also marks the account purged so a
 * late sync can't bring it back.
 *
 * - A failed call throws: the phase fails, the client retries it, and Auth is
 *   never deleted before the read model is clean.
 * - **Fails closed** (PR #234 review): if the site lacks the read-model
 *   settings, it throws a retryable error instead of skipping. Skipping would
 *   delete the login while the person's financial data stayed in Supabase until
 *   someone purged it by hand. Set `READMODEL_SUPABASE_URL` and
 *   `READMODEL_SUPABASE_SERVICE_ROLE_KEY` on the Netlify site before deploying
 *   this, or account deletion stops at this phase until they are set.
 */

export type PurgeEnv = { url?: string; serviceRoleKey?: string };
export type PurgeResult = { rows: number };

/** Shown to the person deleting their account; no configuration detail. */
export const PURGE_NOT_CONFIGURED_MESSAGE =
  "Account deletion is paused while we finish a setup step. Nothing was lost; please try again later.";

export class ReadModelPurgeNotConfigured extends Error {
  constructor() {
    super(PURGE_NOT_CONFIGURED_MESSAGE);
    this.name = "ReadModelPurgeNotConfigured";
  }
}
type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export function readModelPurgeEnv(env: NodeJS.ProcessEnv = process.env): PurgeEnv {
  return { url: env.READMODEL_SUPABASE_URL?.trim(), serviceRoleKey: env.READMODEL_SUPABASE_SERVICE_ROLE_KEY?.trim() };
}

export async function purgeReadModel(uid: string, env: PurgeEnv, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<PurgeResult> {
  if (!env.url || !env.serviceRoleKey) throw new ReadModelPurgeNotConfigured();
  const response = await fetchImpl(`${env.url.replace(/\/$/, "")}/rest/v1/rpc/readmodel_purge_user`, {
    method: "POST",
    headers: {
      apikey: env.serviceRoleKey,
      Authorization: `Bearer ${env.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_uid: uid }),
  });
  if (!response.ok) {
    // No response body in the message: keep provider detail out of the client.
    throw new Error(`Could not erase the reporting copy (HTTP ${response.status}). Try again.`);
  }
  // PR #234 review: a 2xx alone doesn't prove the purge ran. Accept only the
  // function's contract, `{ rows: <non-negative integer>, tables: {…} }`
  // (`{ rows: 0, … }` is the idempotent repeat). Anything else throws, so the
  // phase is retried and Auth is never deleted on an unproven purge.
  const body = await response.json().catch(() => null);
  return { rows: purgeRowsFromBody(body) };
}

const INVALID_RESPONSE = "Could not erase the reporting copy (invalid response). Try again.";

export function purgeRowsFromBody(body: unknown): number {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error(INVALID_RESPONSE);
  const { rows, tables } = body as { rows?: unknown; tables?: unknown };
  if (typeof rows !== "number" || !Number.isSafeInteger(rows) || rows < 0) throw new Error(INVALID_RESPONSE);
  if (!tables || typeof tables !== "object" || Array.isArray(tables)) throw new Error(INVALID_RESPONSE);
  return rows;
}
