import { doc, getDoc, getDocFromCache } from "@/lib/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import type { WriteOutcome } from "@/lib/firestoreWrite";
import { TaxSourceChangedError } from "@/services/tax/taxIncomeStore";
import { clearTaxReview, saveTaxReview } from "@/services/tax/taxStore";
import type { FinancialYearKey, TaxAssetClass } from "@/shared/features/tax/types";
import { TAX_CG_ENGINE_VERSION } from "@/shared/features/tax/utils/capitalGains";
import { taxReviewDocId } from "@/shared/features/tax/utils/ids";
import { isDateInFinancialYear } from "@/shared/features/tax/utils/taxYear";
import { roundMoney } from "@/shared/utils/money";

/**
 * Saving decisions about sales Spendly found in the portfolio (SPENDLY-293).
 *
 * R4.3a: the screen may show trades from the read-model copy. A decision
 * records the sale value it was made against, so the SELL row is read from
 * Firestore first (cache, then server); if it's gone, no longer executed, in
 * another year, or worth a different amount, nothing is written and the user
 * is asked to look again.
 */

const PORTFOLIO_TRANSACTIONS = "portfolioTransactions";

async function readSale(uid: string, id: string): Promise<Record<string, unknown> | null> {
  const database = getFirestoreDb();
  if (!database) throw new Error("Firestore is not available");
  const ref = doc(database, "users", uid, PORTFOLIO_TRANSACTIONS, id);
  let snap;
  try {
    snap = await getDocFromCache(ref);
  } catch {
    snap = await getDoc(ref);
  }
  return snap.exists() ? (snap.data() as Record<string, unknown>) : null;
}

/** The sale's value as Firestore has it; `undefined` when it isn't a sale in this year any more. */
export async function firestoreSaleValue(uid: string, fy: FinancialYearKey, saleId: string): Promise<number | undefined> {
  const data = await readSale(uid, saleId);
  if (!data || data.type !== "SELL" || (data.orderStatus ?? "executed") !== "executed") return undefined;
  if (typeof data.date !== "string" || !isDateInFinancialYear(data.date, fy)) return undefined;
  return roundMoney((Number(data.quantity) || 0) * (Number(data.price) || 0));
}

export type SaleDecision = { decision: "confirm" } | { decision: "exclude" } | { decision: "recategorize"; assetClass: TaxAssetClass };

export async function saveSaleDecision(
  uid: string,
  args: { fy: FinancialYearKey; saleId: string; saleValue: number } & SaleDecision
): Promise<WriteOutcome> {
  const current = await firestoreSaleValue(uid, args.fy, args.saleId);
  if (current === undefined || Math.abs(current - args.saleValue) >= 0.005) throw new TaxSourceChangedError();
  const { outcome } = await saveTaxReview(
    uid,
    {
      fy: args.fy,
      source: { kind: "portfolio_transaction", id: args.saleId },
      decision: args.decision,
      sourceAmount: current,
      engineVersion: TAX_CG_ENGINE_VERSION,
      ...(args.decision === "recategorize" ? { category: args.assetClass } : {}),
    },
    { label: "tax capital gain decision" }
  );
  return outcome;
}

/** Back to "confirm to count it". */
export function undoSaleDecision(uid: string, fy: FinancialYearKey, saleId: string): Promise<WriteOutcome> {
  return clearTaxReview(uid, taxReviewDocId(fy, { kind: "portfolio_transaction", id: saleId }), {
    label: "tax capital gain undo",
  });
}
