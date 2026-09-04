import {
  doc,
  deleteField,
  getDoc,
  increment,
  runTransaction,
  serverTimestamp,
  writeBatch,
  type DocumentData,
  type Firestore,
  type WriteBatch,
} from "firebase/firestore";
import type { GaneshWriter } from "@/services/ganesh/ganeshWriter";

import { newId } from "@/lib/id";
import { commitWrite } from "@/lib/firestoreWrite";
import { omitUndefined } from "@/shared/utils/firestorePayload";
import {
  appendPandalAssetCreate,
  type CreatePandalAssetInput,
} from "@/services/ganesh/ganeshAssets";
import type {
  AuditAction,
  GaneshFileMeta,
  PaymentMethod,
  SponsorType,
  SponsoringType,
  SponsorshipPurpose,
  SponsorshipStatus,
} from "@/shared/types/ganesh";
import { EMPTY_GANESH_SUMMARY } from "@/shared/types/ganesh";
import {
  festivalCol,
  festivalDoc,
  pandalSponsorAuditsCol,
  pandalSponsorsCol,
  summaryDoc,
} from "@/shared/utils/ganeshPaths";
import {
  assertCanCancelSponsorship,
  assertCanConfirmSponsorship,
  assertCanPromiseSponsorship,
  assertCanReceiveSponsorship,
  canLinkSponsoredExpense,
  isInKindSponsoring,
  purposeLabelOf,
  sponsorshipValue,
} from "@/shared/utils/ganeshSponsors";
import { validateCashContribution, validateInKindValue, locationDelta, resolveFundLocation } from "@/shared/utils/ganeshMath";
import { todayDateInput } from "@/shared/utils/ganeshIdentity";

type GaneshActor = {
  uid: string;
  displayName: string;
  phone?: string;
};

export type SponsorAssetDraft = {
  name: string;
  category: CreatePandalAssetInput["category"];
  quantity: number;
  unit: CreatePandalAssetInput["unit"];
  estimatedValue?: number;
  condition?: CreatePandalAssetInput["condition"];
  location?: string;
  description?: string;
};

export type SponsorshipDraft = {
  sponsoringType: SponsoringType;
  purpose: SponsorshipPurpose;
  purposeLabel?: string;
  status?: SponsorshipStatus;
  amount?: number;
  estimatedValue?: number;
  itemName?: string;
  quantity?: string;
  serviceDescription?: string;
  expectedDate?: string;
  notes?: string;
  paymentMethod?: PaymentMethod;
  expenseId?: string;
  pandalAsset?: SponsorAssetDraft;
  clientOpId?: string;
};

function pathRef(db: Firestore, segments: string[]) {
  const [first, ...rest] = segments;
  return doc(db, first, ...rest);
}

function sponsorAudit(
  batch: GaneshWriter,
  db: Firestore,
  pandalId: string,
  payload: {
    actorId: string;
    sponsorId: string;
    action: "created" | "edited" | "photo";
    oldValue?: unknown;
    newValue?: unknown;
    reason?: string;
  }
) {
  batch.set(
    pathRef(db, [...pandalSponsorAuditsCol(pandalId), newId()]),
    omitUndefined({
      ...payload,
      at: serverTimestamp(),
    })
  );
}

/**
 * Append one sponsorship event to the festival audit log.
 *
 * `action` is a required positional argument rather than an optional one with
 * an "edited" default (GS-092). Every one of these events used to be written as
 * "edited", so the admin audit screen rendered creation, promise, confirmation,
 * receipt and cancellation identically as "X edited a sponsorship" — a log that
 * recorded that something happened without recording what. Making it required
 * means a new call site has to state its verb instead of silently inheriting
 * the wrong one.
 */
function festivalAudit(
  batch: GaneshWriter,
  db: Firestore,
  pandalId: string,
  festivalId: string,
  actorId: string,
  entityId: string,
  action: AuditAction,
  oldValue?: unknown,
  newValue?: unknown,
  reason?: string
) {
  batch.set(
    pathRef(db, [...festivalCol(pandalId, festivalId, "auditLogs"), newId()]),
    omitUndefined({
      actorId,
      action,
      entityType: "sponsorship",
      entityId,
      oldValue,
      newValue,
      reason,
      at: serverTimestamp(),
    })
  );
}

function bumpSummary(
  batch: GaneshWriter,
  db: Firestore,
  pandalId: string,
  festivalId: string,
  deltas: Partial<Record<keyof typeof EMPTY_GANESH_SUMMARY, number>>
) {
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  for (const [key, value] of Object.entries(deltas)) {
    if (typeof value === "number" && value !== 0) payload[key] = increment(value);
  }
  batch.set(pathRef(db, summaryDoc(pandalId, festivalId)), payload, { merge: true });
}

async function requireOpenFestival(db: Firestore, pandalId: string, festivalId: string) {
  const snap = await getDoc(pathRef(db, festivalDoc(pandalId, festivalId)));
  if (!snap.exists() || snap.data().status !== "open") {
    throw new Error("This festival is closed.");
  }
}

function validateDraft(input: SponsorshipDraft) {
  const amount = Number(input.amount ?? 0);
  const estimatedValue = Number(input.estimatedValue ?? 0);
  if (input.sponsoringType === "cash" || input.sponsoringType === "expense") {
    if ((input.status === "promised" || input.status === "confirmed" || input.status === "received") && amount <= 0) {
      const valid = validateCashContribution(amount);
      if (!valid.ok) throw new Error(valid.error);
    }
    if (amount < 0) throw new Error("Amount cannot be negative.");
  } else {
    if (input.status === "promised" || input.status === "confirmed" || input.status === "received") {
      const valid = validateInKindValue(estimatedValue);
      if (!valid.ok) throw new Error(valid.error);
    }
    if (estimatedValue < 0) throw new Error("Estimated value cannot be negative.");
  }
  if (input.pandalAsset && input.status !== "received") {
    throw new Error("Add a Pandal asset only when the sponsorship is received.");
  }
  if (input.pandalAsset && input.sponsoringType !== "item") {
    throw new Error("Only an item sponsorship can be added as a Pandal asset.");
  }
  return { amount, estimatedValue };
}

function sponsorshipPayload(
  actor: GaneshActor,
  sponsorId: string,
  input: SponsorshipDraft,
  extras?: Record<string, unknown>
) {
  const status = input.status ?? "prospective";
  const { amount, estimatedValue } = validateDraft({ ...input, status });
  return omitUndefined({
    sponsorId,
    sponsoringType: input.sponsoringType,
    purpose: input.purpose,
    purposeLabel: input.purposeLabel?.trim() || undefined,
    status,
    amount,
    estimatedValue,
    itemName: input.itemName?.trim() || undefined,
    quantity: input.quantity?.trim() || undefined,
    serviceDescription: input.serviceDescription?.trim() || undefined,
    expectedDate: status === "promised" || status === "confirmed" ? input.expectedDate?.trim() || undefined : undefined,
    notes: input.notes?.trim() || undefined,
    paymentMethod: input.sponsoringType === "cash" ? input.paymentMethod : undefined,
    expenseId: input.expenseId,
    createdBy: actor.uid,
    createdAt: serverTimestamp(),
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
    ...extras,
  });
}

function appendReceivedContribution(
  batch: GaneshWriter,
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  input: {
    sponsorshipId: string;
    sponsorId: string;
    sponsorName: string;
    mobile?: string;
    type: SponsoringType;
    purpose: SponsorshipPurpose;
    purposeLabel?: string;
    amount: number;
    estimatedValue: number;
    itemName?: string;
    quantity?: string;
    serviceDescription?: string;
    notes?: string;
    paymentMethod?: PaymentMethod;
    assetId?: string;
    receivedNotes?: string;
    contributionReference?: string;
  }
): string {
  const contributionId = `${input.sponsorshipId}-contribution`;
  const cash = input.type === "cash";
  const title =
    input.itemName?.trim() ||
    input.serviceDescription?.trim() ||
    purposeLabelOf(input.purpose, input.purposeLabel);
  batch.set(
    pathRef(db, [...festivalCol(pandalId, festivalId, "contributions"), contributionId]),
    omitUndefined({
      kind: cash ? "money" : "sponsorship",
      contributorName: input.sponsorName,
      mobile: input.mobile,
      itemName: title,
      quantity: input.quantity,
      amount: cash ? input.amount : 0,
      estimatedValue: cash ? 0 : input.estimatedValue,
      description: input.notes,
      date: todayDateInput(),
      status: "received",
      receivedAt: serverTimestamp(),
      receivedBy: actor.uid,
      receivedNotes: input.receivedNotes,
      paymentMethod: cash ? input.paymentMethod : undefined,
      assetId: input.assetId,
      sponsorId: input.sponsorId,
      sponsorshipId: input.sponsorshipId,
      contributionReference: input.contributionReference,
      clientOpId: contributionId,
      ledgerType: cash ? "OTHER_DONATION" : undefined,
      voided: false,
      createdBy: actor.uid,
      createdAt: serverTimestamp(),
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    })
  );
  if (cash) {
    bumpSummary(batch, db, pandalId, festivalId, {
      otherCashContributions: input.amount,
      ...locationDelta(resolveFundLocation(input.paymentMethod), input.amount),
    });
  } else if (isInKindSponsoring(input.type)) {
    bumpSummary(batch, db, pandalId, festivalId, { sponsoredValue: input.estimatedValue });
  }
  festivalAudit(batch, db, pandalId, festivalId, actor.uid, input.sponsorshipId, "received", undefined, {
    contributionId,
    kind: cash ? "money" : "sponsorship",
  }, "Linked contribution");
  return contributionId;
}

export async function createSponsor(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  input: {
    name: string;
    type: SponsorType;
    mobile?: string;
    email?: string;
    address?: string;
    notes?: string;
  }
): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Error("Enter the sponsor name.");
  const id = newId();
  const batch = writeBatch(db);
  batch.set(
    pathRef(db, [...pandalSponsorsCol(pandalId), id]),
    omitUndefined({
      name,
      type: input.type,
      mobile: input.mobile?.trim() || undefined,
      email: input.email?.trim() || undefined,
      address: input.address?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
      createdBy: actor.uid,
      createdAt: serverTimestamp(),
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    })
  );
  sponsorAudit(batch, db, pandalId, {
    actorId: actor.uid,
    sponsorId: id,
    action: "created",
    newValue: { name, type: input.type },
  });
  await commitWrite(() => batch.commit(), { label: "sponsor" });
  return id;
}

export async function updateSponsor(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  sponsorId: string,
  input: {
    name?: string;
    type?: SponsorType;
    mobile?: string;
    email?: string;
    address?: string;
    notes?: string;
  }
): Promise<void> {
  const ref = pathRef(db, [...pandalSponsorsCol(pandalId), sponsorId]);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Sponsor not found.");
  const name = input.name?.trim();
  if (input.name != null && !name) throw new Error("Enter the sponsor name.");
  const batch = writeBatch(db);
  batch.update(
    ref,
    omitUndefined({
      name,
      type: input.type,
      mobile: input.mobile?.trim() || undefined,
      email: input.email?.trim() || undefined,
      address: input.address?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    })
  );
  sponsorAudit(batch, db, pandalId, {
    actorId: actor.uid,
    sponsorId,
    action: "edited",
    oldValue: { name: snap.data().name, type: snap.data().type },
    newValue: input,
  });
  await commitWrite(() => batch.commit(), { label: "sponsor" });
}

export async function setSponsorArchived(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  sponsorId: string,
  input: { archived: boolean; reason?: string }
): Promise<void> {
  const ref = pathRef(db, [...pandalSponsorsCol(pandalId), sponsorId]);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Sponsor not found.");
  const reason = input.reason?.trim();
  if (input.archived && !reason) throw new Error("Enter a reason for archiving this sponsor.");
  const batch = writeBatch(db);
  batch.update(
    ref,
    input.archived
      ? {
          archived: true,
          archivedBy: actor.uid,
          archivedAt: serverTimestamp(),
          archiveReason: reason,
          updatedBy: actor.uid,
          updatedAt: serverTimestamp(),
        }
      : {
          archived: false,
          archivedBy: deleteField(),
          archivedAt: deleteField(),
          archiveReason: deleteField(),
          updatedBy: actor.uid,
          updatedAt: serverTimestamp(),
        }
  );
  sponsorAudit(batch, db, pandalId, {
    actorId: actor.uid,
    sponsorId,
    action: "edited",
    oldValue: { archived: Boolean(snap.data().archived) },
    newValue: { archived: input.archived, reason },
  });
  await commitWrite(() => batch.commit(), { label: input.archived ? "sponsor archived" : "sponsor restored" });
}

/**
 * Returns the path of the photo this attach replaces, if any, so the caller can
 * remove the now-orphaned object from Storage after this write lands (GS-069).
 */
export async function attachSponsorPhoto(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  sponsorId: string,
  photo: GaneshFileMeta,
  // GS-069: a failure arriving after commitWrite's grace window is reported
  // through this hook rather than rejecting, so without it the caller's
  // try/catch never runs and the just-uploaded object is orphaned.
  onLateFailure?: (error: unknown) => void
): Promise<string | undefined> {
  const ref = pathRef(db, [...pandalSponsorsCol(pandalId), sponsorId]);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Sponsor not found.");
  const previousPath = (snap.data()?.photo as GaneshFileMeta | undefined)?.path;
  const batch = writeBatch(db);
  batch.update(ref, {
    photo,
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  });
  sponsorAudit(batch, db, pandalId, {
    actorId: actor.uid,
    sponsorId,
    action: "photo",
    newValue: { path: photo.path },
  });
  // See attachAssetPhoto for why this waits for a real ack.
  const outcome = await commitWrite(() => batch.commit(), {
    label: "sponsor photo",
    onLateFailure,
  });
  return outcome === "acked" && previousPath && previousPath !== photo.path
    ? previousPath
    : undefined;
}

function appendReceiveEffects(
  batch: GaneshWriter,
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  sponsorshipId: string,
  sponsor: { name: string; mobile?: string; id: string },
  data: {
    sponsoringType: SponsoringType;
    purpose: SponsorshipPurpose;
    purposeLabel?: string;
    amount: number;
    estimatedValue: number;
    itemName?: string;
    quantity?: string;
    serviceDescription?: string;
    notes?: string;
    paymentMethod?: PaymentMethod;
    receivedNotes?: string;
    expenseId?: string;
    pandalAsset?: SponsorAssetDraft;
    contributionReference?: string;
  }
): { contributionId?: string; assetId?: string } {
  if (data.sponsoringType === "expense") {
    if (!data.expenseId) throw new Error("Link an expense before marking this sponsorship received.");
    return {};
  }
  const assetId = data.pandalAsset ? newId() : undefined;
  const contributionId = appendReceivedContribution(batch, db, actor, pandalId, festivalId, {
    sponsorshipId,
    sponsorId: sponsor.id,
    sponsorName: sponsor.name,
    mobile: sponsor.mobile,
    type: data.sponsoringType,
    purpose: data.purpose,
    purposeLabel: data.purposeLabel,
    amount: data.amount,
    estimatedValue: data.estimatedValue,
    itemName: data.itemName,
    quantity: data.quantity,
    serviceDescription: data.serviceDescription,
    notes: data.notes,
    paymentMethod: data.paymentMethod,
    assetId,
    receivedNotes: data.receivedNotes,
    contributionReference: data.contributionReference,
  });
  if (data.pandalAsset && assetId) {
    appendPandalAssetCreate(batch, db, actor, pandalId, assetId, {
      name: data.pandalAsset.name,
      category: data.pandalAsset.category,
      quantity: data.pandalAsset.quantity,
      unit: data.pandalAsset.unit,
      ownershipType: "sponsored",
      estimatedValue: data.pandalAsset.estimatedValue ?? data.estimatedValue,
      condition: data.pandalAsset.condition ?? "good",
      location: data.pandalAsset.location,
      description: data.pandalAsset.description ?? data.notes,
      sourceName: sponsor.name,
      relatedContributionId: contributionId,
    });
  }
  return { contributionId, assetId };
}

export async function addSponsorship(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  sponsorId: string,
  input: SponsorshipDraft
): Promise<string> {
  await requireOpenFestival(db, pandalId, festivalId);
  const sponsorSnap = await getDoc(pathRef(db, [...pandalSponsorsCol(pandalId), sponsorId]));
  if (!sponsorSnap.exists()) throw new Error("Sponsor not found.");
  const status = input.status ?? "prospective";
  const { amount, estimatedValue } = validateDraft({ ...input, status });
  const id = input.clientOpId?.trim() || newId();
  if (input.clientOpId?.trim()) {
    const existing = await getDoc(pathRef(db, [...festivalCol(pandalId, festivalId, "sponsorships"), id]));
    if (existing.exists()) return id;
  }
  const batch = writeBatch(db);
  let contributionId: string | undefined;
  let assetId: string | undefined;
  if (status === "received") {
    const extras = appendReceiveEffects(batch, db, actor, pandalId, festivalId, id, {
      id: sponsorId,
      name: String(sponsorSnap.data().name ?? ""),
      mobile: sponsorSnap.data().mobile ? String(sponsorSnap.data().mobile) : undefined,
    }, {
      sponsoringType: input.sponsoringType,
      purpose: input.purpose,
      purposeLabel: input.purposeLabel,
      amount,
      estimatedValue,
      itemName: input.itemName,
      quantity: input.quantity,
      serviceDescription: input.serviceDescription,
      notes: input.notes,
      paymentMethod: input.paymentMethod,
      expenseId: input.expenseId,
      pandalAsset: input.pandalAsset,
      contributionReference: `GNS-SP-${id.slice(0, 8).toUpperCase()}`,
    });
    contributionId = extras.contributionId;
    assetId = extras.assetId;
  }
  batch.set(
    pathRef(db, [...festivalCol(pandalId, festivalId, "sponsorships"), id]),
    sponsorshipPayload(actor, sponsorId, { ...input, status }, {
      contributionId,
      assetId,
      receivedAt: status === "received" ? serverTimestamp() : undefined,
      receivedBy: status === "received" ? actor.uid : undefined,
      contributionReference: `GNS-SP-${id.slice(0, 8).toUpperCase()}`,
    })
  );
  festivalAudit(batch, db, pandalId, festivalId, actor.uid, id, "created", undefined, {
    sponsorId,
    status,
    type: input.sponsoringType,
  }, "Sponsorship created");
  await commitWrite(() => batch.commit(), { label: "sponsorship" });
  return id;
}

export async function updateOpenSponsorship(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  sponsorshipId: string,
  input: {
    purpose?: SponsorshipPurpose;
    purposeLabel?: string;
    expectedDate?: string;
    notes?: string;
    amount?: number;
    estimatedValue?: number;
    itemName?: string;
    quantity?: string;
    serviceDescription?: string;
  }
): Promise<void> {
  await requireOpenFestival(db, pandalId, festivalId);
  const ref = pathRef(db, [...festivalCol(pandalId, festivalId, "sponsorships"), sponsorshipId]);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Sponsorship not found.");
  const prev = snap.data();
  if (prev.status === "received" || prev.status === "cancelled") {
    throw new Error("Only an open sponsorship can be edited.");
  }
  const batch = writeBatch(db);
  batch.update(
    ref,
    omitUndefined({
      purpose: input.purpose,
      purposeLabel: input.purposeLabel?.trim() || undefined,
      expectedDate: input.expectedDate?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
      amount: input.amount,
      estimatedValue: input.estimatedValue,
      itemName: input.itemName?.trim() || undefined,
      quantity: input.quantity?.trim() || undefined,
      serviceDescription: input.serviceDescription?.trim() || undefined,
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    })
  );
  festivalAudit(batch, db, pandalId, festivalId, actor.uid, sponsorshipId, "edited", {
    purpose: prev.purpose,
    amount: prev.amount,
  }, input, "Sponsorship updated");
  await commitWrite(() => batch.commit(), { label: "sponsorship" });
}

export async function promiseSponsorship(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  sponsorshipId: string
): Promise<void> {
  await requireOpenFestival(db, pandalId, festivalId);
  const ref = pathRef(db, [...festivalCol(pandalId, festivalId, "sponsorships"), sponsorshipId]);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Sponsorship not found.");
  assertCanPromiseSponsorship(snap.data());
  const batch = writeBatch(db);
  batch.update(ref, {
    status: "promised",
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  });
  festivalAudit(batch, db, pandalId, festivalId, actor.uid, sponsorshipId, "promised", { status: "prospective" }, {
    status: "promised",
  }, "Marked promised");
  await commitWrite(() => batch.commit(), { label: "sponsorship" });
}

export async function confirmSponsorship(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  sponsorshipId: string
): Promise<void> {
  await requireOpenFestival(db, pandalId, festivalId);
  const ref = pathRef(db, [...festivalCol(pandalId, festivalId, "sponsorships"), sponsorshipId]);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Sponsorship not found.");
  assertCanConfirmSponsorship(snap.data());
  const batch = writeBatch(db);
  batch.update(ref, {
    status: "confirmed",
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  });
  festivalAudit(batch, db, pandalId, festivalId, actor.uid, sponsorshipId, "confirmed", { status: "promised" }, {
    status: "confirmed",
  }, "Confirmed");
  await commitWrite(() => batch.commit(), { label: "sponsorship" });
}

export async function receiveSponsorship(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  sponsorshipId: string,
  input?: {
    receivedNotes?: string;
    paymentMethod?: PaymentMethod;
    pandalAsset?: SponsorAssetDraft;
    expenseId?: string;
  }
): Promise<void> {
  await requireOpenFestival(db, pandalId, festivalId);
  const ref = pathRef(db, [...festivalCol(pandalId, festivalId, "sponsorships"), sponsorshipId]);

  // Receiving a *cash* sponsorship puts real money into the festival, so its
  // status check must read through a transaction. The mirror contribution is
  // written at a deterministic id, so a double-receive left exactly one
  // contribution document and the defect was invisible — but the `increment()`
  // beside it is not idempotent, so the summary silently counted the cash twice
  // and only a recalculate would have disagreed.
  //
  // Item and service sponsorships stay on a batch: they move an estimated
  // value, not cash, and the hook gates only `sponsoringType === "cash"`
  // online, so a volunteer can still record a donated item with no signal.
  // This pre-read only routes; the cash path re-reads and re-validates inside
  // its transaction.
  const routing = await getDoc(ref);
  if (!routing.exists()) throw new Error("Sponsorship not found.");
  const isCash = String(routing.data().sponsoringType) === "cash";
  const sponsorRef = pathRef(db, [
    ...pandalSponsorsCol(pandalId),
    String(routing.data().sponsorId),
  ]);

  const append = (
    writer: GaneshWriter,
    prev: DocumentData,
    sponsor: { name: string; mobile?: string }
  ) => {
    const type = String(prev.sponsoringType) as SponsoringType;
    const received = appendReceiveEffects(writer, db, actor, pandalId, festivalId, sponsorshipId, {
      id: String(prev.sponsorId),
      name: sponsor.name,
      mobile: sponsor.mobile,
    }, {
      sponsoringType: type,
      purpose: prev.purpose,
      purposeLabel: prev.purposeLabel,
      amount: Number(prev.amount ?? 0),
      estimatedValue: Number(prev.estimatedValue ?? 0),
      itemName: prev.itemName,
      quantity: prev.quantity,
      serviceDescription: prev.serviceDescription,
      notes: prev.notes,
      paymentMethod: input?.paymentMethod ?? prev.paymentMethod,
      receivedNotes: input?.receivedNotes,
      expenseId: input?.expenseId ?? prev.expenseId,
      pandalAsset: input?.pandalAsset,
    });
    writer.update(
      ref,
      omitUndefined({
        status: "received",
        receivedAt: serverTimestamp(),
        receivedBy: actor.uid,
        receivedNotes: input?.receivedNotes?.trim() || undefined,
        paymentMethod: type === "cash" ? input?.paymentMethod ?? prev.paymentMethod : undefined,
        contributionId: received.contributionId,
        assetId: prev.assetId || received.assetId,
        expenseId: input?.expenseId ?? prev.expenseId,
        updatedBy: actor.uid,
        updatedAt: serverTimestamp(),
      })
    );
    festivalAudit(writer, db, pandalId, festivalId, actor.uid, sponsorshipId, "received", {
      status: prev.status,
    }, { status: "received" }, input?.receivedNotes?.trim() || "Marked received");
  };

  const sponsorOf = (snap: {
    exists: () => boolean;
    data: () => DocumentData | undefined;
  }) => {
    if (!snap.exists()) throw new Error("Sponsor not found.");
    const data = snap.data() ?? {};
    return {
      name: String(data.name ?? ""),
      mobile: data.mobile ? String(data.mobile) : undefined,
    };
  };

  if (isCash) {
    await runTransaction(db, async (txn) => {
      const snap = await txn.get(ref);
      if (!snap.exists()) throw new Error("Sponsorship not found.");
      const sponsorSnap = await txn.get(sponsorRef);
      const prev = snap.data();
      assertCanReceiveSponsorship(prev);
      append(txn, prev, sponsorOf(sponsorSnap));
    });
    return;
  }

  const prev = routing.data();
  assertCanReceiveSponsorship(prev);
  const sponsor = sponsorOf(await getDoc(sponsorRef));
  const batch = writeBatch(db);
  append(batch, prev, sponsor);
  await commitWrite(() => batch.commit(), { label: "receive sponsorship" });
}

export async function cancelSponsorship(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  sponsorshipId: string,
  reason?: string
): Promise<void> {
  await requireOpenFestival(db, pandalId, festivalId);
  const ref = pathRef(db, [...festivalCol(pandalId, festivalId, "sponsorships"), sponsorshipId]);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Sponsorship not found.");
  assertCanCancelSponsorship(snap.data());
  const batch = writeBatch(db);
  batch.update(
    ref,
    omitUndefined({
      status: "cancelled",
      cancelReason: reason?.trim() || undefined,
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    })
  );
  festivalAudit(batch, db, pandalId, festivalId, actor.uid, sponsorshipId, "cancelled", { status: snap.data().status }, {
    status: "cancelled",
  }, reason?.trim() || "Cancelled");
  await commitWrite(() => batch.commit(), { label: "cancel sponsorship" });
}

export async function loadSponsoredExpenseLink(
  db: Firestore,
  pandalId: string,
  festivalId: string,
  input: {
    sponsoredAmount: number;
    sponsorId?: string;
    linkedSponsorshipId?: string;
  }
): Promise<{
  sponsorId: string;
  sponsorshipId?: string;
  existing?: { sponsoringType?: string; status?: string; contributionId?: string };
} | null> {
  if (input.sponsoredAmount <= 0) return null;
  if (input.linkedSponsorshipId) {
    const snap = await getDoc(
      pathRef(db, [...festivalCol(pandalId, festivalId, "sponsorships"), input.linkedSponsorshipId])
    );
    if (!snap.exists()) throw new Error("Sponsorship not found.");
    const existing = snap.data();
    if (!canLinkSponsoredExpense(existing)) {
      throw new Error("A received cash sponsorship already entered festival cash. Pay this expense from God Fund.");
    }
    if (existing.sponsoringType !== "expense") {
      throw new Error("Link an expense-type sponsorship, or choose the sponsor to create one.");
    }
    if (existing.status !== "promised" && existing.status !== "confirmed") {
      throw new Error("Only a promised or confirmed expense sponsorship can be linked.");
    }
    return {
      sponsorId: String(existing.sponsorId ?? input.sponsorId ?? ""),
      sponsorshipId: input.linkedSponsorshipId,
      existing: {
        sponsoringType: existing.sponsoringType,
        status: existing.status,
        contributionId: existing.contributionId,
      },
    };
  }
  if (!input.sponsorId) throw new Error("Choose a sponsor for the sponsored amount.");
  const sponsorSnap = await getDoc(pathRef(db, [...pandalSponsorsCol(pandalId), input.sponsorId]));
  if (!sponsorSnap.exists()) throw new Error("Sponsor not found.");
  return { sponsorId: input.sponsorId };
}

export function appendExpenseSponsorship(
  batch: GaneshWriter,
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  input: {
    expenseId: string;
    sponsorId: string;
    sponsorshipId?: string;
    amount: number;
    purpose?: SponsorshipPurpose;
    purposeLabel?: string;
    existing?: {
      sponsoringType?: string;
      status?: string;
      contributionId?: string;
    };
  }
): string {
  if (input.existing && !canLinkSponsoredExpense(input.existing)) {
    throw new Error("A received cash sponsorship already entered festival cash. Pay this expense from God Fund.");
  }
  const id = input.sponsorshipId || newId();
  const ref = pathRef(db, [...festivalCol(pandalId, festivalId, "sponsorships"), id]);
  if (input.sponsorshipId) {
    batch.update(
      ref,
      omitUndefined({
        status: "received",
        expenseId: input.expenseId,
        amount: input.amount,
        receivedAt: serverTimestamp(),
        receivedBy: actor.uid,
        updatedBy: actor.uid,
        updatedAt: serverTimestamp(),
      })
    );
  } else {
    batch.set(
      ref,
      omitUndefined({
        sponsorId: input.sponsorId,
        sponsoringType: "expense",
        purpose: input.purpose ?? "other",
        purposeLabel: input.purposeLabel,
        status: "received",
        amount: input.amount,
        estimatedValue: 0,
        expenseId: input.expenseId,
        receivedAt: serverTimestamp(),
        receivedBy: actor.uid,
        createdBy: actor.uid,
        createdAt: serverTimestamp(),
        updatedBy: actor.uid,
        updatedAt: serverTimestamp(),
      })
    );
  }
  festivalAudit(batch, db, pandalId, festivalId, actor.uid, id, "received", { status: input.existing?.status }, {
    status: "received",
    expenseId: input.expenseId,
  }, "Linked to expense");
  return id;
}

export function sponsorshipValueOf(row: {
  sponsoringType: SponsoringType;
  amount: number;
  estimatedValue: number;
}): number {
  return sponsorshipValue(row);
}
