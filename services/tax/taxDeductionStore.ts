import { collection, getDocs, limit, query, where } from "@/lib/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { logDirectRead } from "@/lib/firestoreReadDebug";
import type { WriteOutcome } from "@/lib/firestoreWrite";
import { TaxSourceChangedError } from "@/services/tax/taxIncomeStore";
import { clearTaxReview, loadTaxEntry, saveTaxReview } from "@/services/tax/taxStore";
import { EPF_CONTRIBUTIONS_COLLECTION } from "@/shared/features/epf/types";
import { normalizeEpfContribution } from "@/shared/features/epf/utils/contributions";
import type { FinancialYearKey, TaxEntry, TaxLine } from "@/shared/features/tax/types";
import {
  EPF_SHARE_SOURCE_ID,
  TAX_DEDUCTION_ENGINE_VERSION,
  epfEmployeeShareForYear,
} from "@/shared/features/tax/utils/deductions";
import { taxReviewDocId } from "@/shared/features/tax/utils/ids";
import { financialYearDateBounds } from "@/shared/features/tax/utils/taxYear";

/**
 * Saving deduction decisions (SPENDLY-292).
 *
 * R4.3a: the screen may show EPF contributions and claims from the read-model
 * copy. A decision records the amount it was made against, so it is worked
 * out again from Firestore first; if it differs from what the user saw,
 * nothing is written and they are asked to look again.
 */

function sameAmount(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) < 0.005;
}

/** The year's EPF employee share, from Firestore. One bounded range read on `month`. */
export async function firestoreEpfEmployeeShare(uid: string, fy: FinancialYearKey): Promise<number> {
  const database = getFirestoreDb();
  const bounds = financialYearDateBounds(fy);
  if (!database || !bounds) throw new Error("Firestore is not available");
  const snap = await getDocs(
    query(
      collection(database, "users", uid, EPF_CONTRIBUTIONS_COLLECTION),
      where("month", ">=", bounds.startDate.slice(0, 7)),
      where("month", "<=", bounds.endDate.slice(0, 7)),
      limit(200)
    )
  );
  logDirectRead(`users/${uid}/${EPF_CONTRIBUTIONS_COLLECTION}`, snap.docs.length, snap.metadata.fromCache ? "cache" : "server", {
    feature: "tax",
    queryShape: "EPF year check before a deduction decision",
  });
  const rows = snap.docs.map((d) => normalizeEpfContribution(d.id, d.data() as Record<string, unknown>));
  return epfEmployeeShareForYear(rows, fy).amount;
}

/** Count, leave out or replace the EPF share Spendly worked out. */
export async function saveEpfDeductionDecision(
  uid: string,
  args: { line: TaxLine; decision: "confirm" | "exclude" | "replace"; replacedBy?: string }
): Promise<WriteOutcome> {
  const current = await firestoreEpfEmployeeShare(uid, args.line.fy);
  if (!sameAmount(current, args.line.value)) throw new TaxSourceChangedError();
  const { outcome } = await saveTaxReview(
    uid,
    {
      fy: args.line.fy,
      source: { kind: "epf_contribution", id: EPF_SHARE_SOURCE_ID },
      decision: args.decision,
      sourceAmount: current,
      engineVersion: TAX_DEDUCTION_ENGINE_VERSION,
      ...(args.decision === "replace" ? { replacedBy: args.replacedBy } : {}),
    },
    { label: "tax EPF deduction decision" }
  );
  return outcome;
}

export function undoEpfDeductionDecision(uid: string, fy: FinancialYearKey): Promise<WriteOutcome> {
  return clearTaxReview(uid, taxReviewDocId(fy, { kind: "epf_contribution", id: EPF_SHARE_SOURCE_ID }), {
    label: "tax EPF deduction undo",
  });
}

/** "I'm eligible for this claim", recorded against the amount claimed. */
export async function confirmDeductionEligibility(uid: string, entry: TaxEntry): Promise<WriteOutcome> {
  if (entry.kind !== "deduction") throw new Error("Only a deduction's eligibility can be confirmed");
  const stored = await loadTaxEntry(uid, entry.id);
  if (!stored || stored.deletedAt || stored.kind !== "deduction" || !sameAmount(stored.fields.amount, entry.fields.amount)) {
    throw new TaxSourceChangedError();
  }
  const { outcome } = await saveTaxReview(
    uid,
    { fy: entry.fy, source: { kind: "tax_entry", id: entry.id }, decision: "confirm", sourceAmount: stored.fields.amount },
    { label: "tax deduction eligibility" }
  );
  return outcome;
}

export function undoDeductionEligibility(uid: string, entry: TaxEntry): Promise<WriteOutcome> {
  return clearTaxReview(uid, taxReviewDocId(entry.fy, { kind: "tax_entry", id: entry.id }), {
    label: "tax deduction eligibility undo",
  });
}
