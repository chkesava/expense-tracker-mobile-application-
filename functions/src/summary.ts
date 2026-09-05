import type { Firestore, Timestamp } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";

import {
  CARRIED_SUMMARY_FIELDS,
  DERIVED_SUMMARY_FIELDS,
  deriveFestivalSummary,
  deriveMemberTotals,
  summaryAuditDelta,
  type FestivalLedger,
  type LedgerDoc,
} from "@/shared/utils/ganeshSummaryDerive";

/**
 * The subcollections the summary is derived from. A write to any of them makes
 * the stored summary stale; a write to anything else (seva, categories,
 * activity, auditLogs, sessions, reconciliations) cannot move a total.
 */
export const LEDGER_SUBCOLLECTIONS = [
  "openingFunds",
  "collections",
  "contributions",
  "expenses",
  "reimbursements",
  "fundTransfers",
] as const;

/**
 * Stamped on the summary with the triggering write's event time.
 *
 * Firestore triggers are at-least-once and unordered, so two ledger writes in
 * quick succession can produce two rebuilds that finish out of order. Without
 * this, a rebuild that read the older state could land last and leave a stale
 * total on display. The rebuild is skipped when the stored stamp is already at
 * or ahead of the event being handled.
 */
export const DERIVED_AT_FIELD = "summaryDerivedAt";

const festivalPath = (pandalId: string, festivalId: string) =>
  `pandals/${pandalId}/festivals/${festivalId}`;

async function loadSubcollection(
  db: Firestore,
  pandalId: string,
  festivalId: string,
  subcol: string
): Promise<LedgerDoc[]> {
  const snap = await db.collection(`${festivalPath(pandalId, festivalId)}/${subcol}`).get();
  return snap.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
}

async function loadLedger(
  db: Firestore,
  pandalId: string,
  festivalId: string
): Promise<FestivalLedger> {
  const [openingFunds, collections, contributions, expenses, reimbursements, fundTransfers] =
    await Promise.all(
      LEDGER_SUBCOLLECTIONS.map((subcol) => loadSubcollection(db, pandalId, festivalId, subcol))
    );
  return { openingFunds, collections, contributions, expenses, reimbursements, fundTransfers };
}

function millisOf(value: unknown): number | null {
  if (!value) return null;
  const stamp = value as Partial<Timestamp>;
  return typeof stamp.toMillis === "function" ? stamp.toMillis() : null;
}

export interface RebuildResult {
  skipped: boolean;
  membersWritten: number;
  /** Summary fields the rebuild moved. Empty when everything already agreed. */
  movedKeys: string[];
}

/**
 * @param auditActorId set for the manual "Recalculate from ledger" only. The
 *   automatic trigger passes nothing: it fires on every ledger row, so an entry
 *   per rebuild would bury the manual ones, and the ledger row is audited
 *   already.
 */

/**
 * Rebuild the derived half of a festival summary from its ledger (GS-004).
 *
 * Runs with admin credentials, so it is the only writer of the twenty-two
 * derived fields. The two allocators (`nextReceiptNumber`,
 * `nextContributionNumber`) are deliberately left alone: they are handed out in
 * a client transaction and are not recomputable, so this merges rather than
 * replaces.
 *
 * Tenant isolation is structural — every path is built from the `pandalId` and
 * `festivalId` of the document that changed, so a rebuild can only ever touch
 * the festival whose own ledger moved.
 */
export async function rebuildFestivalSummary(
  db: Firestore,
  pandalId: string,
  festivalId: string,
  eventTimeMs: number,
  auditActorId?: string
): Promise<RebuildResult> {
  const ledger = await loadLedger(db, pandalId, festivalId);
  const summaryRef = db.doc(`${festivalPath(pandalId, festivalId)}/summary/totals`);

  const outcome = await db.runTransaction(async (txn) => {
    const current = await txn.get(summaryRef);
    const currentData = current.data() ?? {};
    const derivedAt = millisOf(currentData[DERIVED_AT_FIELD]);
    if (derivedAt != null && derivedAt >= eventTimeMs) {
      // A rebuild triggered by a later write already landed. Ours read older
      // state, so writing it would move the totals backwards.
      return { skipped: true, movedKeys: [] as string[] };
    }

    const summary = deriveFestivalSummary(ledger, {
      nextReceiptNumber: Number(currentData.nextReceiptNumber ?? 0),
      nextContributionNumber: Number(currentData.nextContributionNumber ?? 0),
    });

    const payload: Record<string, unknown> = {
      [DERIVED_AT_FIELD]: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    for (const field of DERIVED_SUMMARY_FIELDS) {
      payload[field] = summary[field];
    }
    // Never written here, and named so a future edit does not quietly add them.
    for (const field of CARRIED_SUMMARY_FIELDS) {
      delete payload[field];
    }

    const delta = summaryAuditDelta(current.data() ?? null, summary);
    txn.set(summaryRef, payload, { merge: true });

    if (auditActorId) {
      // Same transaction as the totals, so a failed rebuild cannot leave an
      // audit entry claiming a rebuild that did not happen (GS-053).
      txn.set(db.collection(`${festivalPath(pandalId, festivalId)}/auditLogs`).doc(), {
        actorId: auditActorId,
        action: "adjusted",
        entityType: "summary",
        entityId: "summary",
        oldValue: delta.oldValue,
        newValue: delta.newValue,
        reason: delta.reason,
        at: FieldValue.serverTimestamp(),
      });
    }
    return { skipped: false, movedKeys: delta.movedKeys as string[] };
  });

  if (outcome.skipped) return { skipped: true, membersWritten: 0, movedKeys: [] };

  const membersWritten = await writeMemberTotals(db, pandalId, festivalId, ledger);
  return { skipped: false, membersWritten, movedKeys: outcome.movedKeys };
}

/**
 * The per-member counters, rebuilt from the same ledger. Only members whose
 * figures actually moved are written, so an ordinary collection does not touch
 * every committee document.
 */
async function writeMemberTotals(
  db: Firestore,
  pandalId: string,
  festivalId: string,
  ledger: FestivalLedger
): Promise<number> {
  const derived = deriveMemberTotals(ledger);
  const membersSnap = await db.collection(`${festivalPath(pandalId, festivalId)}/members`).get();
  const zero = { contributionPaid: 0, personalExpenses: 0, reimbursed: 0, pendingReimbursement: 0 };

  const stale = membersSnap.docs.filter((doc) => {
    const want = derived.get(doc.id) ?? zero;
    const have = doc.data();
    return (
      Number(have.contributionPaid ?? 0) !== want.contributionPaid ||
      Number(have.personalExpenses ?? 0) !== want.personalExpenses ||
      Number(have.reimbursed ?? 0) !== want.reimbursed ||
      Number(have.pendingReimbursement ?? 0) !== want.pendingReimbursement
    );
  });

  for (let i = 0; i < stale.length; i += 400) {
    const batch = db.batch();
    for (const doc of stale.slice(i, i + 400)) {
      batch.set(doc.ref, derived.get(doc.id) ?? zero, { merge: true });
    }
    await batch.commit();
  }
  return stale.length;
}

/**
 * Create the summary document for a new festival.
 *
 * The client used to seed this in the batch that follows a festival create.
 * With the derived fields denied to clients that seed has to happen here, or a
 * festival would start with no summary at all until its first ledger row.
 */
export async function seedFestivalSummary(
  db: Firestore,
  pandalId: string,
  festivalId: string
): Promise<void> {
  const summaryRef = db.doc(`${festivalPath(pandalId, festivalId)}/summary/totals`);
  const empty = deriveFestivalSummary(
    {
      openingFunds: [],
      collections: [],
      contributions: [],
      expenses: [],
      reimbursements: [],
      fundTransfers: [],
    },
    {}
  );
  const payload: Record<string, unknown> = {
    [DERIVED_AT_FIELD]: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  for (const field of DERIVED_SUMMARY_FIELDS) {
    payload[field] = empty[field];
  }
  // `create`-like semantics: merge so a summary that somehow already exists
  // (a retry, or a festival restored from an export) is not zeroed.
  await summaryRef.set(payload, { merge: true });
}
