import { fromReadModelDoc } from "@/lib/readModel/readModelDoc";
import { SPEC_BY_COLLECTION, type ReadModelRow } from "@/shared/utils/readModel/mapping";
import { isClean, shadowCompare, type ShadowDoc, type ShadowResult } from "@/shared/utils/readModel/shadowCompare";

/**
 * SPENDLY-673 — the read store over the on-device copy, per collection.
 *
 * `subscribe` hands a provider the same `{ id, data }` documents its Firestore
 * listener gets (the source `doc` with `id`, timestamps restored by
 * `fromReadModelDoc`), so its existing mapping runs unchanged. It re-reads
 * when the copy says the table changed, and this device's unsent writes are
 * already overlaid by the copy. Any failure calls `onError`: the provider's
 * hook then falls back to Firestore for the session.
 *
 * `shadow` compares what Firestore served with the copy and logs counts only
 * (at most once per collection per SHADOW_LOG_MS, and only when they differ).
 */
export type SourceDoc = ShadowDoc;

type CopyLike = {
  status(): { state: string; uid: string | null };
  read(table: string): Promise<ReadModelRow[]>;
  onChange(listener: (tables: string[]) => void): () => void;
};

export const SHADOW_LOG_MS = 10 * 60_000;

/** `{id, data}` for a row: a nested row's id is its own (the last part of "{parentId}/{id}"). */
export function rowToDoc(row: ReadModelRow): SourceDoc {
  const docId = String(row.doc_id);
  const id = docId.includes("/") ? docId.slice(docId.lastIndexOf("/") + 1) : docId;
  const data = fromReadModelDoc<Record<string, unknown>>(id, (row.doc as Record<string, unknown> | null) ?? {});
  return { id, data };
}

export type QueryOptions = {
  where?: (doc: SourceDoc) => boolean;
  orderBy?: { field: string; direction?: "asc" | "desc" }[];
  limit?: number;
};

/** The read store: a collection's documents from the copy, filtered, ordered and limited on the device. */
export async function queryCopy(copy: CopyLike, collection: string, options: QueryOptions = {}): Promise<SourceDoc[]> {
  const spec = SPEC_BY_COLLECTION.get(collection);
  if (!spec) throw new Error(`read store: ${collection} is not synced`);
  let docs = (await copy.read(spec.table)).map(rowToDoc);
  if (options.where) docs = docs.filter(options.where);
  for (const { field, direction } of [...(options.orderBy ?? [])].reverse()) {
    const sign = direction === "desc" ? -1 : 1;
    docs = [...docs].sort((a, b) => {
      const x = a.data[field] as string | number | null | undefined;
      const y = b.data[field] as string | number | null | undefined;
      if (x === y) return 0;
      if (x === undefined || x === null) return 1;
      if (y === undefined || y === null) return -1;
      return (x < y ? -1 : 1) * sign;
    });
  }
  return options.limit === undefined ? docs : docs.slice(0, options.limit);
}

export function createCollectionSource(deps: {
  collection: string;
  copy: () => CopyLike | null;
  log?(event: string, detail: unknown): void;
  now?(): number;
}) {
  const spec = SPEC_BY_COLLECTION.get(deps.collection);
  const now = deps.now ?? Date.now;
  let lastShadowLog = -Infinity;
  let lastShadow: ShadowResult | null = null;

  return {
    /** `supabase` mode: the collection's documents now and on every change. Returns the unsubscribe. */
    subscribe(onDocs: (docs: SourceDoc[]) => void, onError: (error: unknown) => void, options: QueryOptions = {}): () => void {
      const copy = deps.copy();
      if (!copy || !spec) {
        onError(new Error(`read store: no copy for ${deps.collection}`));
        return () => {};
      }
      let live = true;
      let seq = 0;
      const load = () => {
        const mine = ++seq;
        queryCopy(copy, deps.collection, options).then(
          (docs) => {
            if (live && mine === seq) onDocs(docs);
          },
          (error) => {
            if (live) onError(error);
          }
        );
      };
      const off = copy.onChange((tables) => {
        if (tables.includes(spec.table)) load();
      });
      load();
      return () => {
        live = false;
        off();
      };
    },

    /** `shadow` mode: compare what Firestore just served with the copy; log differences (counts only). */
    async shadow(firestore: SourceDoc[]): Promise<ShadowResult | null> {
      const copy = deps.copy();
      const uid = copy?.status().uid;
      if (!copy || !spec || !uid || copy.status().state !== "ready") return null;
      try {
        const rows = await copy.read(spec.table);
        const parent = spec.parent;
        const result = shadowCompare(spec, uid, firestore, rows, (d) =>
          parent ? `${String(d.data[parent.column] ?? d.data.listId ?? "")}/${d.id}` : d.id
        );
        lastShadow = result;
        if (!isClean(result) && now() - lastShadowLog >= SHADOW_LOG_MS) {
          lastShadowLog = now();
          deps.log?.(`readModel.shadow.${deps.collection}`, result);
        }
        return result;
      } catch (error) {
        deps.log?.(`readModel.shadow.${deps.collection}.failed`, error);
        return null;
      }
    },

    lastShadow: () => lastShadow,
  };
}
