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
 * - When the read model isn't configured on this site, there is nothing this
 *   function can reach. The phase reports `configured: false` and moves on; the
 *   sync's orphan check (SPENDLY-508) then flags any rows left behind.
 */

export type PurgeEnv = { url?: string; serviceRoleKey?: string };
export type PurgeResult = { configured: false } | { configured: true; rows: number };
type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export function readModelPurgeEnv(env: NodeJS.ProcessEnv = process.env): PurgeEnv {
  return { url: env.READMODEL_SUPABASE_URL?.trim(), serviceRoleKey: env.READMODEL_SUPABASE_SERVICE_ROLE_KEY?.trim() };
}

export async function purgeReadModel(uid: string, env: PurgeEnv, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<PurgeResult> {
  if (!env.url || !env.serviceRoleKey) return { configured: false };
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
  const body = (await response.json().catch(() => ({}))) as { rows?: unknown };
  return { configured: true, rows: Number(body.rows ?? 0) || 0 };
}
