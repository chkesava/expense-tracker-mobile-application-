/**
 * SPENDLY-740 — `epf-daily`'s read-model source (logic: epfDailyCore.ts). The
 * Supabase copy of every user's EPF rows, service role, read only: it says who
 * has interest or summary work. Nothing is written from it; each named user's
 * rows are re-read from Firestore.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeEstablishment } from "../../shared/features/epf/utils";
import { normalizeEpfContribution } from "../../shared/features/epf/utils/contributions";
import { normalizeInterestEntry } from "../../shared/features/epf/utils/interest";
import { normalizeReconciliation } from "../../shared/features/epf/utils/reconciliation";
import { normalizeTransfer } from "../../shared/features/epf/utils/transfers";
import type { EpfSummary } from "../../shared/types/financialSummary";
import { allRows, readModelRowToDoc, tableOf } from "./billReadModelSource";
import type { EpfUserData, ReadModelEpfSource } from "./epfDailyCore";

export function emptyEpfUserData(): EpfUserData {
  return { establishments: [], contributions: [], transfers: [], reconciliations: [], interestEntries: [], storedSummary: null };
}

export function supabaseEpfReadModel(client: SupabaseClient): ReadModelEpfSource {
  const rows = (collection: string) =>
    allRows((a, b) => client.from(tableOf(collection)).select("uid, doc_id, doc").eq("source_deleted", false).order("uid").order("doc_id").range(a, b));
  return {
    async users() {
      const [est, con, tra, rec, int, sum] = await Promise.all([
        rows("epfEstablishments"),
        rows("epfContributions"),
        rows("epfTransfers"),
        rows("epfReconciliations"),
        rows("epfInterestEntries"),
        rows("financialSummaries"),
      ]);
      const byUid = new Map<string, EpfUserData>();
      const of = (uid: string) => {
        let d = byUid.get(uid);
        if (!d) byUid.set(uid, (d = emptyEpfUserData()));
        return d;
      };
      for (const r of est) { const d = readModelRowToDoc(r); of(r.uid).establishments.push(normalizeEstablishment(d.id, d.data)); }
      for (const r of con) { const d = readModelRowToDoc(r); of(r.uid).contributions.push(normalizeEpfContribution(d.id, d.data)); }
      for (const r of tra) { const d = readModelRowToDoc(r); of(r.uid).transfers.push(normalizeTransfer(d.id, d.data)); }
      for (const r of rec) { const d = readModelRowToDoc(r); of(r.uid).reconciliations.push(normalizeReconciliation(d.id, d.data)); }
      for (const r of int) { const d = readModelRowToDoc(r); of(r.uid).interestEntries.push(normalizeInterestEntry(d.id, d.data)); }
      for (const r of sum) {
        const d = readModelRowToDoc(r);
        if (d.id === "epf" && byUid.has(r.uid)) of(r.uid).storedSummary = d.data as Partial<EpfSummary>;
      }
      return [...byUid.entries()].map(([uid, data]) => ({ uid, data }));
    },
  };
}
