import {
  deleteField,
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
  type Firestore,
  type WriteBatch,
} from "firebase/firestore";
import type { GaneshWriter } from "@/services/ganesh/ganeshWriter";

import { newId } from "@/lib/id";
import { commitWrite } from "@/lib/firestoreWrite";
import type {
  AssetCategory,
  AssetCondition,
  AssetOwnershipType,
  AssetStatus,
  AssetUnit,
  GaneshFileMeta,
  PandalAsset,
  PandalAssetAuditAction,
} from "@/shared/types/ganesh";
import { changedAssetFields, validateAssetDraft } from "@/shared/utils/ganeshAssets";
import { omitUndefined } from "@/shared/utils/firestorePayload";
import { pandalAssetAuditsCol, pandalAssetsCol } from "@/shared/utils/ganeshPaths";

type GaneshActor = {
  uid: string;
  displayName: string;
  phone?: string;
};

export type CreatePandalAssetInput = {
  name: string;
  category: AssetCategory;
  quantity: number;
  unit: AssetUnit;
  ownershipType: AssetOwnershipType;
  estimatedValue: number;
  condition: AssetCondition;
  status?: AssetStatus;
  location?: string;
  description?: string;
  sourceName?: string;
  relatedExpenseId?: string;
  relatedExpenseFestivalId?: string;
  relatedContributionId?: string;
  acquisitionCost?: number;
};

export type UpdatePandalAssetPatch = Partial<{
  name: string;
  category: AssetCategory;
  unit: AssetUnit;
  ownershipType: AssetOwnershipType;
  estimatedValue: number;
  condition: AssetCondition;
  location: string;
  description: string;
  sourceName: string;
  relatedExpenseId: string;
  relatedExpenseFestivalId: string;
  relatedContributionId: string;
  acquisitionCost: number;
}>;

function pathRef(db: Firestore, segments: string[]) {
  const [first, ...rest] = segments;
  return doc(db, first, ...rest);
}

function assetAudit(
  batch: GaneshWriter,
  db: Firestore,
  pandalId: string,
  payload: {
    actorId: string;
    assetId: string;
    action: PandalAssetAuditAction;
    oldValue?: unknown;
    newValue?: unknown;
    reason?: string;
  }
) {
  batch.set(
    pathRef(db, [...pandalAssetAuditsCol(pandalId), newId()]),
    omitUndefined({
      ...payload,
      at: serverTimestamp(),
    })
  );
}

function requireAsset(data: unknown, assetId: string): Omit<PandalAsset, "id"> {
  if (!data) throw new Error("Asset not found.");
  return data as Omit<PandalAsset, "id">;
}

function ownershipExtras(input: CreatePandalAssetInput | UpdatePandalAssetPatch) {
  if (input.ownershipType === "purchased") {
    return {
      sourceName: undefined,
      relatedExpenseId: input.relatedExpenseId?.trim() || undefined,
      relatedExpenseFestivalId: input.relatedExpenseFestivalId?.trim() || undefined,
      relatedContributionId: undefined,
    };
  }
  if (input.ownershipType === "donated" || input.ownershipType === "sponsored") {
    return {
      sourceName: input.sourceName?.trim() || undefined,
      relatedExpenseId: undefined,
      relatedExpenseFestivalId: undefined,
      relatedContributionId: input.relatedContributionId?.trim() || undefined,
    };
  }
  return {
    sourceName: input.sourceName?.trim() || undefined,
    relatedExpenseId: undefined,
    relatedExpenseFestivalId: undefined,
    relatedContributionId: undefined,
  };
}

export function appendPandalAssetCreate(
  batch: GaneshWriter,
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  id: string,
  input: CreatePandalAssetInput
): void {
  const validated = validateAssetDraft({
    name: input.name,
    quantity: input.quantity,
    estimatedValue: input.estimatedValue,
  });
  if (validated.quantity <= 0) {
    throw new Error("Quantity must be greater than 0.");
  }
  const extras = ownershipExtras(input);
  batch.set(
    pathRef(db, [...pandalAssetsCol(pandalId), id]),
    omitUndefined({
      name: validated.name,
      category: input.category,
      quantity: validated.quantity,
      unit: input.unit,
      ownershipType: input.ownershipType,
      estimatedValue: validated.estimatedValue,
      condition: input.condition,
      status: input.status ?? "available",
      location: input.location?.trim() || undefined,
      description: input.description?.trim() || undefined,
      acquisitionCost:
        input.ownershipType === "purchased"
          ? input.acquisitionCost ?? validated.estimatedValue
          : undefined,
      ...extras,
      createdBy: actor.uid,
      createdAt: serverTimestamp(),
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    })
  );
  assetAudit(batch, db, pandalId, {
    actorId: actor.uid,
    assetId: id,
    action: "created",
    newValue: {
      name: validated.name,
      category: input.category,
      quantity: validated.quantity,
      ownershipType: input.ownershipType,
      relatedExpenseId: extras.relatedExpenseId,
      relatedContributionId: extras.relatedContributionId,
    },
  });
}

export async function createPandalAsset(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  input: CreatePandalAssetInput
): Promise<string> {
  const id = newId();
  const batch = writeBatch(db);
  appendPandalAssetCreate(batch, db, actor, pandalId, id, input);
  await commitWrite(() => batch.commit(), { label: "asset create" });
  return id;
}

export function appendAssetAcquisitionCost(
  batch: GaneshWriter,
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  assetId: string,
  acquisitionCost: number
): void {
  batch.update(pathRef(db, [...pandalAssetsCol(pandalId), assetId]), {
    acquisitionCost,
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  });
  assetAudit(batch, db, pandalId, {
    actorId: actor.uid,
    assetId,
    action: "edited",
    newValue: { acquisitionCost },
    reason: "Linked expense amount corrected",
  });
}

export async function updatePandalAsset(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  assetId: string,
  patch: UpdatePandalAssetPatch
): Promise<void> {
  const ref = pathRef(db, [...pandalAssetsCol(pandalId), assetId]);
  const snap = await getDoc(ref);
  const current = requireAsset(snap.data(), assetId);
  const nextName = patch.name ?? current.name;
  const nextValue = patch.estimatedValue ?? current.estimatedValue;
  validateAssetDraft({
    name: nextName,
    quantity: current.quantity,
    estimatedValue: nextValue,
    status: current.status,
  });
  const extras =
    "ownershipType" in patch || "sourceName" in patch || "relatedExpenseId" in patch
      ? ownershipExtras({ ...current, ...patch })
      : {};
  const changed = changedAssetFields(current, {
    ...patch,
    ...(patch.name != null ? { name: nextName.trim() } : {}),
    ...extras,
  });
  if (Object.keys(changed).length === 0) return;
  const update: Record<string, unknown> = {
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  };
  for (const [key, value] of Object.entries(changed)) {
    update[key] = value === "" || value == null ? deleteField() : value;
  }
  const batch = writeBatch(db);
  batch.update(ref, update);
  assetAudit(batch, db, pandalId, {
    actorId: actor.uid,
    assetId,
    action: "edited",
    oldValue: Object.fromEntries(Object.keys(changed).map((key) => [key, current[key as keyof typeof current]])),
    newValue: changed,
  });
  await commitWrite(() => batch.commit(), { label: "asset update" });
}

export async function adjustAssetQuantity(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  assetId: string,
  input: { newQuantity: number; reason: string; status?: AssetStatus }
): Promise<void> {
  const reason = input.reason.trim();
  if (!reason) throw new Error("Enter a reason for the quantity change.");
  const ref = pathRef(db, [...pandalAssetsCol(pandalId), assetId]);
  const snap = await getDoc(ref);
  const current = requireAsset(snap.data(), assetId);
  const status = input.status ?? current.status;
  const validated = validateAssetDraft({
    name: current.name,
    quantity: input.newQuantity,
    estimatedValue: current.estimatedValue,
    status,
  });
  if (validated.quantity === current.quantity && status === current.status) return;
  const batch = writeBatch(db);
  batch.update(
    ref,
    omitUndefined({
      quantity: validated.quantity,
      status,
      disposeReason: status === "disposed" || status === "lost" ? reason : current.disposeReason,
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    })
  );
  assetAudit(batch, db, pandalId, {
    actorId: actor.uid,
    assetId,
    action: "quantity",
    oldValue: current.quantity,
    newValue: validated.quantity,
    reason,
  });
  if (status !== current.status) {
    assetAudit(batch, db, pandalId, {
      actorId: actor.uid,
      assetId,
      action: status === "disposed" ? "disposed" : "status",
      oldValue: current.status,
      newValue: status,
      reason,
    });
  }
  await commitWrite(() => batch.commit(), { label: "asset quantity" });
}

export async function setAssetStatus(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  assetId: string,
  input: { status: AssetStatus; reason?: string }
): Promise<void> {
  const reason = input.reason?.trim() ?? "";
  if ((input.status === "disposed" || input.status === "lost") && !reason) {
    throw new Error("Enter a reason when marking an item disposed or lost.");
  }
  const ref = pathRef(db, [...pandalAssetsCol(pandalId), assetId]);
  const snap = await getDoc(ref);
  const current = requireAsset(snap.data(), assetId);
  if (current.status === input.status && (reason === "" || reason === current.disposeReason)) return;
  const batch = writeBatch(db);
  batch.update(
    ref,
    omitUndefined({
      status: input.status,
      disposeReason: reason || undefined,
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    })
  );
  assetAudit(batch, db, pandalId, {
    actorId: actor.uid,
    assetId,
    action: input.status === "disposed" ? "disposed" : "status",
    oldValue: current.status,
    newValue: input.status,
    reason: reason || undefined,
  });
  await commitWrite(() => batch.commit(), { label: "asset status" });
}

/**
 * Returns the path of the photo this attach replaces, if any, so the caller can
 * remove the now-orphaned object from Storage after this write lands (GS-069).
 */
export async function attachAssetPhoto(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  assetId: string,
  photo: GaneshFileMeta
): Promise<string | undefined> {
  const ref = pathRef(db, [...pandalAssetsCol(pandalId), assetId]);
  const snap = await getDoc(ref);
  requireAsset(snap.data(), assetId);
  const previousPath = (snap.data()?.photo as GaneshFileMeta | undefined)?.path;
  const batch = writeBatch(db);
  batch.update(ref, {
    photo,
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  });
  assetAudit(batch, db, pandalId, {
    actorId: actor.uid,
    assetId,
    action: "photo",
    newValue: photo.path,
  });
  // Only report a previous path once the server has actually confirmed the new
  // one replaced it. A merely-"queued" (offline) outcome could still fail to
  // land, and deleting the previous object on that outcome would orphan the
  // record itself.
  const outcome = await commitWrite(() => batch.commit(), { label: "asset photo" });
  return outcome === "acked" && previousPath && previousPath !== photo.path
    ? previousPath
    : undefined;
}
