import { collection, doc, getDoc, getDocs, query, where } from "@/lib/firestore";

import { logWarning } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import type { WriteOutcome } from "@/lib/firestoreWrite";
import { getAppLocalCopy } from "@/lib/readModelLocal/appCopy";
import { createCollectionSource, toSourceDocs, type SourceDoc } from "@/lib/readModelLocal/readSource";
import { copyAgreesWithFirestore, type CopyCheck } from "@/lib/readModelLocal/verifyCopy";
import { deliverCsv, deliverPdf } from "@/services/export/fileDelivery";
import { saveTaxSnapshot } from "@/services/tax/taxStore";
import { EPF_CONTRIBUTIONS_COLLECTION } from "@/shared/features/epf/types";
import type { FinancialYearKey } from "@/shared/features/tax/types";
import { estimateSnapshotPayload, type TaxRegimeComparison } from "@/shared/features/tax/utils/compareRegimes";
import { taxSummaryFileName, taxSummaryToCsv, taxSummaryToHtml, type TaxSummaryDocument } from "@/shared/features/tax/utils/summaryExport";
import type { TaxEstimateInput } from "@/shared/features/tax/utils/taxInput";
import { financialYearDateBounds } from "@/shared/features/tax/utils/taxYear";
import type { CollectionMode } from "@/shared/utils/readModel/collectionMode";

/**
 * SPENDLY-710 — handing the year's summary to the user, and recording what
 * was exported as a `taxSnapshots` row (reason `export`).
 *
 * R4.3a: the estimate may be computed from the on-device copy. The snapshot
 * stores computed outputs, so it is written only after Firestore (server
 * data) confirms every input the copy served: the year's tax records, the
 * year's incomes and EPF months, and the deposits and portfolio the estimate
 * reads. Otherwise (offline, cache data, a difference) the file is still
 * delivered, and no snapshot is written; the user is told.
 */

const DIRECTORY = "tax-summaries";

/** Every collection the estimate is computed from. */
export const TAX_ESTIMATE_INPUTS: readonly CopyCheck[] = [
  { collection: "taxEntries" },
  { collection: "taxReviews" },
  { collection: "taxProfiles" },
  { collection: "incomes" },
  { collection: "investments" },
  { collection: EPF_CONTRIBUTIONS_COLLECTION },
  { collection: "holdings" },
  { collection: "portfolioTransactions" },
];
export const TAX_ESTIMATE_COLLECTIONS: readonly string[] = TAX_ESTIMATE_INPUTS.map((c) => c.collection);

export async function deliverTaxSummary(
  docToExport: TaxSummaryDocument,
  format: "csv" | "pdf",
  formatMoney: (n: number) => string,
  formatDate: (ms: number) => string
): Promise<void> {
  const fileName = taxSummaryFileName(docToExport.fy, format);
  const title = `${docToExport.title} · ${docToExport.yearLabel}`;
  if (format === "csv") {
    await deliverCsv({ content: taxSummaryToCsv(docToExport, formatDate), fileName, directory: DIRECTORY, title });
  } else {
    await deliverPdf({ html: taxSummaryToHtml(docToExport, formatMoney, formatDate), fileName, directory: DIRECTORY, title });
  }
}

/** Firestore (server data) agrees with the copy for every input the copy served. */
export async function confirmTaxInputsOnFirestore(
  uid: string,
  fy: FinancialYearKey,
  modes: Readonly<Record<string, CollectionMode>>
): Promise<boolean> {
  const db = getFirestoreDb();
  const bounds = financialYearDateBounds(fy);
  if (!db || !bounds) return false;
  const yearBound = new Set(["taxEntries", "taxReviews", "incomes", EPF_CONTRIBUTIONS_COLLECTION]);
  try {
    return await copyAgreesWithFirestore(TAX_ESTIMATE_INPUTS, {
      modeOf: (c) => modes[c] ?? "firestore",
      readServer: async (check): Promise<SourceDoc[] | null> => {
        const ref = collection(db, "users", uid, check.collection);
        if (check.collection === "taxProfiles") {
          const one = await getDoc(doc(db, "users", uid, "taxProfiles", fy));
          if (one.metadata.fromCache) return null;
          return one.exists() ? [{ id: one.id, data: (one.data() ?? {}) as Record<string, unknown> }] : [];
        }
        const q =
          check.collection === "taxEntries" || check.collection === "taxReviews"
            ? query(ref, where("fy", "==", fy))
            : check.collection === "incomes"
              ? query(ref, where("date", ">=", bounds.startDate), where("date", "<=", bounds.endDate))
              : check.collection === EPF_CONTRIBUTIONS_COLLECTION
                ? query(ref, where("month", ">=", bounds.startDate.slice(0, 7)), where("month", "<=", bounds.endDate.slice(0, 7)))
                : query(ref);
        const snap = await getDocs(q);
        return snap.metadata.fromCache ? null : toSourceDocs(snap);
      },
      compare: (check, docs) =>
        createCollectionSource({ collection: check.collection, copy: getAppLocalCopy }).shadow(docs, {
          // Year-bounded reads (and the one profile) can't see the copy's other rows: they aren't "extra".
          windowed: yearBound.has(check.collection) || check.collection === "taxProfiles",
        }),
    });
  } catch (error) {
    logWarning("tax.summaryExport.confirm", error);
    return false;
  }
}

export type SnapshotResult = { kind: "saved"; outcome: WriteOutcome } | { kind: "unconfirmed" } | { kind: "no_rules" };

/** Record what was exported. Never rewrites an earlier snapshot (create-only, own id). */
export async function snapshotExport(
  uid: string,
  args: {
    fy: FinancialYearKey;
    input: TaxEstimateInput;
    comparison: TaxRegimeComparison;
    modes: Readonly<Record<string, CollectionMode>>;
    generatedAtMs: number;
  }
): Promise<SnapshotResult> {
  const payload = estimateSnapshotPayload(args.input, args.comparison);
  if (!payload || !args.comparison.law) return { kind: "no_rules" };
  if (!(await confirmTaxInputsOnFirestore(uid, args.fy, args.modes))) return { kind: "unconfirmed" };
  const { outcome } = await saveTaxSnapshot(
    uid,
    { fy: args.fy, law: args.comparison.law, reason: "export", createdAtMs: args.generatedAtMs, ...payload },
    { label: "tax summary snapshot" }
  );
  return { kind: "saved", outcome };
}
