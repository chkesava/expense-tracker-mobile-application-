import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type Firestore,
  type WriteBatch,
} from "firebase/firestore";

import { DEFAULT_GANESH_CATEGORIES } from "@/shared/data/ganeshCategories";
import { newId } from "@/lib/id";
import { commitWrite } from "@/lib/firestoreWrite";
import { omitUndefined } from "@/shared/utils/firestorePayload";
import {
  deriveHouseholdStatus,
  summarizeLedger,
  validateCashContribution,
  validateCollection,
  validateExpenseFunding,
  validateInKindValue,
  validatePositiveAmount,
  validateReimbursement,
} from "@/shared/utils/ganeshMath";
import { generatePandalCode, normalizePandalCode } from "@/shared/utils/ganeshIdentity";
import {
  festivalCol,
  festivalDoc,
  membershipDoc,
  pandalMemberAuditsCol,
  summaryDoc,
} from "@/shared/utils/ganeshPaths";
import type {
  AuditAction,
  ContributionKind,
  ContributionStatus,
  Festival,
  GaneshMemberStatus,
  GaneshRole,
  HouseholdStatus,
  OpeningFundSource,
  PaymentMethod,
  PermanentFundLocation,
  PandalJoinMode,
} from "@/shared/types/ganesh";
import { JOIN_APPROVE_ROLES } from "@/shared/utils/ganeshPermissions";
import { EMPTY_GANESH_SUMMARY } from "@/shared/types/ganesh";
import {
  seedPermanentFund,
  transferFestivalToPermanent,
  transferPermanentToFestival,
} from "@/services/ganesh/ganeshPermanentFund";

export type GaneshActor = {
  uid: string;
  displayName: string;
  phone?: string;
};

function pathRef(db: Firestore, segments: string[]) {
  const [first, ...rest] = segments;
  return doc(db, first, ...rest);
}

function colRef(db: Firestore, segments: string[]) {
  const [first, ...rest] = segments;
  return collection(db, first, ...rest);
}

function audit(
  batch: WriteBatch,
  db: Firestore,
  pandalId: string,
  festivalId: string,
  actorId: string,
  action: AuditAction,
  entityType: string,
  entityId: string,
  extra?: { oldValue?: unknown; newValue?: unknown; reason?: string }
) {
  const id = newId();
  batch.set(
    pathRef(db, [...festivalCol(pandalId, festivalId, "auditLogs"), id]),
    omitUndefined({
      actorId,
      action,
      entityType,
      entityId,
      oldValue: extra?.oldValue ?? null,
      newValue: extra?.newValue ?? null,
      reason: extra?.reason,
      at: serverTimestamp(),
    })
  );
}

function activity(
  batch: WriteBatch,
  db: Firestore,
  pandalId: string,
  festivalId: string,
  payload: {
    title: string;
    subtitle?: string;
    amount?: number;
    estimatedValue?: number;
    actorId: string;
    entityType: string;
    entityId: string;
  }
) {
  const id = newId();
  batch.set(
    pathRef(db, [...festivalCol(pandalId, festivalId, "activity"), id]),
    omitUndefined({
      ...payload,
      createdAt: serverTimestamp(),
    })
  );
}

function memberAudit(
  batch: WriteBatch,
  db: Firestore,
  pandalId: string,
  payload: {
    actorId: string;
    targetUserId: string;
    action: "role_changed" | "suspended" | "removed" | "approved" | "join_mode";
    oldRole?: GaneshRole;
    newRole?: GaneshRole;
    oldStatus?: GaneshMemberStatus;
    newStatus?: GaneshMemberStatus;
    reason?: string;
  }
) {
  batch.set(
    pathRef(db, [...pandalMemberAuditsCol(pandalId), newId()]),
    omitUndefined({
      ...payload,
      at: serverTimestamp(),
    })
  );
}

function bumpSummary(
  batch: WriteBatch,
  db: Firestore,
  pandalId: string,
  festivalId: string,
  deltas: Partial<Record<keyof typeof EMPTY_GANESH_SUMMARY, number>>
) {
  const ref = pathRef(db, summaryDoc(pandalId, festivalId));
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  for (const [key, value] of Object.entries(deltas)) {
    if (typeof value === "number" && value !== 0) {
      payload[key] = increment(value);
    }
  }
  batch.set(ref, payload, { merge: true });
}

async function uniquePandalCode(db: Firestore): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generatePandalCode();
    const snap = await getDoc(doc(db, "pandalInvites", code));
    if (!snap.exists()) return code;
  }
  return `${generatePandalCode()}${generatePandalCode().slice(0, 2)}`;
}

export async function createPandalAndFestival(
  db: Firestore,
  actor: GaneshActor,
  input: {
    pandalName: string;
    area?: string;
    description?: string;
    festivalName: string;
    year: number;
    initialFund?: {
      amount: number;
      location: PermanentFundLocation;
      description?: string;
    };
    allocateToFestival?: {
      amount: number;
      location: PermanentFundLocation;
    };
  }
): Promise<{ pandalId: string; festivalId: string; code: string }> {
  const name = input.pandalName.trim();
  if (!name) throw new Error("Enter a Pandal name.");
  const festivalName = input.festivalName.trim() || `Ganesh Chaturthi ${input.year}`;
  const pandalId = newId();
  const festivalId = newId();
  const code = await uniquePandalCode(db);
  const stamp = {
    createdBy: actor.uid,
    createdAt: serverTimestamp(),
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  };

  const pandalBatch = writeBatch(db);
  pandalBatch.set(
    doc(db, "pandals", pandalId),
    omitUndefined({
      name,
      area: input.area?.trim() || undefined,
      description: input.description?.trim() || undefined,
      code,
      ownerId: actor.uid,
      memberIds: [actor.uid],
      joinMode: "approval" satisfies PandalJoinMode,
      adminCount: 1,
      ...stamp,
    })
  );
  pandalBatch.set(doc(db, "pandalInvites", code), {
    pandalId,
    name,
    joinMode: "approval",
    createdBy: actor.uid,
    createdAt: serverTimestamp(),
  });
  pandalBatch.set(pathRef(db, membershipDoc(actor.uid, pandalId)), {
    pandalId,
    role: "admin",
    status: "active",
    joinedAt: serverTimestamp(),
  });
  pandalBatch.set(
    doc(db, "pandals", pandalId, "members", actor.uid),
    omitUndefined({
      userId: actor.uid,
      displayName: actor.displayName,
      phone: actor.phone,
      role: "admin" satisfies GaneshRole,
      status: "active",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );
  await commitWrite(() => pandalBatch.commit(), { label: "pandal" });

  const festivalBatch = writeBatch(db);
  festivalBatch.set(pathRef(db, festivalDoc(pandalId, festivalId)), {
    name: festivalName,
    year: input.year,
    status: "open",
    contributionMode: "same",
    contributionTargetAmount: 0,
    householdTargetAmount: 500,
    ...stamp,
  });
  await commitWrite(() => festivalBatch.commit(), { label: "festival" });

  const seedBatch = writeBatch(db);
  seedBatch.set(
    pathRef(db, [...festivalCol(pandalId, festivalId, "members"), actor.uid]),
    {
      userId: actor.uid,
      displayName: actor.displayName,
      role: "admin",
      contributionTarget: 0,
      contributionPaid: 0,
      personalExpenses: 0,
      reimbursed: 0,
      pendingReimbursement: 0,
    }
  );
  seedBatch.set(pathRef(db, summaryDoc(pandalId, festivalId)), {
    ...EMPTY_GANESH_SUMMARY,
    updatedAt: serverTimestamp(),
  });
  for (const category of DEFAULT_GANESH_CATEGORIES) {
    seedBatch.set(pathRef(db, [...festivalCol(pandalId, festivalId, "categories"), newId()]), {
      name: category.name,
      isDefault: true,
      sortOrder: category.sortOrder,
      createdBy: actor.uid,
      updatedBy: actor.uid,
      createdAt: serverTimestamp(),
    });
  }
  audit(seedBatch, db, pandalId, festivalId, actor.uid, "created", "festival", festivalId, {
    newValue: { name: festivalName, year: input.year },
  });
  await commitWrite(() => seedBatch.commit(), { label: "festival seed" });

  const initialAmount = Number(input.initialFund?.amount ?? 0);
  try {
    await seedPermanentFund(db, actor, pandalId, {
      amount: initialAmount,
      location: input.initialFund?.location ?? "cash",
      description: input.initialFund?.description,
    });
  } catch (error) {
    if (initialAmount > 0) throw error;
  }

  const allocateAmount = Number(input.allocateToFestival?.amount ?? 0);
  if (allocateAmount > 0) {
    await transferPermanentToFestival(db, actor, pandalId, festivalId, {
      amount: allocateAmount,
      location: input.allocateToFestival?.location ?? input.initialFund?.location ?? "cash",
      festivalName,
      description: `Opening funds for ${festivalName}`,
    });
  }

  return { pandalId, festivalId, code };
}

export async function requestPandalJoin(
  db: Firestore,
  actor: GaneshActor,
  rawCode: string
): Promise<{ pandalId: string; pandalName: string; joined: boolean }> {
  const code = normalizePandalCode(rawCode);
  if (code.length < 4) throw new Error("Enter a valid Pandal code.");
  const invite = await getDoc(doc(db, "pandalInvites", code));
  if (!invite.exists()) throw new Error("No Pandal found for that code.");
  const pandalId = String(invite.data().pandalId);
  const pandalName = String(invite.data().name ?? "Pandal");
  const existing = await getDoc(doc(db, "pandals", pandalId, "members", actor.uid));
  if (existing.exists() && existing.data().status === "active") {
    throw new Error("You are already a member of this Pandal.");
  }
  const joinMode = (invite.data().joinMode ?? "approval") as PandalJoinMode;
  const requestId = `${pandalId}__${actor.uid}`;
  const joinBatch = writeBatch(db);
  if (joinMode === "open" && !existing.exists()) {
    joinBatch.set(
      doc(db, "pandals", pandalId, "members", actor.uid),
      omitUndefined({
        userId: actor.uid,
        displayName: actor.displayName,
        phone: actor.phone,
        role: "member" satisfies GaneshRole,
        status: "active",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
    joinBatch.set(pathRef(db, membershipDoc(actor.uid, pandalId)), {
      pandalId,
      role: "member",
      status: "active",
      joinedAt: serverTimestamp(),
    });
    await commitWrite(() => joinBatch.commit(), { label: "open join" });
    return { pandalId, pandalName, joined: true };
  }
  joinBatch.set(
    doc(db, "pandalJoinRequests", requestId),
    omitUndefined({
      pandalId,
      userId: actor.uid,
      displayName: actor.displayName,
      phone: actor.phone,
      status: "pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );
  await commitWrite(() => joinBatch.commit(), { label: "join request" });
  return { pandalId, pandalName, joined: false };
}

export async function decideJoinRequest(
  db: Firestore,
  actor: GaneshActor,
  requestId: string,
  decision: "approved" | "rejected",
  role: GaneshRole = "member"
): Promise<void> {
  const requestSnap = await getDoc(doc(db, "pandalJoinRequests", requestId));
  if (!requestSnap.exists()) throw new Error("Join request not found.");
  const request = requestSnap.data();
  const pandalId = String(request.pandalId);
  const userId = String(request.userId);
  const batch = writeBatch(db);
  batch.update(doc(db, "pandalJoinRequests", requestId), {
    status: decision,
    decidedBy: actor.uid,
    updatedAt: serverTimestamp(),
  });
  if (decision === "approved") {
    if (role === "admin" || !JOIN_APPROVE_ROLES.includes(role)) {
      throw new Error("Approve new members as Member, Collector, or Viewer.");
    }
    batch.set(
      doc(db, "pandals", pandalId, "members", userId),
      omitUndefined({
        userId,
        displayName: String(request.displayName ?? "Member"),
        phone: request.phone,
        role,
        status: "active",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      { merge: true }
    );
    batch.update(doc(db, "pandals", pandalId), {
      memberIds: arrayUnion(userId),
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    });
    batch.set(pathRef(db, membershipDoc(userId, pandalId)), {
      pandalId,
      role,
      status: "active",
      joinedAt: serverTimestamp(),
    });
    memberAudit(batch, db, pandalId, {
      actorId: actor.uid,
      targetUserId: userId,
      action: "approved",
      newRole: role,
      newStatus: "active",
    });
    const festivals = await getDocs(collection(db, "pandals", pandalId, "festivals"));
    festivals.forEach((festivalSnap) => {
      if (festivalSnap.data().status === "closed") return;
      batch.set(
        pathRef(db, [...festivalCol(pandalId, festivalSnap.id, "members"), userId]),
        {
          userId,
          displayName: String(request.displayName ?? "Member"),
          role,
          contributionTarget: Number(festivalSnap.data().contributionTargetAmount ?? 0),
          contributionPaid: 0,
          personalExpenses: 0,
          reimbursed: 0,
          pendingReimbursement: 0,
        },
        { merge: true }
      );
    });
  }
  await commitWrite(() => batch.commit(), { label: "join decision" });
}

export async function updatePandalJoinMode(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  joinMode: PandalJoinMode
): Promise<void> {
  const pandalSnap = await getDoc(doc(db, "pandals", pandalId));
  if (!pandalSnap.exists()) throw new Error("Pandal not found.");
  const code = String(pandalSnap.data().code ?? "");
  const batch = writeBatch(db);
  batch.update(doc(db, "pandals", pandalId), {
    joinMode,
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  });
  if (code) {
    batch.set(
      doc(db, "pandalInvites", normalizePandalCode(code)),
      { joinMode, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }
  memberAudit(batch, db, pandalId, {
    actorId: actor.uid,
    targetUserId: actor.uid,
    action: "join_mode",
    reason: joinMode,
  });
  await commitWrite(() => batch.commit(), { label: "join mode" });
}

export async function updatePandalMember(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  targetUserId: string,
  input: { role?: GaneshRole; status?: GaneshMemberStatus; reason?: string }
): Promise<void> {
  const [pandalSnap, memberSnap] = await Promise.all([
    getDoc(doc(db, "pandals", pandalId)),
    getDoc(doc(db, "pandals", pandalId, "members", targetUserId)),
  ]);
  if (!pandalSnap.exists() || !memberSnap.exists()) throw new Error("Member not found.");
  const oldRole = String(memberSnap.data().role ?? "member") as GaneshRole;
  const oldStatus = String(memberSnap.data().status ?? "active") as GaneshMemberStatus;
  const nextRole = input.role ?? oldRole;
  const nextStatus = input.status ?? oldStatus;
  const storedAdminCount = pandalSnap.data().adminCount;
  const adminCount = typeof storedAdminCount === "number" ? storedAdminCount : 1;
  const wasAdmin = oldRole === "admin" && oldStatus === "active";
  const willBeAdmin = nextRole === "admin" && nextStatus === "active";
  if (wasAdmin && !willBeAdmin && adminCount <= 1) {
    throw new Error("This Pandal has only one Admin. Assign another Admin before removing this user.");
  }
  const nextAdminCount = adminCount + (willBeAdmin && !wasAdmin ? 1 : 0) - (wasAdmin && !willBeAdmin ? 1 : 0);

  const batch = writeBatch(db);
  batch.update(doc(db, "pandals", pandalId, "members", targetUserId), {
    role: nextRole,
    status: nextStatus,
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, "pandals", pandalId), {
    adminCount: nextAdminCount,
    memberIds: nextStatus === "active" ? arrayUnion(targetUserId) : arrayRemove(targetUserId),
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  });
  batch.set(pathRef(db, membershipDoc(targetUserId, pandalId)), {
    pandalId,
    role: nextRole,
    status: nextStatus,
    joinedAt: memberSnap.data().createdAt ?? serverTimestamp(),
  });
  const action =
    nextStatus === "removed"
      ? "removed"
      : nextStatus === "suspended"
        ? "suspended"
        : "role_changed";
  memberAudit(batch, db, pandalId, {
    actorId: actor.uid,
    targetUserId,
    action,
    oldRole,
    newRole: nextRole,
    oldStatus,
    newStatus: nextStatus,
    reason: input.reason,
  });
  await commitWrite(() => batch.commit(), { label: "member update" });
}

export async function createFestival(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  input: { name: string; year: number }
): Promise<string> {
  const festivalId = newId();
  const members = await getDocs(collection(db, "pandals", pandalId, "members"));
  const stamp = {
    createdBy: actor.uid,
    createdAt: serverTimestamp(),
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  };
  const festivalBatch = writeBatch(db);
  festivalBatch.set(pathRef(db, festivalDoc(pandalId, festivalId)), {
    name: input.name.trim(),
    year: input.year,
    status: "open",
    contributionMode: "same",
    contributionTargetAmount: 0,
    householdTargetAmount: 500,
    ...stamp,
  });
  await commitWrite(() => festivalBatch.commit(), { label: "festival" });

  const seedBatch = writeBatch(db);
  seedBatch.set(pathRef(db, summaryDoc(pandalId, festivalId)), {
    ...EMPTY_GANESH_SUMMARY,
    updatedAt: serverTimestamp(),
  });
  members.forEach((memberSnap) => {
    const member = memberSnap.data();
    if (member.status === "removed" || member.status === "suspended") return;
    seedBatch.set(pathRef(db, [...festivalCol(pandalId, festivalId, "members"), memberSnap.id]), {
      userId: memberSnap.id,
      displayName: member.displayName ?? "Member",
      role: member.role ?? "member",
      contributionTarget: 0,
      contributionPaid: 0,
      personalExpenses: 0,
      reimbursed: 0,
      pendingReimbursement: 0,
    });
  });
  for (const category of DEFAULT_GANESH_CATEGORIES) {
    seedBatch.set(pathRef(db, [...festivalCol(pandalId, festivalId, "categories"), newId()]), {
      name: category.name,
      isDefault: true,
      sortOrder: category.sortOrder,
      createdBy: actor.uid,
      updatedBy: actor.uid,
      createdAt: serverTimestamp(),
    });
  }
  audit(seedBatch, db, pandalId, festivalId, actor.uid, "created", "festival", festivalId, {
    newValue: input,
  });
  await commitWrite(() => seedBatch.commit(), { label: "festival seed" });
  return festivalId;
}

export async function updateFestivalTargets(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  input: {
    contributionMode: "same" | "custom";
    contributionTargetAmount: number;
    householdTargetAmount: number;
    customTargets?: Record<string, number>;
  }
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(pathRef(db, festivalDoc(pandalId, festivalId)), {
    contributionMode: input.contributionMode,
    contributionTargetAmount: input.contributionTargetAmount,
    householdTargetAmount: input.householdTargetAmount,
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  });
  const members = await getDocs(colRef(db, festivalCol(pandalId, festivalId, "members")));
  members.forEach((memberSnap) => {
    const target =
      input.contributionMode === "custom"
        ? Number(input.customTargets?.[memberSnap.id] ?? 0)
        : input.contributionTargetAmount;
    batch.update(memberSnap.ref, { contributionTarget: target });
  });
  audit(batch, db, pandalId, festivalId, actor.uid, "adjusted", "festival", festivalId, {
    newValue: input,
    reason: "Updated contribution targets",
  });
  await commitWrite(() => batch.commit(), { label: "targets" });
}

export async function addOpeningFund(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  input: {
    amount: number;
    sourceType: OpeningFundSource;
    description?: string;
    date: string;
  }
): Promise<string> {
  const valid = validatePositiveAmount(input.amount, "Opening fund");
  if (!valid.ok) throw new Error(valid.error);
  const id = newId();
  const batch = writeBatch(db);
  batch.set(
    pathRef(db, [...festivalCol(pandalId, festivalId, "openingFunds"), id]),
    omitUndefined({
      amount: input.amount,
      sourceType: input.sourceType,
      description: input.description?.trim() || undefined,
      date: input.date,
      ledgerType: "OPENING_BALANCE",
      voided: false,
      createdBy: actor.uid,
      createdAt: serverTimestamp(),
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    })
  );
  bumpSummary(batch, db, pandalId, festivalId, { openingFunds: input.amount });
  activity(batch, db, pandalId, festivalId, {
    title: "Opening fund",
    subtitle: `Added by ${actor.displayName}`,
    amount: input.amount,
    actorId: actor.uid,
    entityType: "openingFund",
    entityId: id,
  });
  audit(batch, db, pandalId, festivalId, actor.uid, "created", "openingFund", id, {
    newValue: input,
  });
  await commitWrite(() => batch.commit(), { label: "opening fund" });
  return id;
}

export async function addCollection(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  input: {
    donorName: string;
    amount: number;
    paymentMethod: PaymentMethod;
    collectorId: string;
    date: string;
    mobile?: string;
    houseNumber?: string;
    address?: string;
    notes?: string;
    householdId?: string;
    expectedAmount?: number;
    createHousehold?: boolean;
  }
): Promise<string> {
  const valid = validateCollection(input.amount);
  if (!valid.ok) throw new Error(valid.error);
  const donorName = input.donorName.trim();
  if (!donorName) throw new Error("Enter the donor name.");
  const id = newId();
  const householdId = input.householdId || (input.createHousehold !== false ? newId() : undefined);
  const batch = writeBatch(db);
  batch.set(
    pathRef(db, [...festivalCol(pandalId, festivalId, "collections"), id]),
    omitUndefined({
      householdId,
      donorName,
      mobile: input.mobile?.trim() || undefined,
      houseNumber: input.houseNumber?.trim() || undefined,
      address: input.address?.trim() || undefined,
      amount: input.amount,
      paymentMethod: input.paymentMethod,
      collectorId: input.collectorId,
      notes: input.notes?.trim() || undefined,
      date: input.date,
      ledgerType: "COLLECTION",
      voided: false,
      createdBy: actor.uid,
      createdAt: serverTimestamp(),
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    })
  );

  if (householdId) {
    const householdRef = pathRef(db, [
      ...festivalCol(pandalId, festivalId, "households"),
      householdId,
    ]);
    const existing = input.householdId ? await getDoc(householdRef) : null;
    if (existing?.exists()) {
      const prev = existing.data();
      const collectedAmount = Number(prev.collectedAmount ?? 0) + input.amount;
      const expectedAmount = Number(prev.expectedAmount ?? 0);
      batch.update(householdRef, {
        collectedAmount,
        status: deriveHouseholdStatus({
          expectedAmount,
          collectedAmount,
          forcedStatus: prev.status,
        }),
        updatedBy: actor.uid,
        updatedAt: serverTimestamp(),
      });
    } else {
      const expectedAmount = Number(input.expectedAmount ?? 0);
      batch.set(
        householdRef,
        omitUndefined({
          name: donorName,
          houseNumber: input.houseNumber?.trim() || undefined,
          mobile: input.mobile?.trim() || undefined,
          area: input.address?.trim() || undefined,
          expectedAmount,
          collectedAmount: input.amount,
          status: deriveHouseholdStatus({
            expectedAmount,
            collectedAmount: input.amount,
          }),
          createdBy: actor.uid,
          createdAt: serverTimestamp(),
          updatedBy: actor.uid,
          updatedAt: serverTimestamp(),
        })
      );
    }
  }

  bumpSummary(batch, db, pandalId, festivalId, {
    chanda: input.amount,
    collectionCount: 1,
  });
  activity(batch, db, pandalId, festivalId, {
    title: `${donorName}`,
    subtitle: `Collected by member · Added by ${actor.displayName}`,
    amount: input.amount,
    actorId: actor.uid,
    entityType: "collection",
    entityId: id,
  });
  audit(batch, db, pandalId, festivalId, actor.uid, "created", "collection", id, {
    newValue: { donorName, amount: input.amount },
  });
  await commitWrite(() => batch.commit(), { label: "collection" });
  return id;
}

export async function updateHousehold(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  householdId: string,
  input: {
    expectedAmount?: number;
    assignedCollectorId?: string | null;
    status?: HouseholdStatus;
    notes?: string;
  }
): Promise<void> {
  const current = await getDoc(
    pathRef(db, [...festivalCol(pandalId, festivalId, "households"), householdId])
  );
  if (!current.exists()) throw new Error("Household not found.");
  const collectedAmount = Number(current.data().collectedAmount ?? 0);
  const expectedAmount = input.expectedAmount ?? Number(current.data().expectedAmount ?? 0);
  const householdBatch = writeBatch(db);
  householdBatch.update(current.ref, omitUndefined({
    expectedAmount,
    assignedCollectorId: input.assignedCollectorId === null ? null : input.assignedCollectorId,
    status: input.status
      ?? deriveHouseholdStatus({
        expectedAmount,
        collectedAmount,
        forcedStatus: input.status,
      }),
    notes: input.notes,
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  }));
  await commitWrite(() => householdBatch.commit(), { label: "household" });
}

export async function addContribution(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  input: {
    kind: ContributionKind;
    contributorName: string;
    contributorMemberId?: string;
    mobile?: string;
    itemName?: string;
    quantity?: string;
    amount?: number;
    estimatedValue?: number;
    isCommitteeContribution?: boolean;
    description?: string;
    date: string;
    status?: ContributionStatus;
  }
): Promise<string> {
  const contributorName = input.contributorName.trim();
  if (!contributorName) throw new Error("Enter the contributor name.");
  const amount = Number(input.amount ?? 0);
  const estimatedValue = Number(input.estimatedValue ?? 0);
  if (input.kind === "money") {
    const valid = validateCashContribution(amount);
    if (!valid.ok) throw new Error(valid.error);
  } else {
    const valid = validateInKindValue(estimatedValue);
    if (!valid.ok) throw new Error(valid.error);
  }
  const id = newId();
  const isCommittee = Boolean(input.isCommitteeContribution && input.contributorMemberId);
  const ledgerType =
    input.kind === "money"
      ? isCommittee
        ? "COMMITTEE_CONTRIBUTION"
        : "OTHER_DONATION"
      : undefined;
  const batch = writeBatch(db);
  batch.set(
    pathRef(db, [...festivalCol(pandalId, festivalId, "contributions"), id]),
    omitUndefined({
      kind: input.kind,
      contributorName,
      contributorMemberId: input.contributorMemberId,
      mobile: input.mobile?.trim() || undefined,
      itemName: input.itemName?.trim() || undefined,
      quantity: input.quantity?.trim() || undefined,
      amount,
      estimatedValue,
      isCommitteeContribution: isCommittee || undefined,
      description: input.description?.trim() || undefined,
      date: input.date,
      status: input.status ?? (input.kind === "money" ? "received" : "promised"),
      ledgerType,
      voided: false,
      createdBy: actor.uid,
      createdAt: serverTimestamp(),
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    })
  );

  const received = (input.status ?? "received") === "received";
  if (input.kind === "money" && received) {
    bumpSummary(batch, db, pandalId, festivalId, {
      committeeContributions: isCommittee ? amount : 0,
      otherCashContributions: isCommittee ? 0 : amount,
    });
    if (isCommittee && input.contributorMemberId) {
      batch.set(
        pathRef(db, [
          ...festivalCol(pandalId, festivalId, "members"),
          input.contributorMemberId,
        ]),
        { contributionPaid: increment(amount) },
        { merge: true }
      );
    }
  } else if (input.kind !== "money" && received) {
    bumpSummary(batch, db, pandalId, festivalId, {
      inKindValue: input.kind === "sponsorship" ? 0 : estimatedValue,
      sponsoredValue: input.kind === "sponsorship" ? estimatedValue : 0,
    });
  }

  activity(batch, db, pandalId, festivalId, {
    title: input.itemName?.trim() || contributorName,
    subtitle: `Contributed by ${contributorName} · Added by ${actor.displayName}`,
    amount: input.kind === "money" ? amount : undefined,
    estimatedValue: input.kind === "money" ? undefined : estimatedValue,
    actorId: actor.uid,
    entityType: "contribution",
    entityId: id,
  });
  audit(batch, db, pandalId, festivalId, actor.uid, "created", "contribution", id, {
    newValue: { contributorName, kind: input.kind, amount, estimatedValue },
  });
  await commitWrite(() => batch.commit(), { label: "contribution" });
  return id;
}

export async function updateContributionStatus(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  contributionId: string,
  status: ContributionStatus
): Promise<void> {
  const ref = pathRef(db, [...festivalCol(pandalId, festivalId, "contributions"), contributionId]);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Contribution not found.");
  const prev = snap.data();
  const prevStatus = String(prev.status);
  if (prevStatus === status) return;
  const batch = writeBatch(db);
  batch.update(ref, {
    status,
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  });
  const amount = Number(prev.amount ?? 0);
  const estimatedValue = Number(prev.estimatedValue ?? 0);
  const kind = String(prev.kind);
  const isCommittee = Boolean(prev.isCommitteeContribution);
  const becameReceived = prevStatus !== "received" && status === "received";
  const leftReceived = prevStatus === "received" && status !== "received";
  const sign = becameReceived ? 1 : leftReceived ? -1 : 0;
  if (sign !== 0 && kind === "money") {
    bumpSummary(batch, db, pandalId, festivalId, {
      committeeContributions: isCommittee ? amount * sign : 0,
      otherCashContributions: isCommittee ? 0 : amount * sign,
    });
    if (isCommittee && prev.contributorMemberId) {
      batch.set(
        pathRef(db, [
          ...festivalCol(pandalId, festivalId, "members"),
          String(prev.contributorMemberId),
        ]),
        { contributionPaid: increment(amount * sign) },
        { merge: true }
      );
    }
  } else if (sign !== 0 && kind !== "money") {
    bumpSummary(batch, db, pandalId, festivalId, {
      inKindValue: kind === "sponsorship" ? 0 : estimatedValue * sign,
      sponsoredValue: kind === "sponsorship" ? estimatedValue * sign : 0,
    });
  }
  audit(batch, db, pandalId, festivalId, actor.uid, "edited", "contribution", contributionId, {
    oldValue: { status: prevStatus },
    newValue: { status },
  });
  await commitWrite(() => batch.commit(), { label: "contribution status" });
}

export async function addExpense(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  input: {
    name: string;
    totalAmount: number;
    godFundAmount: number;
    personalAmount: number;
    sponsoredAmount?: number;
    categoryId: string;
    categoryName: string;
    paidByMemberId: string;
    vendor?: string;
    description?: string;
    notes?: string;
    date: string;
    receiptPath?: string;
    linkedContributionId?: string;
  }
): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Error("Enter the expense name.");
  const sponsoredAmount = input.sponsoredAmount ?? 0;
  const valid = validateExpenseFunding({
    totalAmount: input.totalAmount,
    godFundAmount: input.godFundAmount,
    personalAmount: input.personalAmount,
    sponsoredAmount,
  });
  if (!valid.ok) throw new Error(valid.error);
  const id = newId();
  const batch = writeBatch(db);
  batch.set(
    pathRef(db, [...festivalCol(pandalId, festivalId, "expenses"), id]),
    omitUndefined({
      name,
      totalAmount: input.totalAmount,
      godFundAmount: input.godFundAmount,
      personalAmount: input.personalAmount,
      sponsoredAmount,
      categoryId: input.categoryId,
      categoryName: input.categoryName,
      paidByMemberId: input.paidByMemberId,
      vendor: input.vendor?.trim() || undefined,
      description: input.description?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
      date: input.date,
      receiptPath: input.receiptPath,
      linkedContributionId: input.linkedContributionId,
      ledgerType: "EXPENSE",
      voided: false,
      createdBy: actor.uid,
      createdAt: serverTimestamp(),
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    })
  );
  bumpSummary(batch, db, pandalId, festivalId, {
    godFundExpenses: input.godFundAmount,
    personalMoneyUsed: input.personalAmount,
    pendingReimbursements: input.personalAmount,
    expenseCount: 1,
  });
  if (input.personalAmount > 0) {
    batch.set(
      pathRef(db, [...festivalCol(pandalId, festivalId, "members"), input.paidByMemberId]),
      {
        personalExpenses: increment(input.personalAmount),
        pendingReimbursement: increment(input.personalAmount),
      },
      { merge: true }
    );
  }
  activity(batch, db, pandalId, festivalId, {
    title: name,
    subtitle: `Paid by member · Added by ${actor.displayName}`,
    amount: input.totalAmount,
    actorId: actor.uid,
    entityType: "expense",
    entityId: id,
  });
  audit(batch, db, pandalId, festivalId, actor.uid, "created", "expense", id, {
    newValue: input,
  });
  await commitWrite(() => batch.commit(), { label: "expense" });
  return id;
}

export async function addReimbursement(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  input: {
    memberId: string;
    amount: number;
    paymentMethod: PaymentMethod;
    date: string;
    notes?: string;
    pendingPersonalExpense: number;
  }
): Promise<string> {
  const valid = validateReimbursement(input.amount, input.pendingPersonalExpense);
  if (!valid.ok) throw new Error(valid.error);
  const id = newId();
  const batch = writeBatch(db);
  batch.set(
    pathRef(db, [...festivalCol(pandalId, festivalId, "reimbursements"), id]),
    omitUndefined({
      memberId: input.memberId,
      amount: input.amount,
      paymentMethod: input.paymentMethod,
      date: input.date,
      notes: input.notes?.trim() || undefined,
      ledgerType: "REIMBURSEMENT",
      voided: false,
      createdBy: actor.uid,
      createdAt: serverTimestamp(),
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    })
  );
  bumpSummary(batch, db, pandalId, festivalId, {
    reimbursements: input.amount,
    pendingReimbursements: -input.amount,
  });
  batch.set(
    pathRef(db, [...festivalCol(pandalId, festivalId, "members"), input.memberId]),
    {
      reimbursed: increment(input.amount),
      pendingReimbursement: increment(-input.amount),
    },
    { merge: true }
  );
  activity(batch, db, pandalId, festivalId, {
    title: "Reimbursement",
    subtitle: `Recorded by ${actor.displayName}`,
    amount: input.amount,
    actorId: actor.uid,
    entityType: "reimbursement",
    entityId: id,
  });
  audit(batch, db, pandalId, festivalId, actor.uid, "reimbursed", "reimbursement", id, {
    newValue: input,
  });
  await commitWrite(() => batch.commit(), { label: "reimbursement" });
  return id;
}

export async function voidFinancialRecord(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  input: {
    entityType: "openingFund" | "collection" | "contribution" | "expense" | "reimbursement";
    entityId: string;
    reason: string;
  }
): Promise<void> {
  const colName =
    input.entityType === "openingFund"
      ? "openingFunds"
      : input.entityType === "collection"
        ? "collections"
        : input.entityType === "contribution"
          ? "contributions"
          : input.entityType === "expense"
            ? "expenses"
            : "reimbursements";
  const ref = pathRef(db, [...festivalCol(pandalId, festivalId, colName), input.entityId]);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Record not found.");
  if (snap.data().voided) throw new Error("This record is already voided.");
  const data = snap.data();
  if (input.entityType === "openingFund" && data.sourceType === "permanent_fund") {
    throw new Error(
      "Return Permanent Fund money from the Permanent Fund screen. Do not void this opening fund."
    );
  }
  const batch = writeBatch(db);
  batch.update(ref, {
    voided: true,
    voidReason: input.reason.trim() || "Voided",
    voidedBy: actor.uid,
    voidedAt: serverTimestamp(),
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  });

  if (input.entityType === "openingFund") {
    bumpSummary(batch, db, pandalId, festivalId, { openingFunds: -Number(data.amount ?? 0) });
  } else if (input.entityType === "collection") {
    bumpSummary(batch, db, pandalId, festivalId, {
      chanda: -Number(data.amount ?? 0),
      collectionCount: -1,
    });
    if (data.householdId) {
      const householdRef = pathRef(db, [
        ...festivalCol(pandalId, festivalId, "households"),
        String(data.householdId),
      ]);
      const household = await getDoc(householdRef);
      if (household.exists()) {
        const collectedAmount = Math.max(
          0,
          Number(household.data().collectedAmount ?? 0) - Number(data.amount ?? 0)
        );
        batch.update(householdRef, {
          collectedAmount,
          status: deriveHouseholdStatus({
            expectedAmount: Number(household.data().expectedAmount ?? 0),
            collectedAmount,
          }),
          updatedBy: actor.uid,
          updatedAt: serverTimestamp(),
        });
      }
    }
  } else if (input.entityType === "contribution") {
    if (data.status === "received" && data.kind === "money") {
      const amount = Number(data.amount ?? 0);
      bumpSummary(batch, db, pandalId, festivalId, {
        committeeContributions: data.isCommitteeContribution ? -amount : 0,
        otherCashContributions: data.isCommitteeContribution ? 0 : -amount,
      });
      if (data.isCommitteeContribution && data.contributorMemberId) {
        batch.set(
          pathRef(db, [
            ...festivalCol(pandalId, festivalId, "members"),
            String(data.contributorMemberId),
          ]),
          { contributionPaid: increment(-amount) },
          { merge: true }
        );
      }
    } else if (data.status === "received" && data.kind !== "money") {
      const estimatedValue = Number(data.estimatedValue ?? 0);
      bumpSummary(batch, db, pandalId, festivalId, {
        inKindValue: data.kind === "sponsorship" ? 0 : -estimatedValue,
        sponsoredValue: data.kind === "sponsorship" ? -estimatedValue : 0,
      });
    }
  } else if (input.entityType === "expense") {
    const godFundAmount = Number(data.godFundAmount ?? 0);
    const personalAmount = Number(data.personalAmount ?? 0);
    bumpSummary(batch, db, pandalId, festivalId, {
      godFundExpenses: -godFundAmount,
      personalMoneyUsed: -personalAmount,
      pendingReimbursements: -personalAmount,
      expenseCount: -1,
    });
    if (personalAmount > 0 && data.paidByMemberId) {
      batch.set(
        pathRef(db, [...festivalCol(pandalId, festivalId, "members"), String(data.paidByMemberId)]),
        {
          personalExpenses: increment(-personalAmount),
          pendingReimbursement: increment(-personalAmount),
        },
        { merge: true }
      );
    }
  } else if (input.entityType === "reimbursement") {
    const amount = Number(data.amount ?? 0);
    bumpSummary(batch, db, pandalId, festivalId, {
      reimbursements: -amount,
      pendingReimbursements: amount,
    });
    batch.set(
      pathRef(db, [...festivalCol(pandalId, festivalId, "members"), String(data.memberId)]),
      {
        reimbursed: increment(-amount),
        pendingReimbursement: increment(amount),
      },
      { merge: true }
    );
  }

  audit(batch, db, pandalId, festivalId, actor.uid, "voided", input.entityType, input.entityId, {
    oldValue: data,
    reason: input.reason,
  });
  await commitWrite(() => batch.commit(), { label: "void" });
}

export async function closeFestival(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  settlement?: {
    transferAmount: number;
    remainingAmount: number;
    location: PermanentFundLocation;
    festivalName?: string;
  }
): Promise<void> {
  const transferAmount = Number(settlement?.transferAmount ?? 0);
  if (transferAmount > 0) {
    await transferFestivalToPermanent(db, actor, pandalId, festivalId, {
      amount: transferAmount,
      location: settlement?.location ?? "cash",
      festivalName: settlement?.festivalName,
      type: "CARRY_FORWARD",
      closeFestival: true,
      description: "Festival closing carry forward",
    });
    return;
  }
  const batch = writeBatch(db);
  batch.update(pathRef(db, festivalDoc(pandalId, festivalId)), {
    status: "closed",
    closedAt: serverTimestamp(),
    closedBy: actor.uid,
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  });
  audit(batch, db, pandalId, festivalId, actor.uid, "closed", "festival", festivalId, {
    reason: "Festival closed",
  });
  await commitWrite(() => batch.commit(), { label: "close festival" });
}

export async function recomputeFestivalSummary(
  db: Firestore,
  pandalId: string,
  festivalId: string
): Promise<void> {
  const load = async (name: Parameters<typeof festivalCol>[2]) =>
    getDocs(query(colRef(db, festivalCol(pandalId, festivalId, name)), limit(2000)));

  const [opening, collections, contributions, expenses, reimbursements, fundTransfers] =
    await Promise.all([
      load("openingFunds"),
      load("collections"),
      load("contributions"),
      load("expenses"),
      load("reimbursements"),
      load("fundTransfers"),
    ]);

  const notVoided = (docSnap: { data: () => { voided?: boolean } }) => !docSnap.data().voided;
  const received = (docSnap: { data: () => { voided?: boolean; status?: string } }) =>
    notVoided(docSnap) && docSnap.data().status !== "cancelled" && docSnap.data().status !== "promised";

  const summary = summarizeLedger({
    openingFunds: opening.docs.filter(notVoided).map((docSnap) => Number(docSnap.data().amount ?? 0)),
    collections: collections.docs.filter(notVoided).map((docSnap) => Number(docSnap.data().amount ?? 0)),
    committeeContributions: contributions.docs
      .filter((docSnap) => received(docSnap) && docSnap.data().kind === "money" && docSnap.data().isCommitteeContribution)
      .map((docSnap) => Number(docSnap.data().amount ?? 0)),
    otherCashContributions: contributions.docs
      .filter((docSnap) => received(docSnap) && docSnap.data().kind === "money" && !docSnap.data().isCommitteeContribution)
      .map((docSnap) => Number(docSnap.data().amount ?? 0)),
    godFundExpenses: expenses.docs.filter(notVoided).map((docSnap) => Number(docSnap.data().godFundAmount ?? 0)),
    reimbursements: reimbursements.docs.filter(notVoided).map((docSnap) => Number(docSnap.data().amount ?? 0)),
    personalAmounts: expenses.docs.filter(notVoided).map((docSnap) => Number(docSnap.data().personalAmount ?? 0)),
    inKindValues: contributions.docs
      .filter((docSnap) => received(docSnap) && docSnap.data().kind !== "money" && docSnap.data().kind !== "sponsorship")
      .map((docSnap) => Number(docSnap.data().estimatedValue ?? 0)),
    sponsoredValues: contributions.docs
      .filter((docSnap) => received(docSnap) && docSnap.data().kind === "sponsorship")
      .map((docSnap) => Number(docSnap.data().estimatedValue ?? 0)),
  });
  summary.transferredToPermanentFund = fundTransfers.docs
    .filter((docSnap) => docSnap.data().direction === "to_permanent")
    .reduce((sum, docSnap) => sum + Number(docSnap.data().amount ?? 0), 0);
  summary.receivedFromPermanentFund = fundTransfers.docs
    .filter((docSnap) => docSnap.data().direction === "from_permanent")
    .reduce((sum, docSnap) => sum + Number(docSnap.data().amount ?? 0), 0);

  const summaryBatch = writeBatch(db);
  summaryBatch.set(pathRef(db, summaryDoc(pandalId, festivalId)), {
    ...summary,
    updatedAt: serverTimestamp(),
  });
  await commitWrite(() => summaryBatch.commit(), { label: "recompute" });
}

export async function addCustomCategory(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  name: string
): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Enter a category name.");
  const id = newId();
  const categoryBatch = writeBatch(db);
  categoryBatch.set(pathRef(db, [...festivalCol(pandalId, festivalId, "categories"), id]), {
    name: trimmed,
    isDefault: false,
    sortOrder: 500,
    createdBy: actor.uid,
    updatedBy: actor.uid,
    createdAt: serverTimestamp(),
  });
  await commitWrite(() => categoryBatch.commit(), { label: "category" });
  return id;
}

export async function listOpenFestivalIds(db: Firestore, pandalId: string): Promise<Festival[]> {
  const snap = await getDocs(
    query(collection(db, "pandals", pandalId, "festivals"), where("status", "==", "open"))
  );
  return snap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as Omit<Festival, "id">),
  }));
}
