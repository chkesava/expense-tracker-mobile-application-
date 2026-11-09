/**
 * SPENDLY-739 — `subscription-daily`'s read-model source (logic:
 * subscriptionDailyCore.ts). The Supabase copy of every user's subscriptions,
 * service role, read only: it says who has something due. Nothing is written
 * from it; each named user's subscriptions are re-read from Firestore.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Subscription } from "../../shared/types/subscription";
import { allRows, billSettingsFromDoc, readModelRowToDoc, tableOf } from "./billReadModelSource";
import type { ReadModelSubscriptionSource } from "./subscriptionDailyCore";

export function supabaseSubscriptionReadModel(client: SupabaseClient): ReadModelSubscriptionSource {
  return {
    async users() {
      const rows = await allRows((a, b) =>
        client.from(tableOf("subscriptions")).select("uid, doc_id, doc").eq("source_deleted", false).order("uid").order("doc_id").range(a, b)
      );
      const byUid = new Map<string, Subscription[]>();
      for (const row of rows) {
        const d = readModelRowToDoc(row);
        byUid.set(row.uid, [...(byUid.get(row.uid) ?? []), { ...(d.data as unknown as Subscription), id: d.id }]);
      }
      return [...byUid.entries()].map(([uid, subscriptions]) => ({ uid, subscriptions }));
    },
    async settings(uid) {
      const { data, error } = await client.from(tableOf("userSettings")).select("doc").eq("uid", uid).eq("source_deleted", false).limit(1);
      if (error) throw new Error(`read model: ${error.message}`);
      return { timezone: billSettingsFromDoc(((data ?? [])[0] as { doc?: Record<string, unknown> } | undefined)?.doc).timezone };
    },
  };
}
