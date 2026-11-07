import { doc, getDoc, getDocFromCache } from "@/lib/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import type { WriteOutcome } from "@/lib/firestoreWrite";
import { clearTaxReview, saveTaxReview } from "@/services/tax/taxStore";
import type { Income } from "@/shared/types/expense";
import type { Investment } from "@/shared/types/investment";
import type { FinancialYearKey, TaxLine, TaxReviewDecision, TaxSourceKind } from "@/shared/features/tax/types";
import { taxReviewDocId } from "@/shared/features/tax/utils/ids";
import {
  TAX_INCOME_ENGINE_VERSION,
  depositInterestForYear,
  deriveIncomeItems,
} from "@/shared/features/tax/utils/income";

/**
 * Saving the user's decisions about derived tax income (SPENDLY-290).
 *
 * R4.3a: the screen may show incomes and deposits from the read-model copy.
 * A decision records the source amount it was made against, so before writing
 * it the amount is worked out again from the source document as Firestore has
 * it (cache, then server). If it differs from what the user saw, nothing is
 * written and the user is asked to look again.
 */

export class TaxSourceChangedError extends Error {
  constructor() {
    super("This item changed. Check it again before deciding.");
    this.name = "TaxSourceChangedError";
  }
}

function db() {
  const database = getFirestoreDb();
  if (!database) throw new Error("Firestore is not available");
  return database;
}

async function readFirestore(uid: string, collectionName: string, id: string): Promise<Record<string, unknown> | null> {
  const ref = doc(db(), "users", uid, collectionName, id);
  let snap;
  try {
    snap = await getDocFromCache(ref);
  } catch {
    snap = await getDoc(ref);
  }
  return snap.exists() ? (snap.data() as Record<string, unknown>) : null;
}

const SUPPORTED: readonly TaxSourceKind[] = ["income", "investment"];

/** The derived amount of one income-screen item, from Firestore. `undefined` when the item no longer exists. */
export async function firestoreIncomeSourceAmount(
  uid: string,
  fy: FinancialYearKey,
  kind: TaxSourceKind,
  id: string,
  todayKey: string
): Promise<number | null | undefined> {
  if (kind === "income") {
    const data = await readFirestore(uid, "incomes", id);
    if (!data) return undefined;
    const item = deriveIncomeItems([{ ...(data as Omit<Income, "id">), id }], fy).items[0];
    return item ? item.value : undefined;
  }
  if (kind === "investment") {
    const data = await readFirestore(uid, "investments", id);
    if (!data) return undefined;
    return depositInterestForYear({ ...(data as Omit<Investment, "id">), id }, fy, todayKey);
  }
  return undefined;
}

function sameAmount(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) < 0.005;
}

export async function saveIncomeDecision(
  uid: string,
  args: {
    line: TaxLine;
    decision: Exclude<TaxReviewDecision, "defer" | "resolve">;
    category?: string;
    replacedBy?: string;
    note?: string;
    todayKey: string;
  }
): Promise<WriteOutcome> {
  const ref = args.line.provenance.sourceRef;
  if (!ref || !SUPPORTED.includes(ref.kind)) throw new Error("Only Spendly income and deposits can be decided here");
  // `line.value` is the derived value the user saw (a review never changes it).
  const current = await firestoreIncomeSourceAmount(uid, args.line.fy, ref.kind, ref.id, args.todayKey);
  if (current === undefined || !sameAmount(current, args.line.value)) throw new TaxSourceChangedError();

  const { outcome } = await saveTaxReview(
    uid,
    {
      fy: args.line.fy,
      source: ref,
      decision: args.decision,
      sourceAmount: current,
      engineVersion: TAX_INCOME_ENGINE_VERSION,
      ...(args.decision === "recategorize" ? { category: args.category } : {}),
      ...(args.decision === "replace" ? { replacedBy: args.replacedBy } : {}),
      ...(args.note ? { note: args.note } : {}),
    },
    { label: "tax income decision" }
  );
  return outcome;
}

/** Back to what Spendly derives. */
export function undoIncomeDecision(uid: string, line: TaxLine): Promise<WriteOutcome> {
  const ref = line.provenance.sourceRef;
  if (!ref) throw new Error("Nothing to undo");
  return clearTaxReview(uid, taxReviewDocId(line.fy, ref), { label: "tax income undo" });
}
