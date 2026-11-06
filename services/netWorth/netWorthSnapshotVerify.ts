import { collection, doc, getDoc, getDocs } from "@/lib/firestore";

import { logWarning } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { getAppLocalCopy } from "@/lib/readModelLocal/appCopy";
import { createCollectionSource, toSourceDocs, type SourceDoc } from "@/lib/readModelLocal/readSource";
import { copyAgreesWithFirestore, type CopyCheck } from "@/lib/readModelLocal/verifyCopy";
import type { CollectionMode } from "@/shared/utils/readModel/collectionMode";
import { NET_WORTH_HISTORY_COLLECTION, dayKeyOf, monthKeyOf } from "@/shared/utils/netWorthHistory";

/**
 * SPENDLY-599 (R4.3a) — the daily net-worth point is written from totals
 * composed over several collections (`composeNetWorth`: stored account
 * balances, portfolio, borrowings, receivables, the EPF summary). When any of
 * them, or the history itself, comes from the on-device copy, the point is
 * written only after Firestore (server data) confirms the same inputs and
 * that today isn't recorded yet. The ledger collections only raise the
 * "may be partial" flag, which isn't a blocker, so they aren't checked.
 */
export const NET_WORTH_INPUTS: readonly CopyCheck[] = [
  { collection: "accounts" },
  { collection: "accountTypes" },
  { collection: "investments" },
  { collection: "holdings" },
  { collection: "investmentCashTransactions" },
  { collection: "borrowings" },
  { collection: "borrowingRepayments" },
  { collection: "receivables" },
  { collection: "receivableRepayments" },
  { collection: "financialSummaries", docId: "epf" },
  // SPENDLY-686: money held for others (Group Funds) is a liability.
  { collection: "groupFunds" },
];

/** Every collection whose mode the recorder needs. */
export const NET_WORTH_SNAPSHOT_COLLECTIONS: readonly string[] = [
  NET_WORTH_HISTORY_COLLECTION,
  ...NET_WORTH_INPUTS.map((c) => c.collection),
];

export type SnapshotVerdict =
  | { kind: "write"; monthDocExists: boolean }
  /** Firestore already has today's point; the copy will catch up. */
  | { kind: "recorded" }
  /** Firestore couldn't confirm (offline, cache data, a difference): try later. */
  | { kind: "unconfirmed" };

export function snapshotReadsCopy(modes: Readonly<Record<string, CollectionMode>>): boolean {
  return NET_WORTH_SNAPSHOT_COLLECTIONS.some((c) => modes[c] === "supabase");
}

export async function confirmSnapshotOnFirestore(
  uid: string,
  todayKey: string,
  modes: Readonly<Record<string, CollectionMode>>,
  monthDocExists: boolean
): Promise<SnapshotVerdict> {
  const db = getFirestoreDb();
  if (!db) return { kind: "unconfirmed" };
  try {
    let exists = monthDocExists;
    if (modes[NET_WORTH_HISTORY_COLLECTION] === "supabase") {
      const snap = await getDoc(doc(db, "users", uid, NET_WORTH_HISTORY_COLLECTION, monthKeyOf(todayKey)));
      if (snap.metadata.fromCache) return { kind: "unconfirmed" };
      const points = (snap.data()?.points ?? {}) as Record<string, unknown>;
      if (snap.exists() && points[dayKeyOf(todayKey)]) return { kind: "recorded" };
      exists = snap.exists();
    }
    const agrees = await copyAgreesWithFirestore(NET_WORTH_INPUTS, {
      modeOf: (c) => modes[c] ?? "firestore",
      readServer: async (check): Promise<SourceDoc[] | null> => {
        if (check.docId !== undefined) {
          const one = await getDoc(doc(db, "users", uid, check.collection, check.docId));
          if (one.metadata.fromCache) return null;
          return one.exists() ? [{ id: one.id, data: (one.data() ?? {}) as Record<string, unknown> }] : [];
        }
        const all = await getDocs(collection(db, "users", uid, check.collection));
        return all.metadata.fromCache ? null : toSourceDocs(all);
      },
      compare: (check, docs) =>
        createCollectionSource({ collection: check.collection, copy: getAppLocalCopy }).shadow(docs, {
          windowed: check.docId !== undefined,
        }),
    });
    return agrees ? { kind: "write", monthDocExists: exists } : { kind: "unconfirmed" };
  } catch (error) {
    logWarning("netWorthHistory.confirm", error);
    return { kind: "unconfirmed" };
  }
}
