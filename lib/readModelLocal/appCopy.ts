import type { SupabaseClient } from "@supabase/supabase-js";

import type { ChangesSinceRow } from "@/lib/readModelRealtime";

import type { FetchedRow, PageCursor } from "./localCopy";
import type { LocalStoreFactory } from "./store";

/**
 * SPENDLY-594 — the app's pieces for the local copy: the platform's store and
 * the Supabase reads (PostgREST under RLS, the caller's own rows only).
 */
export { LOCAL_DB_NAME, platformStoreFactory } from "./platformStore";

/** A PostgREST filter value, quoted so commas, dots and brackets in doc ids are safe. */
export const quoteFilterValue = (value: string) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/** Keyset paging after (synced_at, doc_id): rows strictly after the cursor, in that order. */
export function afterCursorFilter(after: PageCursor): string {
  const s = quoteFilterValue(after.syncedAt);
  return `synced_at.gt.${s},and(synced_at.eq.${s},doc_id.gt.${quoteFilterValue(after.docId)})`;
}

const BY_IDS_CHUNK = 100;

export function supabaseFetchers(client: () => Promise<SupabaseClient | null>) {
  const need = async () => {
    const c = await client();
    if (!c) throw new Error("read model not connected");
    return c;
  };
  return {
    async fetchPage(table: string, after: PageCursor | null, limit: number): Promise<FetchedRow[]> {
      let query = (await need()).from(table).select("*").order("synced_at", { ascending: true }).order("doc_id", { ascending: true }).limit(limit);
      if (after) query = query.or(afterCursorFilter(after));
      const { data, error } = await query;
      if (error) throw new Error(`${table}: ${error.message}`);
      return (data ?? []) as FetchedRow[];
    },
    async fetchByIds(table: string, ids: string[]): Promise<FetchedRow[]> {
      const c = await need();
      const out: FetchedRow[] = [];
      for (let i = 0; i < ids.length; i += BY_IDS_CHUNK) {
        const { data, error } = await c.from(table).select("*").in("doc_id", ids.slice(i, i + BY_IDS_CHUNK));
        if (error) throw new Error(`${table}: ${error.message}`);
        out.push(...((data ?? []) as FetchedRow[]));
      }
      return out;
    },
    async changesSince(since: string, limit: number): Promise<ChangesSinceRow[]> {
      const { data, error } = await (await need()).rpc("readmodel_changes_since", { p_since: since, p_limit: limit });
      if (error) throw new Error(`readmodel_changes_since: ${error.message}`);
      return (data ?? []) as ChangesSinceRow[];
    },
  };
}

type AppLocalCopy = ReturnType<typeof import("./localCopy").createLocalCopy>;
let appCopy: AppLocalCopy | null = null;

/** FinanceDataProvider registers the app's copy; SPENDLY-673's read store reads it. */
export function setAppLocalCopy(copy: AppLocalCopy | null): void {
  appCopy = copy;
}

export function getAppLocalCopy(): AppLocalCopy | null {
  return appCopy;
}
