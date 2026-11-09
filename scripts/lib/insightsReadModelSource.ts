/**
 * SPENDLY-747 — `insights-daily`'s read-model source (logic:
 * insightsDailyCore.ts). Service role, read only. The copy only says who has
 * changed inputs (the newest `synced_at` across the input tables, tombstones
 * included); the inputs themselves are read from Firestore.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { allRows, tableOf } from "./billReadModelSource";
import { INSIGHT_INPUT_COLLECTIONS } from "./insightsDailyCore";

export function supabaseInsightsReadModel(client: SupabaseClient) {
  return {
    async listOwners(): Promise<string[]> {
      const rows = await allRows((a, b) =>
        client.from(tableOf("userSettings")).select("uid, doc_id").eq("source_deleted", false).order("uid").range(a, b)
      );
      return [...new Set(rows.map((r) => r.uid))];
    },
    async inputsSyncedAt(uid: string): Promise<string | null> {
      let newest: string | null = null;
      for (const collection of INSIGHT_INPUT_COLLECTIONS) {
        const { data, error } = await client
          .from(tableOf(collection))
          .select("synced_at")
          .eq("uid", uid)
          .order("synced_at", { ascending: false })
          .limit(1);
        if (error) throw new Error(`read model: ${error.message}`);
        const at = (data ?? [])[0] as { synced_at?: string } | undefined;
        if (at?.synced_at && (!newest || Date.parse(at.synced_at) > Date.parse(newest))) newest = at.synced_at;
      }
      return newest;
    },
  };
}
