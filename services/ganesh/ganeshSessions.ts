import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
  type Firestore,
} from "firebase/firestore";

import { commitWrite } from "@/lib/firestoreWrite";
import { newId } from "@/lib/id";
import { omitUndefined } from "@/shared/utils/firestorePayload";
import type { GaneshActor } from "@/services/ganesh/ganeshWrites";
import type { PaymentMethod } from "@/shared/types/ganesh";
import type {
  CashReconciliation,
  CollectionSession,
} from "@/shared/types/ganeshSessions";
import { festivalCol, festivalDoc } from "@/shared/utils/ganeshPaths";
import { todayDateInput } from "@/shared/utils/ganeshIdentity";
import {
  assertMismatchReason,
  assertReconciliationEditable,
  canApproveReconciliation,
  canCancelSession,
  canCloseSession,
  reconciliationDifference,
  reconciliationStatusFor,
  sessionStatusForReconciliation,
  summarizeSession,
} from "@/shared/utils/ganeshReconciliation";

/**
 * Collection sessions and cash reconciliation (GS-076, GS-075).
 *
 * Two accountability records, and the whole point of both is that they are
 * append-mostly: a session freezes its totals at close, a reconciliation locks
 * on approval, and a wrong count is corrected by an adjustment rather than by
 * editing what was recorded. Nothing here rewrites a collection.
 */

// Local, matching the convention in the sibling service modules.
function pathRef(db: Firestore, segments: string[]) {
  const [first, ...rest] = segments;
  return doc(db, first, ...rest);
}

function sessionsCol(db: Firestore, pandalId: string, festivalId: string) {
  const [first, ...rest] = festivalCol(pandalId, festivalId, "collectionSessions");
  return collection(db, first, ...rest);
}

function collectionsCol(db: Firestore, pandalId: string, festivalId: string) {
  const [first, ...rest] = festivalCol(pandalId, festivalId, "collections");
  return collection(db, first, ...rest);
}

async function requireOpenFestival(db: Firestore, pandalId: string, festivalId: string) {
  const snap = await getDoc(pathRef(db, festivalDoc(pandalId, festivalId)));
  if (!snap.exists() || snap.data().status !== "open") {
    throw new Error("This festival is closed.");
  }
}

function sessionRef(db: Firestore, pandalId: string, festivalId: string, sessionId: string) {
  return pathRef(db, [...festivalCol(pandalId, festivalId, "collectionSessions"), sessionId]);
}

/** One reconciliation per session, so its id *is* the session id. */
function reconciliationRef(
  db: Firestore,
  pandalId: string,
  festivalId: string,
  sessionId: string
) {
  return pathRef(db, [...festivalCol(pandalId, festivalId, "reconciliations"), sessionId]);
}

/**
 * The collector's open session, if any.
 *
 * A collector has at most one open session at a time — two would split the cash
 * they are accountable for across two handovers with no way to say which notes
 * belonged to which.
 */
export async function findOpenSession(
  db: Firestore,
  pandalId: string,
  festivalId: string,
  collectorId: string
): Promise<CollectionSession | null> {
  const snap = await getDocs(
    query(
      sessionsCol(db, pandalId, festivalId),
      where("collectorId", "==", collectorId),
      where("status", "==", "open")
    )
  );
  const first = snap.docs[0];
  if (!first) return null;
  return { id: first.id, ...(first.data() as Omit<CollectionSession, "id">) };
}

/**
 * Open a session, or return the one already open (GS-076 point 1).
 *
 * Idempotent by design rather than by key: starting a session twice should
 * hand back the same session, not create a second one, because the collector's
 * intent is "I am collecting now", not "make me a record".
 */
export async function startCollectionSession(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  input?: { collectorId?: string; collectorName?: string; date?: string }
): Promise<string> {
  await requireOpenFestival(db, pandalId, festivalId);
  const collectorId = input?.collectorId?.trim() || actor.uid;
  const existing = await findOpenSession(db, pandalId, festivalId, collectorId);
  if (existing) return existing.id;

  const id = newId();
  const batch = writeBatch(db);
  batch.set(
    sessionRef(db, pandalId, festivalId, id),
    omitUndefined({
      collectorId,
      collectorName: input?.collectorName?.trim() || actor.displayName,
      status: "open",
      date: input?.date?.trim() || todayDateInput(),
      startedAt: serverTimestamp(),
      expectedCash: 0,
      expectedNonCash: 0,
      totalCollected: 0,
      collectionCount: 0,
      createdBy: actor.uid,
      createdAt: serverTimestamp(),
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    })
  );
  await commitWrite(() => batch.commit(), { label: "collection session" });
  return id;
}

/** The session's own collection rows, used to freeze its totals at close. */
async function readSessionCollections(
  db: Firestore,
  pandalId: string,
  festivalId: string,
  sessionId: string
) {
  const snap = await getDocs(
    query(collectionsCol(db, pandalId, festivalId), where("sessionId", "==", sessionId))
  );
  return snap.docs.map((docSnap) => ({
    amount: Number(docSnap.data().amount ?? 0),
    paymentMethod: String(docSnap.data().paymentMethod ?? "cash"),
    voided: Boolean(docSnap.data().voided),
  }));
}

/**
 * Close a session and declare the handover (GS-076 points 6-7).
 *
 * Totals are computed from the session's collections and frozen onto the
 * session, so the expected figure a reconciliation is judged against cannot
 * drift afterwards. The whole thing runs in a transaction: closing twice must
 * not produce two different frozen totals.
 */
export async function closeCollectionSession(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  sessionId: string,
  input: { declaredCash: number }
): Promise<void> {
  await requireOpenFestival(db, pandalId, festivalId);
  const totals = summarizeSession(
    await readSessionCollections(db, pandalId, festivalId, sessionId)
  );

  await runTransaction(db, async (txn) => {
    const ref = sessionRef(db, pandalId, festivalId, sessionId);
    const snap = await txn.get(ref);
    if (!snap.exists()) throw new Error("Collection session not found.");
    const session = snap.data() as CollectionSession;
    if (session.collectorId !== actor.uid && session.createdBy !== actor.uid) {
      // Someone else's session. An admin closing on a collector's behalf is a
      // real need, but it must be an explicit act rather than a side effect, so
      // it goes through `closeSessionAsAdmin` where the actor is recorded.
      throw new Error("This session belongs to another collector.");
    }
    const allowed = canCloseSession(session, input.declaredCash, totals.expectedCash);
    if (!allowed.ok) throw new Error(allowed.error);

    txn.update(ref, {
      status: "closed",
      closedAt: serverTimestamp(),
      declaredCash: Number(input.declaredCash ?? 0),
      ...totals,
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    });
  });
}

/** Cancel a session opened by mistake. Refuses once money is in it. */
export async function cancelCollectionSession(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  sessionId: string,
  reason?: string
): Promise<void> {
  const totals = summarizeSession(
    await readSessionCollections(db, pandalId, festivalId, sessionId)
  );
  await runTransaction(db, async (txn) => {
    const ref = sessionRef(db, pandalId, festivalId, sessionId);
    const snap = await txn.get(ref);
    if (!snap.exists()) throw new Error("Collection session not found.");
    const allowed = canCancelSession(snap.data() as CollectionSession, totals.collectionCount);
    if (!allowed.ok) throw new Error(allowed.error);
    txn.update(ref, {
      status: "cancelled",
      cancelReason: reason?.trim() || undefined,
      closedAt: serverTimestamp(),
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * Count the cash and record the outcome (GS-075 points 3-7).
 *
 * Never adjusts a collection. A mismatch is recorded as a mismatch, with both
 * figures preserved and a reason required, and the session is marked so the
 * discrepancy is visible rather than absorbed.
 *
 * One transaction over the session and the reconciliation, so the two cannot
 * disagree about whether this session has been counted.
 */
export async function recordCashCount(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  sessionId: string,
  input: {
    countedCash: number;
    reason?: string;
    /** From the caller's permission check; the rules enforce it again. */
    hasApprovalPermission: boolean;
  }
): Promise<{ difference: number; status: CashReconciliation["status"] }> {
  await requireOpenFestival(db, pandalId, festivalId);
  const counted = Number(input.countedCash ?? 0);
  if (!Number.isFinite(counted) || counted < 0) {
    throw new Error("Enter the counted cash as 0 or more.");
  }

  return runTransaction(db, async (txn) => {
    const sRef = sessionRef(db, pandalId, festivalId, sessionId);
    const rRef = reconciliationRef(db, pandalId, festivalId, sessionId);
    const [sSnap, rSnap] = await Promise.all([txn.get(sRef), txn.get(rRef)]);
    if (!sSnap.exists()) throw new Error("Collection session not found.");
    const session = sSnap.data() as CollectionSession;
    if (session.status === "open") {
      throw new Error("The collector has not closed this session yet.");
    }
    if (session.status === "cancelled") {
      throw new Error("This session was cancelled.");
    }

    const editable = assertReconciliationEditable(
      rSnap.exists() ? (rSnap.data() as CashReconciliation) : null
    );
    if (!editable.ok) throw new Error(editable.error);

    const approval = canApproveReconciliation({
      actorId: actor.uid,
      collectorId: session.collectorId,
      hasApprovalPermission: input.hasApprovalPermission,
    });
    if (!approval.ok) throw new Error(approval.error);

    const expectedCash = Number(session.expectedCash ?? 0);
    const difference = reconciliationDifference(counted, expectedCash);
    const status = reconciliationStatusFor(difference);

    const reasonCheck = assertMismatchReason(difference, input.reason);
    if (!reasonCheck.ok) throw new Error(reasonCheck.error);

    txn.set(
      rRef,
      omitUndefined({
        sessionId,
        collectorId: session.collectorId,
        expectedCash,
        declaredCash: Number(session.declaredCash ?? 0),
        countedCash: counted,
        difference,
        status,
        reason: input.reason?.trim() || undefined,
        countedBy: actor.uid,
        countedByName: actor.displayName,
        approvedBy: actor.uid,
        approvedAt: serverTimestamp(),
        // Point 10 — immutable from here; corrections go through an adjustment.
        locked: true,
        createdBy: actor.uid,
        createdAt: serverTimestamp(),
        updatedBy: actor.uid,
        updatedAt: serverTimestamp(),
      })
    );
    txn.update(sRef, {
      status: sessionStatusForReconciliation(status),
      reconciliationId: sessionId,
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    });

    return { difference, status };
  });
}

/**
 * Resolve a discrepancy by recording an adjustment (GS-075 point 8).
 *
 * Appends a correction; it does not touch the reconciliation's counted or
 * expected figures, and it does not touch a single collection. Afterwards the
 * reconciliation reads `resolved` — which is a statement that the difference
 * was explained, not that it went away.
 */
export async function resolveReconciliation(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  sessionId: string,
  input: { amount: number; reason: string; paymentMethod?: PaymentMethod }
): Promise<string> {
  await requireOpenFestival(db, pandalId, festivalId);
  const reason = input.reason?.trim();
  if (!reason) throw new Error("Record why this difference is being resolved.");
  const signed = Number(input.amount ?? 0);
  if (!Number.isFinite(signed)) throw new Error("Enter a valid adjustment amount.");
  // Magnitude plus direction, not a signed amount: `direction` is the single
  // encoding of sense (GS-078), and the rules refuse a negative money field
  // anyway (GS-004).
  const amount = Math.abs(signed);
  const direction: "in" | "out" = signed >= 0 ? "in" : "out";

  const adjustmentId = newId();
  await runTransaction(db, async (txn) => {
    const rRef = reconciliationRef(db, pandalId, festivalId, sessionId);
    const rSnap = await txn.get(rRef);
    if (!rSnap.exists()) throw new Error("This session has not been counted yet.");
    const reconciliation = rSnap.data() as CashReconciliation;
    if (reconciliation.status === "matched") {
      throw new Error("This count matched, so there is nothing to resolve.");
    }

    txn.set(
      pathRef(db, [...festivalCol(pandalId, festivalId, "cashAdjustments"), adjustmentId]),
      omitUndefined({
        reconciliationId: sessionId,
        sessionId,
        amount,
        reason,
        approvedBy: actor.uid,
        date: todayDateInput(),
        paymentMethod: input.paymentMethod ?? "cash",
        direction,
        // GS-078 — an adjustment is a money movement and carries its purpose
        // like any other.
        purposeType: "adjustment",
        purposeCategory: "reconciliation_discrepancy",
        purposeDetail: reason,
        createdBy: actor.uid,
        createdAt: serverTimestamp(),
        updatedBy: actor.uid,
        updatedAt: serverTimestamp(),
      })
    );

    // The only field of a locked reconciliation that may move, and only in one
    // direction: mismatch -> resolved.
    txn.update(rRef, {
      status: "resolved",
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    });
  });
  return adjustmentId;
}
