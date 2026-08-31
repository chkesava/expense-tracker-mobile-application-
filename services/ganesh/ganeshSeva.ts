import {
  doc,
  getDoc,
  getDocs,
  increment,
  collection,
  serverTimestamp,
  writeBatch,
  type Firestore,
} from "firebase/firestore";

import { newId } from "@/lib/id";
import { commitWrite } from "@/lib/firestoreWrite";
import { omitUndefined } from "@/shared/utils/firestorePayload";
import type {
  DutyStatus,
  FestivalSeva,
  SevaDuty,
  SevaKind,
  SevaStatus,
} from "@/shared/types/ganesh";
import { festivalCol, sevaDutiesCol } from "@/shared/utils/ganeshPaths";
import { requireOpenFestival } from "@/services/ganesh/ganeshFestivalGuard";
import {
  assertCanAssignDuty,
  assertCanTransitionDuty,
  assertCanTransitionSeva,
  validateSeva,
} from "@/shared/utils/ganeshSeva";

/**
 * Seva writers.
 *
 * Everything here is a plain `writeBatch`. Not one of these paths reads a
 * balance, so none needs a transaction, and staying on batches means a
 * coordinator can plan and staff seva with no signal at the pandal and have it
 * sync later — which is exactly when a schedule gets edited. See the note in
 * `services/ganesh/ganeshWriter.ts` for why that choice is load-bearing.
 */

type GaneshActor = {
  uid: string;
  displayName: string;
  phone?: string;
};

function pathRef(db: Firestore, segments: string[]) {
  const [root, ...rest] = segments;
  return doc(db, root, ...rest);
}

export type SevaInput = {
  name: string;
  kind: SevaKind;
  date: string;
  startTime: string;
  endTime?: string;
  location?: string;
  notes?: string;
};

export async function createSeva(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  input: SevaInput
): Promise<string> {
  await requireOpenFestival(db, pandalId, festivalId);
  const valid = validateSeva(input);
  if (!valid.ok) throw new Error(valid.error);

  const id = newId();
  const batch = writeBatch(db);
  batch.set(
    pathRef(db, [...festivalCol(pandalId, festivalId, "seva"), id]),
    omitUndefined({
      name: input.name.trim(),
      kind: input.kind,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime?.trim() || undefined,
      location: input.location?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
      status: "scheduled" satisfies SevaStatus,
      dutyCount: 0,
      voided: false,
      createdBy: actor.uid,
      createdAt: serverTimestamp(),
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    })
  );
  await commitWrite(() => batch.commit(), { label: "seva" });
  return id;
}

export async function updateSeva(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  sevaId: string,
  input: SevaInput
): Promise<void> {
  const valid = validateSeva(input);
  if (!valid.ok) throw new Error(valid.error);

  const batch = writeBatch(db);
  batch.update(pathRef(db, [...festivalCol(pandalId, festivalId, "seva"), sevaId]), {
    name: input.name.trim(),
    kind: input.kind,
    date: input.date,
    startTime: input.startTime,
    // Written rather than omitted so clearing an optional field actually clears
    // it. `omitUndefined` would silently keep the old value.
    endTime: input.endTime?.trim() ?? "",
    location: input.location?.trim() ?? "",
    notes: input.notes?.trim() ?? "",
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  });
  await commitWrite(() => batch.commit(), { label: "seva" });
}

export async function setSevaStatus(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  sevaId: string,
  next: SevaStatus
): Promise<void> {
  const ref = pathRef(db, [...festivalCol(pandalId, festivalId, "seva"), sevaId]);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("This seva no longer exists.");
  assertCanTransitionSeva(snap.data() as Pick<FestivalSeva, "status" | "voided">, next);

  const batch = writeBatch(db);
  batch.update(ref, {
    status: next,
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  });
  await commitWrite(() => batch.commit(), { label: "seva status" });
}

/**
 * Soft-remove, matching how every other Ganesh record is withdrawn. The seva
 * stays readable so a completed festival's schedule still reconciles with what
 * people remember happening.
 */
export async function voidSeva(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  sevaId: string,
  reason?: string
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(pathRef(db, [...festivalCol(pandalId, festivalId, "seva"), sevaId]), {
    voided: true,
    voidReason: reason?.trim() || "Removed",
    voidedBy: actor.uid,
    voidedAt: serverTimestamp(),
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  });
  await commitWrite(() => batch.commit(), { label: "remove seva" });
}

/* ----------------------------------------------------------------- Duties */

export async function assignDuty(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  sevaId: string,
  input: { userId: string; displayName: string; roleLabel?: string }
): Promise<string> {
  const dutiesPath = sevaDutiesCol(pandalId, festivalId, sevaId);
  const [root, ...rest] = dutiesPath;
  const existing = await getDocs(collection(db, root, ...rest));
  assertCanAssignDuty(
    existing.docs.map((docSnap) => docSnap.data() as Pick<SevaDuty, "userId">),
    input.userId
  );

  const id = newId();
  const batch = writeBatch(db);
  batch.set(
    pathRef(db, [...dutiesPath, id]),
    omitUndefined({
      sevaId,
      userId: input.userId,
      displayName: input.displayName,
      roleLabel: input.roleLabel?.trim() || undefined,
      status: "assigned" satisfies DutyStatus,
      createdBy: actor.uid,
      createdAt: serverTimestamp(),
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    })
  );
  // Denormalised so a schedule list can show "4 volunteers" without a
  // subquery per row. Nothing reads it for correctness — `dutyCounts()` over
  // the real duties is the source of truth on the detail screen.
  batch.update(pathRef(db, [...festivalCol(pandalId, festivalId, "seva"), sevaId]), {
    dutyCount: increment(1),
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  });
  await commitWrite(() => batch.commit(), { label: "assign volunteer" });
  return id;
}

export async function removeDuty(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  sevaId: string,
  dutyId: string
): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(pathRef(db, [...sevaDutiesCol(pandalId, festivalId, sevaId), dutyId]));
  batch.update(pathRef(db, [...festivalCol(pandalId, festivalId, "seva"), sevaId]), {
    dutyCount: increment(-1),
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  });
  await commitWrite(() => batch.commit(), { label: "remove volunteer" });
}

export async function setDutyStatus(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  sevaId: string,
  dutyId: string,
  next: DutyStatus
): Promise<void> {
  const ref = pathRef(db, [...sevaDutiesCol(pandalId, festivalId, sevaId), dutyId]);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("This volunteer is no longer on this seva.");
  assertCanTransitionDuty(snap.data() as Pick<SevaDuty, "status">, next);

  const batch = writeBatch(db);
  // Exactly these three keys: the rules let a volunteer update their own duty
  // only when the change set is status/updatedBy/updatedAt, so adding a field
  // here would silently break self-service for everyone without seva.assign.
  batch.update(ref, {
    status: next,
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  });
  await commitWrite(() => batch.commit(), { label: "duty status" });
}
