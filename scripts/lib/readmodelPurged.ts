import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * SPENDLY-520 — which accounts were erased by `readmodel_purge_user`, in one
 * query per 200 accounts instead of one RPC per account (PR #234 review).
 *
 * `purged_users` stores only `encode(sha256(uid), 'hex')`
 * (`readmodel_uid_hash`, migration 20261024000000), so the hashes are
 * computed here the same way and matched in batches. Service role only: the
 * table has no client grants.
 */
export function readModelUidHash(uid: string): string {
  return createHash("sha256").update(uid, "utf8").digest("hex");
}

const CHUNK = 200;

export async function purgedUidsBatch(client: SupabaseClient, uids: string[]): Promise<Set<string>> {
  const byHash = new Map(uids.map((uid) => [readModelUidHash(uid), uid]));
  const hashes = [...byHash.keys()];
  const out = new Set<string>();
  for (let i = 0; i < hashes.length; i += CHUNK) {
    const { data, error } = await client.from("purged_users").select("uid_hash").in("uid_hash", hashes.slice(i, i + CHUNK));
    if (error) throw new Error(`purged_users: ${error.message}`);
    for (const row of (data ?? []) as { uid_hash: string }[]) {
      const uid = byHash.get(row.uid_hash);
      if (uid) out.add(uid);
    }
  }
  return out;
}
