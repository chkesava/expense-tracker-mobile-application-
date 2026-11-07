import { collection, getDocs, limit, query, where } from "@/lib/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { logDirectRead } from "@/lib/firestoreReadDebug";
import type { WriteOutcome } from "@/lib/firestoreWrite";
import { TaxSourceChangedError } from "@/services/tax/taxIncomeStore";
import { clearTaxReview, saveTaxReview } from "@/services/tax/taxStore";
import type { FinancialYearKey, TaxEntry } from "@/shared/features/tax/types";
import { taxEntryFromDoc } from "@/shared/features/tax/utils/docs";
import { taxReviewDocId } from "@/shared/features/tax/utils/ids";
import { acceptedAmount, reconcileTds, type TdsMatchRow } from "@/shared/features/tax/utils/tdsReconcile";

/**
 * Accepting a TDS difference (SPENDLY-291).
 *
 * R4.3a: the screen may compute the row from the read-model copy. Before the
 * acceptance is written, the year's records are read from Firestore and the
 * row is worked out again; if its differences aren't what the user saw,
 * nothing is written and they are asked to look again.
 */

/** The cap on records read for one check; a year never holds nearly this many. */
const YEAR_LIMIT = 500;

async function firestoreYearEntries(uid: string, fy: FinancialYearKey): Promise<TaxEntry[]> {
  const database = getFirestoreDb();
  if (!database) throw new Error("Firestore is not available");
  const snap = await getDocs(
    query(collection(database, "users", uid, "taxEntries"), where("fy", "==", fy), limit(YEAR_LIMIT))
  );
  logDirectRead(`users/${uid}/taxEntries`, snap.docs.length, snap.metadata.fromCache ? "cache" : "server", {
    feature: "tax",
    queryShape: "year check before accepting a TDS difference",
  });
  return snap.docs
    .map((d) => taxEntryFromDoc(d.id, d.data() as Record<string, unknown>, fy))
    .filter((e): e is TaxEntry => !!e);
}

function sameDifference(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) < 0.005;
}

export async function acceptTdsDifference(uid: string, fy: FinancialYearKey, row: TdsMatchRow): Promise<WriteOutcome> {
  if (row.tdsDifference === null) throw new Error("Only a difference between two sides can be accepted");
  const fresh = reconcileTds({ fy, entries: await firestoreYearEntries(uid, fy), reviews: [] }).rows.find((r) => r.key === row.key);
  if (
    !fresh ||
    fresh.state !== "mismatch" ||
    !sameDifference(fresh.tdsDifference, row.tdsDifference) ||
    !sameDifference(fresh.paidDifference, row.paidDifference)
  ) {
    throw new TaxSourceChangedError();
  }
  const { outcome } = await saveTaxReview(
    uid,
    {
      fy,
      source: { kind: "reconciliation", id: row.key },
      decision: "confirm",
      sourceAmount: acceptedAmount(fresh.tdsDifference ?? 0, fresh.paidDifference),
    },
    { label: "tax TDS acceptance" }
  );
  return outcome;
}

/** Back to "doesn't match". */
export function undoTdsAcceptance(uid: string, fy: FinancialYearKey, row: TdsMatchRow): Promise<WriteOutcome> {
  return clearTaxReview(uid, taxReviewDocId(fy, { kind: "reconciliation", id: row.key }), { label: "tax TDS acceptance undo" });
}
