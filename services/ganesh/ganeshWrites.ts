import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  doc,
  documentId,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  where,
  writeBatch,
  type Firestore,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Transaction,
  type WriteBatch,
} from "firebase/firestore";

import { DEFAULT_GANESH_CATEGORIES } from "@/shared/data/ganeshCategories";
import { errorCode, logError } from "@/lib/errors";
import { newId } from "@/lib/id";
import { commitWrite } from "@/lib/firestoreWrite";
import { omitUndefined } from "@/shared/utils/firestorePayload";
import {
  availableGodFund,
  deriveHouseholdStatus,
  formatCollectionReceipt,
  locationDelta,
  mapHouseholdForNewFestival,
  money,
  parseGaneshSummary,
  resolveFundLocation,
  summarizeLedger,
  validateCashContribution,
  validateCollection,
  validateExpenseFunding,
  validateGodFundLocationSpend,
  validateGodFundSpend,
  validateInKindValue,
  validateNonNegativeAmount,
  validatePositiveAmount,
  validateReimbursement,
  validateReimbursementReversal,
  validateSettlement,
} from "@/shared/utils/ganeshMath";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { ganeshStoredPath } from "@/services/ganesh/storage/storagePaths";
import { generatePandalCode, normalizePandalCode } from "@/shared/utils/ganeshIdentity";
import { validateFestivalWindow } from "@/shared/utils/ganeshSeva";
import { requireOpenFestival } from "@/services/ganesh/ganeshFestivalGuard";
import {
  duplicateFestivalYearMessage,
  planFestivalYearClaim,
  yearTakenByAnotherFestival,
} from "@/shared/utils/ganeshFestivalYear";
import {
  festivalCol,
  festivalDoc,
  festivalYearDoc,
  membershipDoc,
  pandalAssetsCol,
  pandalMemberAuditsCol,
  summaryDoc,
} from "@/shared/utils/ganeshPaths";
import type {
  AuditAction,
  ContributionKind,
  ContributionStatus,
  Festival,
  GaneshFileMeta,
  GaneshMemberStatus,
  GaneshRole,
  HouseholdStatus,
  OpeningFundSource,
  PaymentMethod,
  PermanentFundLocation,
  PandalJoinMode,
  SponsorshipPurpose,
} from "@/shared/types/ganesh";
import {
  appendExpenseSponsorship,
  loadSponsoredExpenseLink,
} from "@/services/ganesh/ganeshSponsors";
import {
  assertCanCancelContribution,
  assertCanReceiveContribution,
  isReceived,
} from "@/shared/utils/ganeshContributions";
import { JOIN_APPROVE_ROLES, ALL_GANESH_PERMISSIONS, ROLE_PERMISSIONS } from "@/shared/utils/ganeshPermissions";
import { expandPermissions } from "@/shared/utils/ganeshPermissionRegistry";
import type { PandalMemberAuditAction } from "@/shared/types/ganesh";
import {
  appendAssetAcquisitionCost,
  appendPandalAssetCreate,
  type CreatePandalAssetInput,
} from "@/services/ganesh/ganeshAssets";
import type { GaneshWriter } from "@/services/ganesh/ganeshWriter";
import {
  festivalMemberSeedPayload,
  shouldSeedFestivalMember,
} from "@/shared/utils/ganeshFestivalMemberSeed";
import { tryStampPandalMembershipIndex } from "@/services/ganesh/ganeshMembershipIndex";
import { ensurePandalRoles } from "@/services/ganesh/ganeshRoles";
import { EMPTY_GANESH_SUMMARY } from "@/shared/types/ganesh";
import {
  InsufficientFundError,
  seedPermanentFund,
  transferFestivalToPermanent,
  transferPermanentToFestival,
} from "@/services/ganesh/ganeshPermanentFund";

export { requireOpenFestival };

export {
  assertGodFundSpendOnline,
  assertMoneyReceiveOnline,
  assertPromiseCancelOnline,
  assertReimbursementOnline,
  assertVoidOnline,
  GOD_FUND_SPEND_OFFLINE_ERROR,
  LEDGER_VOID_OFFLINE_ERROR,
  MONEY_RECEIVE_OFFLINE_ERROR,
  PROMISE_CANCEL_OFFLINE_ERROR,
  REIMBURSEMENT_OFFLINE_ERROR,
} from "@/shared/utils/ganeshContributions";

export type GaneshActor = {
  uid: string;
  displayName: string;
  phone?: string;
};


function pathRef(db: Firestore, segments: string[]) {
  const [first, ...rest] = segments;
  return doc(db, first, ...rest);
}

async function readOwnMemberDoc(
  db: Firestore,
  pandalId: string,
  uid: string
): Promise<{ status?: string } | null> {
  try {
    const snap = await getDoc(doc(db, "pandals", pandalId, "members", uid));
    if (!snap.exists()) return null;
    return snap.data() as { status?: string };
  } catch (error) {
    if (errorCode(error) === "permission-denied") return null;
    throw error;
  }
}

function colRef(db: Firestore, segments: string[]) {
  const [first, ...rest] = segments;
  return collection(db, first, ...rest);
}

function audit(
  batch: GaneshWriter,
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
  batch: GaneshWriter,
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
  batch: GaneshWriter,
  db: Firestore,
  pandalId: string,
  payload: {
    actorId: string;
    targetUserId: string;
    action: PandalMemberAuditAction;
    oldRole?: GaneshRole;
    newRole?: GaneshRole;
    oldStatus?: GaneshMemberStatus;
    newStatus?: GaneshMemberStatus;
    roleId?: string;
    roleName?: string;
    oldPermissions?: string[];
    newPermissions?: string[];
    /** Free-form before/after, for Pandal-level edits that are not role changes. */
    oldValue?: unknown;
    newValue?: unknown;
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
  batch: GaneshWriter,
  db: Firestore,
  pandalId: string,
  festivalId: string,
  deltas: Partial<Record<keyof typeof EMPTY_GANESH_SUMMARY, number>>
) {
  const ref = pathRef(db, summaryDoc(pandalId, festivalId));
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  for (const [key, value] of Object.entries(deltas)) {
    if (typeof value === "number" && value !== 0) {
      // Rounded before it is stored (GS-081). Raw values went straight into
      // `increment()`, so the stored components drifted permanently; only the
      // derived figures were rounded, which hid the drift rather than avoiding
      // it, and comparisons against the stored values were unrounded.
      payload[key] = increment(money(value));
    }
  }
  batch.set(ref, payload, { merge: true });
}

function locationBump(method: string | undefined, signedAmount: number) {
  return locationDelta(resolveFundLocation(method), signedAmount);
}

function requireCashMethod(paymentMethod?: PaymentMethod): PaymentMethod {
  if (!paymentMethod) {
    throw new Error("Choose Cash, UPI, Bank or Other.");
  }
  return resolveFundLocation(paymentMethod);
}

function requireGodFundMethod(
  godFundAmount: number,
  paymentMethod?: PaymentMethod
): PaymentMethod | undefined {
  if (!(godFundAmount > 0)) {
    return paymentMethod ? resolveFundLocation(paymentMethod) : undefined;
  }
  if (!paymentMethod) {
    throw new Error("Choose how the God Fund paid: Cash, UPI, Bank or Other.");
  }
  return resolveFundLocation(paymentMethod);
}

async function commitFestivalAndYearClaim(
  db: Firestore,
  pandalId: string,
  festivalId: string,
  year: number,
  festivalPayload?: Record<string, unknown>
): Promise<void> {
  await runTransaction(db, async (txn) => {
    const yearRef = pathRef(db, festivalYearDoc(pandalId, year));
    const festivalRef = pathRef(db, festivalDoc(pandalId, festivalId));
    const yearSnap = await txn.get(yearRef);
    const festivalSnap = await txn.get(festivalRef);
    const claim = planFestivalYearClaim({
      year,
      claimingFestivalId: festivalId,
      sentinel: yearSnap.exists()
        ? { festivalId: String(yearSnap.data().festivalId ?? "") }
        : undefined,
      festivalExists: festivalSnap.exists(),
    });
    if (!claim.ok) throw new Error(claim.error);
    if (claim.writeFestival) {
      if (!festivalPayload) throw new Error("Festival could not be created.");
      txn.set(festivalRef, festivalPayload);
    }
    if (claim.writeSentinel) {
      txn.set(yearRef, { festivalId, year });
    }
  });
}

async function uniquePandalCode(db: Firestore): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generatePandalCode();
    const snap = await getDoc(doc(db, "pandalInvites", code));
    if (!snap.exists()) return code;
  }
  // GS-088: the last-resort code skipped the uniqueness check the eight
  // attempts above exist to perform. A collision here is not silent — the
  // batch's `set` on an existing pandalInvites document is refused by the
  // rules, failing the whole creation — but failing loudly at the end of a
  // Pandal setup is a poor outcome when checking costs one read.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = `${generatePandalCode()}${generatePandalCode().slice(0, 2)}`;
    const snap = await getDoc(doc(db, "pandalInvites", code));
    if (!snap.exists()) return code;
  }
  throw new Error("Could not allocate a Pandal code. Please try again.");
}

async function seedFirstFestival(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  festivalName: string,
  year: number,
  stamp: { createdBy: string; createdAt: unknown; updatedBy: string; updatedAt: unknown }
): Promise<void> {
  const festivalRef = pathRef(db, festivalDoc(pandalId, festivalId));
  const existing = await getDoc(festivalRef);
  const created = !existing.exists();
  await commitFestivalAndYearClaim(
    db,
    pandalId,
    festivalId,
    year,
    created
      ? {
          name: festivalName,
          year,
          status: "open",
          contributionMode: "same",
          contributionTargetAmount: 0,
          householdTargetAmount: 500,
          ...stamp,
        }
      : undefined
  );

  const seedBatch = writeBatch(db);
  seedBatch.set(
    pathRef(db, [...festivalCol(pandalId, festivalId, "members"), actor.uid]),
    festivalMemberSeedPayload({
      userId: actor.uid,
      displayName: actor.displayName,
      role: "admin",
    }),
    { merge: true }
  );
  seedBatch.set(
    pathRef(db, summaryDoc(pandalId, festivalId)),
    {
      ...EMPTY_GANESH_SUMMARY,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  const categoriesSnap = await getDocs(colRef(db, [...festivalCol(pandalId, festivalId, "categories")]));
  if (categoriesSnap.empty) {
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
  }
  if (created) {
    audit(seedBatch, db, pandalId, festivalId, actor.uid, "created", "festival", festivalId, {
      newValue: { name: festivalName, year },
    });
  }
  await commitWrite(() => seedBatch.commit(), { label: "festival seed" });
}

async function seedFirstFestivalWithRetry(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  festivalName: string,
  year: number,
  stamp: { createdBy: string; createdAt: unknown; updatedBy: string; updatedAt: unknown }
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await seedFirstFestival(db, actor, pandalId, festivalId, festivalName, year, stamp);
      return;
    } catch (error) {
      lastError = error;
      logError("ganesh.festivalSeed.retry", error);
    }
  }
  throw lastError;
}

async function seedOpenFestivalMemberRows(
  db: Firestore,
  pandalId: string,
  userId: string,
  displayName: string,
  role: GaneshRole
): Promise<void> {
  const festivals = await getDocs(collection(db, "pandals", pandalId, "festivals"));
  const batch = writeBatch(db);
  let writes = 0;
  festivals.forEach((festivalSnap) => {
    if (!shouldSeedFestivalMember(festivalSnap.data().status)) return;
    writes += 1;
    batch.set(
      pathRef(db, [...festivalCol(pandalId, festivalSnap.id, "members"), userId]),
      festivalMemberSeedPayload({
        userId,
        displayName,
        role,
        contributionTarget: Number(festivalSnap.data().contributionTargetAmount ?? 0),
      }),
      { merge: true }
    );
  });
  if (writes === 0) return;
  await commitWrite(() => batch.commit(), { label: "open join festival members" });
}

export async function createPandalAndFestival(
  db: Firestore,
  actor: GaneshActor,
  input: {
    pandalName: string;
    area?: string;
    description?: string;
    contactPhone?: string;
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
      contactPhone: input.contactPhone?.trim() || undefined,
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
    pandalName: name,
    joinedAt: serverTimestamp(),
  });
  pandalBatch.set(
    doc(db, "pandals", pandalId, "members", actor.uid),
    omitUndefined({
      userId: actor.uid,
      displayName: actor.displayName,
      phone: actor.phone,
      role: "admin" satisfies GaneshRole,
      roleIds: [],
      permissions: [...ALL_GANESH_PERMISSIONS],
      status: "active",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );
  await commitWrite(() => pandalBatch.commit(), { label: "pandal" });
  try {
    const createdAudit = writeBatch(db);
    memberAudit(createdAudit, db, pandalId, {
      actorId: actor.uid,
      targetUserId: actor.uid,
      action: "pandal_created",
      newRole: "admin",
      newStatus: "active",
    });
    await commitWrite(() => createdAudit.commit(), { label: "pandal created audit" });
  } catch (error) {
    logError("ganesh.pandalCreatedAudit", error);
  }
  try {
    await ensurePandalRoles(db, actor, pandalId);
  } catch (error) {
    logError("ganesh.ensurePandalRoles", error);
  }

  await seedFirstFestivalWithRetry(db, actor, pandalId, festivalId, festivalName, input.year, stamp);

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
  const existing = await readOwnMemberDoc(db, pandalId, actor.uid);
  if (existing?.status === "active") {
    throw new Error("You are already a member of this Pandal.");
  }
  const joinMode = (invite.data().joinMode ?? "approval") as PandalJoinMode;
  const requestId = `${pandalId}__${actor.uid}`;
  const joinBatch = writeBatch(db);
  if (joinMode === "open" && !existing) {
    joinBatch.set(
      doc(db, "pandals", pandalId, "members", actor.uid),
      omitUndefined({
        userId: actor.uid,
        displayName: actor.displayName,
        phone: actor.phone,
        role: "member" satisfies GaneshRole,
        roleIds: ["member"],
        permissions: expandPermissions([...ROLE_PERMISSIONS.member]),
        status: "active",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
    joinBatch.set(pathRef(db, membershipDoc(actor.uid, pandalId)), {
      pandalId,
      role: "member",
      status: "active",
      pandalName,
      joinedAt: serverTimestamp(),
    });
    await commitWrite(() => joinBatch.commit(), { label: "open join" });
    try {
      await seedOpenFestivalMemberRows(db, pandalId, actor.uid, actor.displayName, "member");
    } catch (error) {
      logError("ganesh.openJoin.festivalMembers", error);
    }
    return { pandalId, pandalName, joined: true };
  }
  joinBatch.set(
    doc(db, "pandalJoinRequests", requestId),
    omitUndefined({
      pandalId,
      pandalName,
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
  assignment: GaneshRole | { roleId: string } = "member"
): Promise<void> {
  const requestSnap = await getDoc(doc(db, "pandalJoinRequests", requestId));
  if (!requestSnap.exists()) throw new Error("Join request not found.");
  const request = requestSnap.data();
  const pandalId = String(request.pandalId);
  const userId = String(request.userId);
  const batch = writeBatch(db);
  let approvedRole: GaneshRole | undefined;
  batch.update(doc(db, "pandalJoinRequests", requestId), {
    status: decision,
    decidedBy: actor.uid,
    updatedAt: serverTimestamp(),
  });
  if (decision === "approved") {
    const roleId = typeof assignment === "string" ? assignment : assignment.roleId;
    if (roleId === "admin") {
      throw new Error("Approve new members with a committee role. Admin is not self-serve.");
    }
    const roles = await ensurePandalRoles(db, actor, pandalId);
    const assigned = roles.find((item) => item.id === roleId);
    const fallbackRole =
      typeof assignment === "string" && JOIN_APPROVE_ROLES.includes(assignment)
        ? assignment
        : "member";
    if (!assigned && !JOIN_APPROVE_ROLES.includes(fallbackRole)) {
      throw new Error("Choose a valid role.");
    }
    const role: GaneshRole =
      assigned && JOIN_APPROVE_ROLES.includes(assigned.id as GaneshRole)
        ? (assigned.id as GaneshRole)
        : fallbackRole;
    approvedRole = role;
    const roleIds = [assigned?.id ?? role];
    const permissions = assigned
      ? expandPermissions(assigned.permissions)
      : expandPermissions([...ROLE_PERMISSIONS[role]]);
    batch.set(
      doc(db, "pandals", pandalId, "members", userId),
      omitUndefined({
        userId,
        displayName: String(request.displayName ?? "Member"),
        phone: request.phone,
        role,
        roleIds,
        permissions,
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
    memberAudit(batch, db, pandalId, {
      actorId: actor.uid,
      targetUserId: userId,
      action: "approved",
      newRole: role,
      newStatus: "active",
      roleId: roleIds[0],
      roleName: assigned?.name,
    });
    const festivals = await getDocs(collection(db, "pandals", pandalId, "festivals"));
    festivals.forEach((festivalSnap) => {
      if (!shouldSeedFestivalMember(festivalSnap.data().status)) return;
      batch.set(
        pathRef(db, [...festivalCol(pandalId, festivalSnap.id, "members"), userId]),
        festivalMemberSeedPayload({
          userId,
          displayName: String(request.displayName ?? "Member"),
          role,
          contributionTarget: Number(festivalSnap.data().contributionTargetAmount ?? 0),
        }),
        { merge: true }
      );
    });
  } else {
    memberAudit(batch, db, pandalId, {
      actorId: actor.uid,
      targetUserId: userId,
      action: "rejected",
    });
  }
  await commitWrite(() => batch.commit(), { label: "join decision" });
  if (approvedRole) {
    await tryStampPandalMembershipIndex(db, userId, {
      pandalId,
      role: approvedRole,
      status: "active",
      pandalName: String(request.pandalName ?? ""),
    });
  }
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

/**
 * Archive or restore a Pandal (GS-017).
 *
 * The replacement for hard delete, which `firestore.rules` now refuses: a
 * Pandal delete cannot cascade in Firestore, so it would leave every festival
 * ledger unreachable and undeletable rather than removed. Archiving keeps all
 * of it readable and is reversible.
 *
 * Refuses while any festival is still open. An open festival means money is
 * still moving and may hold an unsettled balance, so archiving around it would
 * strand that money — the committee settles first. Closing implicitly here
 * would bypass `closeFestival`'s balance acknowledgement, which is a
 * deliberate money guard.
 */
export async function setPandalArchived(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  input: { archived: boolean; reason?: string }
): Promise<void> {
  const reason = input.reason?.trim();
  if (input.archived && !reason) {
    throw new Error("Enter a reason for archiving this Pandal.");
  }

  const pandalSnap = await getDoc(doc(db, "pandals", pandalId));
  if (!pandalSnap.exists()) throw new Error("Pandal not found.");
  const alreadyArchived = pandalSnap.data().archived === true;
  if (alreadyArchived === input.archived) return;

  if (input.archived) {
    const open = await listOpenFestivalIds(db, pandalId);
    if (open.length > 0) {
      const names = open.map((festival) => festival.name).filter(Boolean).join(", ");
      throw new Error(
        names
          ? `Close ${names} before archiving this Pandal, so any money left in it is settled first.`
          : "Close this Pandal's open festival before archiving it."
      );
    }
  }

  const batch = writeBatch(db);
  batch.update(doc(db, "pandals", pandalId), {
    archived: input.archived,
    // Cleared on restore so a stale reason cannot outlive the state.
    archivedBy: input.archived ? actor.uid : deleteField(),
    archivedAt: input.archived ? serverTimestamp() : deleteField(),
    archiveReason: input.archived ? reason : deleteField(),
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  });
  memberAudit(batch, db, pandalId, {
    actorId: actor.uid,
    targetUserId: actor.uid,
    action: input.archived ? "pandal_archived" : "pandal_restored",
    reason: input.archived ? reason : "Pandal restored",
  });
  await commitWrite(() => batch.commit(), {
    label: input.archived ? "archive pandal" : "restore pandal",
  });
}

/**
 * Move `ownerId` to another active admin (GS-017).
 *
 * `ownerId` was set at creation and pinned immutable, so a founder who left
 * could never hand it over. It no longer authorizes anything — the delete it
 * used to gate is refused outright — but it remains the record of who holds the
 * Pandal, and that record should be able to follow reality.
 *
 * Gated on active admin rather than on the current owner, deliberately: the
 * situation this ticket describes is a founder who is gone, suspended or
 * unreachable. Requiring their participation would make ownership permanently
 * unmovable in exactly the case that matters. The target must be an active
 * admin so ownership never lands on someone who has left.
 */
export async function transferPandalOwnership(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  targetUserId: string
): Promise<void> {
  if (!targetUserId.trim()) throw new Error("Choose who should hold this Pandal.");
  const [pandalSnap, targetSnap] = await Promise.all([
    getDoc(doc(db, "pandals", pandalId)),
    getDoc(doc(db, "pandals", pandalId, "members", targetUserId)),
  ]);
  if (!pandalSnap.exists()) throw new Error("Pandal not found.");
  if (String(pandalSnap.data().ownerId ?? "") === targetUserId) return;
  if (!targetSnap.exists()) throw new Error("That person is not a member of this Pandal.");
  const targetData = targetSnap.data();
  if (targetData.status !== "active" || targetData.role !== "admin") {
    throw new Error("Only an active Pandal Admin can hold the Pandal.");
  }

  const batch = writeBatch(db);
  batch.update(doc(db, "pandals", pandalId), {
    ownerId: targetUserId,
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  });
  memberAudit(batch, db, pandalId, {
    actorId: actor.uid,
    targetUserId,
    action: "ownership_transferred",
    reason: `Pandal ownership moved from ${String(pandalSnap.data().ownerId ?? "unknown")}`,
  });
  await commitWrite(() => batch.commit(), { label: "transfer ownership" });
}

export async function updatePandalProfile(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  input: {
    name?: string;
    area?: string;
    description?: string;
    contactPhone?: string;
  }
): Promise<void> {
  const pandalSnap = await getDoc(doc(db, "pandals", pandalId));
  if (!pandalSnap.exists()) throw new Error("Pandal not found.");
  const name = input.name?.trim() || String(pandalSnap.data().name ?? "");
  if (!name) throw new Error("Enter a Pandal name.");
  const code = String(pandalSnap.data().code ?? "");
  const batch = writeBatch(db);
  batch.update(doc(db, "pandals", pandalId), {
    name,
    area: input.area?.trim() || "",
    description: input.description?.trim() || "",
    contactPhone: input.contactPhone?.trim() || "",
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  });
  if (code) {
    batch.set(
      doc(db, "pandalInvites", normalizePandalCode(code)),
      { name, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }
  // The Pandal's public identity — the name on every report and the invite
  // record joiners see. Changing it left no trace at all.
  memberAudit(batch, db, pandalId, {
    actorId: actor.uid,
    targetUserId: actor.uid,
    action: "pandal_profile",
    oldValue: {
      name: String(pandalSnap.data().name ?? ""),
      area: String(pandalSnap.data().area ?? ""),
      contactPhone: String(pandalSnap.data().contactPhone ?? ""),
    },
    newValue: {
      name,
      area: input.area?.trim() || "",
      contactPhone: input.contactPhone?.trim() || "",
    },
  });
  await commitWrite(() => batch.commit(), { label: "pandal profile" });
}

/**
 * Festival dates are optional — festivals created before the seva schedule
 * existed have none, and every surface degrades to the festival name. But a
 * window that ends before it starts would make `festivalDayNumber` and the
 * schedule's day strip nonsense, so reject that pair outright.
 */
function assertFestivalWindow(startDate?: string, endDate?: string): void {
  const result = validateFestivalWindow(startDate, endDate);
  if (!result.ok) throw new Error(result.error);
}

export async function updateFestivalDetails(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  input: { name?: string; year?: number; startDate?: string; endDate?: string }
): Promise<void> {
  const festivalSnap = await getDoc(pathRef(db, festivalDoc(pandalId, festivalId)));
  if (!festivalSnap.exists()) throw new Error("Festival not found.");
  const name = input.name?.trim() || String(festivalSnap.data().name ?? "");
  if (!name) throw new Error("Enter a festival name.");
  const year = Number(input.year ?? festivalSnap.data().year);
  if (!Number.isFinite(year) || year < 2000) throw new Error("Enter a valid year.");
  const previous = festivalSnap.data();
  // Undefined means "leave alone"; an empty string means "clear it".
  const startDate = input.startDate === undefined
    ? (previous.startDate as string | undefined)
    : input.startDate.trim() || undefined;
  const endDate = input.endDate === undefined
    ? (previous.endDate as string | undefined)
    : input.endDate.trim() || undefined;
  assertFestivalWindow(startDate, endDate);
  const batch = writeBatch(db);
  batch.update(pathRef(db, festivalDoc(pandalId, festivalId)), {
    name,
    year,
    startDate: startDate ?? "",
    endDate: endDate ?? "",
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  });
  audit(batch, db, pandalId, festivalId, actor.uid, "edited", "festival", festivalId, {
    oldValue: {
      name: previous.name,
      year: previous.year,
      startDate: previous.startDate,
      endDate: previous.endDate,
    },
    newValue: { name, year, startDate, endDate },
  });
  await commitWrite(() => batch.commit(), { label: "festival details" });
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

  const roleChanged = nextRole !== oldRole;
  const roleIds = nextRole === "admin" ? [] : [nextRole];
  const permissions =
    nextRole === "admin"
      ? [...ALL_GANESH_PERMISSIONS]
      : expandPermissions([...ROLE_PERMISSIONS[nextRole]]);

  const batch = writeBatch(db);
  batch.update(doc(db, "pandals", pandalId, "members", targetUserId), omitUndefined({
    role: nextRole,
    roleIds: roleChanged ? roleIds : undefined,
    permissions: roleChanged ? permissions : undefined,
    status: nextStatus,
    updatedAt: serverTimestamp(),
  }));
  batch.update(doc(db, "pandals", pandalId), {
    adminCount: nextAdminCount,
    memberIds: nextStatus === "active" ? arrayUnion(targetUserId) : arrayRemove(targetUserId),
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
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
  await tryStampPandalMembershipIndex(db, targetUserId, {
    pandalId,
    role: nextRole,
    status: nextStatus,
    pandalName: String(pandalSnap.data().name ?? ""),
    joinedAt: memberSnap.data().createdAt,
  });
}

export async function createFestival(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  input: { name: string; year: number; startDate?: string; endDate?: string }
): Promise<string> {
  assertFestivalWindow(input.startDate, input.endDate);
  const festivalsSnap = await getDocs(collection(db, "pandals", pandalId, "festivals"));
  const existingFestivals = festivalsSnap.docs.map((docSnap) => ({
    id: docSnap.id,
    year: Number(docSnap.data().year),
  }));
  if (yearTakenByAnotherFestival(existingFestivals, input.year)) {
    throw new Error(duplicateFestivalYearMessage(input.year));
  }
  const festivalId = newId();
  const members = await getDocs(collection(db, "pandals", pandalId, "members"));
  const stamp = {
    createdBy: actor.uid,
    createdAt: serverTimestamp(),
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  };
  await commitFestivalAndYearClaim(db, pandalId, festivalId, input.year, {
    name: input.name.trim(),
    year: input.year,
    status: "open",
    contributionMode: "same",
    contributionTargetAmount: 0,
    householdTargetAmount: 500,
    ...omitUndefined({
      startDate: input.startDate?.trim() || undefined,
      endDate: input.endDate?.trim() || undefined,
    }),
    ...stamp,
  });

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

  // GS-062 — reuse last festival's house list with reset balances (no collections).
  const previousFestival = festivalsSnap.docs
    .map((docSnap) => ({
      id: docSnap.id,
      year: Number(docSnap.data().year ?? 0),
    }))
    .sort((a, b) => b.year - a.year || a.id.localeCompare(b.id))[0];
  if (previousFestival) {
    const previousHouseholds = await getDocs(
      colRef(db, festivalCol(pandalId, previousFestival.id, "households"))
    );
    const houses = previousHouseholds.docs;
    for (let i = 0; i < houses.length; i += 400) {
      const slice = houses.slice(i, i + 400);
      const houseBatch = writeBatch(db);
      for (const houseSnap of slice) {
        const seeded = mapHouseholdForNewFestival(houseSnap.data(), 500);
        houseBatch.set(
          pathRef(db, [...festivalCol(pandalId, festivalId, "households"), newId()]),
          omitUndefined({
            ...seeded,
            createdBy: actor.uid,
            createdAt: serverTimestamp(),
            updatedBy: actor.uid,
            updatedAt: serverTimestamp(),
          })
        );
      }
      await commitWrite(() => houseBatch.commit(), { label: "festival households" });
    }
  }

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
    if (input.contributionMode === "same" && memberSnap.data().contributionTargetOverridden) {
      return;
    }
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

export async function setMemberContributionTarget(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  memberId: string,
  input: {
    amount?: number;
    resetToDefault?: boolean;
    displayName?: string;
    role?: GaneshRole;
  }
): Promise<void> {
  const festivalSnap = await getDoc(pathRef(db, festivalDoc(pandalId, festivalId)));
  if (!festivalSnap.exists()) throw new Error("Festival not found.");
  if (festivalSnap.data().status !== "open") {
    throw new Error("Open the festival before changing a person's target.");
  }
  const defaultTarget = Number(festivalSnap.data().contributionTargetAmount ?? 0);
  const reset = Boolean(input.resetToDefault);
  const amount = reset ? defaultTarget : Number(input.amount);
  const valid = validateNonNegativeAmount(amount, "This person's target");
  if (!valid.ok) throw new Error(valid.error);

  const memberRef = pathRef(db, [...festivalCol(pandalId, festivalId, "members"), memberId]);
  const existing = await getDoc(memberRef);
  const batch = writeBatch(db);
  batch.set(
    memberRef,
    omitUndefined({
      userId: memberId,
      displayName:
        input.displayName?.trim() ||
        String(existing.data()?.displayName ?? "Member"),
      role: input.role ?? existing.data()?.role ?? "member",
      contributionTarget: amount,
      contributionTargetOverridden: !reset,
      contributionPaid: existing.exists() ? undefined : 0,
      personalExpenses: existing.exists() ? undefined : 0,
      reimbursed: existing.exists() ? undefined : 0,
      pendingReimbursement: existing.exists() ? undefined : 0,
      createdBy: existing.exists() ? undefined : actor.uid,
      createdAt: existing.exists() ? undefined : serverTimestamp(),
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    }),
    { merge: true }
  );
  audit(batch, db, pandalId, festivalId, actor.uid, "adjusted", "festivalMember", memberId, {
    newValue: { contributionTarget: amount, contributionTargetOverridden: !reset },
    reason: reset ? "Reset to committee default target" : "Custom committee target",
  });
  await commitWrite(() => batch.commit(), { label: "member target" });
}

export async function setCommitteeContributionWaiver(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  memberId: string,
  input: { waived: boolean; reason?: string }
): Promise<void> {
  await requireOpenFestival(db, pandalId, festivalId);
  const ref = pathRef(db, [...festivalCol(pandalId, festivalId, "members"), memberId]);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Committee member not found.");
  const reason = input.reason?.trim();
  if (input.waived && !reason) throw new Error("Enter a reason for waiving this contribution.");
  const batch = writeBatch(db);
  batch.update(
    ref,
    input.waived
      ? {
          contributionWaived: true,
          waivedBy: actor.uid,
          waivedAt: serverTimestamp(),
          waiveReason: reason,
          updatedBy: actor.uid,
          updatedAt: serverTimestamp(),
        }
      : {
          contributionWaived: false,
          waivedBy: deleteField(),
          waivedAt: deleteField(),
          waiveReason: deleteField(),
          updatedBy: actor.uid,
          updatedAt: serverTimestamp(),
        }
  );
  audit(batch, db, pandalId, festivalId, actor.uid, "adjusted", "festivalMember", memberId, {
    oldValue: {
      contributionWaived: Boolean(snap.data().contributionWaived),
      waiveReason: snap.data().waiveReason,
    },
    newValue: { contributionWaived: input.waived, waiveReason: reason },
    reason: input.waived ? "Committee contribution waived" : "Committee contribution waiver removed",
  });
  await commitWrite(() => batch.commit(), { label: input.waived ? "contribution waived" : "waiver removed" });
}

export async function addOpeningFund(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  input: {
    amount: number;
    sourceType: OpeningFundSource;
    location?: PermanentFundLocation;
    description?: string;
    date: string;
  }
): Promise<string> {
  const ids = await addOpeningFunds(db, actor, pandalId, festivalId, {
    amounts: {
      // `sourceType` is a provenance ("permanent_fund", "donation"), never a
      // location — feeding it to resolveFundLocation only ever yielded "other".
      [resolveFundLocation(input.location)]: input.amount,
    },
    sourceType: input.sourceType,
    description: input.description,
    date: input.date,
  });
  return ids[0];
}

export async function addOpeningFunds(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  input: {
    amounts: Partial<Record<PermanentFundLocation, number>>;
    sourceType: OpeningFundSource;
    description?: string;
    date: string;
  }
): Promise<string[]> {
  await requireOpenFestival(db, pandalId, festivalId);
  const entries = (["cash", "upi", "bank", "other"] as PermanentFundLocation[])
    .map((location) => ({ location, amount: Number(input.amounts[location] ?? 0) }))
    .filter((entry) => entry.amount > 0);
  if (entries.length === 0) throw new Error("Enter an opening fund amount.");
  for (const entry of entries) {
    const valid = validatePositiveAmount(entry.amount, "Opening fund");
    if (!valid.ok) throw new Error(valid.error);
  }

  const ids: string[] = [];
  const batch = writeBatch(db);
  const totals = { openingFunds: 0, cash: 0, upi: 0, bank: 0, other: 0 };
  for (const entry of entries) {
    const id = newId();
    ids.push(id);
    totals.openingFunds += entry.amount;
    totals[entry.location] += entry.amount;
    batch.set(
      pathRef(db, [...festivalCol(pandalId, festivalId, "openingFunds"), id]),
      omitUndefined({
        amount: entry.amount,
        sourceType: input.sourceType,
        location: entry.location,
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
    activity(batch, db, pandalId, festivalId, {
      title: "Opening fund",
      subtitle: `Added by ${actor.displayName}`,
      amount: entry.amount,
      actorId: actor.uid,
      entityType: "openingFund",
      entityId: id,
    });
    audit(batch, db, pandalId, festivalId, actor.uid, "created", "openingFund", id, {
      newValue: { ...input, amount: entry.amount, location: entry.location },
    });
  }
  bumpSummary(batch, db, pandalId, festivalId, totals);
  await commitWrite(() => batch.commit(), { label: "opening fund" });
  return ids;
}

export type AddCollectionResult = {
  id: string;
  receiptNumber?: string;
};

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
    area?: string;
    notes?: string;
    householdId?: string;
    expectedAmount?: number;
    createHousehold?: boolean;
    clientOpId?: string;
    /** When false, skip receipt allocation (offline / weak network). */
    assignReceipt?: boolean;
  }
): Promise<AddCollectionResult> {
  await requireOpenFestival(db, pandalId, festivalId);
  const valid = validateCollection(input.amount);
  if (!valid.ok) throw new Error(valid.error);
  const donorName = input.donorName.trim();
  if (!donorName) throw new Error("Enter the donor name.");

  const collectorId = await resolveCollectorId(db, pandalId, actor.uid, input.collectorId);
  const collectionId = input.clientOpId?.trim() || newId();
  const householdId =
    input.householdId || (input.createHousehold !== false ? newId() : undefined);
  const assignReceipt = input.assignReceipt !== false;
  const area = input.area?.trim() || undefined;
  const address = input.address?.trim() || undefined;

  if (assignReceipt) {
    return runTransaction(db, async (txn) => {
      const collectionRef = pathRef(db, [
        ...festivalCol(pandalId, festivalId, "collections"),
        collectionId,
      ]);
      const existingCollection = await txn.get(collectionRef);
      if (existingCollection.exists() && !existingCollection.data().voided) {
        return {
          id: collectionId,
          receiptNumber:
            typeof existingCollection.data().receiptNumber === "string"
              ? existingCollection.data().receiptNumber
              : undefined,
        };
      }

      const festivalSnap = await txn.get(pathRef(db, festivalDoc(pandalId, festivalId)));
      const year = Number(festivalSnap.data()?.year ?? new Date().getFullYear());
      const summaryRef = pathRef(db, summaryDoc(pandalId, festivalId));
      const summarySnap = await txn.get(summaryRef);
      const nextSeq = Number(summarySnap.data()?.nextReceiptNumber ?? 0) + 1;
      const receiptNumber = formatCollectionReceipt(year, nextSeq);

      let householdStatus: HouseholdStatus | undefined;
      if (householdId) {
        const householdRef = pathRef(db, [
          ...festivalCol(pandalId, festivalId, "households"),
          householdId,
        ]);
        if (input.householdId) {
          const existing = await txn.get(householdRef);
          if (existing.exists()) {
            const prev = existing.data();
            const expectedAmount = Number(prev.expectedAmount ?? 0);
            const collectedAmount = money(Number(prev.collectedAmount ?? 0) + input.amount);
            householdStatus = deriveHouseholdStatus({
              expectedAmount,
              collectedAmount,
            });
            txn.update(householdRef, {
              collectedAmount: increment(input.amount),
              status: householdStatus,
              updatedBy: actor.uid,
              updatedAt: serverTimestamp(),
            });
          } else {
            const expectedAmount = Number(input.expectedAmount ?? 0);
            householdStatus = deriveHouseholdStatus({
              expectedAmount,
              collectedAmount: input.amount,
            });
            txn.set(
              householdRef,
              omitUndefined({
                name: donorName,
                houseNumber: input.houseNumber?.trim() || undefined,
                mobile: input.mobile?.trim() || undefined,
                area,
                expectedAmount,
                collectedAmount: input.amount,
                status: householdStatus,
                createdBy: actor.uid,
                createdAt: serverTimestamp(),
                updatedBy: actor.uid,
                updatedAt: serverTimestamp(),
              })
            );
          }
        } else {
          const expectedAmount = Number(input.expectedAmount ?? 0);
          householdStatus = deriveHouseholdStatus({
            expectedAmount,
            collectedAmount: input.amount,
          });
          txn.set(
            householdRef,
            omitUndefined({
              name: donorName,
              houseNumber: input.houseNumber?.trim() || undefined,
              mobile: input.mobile?.trim() || undefined,
              area,
              expectedAmount,
              collectedAmount: input.amount,
              status: householdStatus,
              createdBy: actor.uid,
              createdAt: serverTimestamp(),
              updatedBy: actor.uid,
              updatedAt: serverTimestamp(),
            })
          );
        }
      }

      txn.set(
        collectionRef,
        omitUndefined({
          householdId,
          donorName,
          mobile: input.mobile?.trim() || undefined,
          houseNumber: input.houseNumber?.trim() || undefined,
          address,
          amount: input.amount,
          paymentMethod: input.paymentMethod,
          collectorId,
          receiptNumber,
          clientOpId: input.clientOpId?.trim() || collectionId,
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

      bumpSummary(txn, db, pandalId, festivalId, {
        chanda: input.amount,
        collectionCount: 1,
        ...locationBump(input.paymentMethod, input.amount),
      });
      txn.set(
        summaryRef,
        { nextReceiptNumber: nextSeq, updatedAt: serverTimestamp() },
        { merge: true }
      );
      activity(txn, db, pandalId, festivalId, {
        title: `${donorName}`,
        subtitle: `Collected by member · Added by ${actor.displayName}`,
        amount: input.amount,
        actorId: actor.uid,
        entityType: "collection",
        entityId: collectionId,
      });
      audit(txn, db, pandalId, festivalId, actor.uid, "created", "collection", collectionId, {
        newValue: { donorName, amount: input.amount, receiptNumber },
      });
      return { id: collectionId, receiptNumber };
    });
  }

  // Offline / deferred receipt: batch write without allocating a number.
  const batch = writeBatch(db);
  const collectionRef = pathRef(db, [
    ...festivalCol(pandalId, festivalId, "collections"),
    collectionId,
  ]);
  batch.set(
    collectionRef,
    omitUndefined({
      householdId,
      donorName,
      mobile: input.mobile?.trim() || undefined,
      houseNumber: input.houseNumber?.trim() || undefined,
      address,
      amount: input.amount,
      paymentMethod: input.paymentMethod,
      collectorId,
      clientOpId: input.clientOpId?.trim() || collectionId,
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
      const expectedAmount = Number(prev.expectedAmount ?? 0);
      const collectedAmount = money(Number(prev.collectedAmount ?? 0) + input.amount);
      batch.update(householdRef, {
        collectedAmount: increment(input.amount),
        status: deriveHouseholdStatus({ expectedAmount, collectedAmount }),
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
          area,
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
    ...locationBump(input.paymentMethod, input.amount),
  });
  activity(batch, db, pandalId, festivalId, {
    title: `${donorName}`,
    subtitle: `Collected by member · Added by ${actor.displayName}`,
    amount: input.amount,
    actorId: actor.uid,
    entityType: "collection",
    entityId: collectionId,
  });
  audit(batch, db, pandalId, festivalId, actor.uid, "created", "collection", collectionId, {
    newValue: { donorName, amount: input.amount },
  });
  await commitWrite(() => batch.commit(), { label: "collection" });
  return { id: collectionId };
}

async function resolveCollectorId(
  db: Firestore,
  pandalId: string,
  actorUid: string,
  requested: string
): Promise<string> {
  const candidate = requested.trim() || actorUid;
  if (!candidate) throw new Error("Choose who collected this.");
  if (candidate === actorUid) return candidate;
  try {
    const snap = await getDoc(doc(db, "pandals", pandalId, "members", candidate));
    if (!snap.exists()) return actorUid;
    const status = snap.data().status;
    if (status === "removed" || status === "suspended") return actorUid;
    return candidate;
  } catch {
    return actorUid;
  }
}

/**
 * Assign receipt numbers to collections that synced without one (offline path).
 * Safe to call repeatedly; only fills missing `receiptNumber`.
 */
export async function assignPendingCollectionReceipts(
  db: Firestore,
  pandalId: string,
  festivalId: string
): Promise<number> {
  const festivalSnap = await getDoc(pathRef(db, festivalDoc(pandalId, festivalId)));
  if (!festivalSnap.exists()) return 0;
  const year = Number(festivalSnap.data().year ?? new Date().getFullYear());
  const pending = await getDocs(
    query(
      colRef(db, festivalCol(pandalId, festivalId, "collections")),
      where("voided", "==", false),
      limit(50)
    )
  );
  const missing = pending.docs.filter((docSnap) => !docSnap.data().receiptNumber);
  if (missing.length === 0) return 0;

  let assigned = 0;
  for (const docSnap of missing) {
    await runTransaction(db, async (txn) => {
      const live = await txn.get(docSnap.ref);
      if (!live.exists() || live.data().receiptNumber || live.data().voided) return;
      const summaryRef = pathRef(db, summaryDoc(pandalId, festivalId));
      const summarySnap = await txn.get(summaryRef);
      const nextSeq = Number(summarySnap.data()?.nextReceiptNumber ?? 0) + 1;
      const receiptNumber = formatCollectionReceipt(year, nextSeq);
      txn.update(docSnap.ref, {
        receiptNumber,
        updatedAt: serverTimestamp(),
      });
      txn.set(
        summaryRef,
        { nextReceiptNumber: nextSeq, updatedAt: serverTimestamp() },
        { merge: true }
      );
      assigned += 1;
    });
  }
  return assigned;
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
  const prev = current.data();
  const collectedAmount = Number(prev.collectedAmount ?? 0);
  const expectedAmount = input.expectedAmount ?? Number(prev.expectedAmount ?? 0);
  const previousStatus = prev.status as HouseholdStatus | undefined;
  const householdBatch = writeBatch(db);
  householdBatch.update(
    current.ref,
    omitUndefined({
      expectedAmount,
      assignedCollectorId: input.assignedCollectorId === null ? null : input.assignedCollectorId,
      status:
        input.status
        ?? deriveHouseholdStatus({
          expectedAmount,
          collectedAmount,
          // Preserve sticky visit statuses on expected-only edits (GS-026).
          forcedStatus: previousStatus,
        }),
      notes: input.notes,
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    })
  );
  audit(householdBatch, db, pandalId, festivalId, actor.uid, "edited", "household", householdId, {
    oldValue: {
      expectedAmount: Number(prev.expectedAmount ?? 0),
      status: previousStatus ?? null,
    },
    newValue: { expectedAmount, status: input.status ?? null },
  });
  await commitWrite(() => householdBatch.commit(), { label: "household" });
}

export type AssetPurchaseDraft = {
  name: string;
  category: CreatePandalAssetInput["category"];
  quantity: number;
  unit: CreatePandalAssetInput["unit"];
  estimatedValue?: number;
  condition?: CreatePandalAssetInput["condition"];
  location?: string;
  description?: string;
};

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
    expectedDate?: string;
    status?: ContributionStatus;
    paymentMethod?: PaymentMethod;
    pandalAsset?: AssetPurchaseDraft;
    clientOpId?: string;
  }
): Promise<string> {
  await requireOpenFestival(db, pandalId, festivalId);
  const contributorName = input.contributorName.trim();
  if (!contributorName) throw new Error("Enter the contributor name.");
  const status = input.status ?? (input.kind === "money" ? "received" : "promised");
  if (input.pandalAsset && status !== "received") {
    throw new Error("Add a Pandal asset only when the contribution is received.");
  }
  if (input.pandalAsset && input.kind !== "item" && input.kind !== "sponsorship") {
    throw new Error("Only item or sponsorship contributions can be added as Pandal assets.");
  }
  const amount = Number(input.amount ?? 0);
  const estimatedValue = Number(input.estimatedValue ?? 0);
  if (input.kind === "money") {
    const valid = validateCashContribution(amount);
    if (!valid.ok) throw new Error(valid.error);
  } else {
    const valid = validateInKindValue(estimatedValue);
    if (!valid.ok) throw new Error(valid.error);
  }
  const id = input.clientOpId?.trim() || newId();
  const assetId = input.pandalAsset ? newId() : undefined;
  const isCommittee = Boolean(input.isCommitteeContribution && input.contributorMemberId);
  const received = status === "received";
  const paymentMethod =
    input.kind === "money" && received ? requireCashMethod(input.paymentMethod) : undefined;
  const ledgerType =
    input.kind === "money"
      ? isCommittee
        ? "COMMITTEE_CONTRIBUTION"
        : "OTHER_DONATION"
      : undefined;
  const contributionReference = (year: number, sequence: number) =>
    `GNS${String(year).slice(-2)}-CON-${String(sequence).padStart(6, "0")}`;

  const appendContribution = (
    batch: GaneshWriter,
    reference?: string,
    nextContributionNumber?: number
  ) => {
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
      expectedDate: status === "promised" ? input.expectedDate?.trim() || undefined : undefined,
      status,
      receivedAt: status === "received" ? serverTimestamp() : undefined,
      receivedBy: status === "received" ? actor.uid : undefined,
      paymentMethod,
      assetId,
      contributionReference: reference,
      clientOpId: input.clientOpId?.trim() || undefined,
      ledgerType,
      voided: false,
      createdBy: actor.uid,
      createdAt: serverTimestamp(),
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    })
  );

  if (nextContributionNumber != null) {
    batch.set(
      pathRef(db, summaryDoc(pandalId, festivalId)),
      { nextContributionNumber, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }
  if (status === "promised") {
    bumpSummary(batch, db, pandalId, festivalId, {
      promisedCashContributions: input.kind === "money" ? amount : 0,
      promisedInKindValue: input.kind === "money" ? 0 : estimatedValue,
    });
  }

  if (input.kind === "money" && received) {
    bumpSummary(batch, db, pandalId, festivalId, {
      committeeContributions: isCommittee ? amount : 0,
      otherCashContributions: isCommittee ? 0 : amount,
      ...locationBump(paymentMethod, amount),
    });
    if (isCommittee && input.contributorMemberId) {
      batch.set(
        pathRef(db, [
          ...festivalCol(pandalId, festivalId, "members"),
          input.contributorMemberId,
        ]),
        {
          userId: input.contributorMemberId,
          displayName: contributorName,
          contributionPaid: increment(amount),
          // GS-103: the rules apply ganeshIdentityUpdate() once a member
          // document carries `createdBy`, which setMemberContributionTarget
          // writes. Without `updatedBy` a *second* actor's write is refused, so
          // recording a payment failed for one committee member and not another.
          updatedBy: actor.uid,
        },
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
  if (input.pandalAsset && assetId) {
    appendPandalAssetCreate(batch, db, actor, pandalId, assetId, {
      name: input.pandalAsset.name,
      category: input.pandalAsset.category,
      quantity: input.pandalAsset.quantity,
      unit: input.pandalAsset.unit,
      ownershipType: input.kind === "sponsorship" ? "sponsored" : "donated",
      estimatedValue: input.pandalAsset.estimatedValue ?? estimatedValue,
      condition: input.pandalAsset.condition ?? "good",
      location: input.pandalAsset.location,
      description: input.pandalAsset.description ?? input.description,
      sourceName: contributorName,
      relatedContributionId: id,
    });
  }

  audit(batch, db, pandalId, festivalId, actor.uid, "created", "contribution", id, {
    newValue: { contributorName, kind: input.kind, amount, estimatedValue, contributionReference: reference },
  });
  };

  if (input.kind === "money" && received) {
    await runTransaction(db, async (txn) => {
      const contributionRef = pathRef(db, [...festivalCol(pandalId, festivalId, "contributions"), id]);
      if (input.clientOpId) {
        const existing = await txn.get(contributionRef);
        if (existing.exists()) return;
      }
      const festivalSnap = await txn.get(pathRef(db, festivalDoc(pandalId, festivalId)));
      const summarySnap = await txn.get(pathRef(db, summaryDoc(pandalId, festivalId)));
      const year = Number(festivalSnap.data()?.year ?? new Date().getFullYear());
      const nextNumber = Number(summarySnap.data()?.nextContributionNumber ?? 0) + 1;
      appendContribution(txn, contributionReference(year, nextNumber), nextNumber);
    });
    return id;
  }

  if (input.clientOpId) {
    const existing = await getDoc(pathRef(db, [...festivalCol(pandalId, festivalId, "contributions"), id]));
    if (existing.exists()) return id;
  }
  const batch = writeBatch(db);
  appendContribution(batch);
  await commitWrite(() => batch.commit(), { label: "contribution" });
  return id;
}

/**
 * Returns the path of the photo this attach replaces, if any, so the caller can
 * remove the now-orphaned object from Storage after this write lands (GS-069).
 * Firestore has no concept of Supabase Storage, so that removal has to happen
 * client-side, in the caller — this function only reports what to clean up.
 */
export async function attachContributionPhoto(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  contributionId: string,
  photo: GaneshFileMeta
): Promise<string | undefined> {
  const ref = pathRef(db, [...festivalCol(pandalId, festivalId, "contributions"), contributionId]);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Contribution not found.");
  const previousPath = ganeshStoredPath(snap.data().photo as GaneshFileMeta | undefined, undefined);
  const batch = writeBatch(db);
  batch.update(ref, {
    photo,
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  });
  audit(
    batch, db, pandalId, festivalId, actor.uid, "edited", "contribution", contributionId,
    {
      // Paths only, not the whole meta: enough to tell that evidence was
      // replaced and which object it was, without copying file internals into
      // the audit trail.
      oldValue: { photoPath: previousPath ?? null },
      newValue: { photoPath: photo.path },
      reason: previousPath && previousPath !== photo.path ? "Photo replaced" : "Photo attached",
    }
  );
  // Only report a previous path once the server has actually confirmed the new
  // one replaced it. A merely-"queued" (offline) outcome could still fail to
  // land, and deleting the previous object on that outcome would orphan the
  // record itself — it would keep pointing at a photo that no longer exists.
  const outcome = await commitWrite(() => batch.commit(), { label: "contribution photo" });
  return outcome === "acked" && previousPath !== photo.path ? previousPath : undefined;
}

/**
 * Whether the closing balance the client expects to leave behind matches what
 * the server actually reads. Uses the same rounding as every other money
 * comparison rather than a local epsilon (see GS-080).
 */
function closeBalanceAgrees(claimedRemaining: number, serverClosing: number): boolean {
  return validateSettlement({
    closing: serverClosing,
    transfer: 0,
    remaining: claimedRemaining,
  }).ok;
}

async function readSummaryInTxn(
  txn: Transaction,
  db: Firestore,
  pandalId: string,
  festivalId: string
) {
  const snap = await txn.get(pathRef(db, summaryDoc(pandalId, festivalId)));
  return parseGaneshSummary(snap.exists() ? snap.data() : null);
}

/**
 * Re-derives, inside the transaction, what a member is actually owed. The
 * caller-supplied ceiling in `addReimbursement`'s input comes from a locally
 * cached member document and must never be the thing that authorizes a payout.
 */
function assertReimbursementReversible(reversal: number, pending: number): void {
  const check = validateReimbursementReversal(reversal, pending);
  if (!check.ok) throw new Error(check.error);
}

async function readMemberPendingInTxn(
  txn: Transaction,
  db: Firestore,
  pandalId: string,
  festivalId: string,
  memberId: string
): Promise<{ pending: number; exists: boolean }> {
  const snap = await txn.get(
    pathRef(db, [...festivalCol(pandalId, festivalId, "members"), memberId])
  );
  if (!snap.exists()) return { pending: 0, exists: false };
  return { pending: Number(snap.data().pendingReimbursement ?? 0), exists: true };
}

function bumpReceivedContribution(
  batch: GaneshWriter,
  db: Firestore,
  pandalId: string,
  festivalId: string,
  data: {
    kind: string;
    amount: number;
    estimatedValue: number;
    isCommittee: boolean;
    contributorMemberId?: string;
    contributorName?: string;
    paymentMethod?: PaymentMethod;
    wasPromised?: boolean;
    /** Needed so the member counter write can set `updatedBy` (GS-103). */
    actorId: string;
  }
) {
  if (data.kind === "money") {
    bumpSummary(batch, db, pandalId, festivalId, {
      committeeContributions: data.isCommittee ? data.amount : 0,
      otherCashContributions: data.isCommittee ? 0 : data.amount,
      promisedCashContributions: data.wasPromised ? -data.amount : 0,
      ...locationBump(data.paymentMethod, data.amount),
    });
    if (data.isCommittee && data.contributorMemberId) {
      batch.set(
        pathRef(db, [...festivalCol(pandalId, festivalId, "members"), data.contributorMemberId]),
        {
          userId: data.contributorMemberId,
          displayName: data.contributorName,
          contributionPaid: increment(data.amount),
          updatedBy: data.actorId,
        },
        { merge: true }
      );
    }
    return;
  }
  bumpSummary(batch, db, pandalId, festivalId, {
    inKindValue: data.kind === "sponsorship" ? 0 : data.estimatedValue,
    sponsoredValue: data.kind === "sponsorship" ? data.estimatedValue : 0,
    promisedInKindValue: data.wasPromised ? -data.estimatedValue : 0,
  });
}

export async function receiveContribution(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  contributionId: string,
  input?: {
    receivedNotes?: string;
    paymentMethod?: PaymentMethod;
    pandalAsset?: AssetPurchaseDraft;
  }
): Promise<void> {
  await requireOpenFestival(db, pandalId, festivalId);
  const ref = pathRef(db, [...festivalCol(pandalId, festivalId, "contributions"), contributionId]);
  // Generated outside the transaction so a retry reuses the same id rather than
  // minting a fresh one on every attempt.
  const assetId = input?.pandalAsset ? newId() : undefined;

  // Receiving *money* adds real cash to the festival, so its status check has
  // to read through a transaction. Read with `getDoc` and written with a batch,
  // two committee members marking one promise received both saw
  // `status: "promised"` and both committed: the summary counted the gift twice
  // while the contribution document still looked like a single clean row.
  //
  // In-kind and sponsorship receives stay on a batch. They move an *estimated
  // value*, not cash, and `assertMoneyReceiveOnline` gates only the money path
  // precisely so a volunteer can still record a donated item with no signal.
  // This pre-read only routes between the two; the money path re-reads and
  // re-validates inside its transaction, so nothing trusts it as a check.
  const routing = await getDoc(ref);
  if (!routing.exists()) throw new Error("Contribution not found.");
  const isMoney = String(routing.data().kind) === "money";

  const append = (writer: GaneshWriter, prev: DocumentData) => {
    const kind = String(prev.kind);
    const paymentMethod = kind === "money" ? requireCashMethod(input?.paymentMethod) : undefined;
    if (input?.pandalAsset && kind !== "item" && kind !== "sponsorship") {
      throw new Error("Only item or sponsorship contributions can be added as Pandal assets.");
    }
    writer.update(
      ref,
      omitUndefined({
        status: "received",
        receivedAt: serverTimestamp(),
        receivedBy: actor.uid,
        receivedNotes: input?.receivedNotes?.trim() || undefined,
        paymentMethod,
        assetId: prev.assetId || assetId,
        updatedBy: actor.uid,
        updatedAt: serverTimestamp(),
      })
    );
    bumpReceivedContribution(writer, db, pandalId, festivalId, {
      kind,
      amount: Number(prev.amount ?? 0),
      estimatedValue: Number(prev.estimatedValue ?? 0),
      isCommittee: Boolean(prev.isCommitteeContribution),
      contributorMemberId: prev.contributorMemberId ? String(prev.contributorMemberId) : undefined,
      contributorName: prev.contributorName ? String(prev.contributorName) : undefined,
      paymentMethod,
      wasPromised: prev.status === "promised",
      actorId: actor.uid,
    });
    if (input?.pandalAsset && assetId) {
      appendPandalAssetCreate(writer, db, actor, pandalId, assetId, {
        name: input.pandalAsset.name,
        category: input.pandalAsset.category,
        quantity: input.pandalAsset.quantity,
        unit: input.pandalAsset.unit,
        ownershipType: kind === "sponsorship" ? "sponsored" : "donated",
        estimatedValue: input.pandalAsset.estimatedValue ?? Number(prev.estimatedValue ?? 0),
        condition: input.pandalAsset.condition ?? "good",
        location: input.pandalAsset.location,
        description: input.pandalAsset.description ?? String(prev.description ?? ""),
        sourceName: String(prev.contributorName ?? ""),
        relatedContributionId: contributionId,
      });
    }
    audit(writer, db, pandalId, festivalId, actor.uid, "edited", "contribution", contributionId, {
      oldValue: { status: prev.status },
      newValue: { status: "received" },
      reason: input?.receivedNotes?.trim() || "Marked received",
    });
  };

  if (isMoney) {
    await runTransaction(db, async (txn) => {
      const snap = await txn.get(ref);
      if (!snap.exists()) throw new Error("Contribution not found.");
      const prev = snap.data();
      assertCanReceiveContribution(prev);
      append(txn, prev);
    });
    return;
  }

  const prev = routing.data();
  assertCanReceiveContribution(prev);
  const batch = writeBatch(db);
  append(batch, prev);
  await commitWrite(() => batch.commit(), { label: "receive contribution" });
}

export async function cancelContribution(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  contributionId: string,
  reason?: string
): Promise<void> {
  await requireOpenFestival(db, pandalId, festivalId);
  const ref = pathRef(db, [...festivalCol(pandalId, festivalId, "contributions"), contributionId]);

  // Cancelling withdraws a promise from the promised totals. Two cancels of one
  // promise used to subtract it twice and drive those totals negative — and
  // "Promised" versus "Received" is a distinction the committee is asked to
  // trust, so a negative promise is worse than a merely wrong one.
  await runTransaction(db, async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists()) throw new Error("Contribution not found.");
    const prev = snap.data();
    assertCanCancelContribution(prev);
    txn.update(
      ref,
      omitUndefined({
        status: "cancelled",
        cancelReason: reason?.trim() || undefined,
        updatedBy: actor.uid,
        updatedAt: serverTimestamp(),
      })
    );
    bumpSummary(txn, db, pandalId, festivalId, {
      promisedCashContributions: prev.kind === "money" ? -Number(prev.amount ?? 0) : 0,
      promisedInKindValue: prev.kind === "money" ? 0 : -Number(prev.estimatedValue ?? 0),
    });
    audit(txn, db, pandalId, festivalId, actor.uid, "edited", "contribution", contributionId, {
      oldValue: { status: prev.status },
      newValue: { status: "cancelled" },
      reason: reason?.trim() || "Cancelled",
    });
  });
}

export async function updatePromisedContribution(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  contributionId: string,
  input: {
    expectedDate?: string;
    description?: string;
    mobile?: string;
  }
): Promise<void> {
  await requireOpenFestival(db, pandalId, festivalId);
  const ref = pathRef(db, [...festivalCol(pandalId, festivalId, "contributions"), contributionId]);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Contribution not found.");
  const prev = snap.data();
  if (prev.voided) throw new Error("This contribution is already voided.");
  if (prev.status !== "promised") throw new Error("Only a promised contribution can be edited.");
  const batch = writeBatch(db);
  batch.update(
    ref,
    omitUndefined({
      expectedDate: input.expectedDate?.trim() || undefined,
      description: input.description?.trim() || undefined,
      mobile: input.mobile?.trim() || undefined,
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    })
  );
  audit(batch, db, pandalId, festivalId, actor.uid, "edited", "contribution", contributionId, {
    oldValue: {
      expectedDate: prev.expectedDate,
      description: prev.description,
      mobile: prev.mobile,
    },
    newValue: input,
  });
  await commitWrite(() => batch.commit(), { label: "contribution" });
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
    reimbursementRequired?: boolean;
    clientOpId?: string;
    vendor?: string;
    description?: string;
    notes?: string;
    date: string;
    receiptPath?: string;
    linkedContributionId?: string;
    sponsorId?: string;
    linkedSponsorshipId?: string;
    sponsorshipPurpose?: SponsorshipPurpose;
    purposeLabel?: string;
    paymentMethod?: PaymentMethod;
  }
): Promise<string> {
  await requireOpenFestival(db, pandalId, festivalId);
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
  const paymentMethod = requireGodFundMethod(input.godFundAmount, input.paymentMethod);
  const sponsorLink = await loadSponsoredExpenseLink(db, pandalId, festivalId, {
    sponsoredAmount,
    sponsorId: input.sponsorId,
    linkedSponsorshipId: input.linkedSponsorshipId,
  });
  const id = input.clientOpId?.trim() || newId();
  const reimbursementRequired = input.reimbursementRequired !== false;

  const appendExpense = (writer: GaneshWriter) => {
    const linkedSponsorshipId = sponsorLink
      ? appendExpenseSponsorship(writer, db, actor, pandalId, festivalId, {
          expenseId: id,
          sponsorId: sponsorLink.sponsorId,
          sponsorshipId: sponsorLink.sponsorshipId,
          amount: sponsoredAmount,
          purpose: input.sponsorshipPurpose,
          purposeLabel: input.purposeLabel,
          existing: sponsorLink.existing,
        })
      : undefined;
    writer.set(
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
        reimbursementRequired,
        clientOpId: input.clientOpId?.trim() || id,
        vendor: input.vendor?.trim() || undefined,
        description: input.description?.trim() || undefined,
        notes: input.notes?.trim() || undefined,
        date: input.date,
        receiptPath: input.receiptPath,
        linkedContributionId: input.linkedContributionId,
        linkedSponsorshipId,
        expenseType: "normal",
        paymentMethod,
        ledgerType: "EXPENSE",
        voided: false,
        createdBy: actor.uid,
        createdAt: serverTimestamp(),
        updatedBy: actor.uid,
        updatedAt: serverTimestamp(),
      })
    );
    bumpSummary(writer, db, pandalId, festivalId, {
      godFundExpenses: input.godFundAmount,
      personalMoneyUsed: input.personalAmount,
      pendingReimbursements: reimbursementRequired ? input.personalAmount : 0,
      expenseCount: 1,
      // Sponsor-paid money never enters the God Fund, so it is neither cash in
      // nor a God Fund expense. Tracked on its own so the report can show it
      // instead of dropping it (GS-039).
      sponsoredExpenseAmount: sponsoredAmount,
      ...(input.godFundAmount > 0 ? locationBump(paymentMethod, -input.godFundAmount) : {}),
    });
    if (reimbursementRequired && input.personalAmount > 0) {
      writer.set(
        pathRef(db, [...festivalCol(pandalId, festivalId, "members"), input.paidByMemberId]),
        {
          personalExpenses: increment(input.personalAmount),
          pendingReimbursement: increment(input.personalAmount),
          updatedBy: actor.uid,
        },
        { merge: true }
      );
    }
    activity(writer, db, pandalId, festivalId, {
      title: name,
      subtitle: `Paid by member · Added by ${actor.displayName}`,
      amount: input.totalAmount,
      actorId: actor.uid,
      entityType: "expense",
      entityId: id,
    });
    audit(writer, db, pandalId, festivalId, actor.uid, "created", "expense", id, {
      newValue: input,
    });
  };

  // Spending real cash: read the balance inside the transaction so two
  // treasurers cannot both pass the same check. Everything else appends.
  if (input.godFundAmount > 0) {
    await runTransaction(db, async (txn) => {
      if (input.clientOpId) {
        const expenseRef = pathRef(db, [...festivalCol(pandalId, festivalId, "expenses"), id]);
        const existing = await txn.get(expenseRef);
        if (existing.exists()) {
          if (existing.data().voided) throw new Error("This expense operation was already voided.");
          return;
        }
      }
      const summary = await readSummaryInTxn(txn, db, pandalId, festivalId);
      const spendOk = validateGodFundLocationSpend(
        input.godFundAmount,
        resolveFundLocation(paymentMethod),
        summary
      );
      if (!spendOk.ok) throw new Error(spendOk.error);
      appendExpense(txn);
    });
    return id;
  }

  if (input.clientOpId) {
    const existing = await getDoc(pathRef(db, [...festivalCol(pandalId, festivalId, "expenses"), id]));
    if (existing.exists()) {
      if (existing.data().voided) throw new Error("This expense operation was already voided.");
      return id;
    }
  }

  const batch = writeBatch(db);
  appendExpense(batch);
  await commitWrite(() => batch.commit(), { label: "expense" });
  return id;
}

export async function addAssetPurchase(
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
    reimbursementRequired?: boolean;
    clientOpId?: string;
    vendor?: string;
    description?: string;
    notes?: string;
    date: string;
    receiptPath?: string;
    sponsorId?: string;
    linkedSponsorshipId?: string;
    sponsorshipPurpose?: SponsorshipPurpose;
    purposeLabel?: string;
    asset: AssetPurchaseDraft;
    paymentMethod?: PaymentMethod;
  }
): Promise<{ expenseId: string; assetId: string }> {
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
  const paymentMethod = requireGodFundMethod(input.godFundAmount, input.paymentMethod);
  const estimatedValue =
    input.asset.estimatedValue != null && Number.isFinite(input.asset.estimatedValue)
      ? input.asset.estimatedValue
      : input.totalAmount;
  const sponsorLink = await loadSponsoredExpenseLink(db, pandalId, festivalId, {
    sponsoredAmount,
    sponsorId: input.sponsorId,
    linkedSponsorshipId: input.linkedSponsorshipId,
  });
  const expenseId = input.clientOpId?.trim() || newId();
  const assetId = newId();
  const reimbursementRequired = input.reimbursementRequired !== false;
  const cashAmount = input.godFundAmount + input.personalAmount;

  const appendAssetPurchase = (writer: GaneshWriter) => {
  const linkedSponsorshipId = sponsorLink
    ? appendExpenseSponsorship(writer, db, actor, pandalId, festivalId, {
        expenseId,
        sponsorId: sponsorLink.sponsorId,
        sponsorshipId: sponsorLink.sponsorshipId,
        amount: sponsoredAmount,
        purpose: input.sponsorshipPurpose,
        purposeLabel: input.purposeLabel,
        existing: sponsorLink.existing,
      })
    : undefined;
  writer.set(
    pathRef(db, [...festivalCol(pandalId, festivalId, "expenses"), expenseId]),
    omitUndefined({
      name,
      totalAmount: input.totalAmount,
      godFundAmount: input.godFundAmount,
      personalAmount: input.personalAmount,
      sponsoredAmount,
      categoryId: input.categoryId,
      categoryName: input.categoryName,
      paidByMemberId: input.paidByMemberId,
      reimbursementRequired,
      clientOpId: input.clientOpId?.trim() || expenseId,
      vendor: input.vendor?.trim() || undefined,
      description: input.description?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
      date: input.date,
      receiptPath: input.receiptPath,
      linkedSponsorshipId,
      expenseType: "asset_purchase",
      assetId,
      paymentMethod,
      ledgerType: "EXPENSE",
      voided: false,
      createdBy: actor.uid,
      createdAt: serverTimestamp(),
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    })
  );
  // Must be `writer`, not the `batch` declared further down: on the God Fund
  // path this closure runs inside runTransaction *before* that `const` is
  // initialised, so naming it here threw a TDZ ReferenceError and left the
  // asset row outside the transaction.
  appendPandalAssetCreate(writer, db, actor, pandalId, assetId, {
    name: input.asset.name,
    category: input.asset.category,
    quantity: input.asset.quantity,
    unit: input.asset.unit,
    ownershipType: "purchased",
    estimatedValue,
    condition: input.asset.condition ?? "good",
    location: input.asset.location,
    description: input.asset.description,
    relatedExpenseId: expenseId,
    relatedExpenseFestivalId: festivalId,
    acquisitionCost: input.totalAmount,
  });
  bumpSummary(writer, db, pandalId, festivalId, {
    godFundExpenses: input.godFundAmount,
    personalMoneyUsed: input.personalAmount,
    pendingReimbursements: reimbursementRequired ? input.personalAmount : 0,
    expenseCount: 1,
    assetPurchaseAmount: cashAmount,
    sponsoredExpenseAmount: sponsoredAmount,
    ...(input.godFundAmount > 0 ? locationBump(paymentMethod, -input.godFundAmount) : {}),
  });
  if (reimbursementRequired && input.personalAmount > 0) {
    writer.set(
      pathRef(db, [...festivalCol(pandalId, festivalId, "members"), input.paidByMemberId]),
      {
        personalExpenses: increment(input.personalAmount),
        pendingReimbursement: increment(input.personalAmount),
        updatedBy: actor.uid,
      },
      { merge: true }
    );
  }
  activity(writer, db, pandalId, festivalId, {
    title: name,
    subtitle: `Asset purchase · Added by ${actor.displayName}`,
    amount: input.totalAmount,
    actorId: actor.uid,
    entityType: "expense",
    entityId: expenseId,
  });
  audit(writer, db, pandalId, festivalId, actor.uid, "created", "expense", expenseId, {
    newValue: { ...input, expenseType: "asset_purchase", assetId },
  });
  };

  // Same reasoning as addExpense: a God Fund purchase reads the balance inside
  // the transaction; a purchase funded personally or by a sponsor just appends.
  if (input.godFundAmount > 0) {
    await runTransaction(db, async (txn) => {
      if (input.clientOpId) {
        const expenseRef = pathRef(db, [...festivalCol(pandalId, festivalId, "expenses"), expenseId]);
        const existing = await txn.get(expenseRef);
        if (existing.exists()) {
          if (existing.data().voided) throw new Error("This expense operation was already voided.");
          return;
        }
      }
      const summary = await readSummaryInTxn(txn, db, pandalId, festivalId);
      const spendOk = validateGodFundLocationSpend(
        input.godFundAmount,
        resolveFundLocation(paymentMethod),
        summary
      );
      if (!spendOk.ok) throw new Error(spendOk.error);
      appendAssetPurchase(txn);
    });
    return { expenseId, assetId };
  }

  if (input.clientOpId) {
    const existing = await getDoc(pathRef(db, [...festivalCol(pandalId, festivalId, "expenses"), expenseId]));
    if (existing.exists()) {
      if (existing.data().voided) throw new Error("This expense operation was already voided.");
      return { expenseId, assetId: String(existing.data().assetId ?? assetId) };
    }
  }

  const batch = writeBatch(db);
  appendAssetPurchase(batch);
  await commitWrite(() => batch.commit(), { label: "asset purchase" });
  return { expenseId, assetId };
}

export async function updateExpenseAmounts(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  expenseId: string,
  input: {
    totalAmount: number;
    godFundAmount: number;
    personalAmount: number;
    sponsoredAmount?: number;
  }
): Promise<void> {
  const ref = pathRef(db, [...festivalCol(pandalId, festivalId, "expenses"), expenseId]);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Expense not found.");
  const festivalSnap = await getDoc(pathRef(db, festivalDoc(pandalId, festivalId)));
  if (!festivalSnap.exists() || festivalSnap.data().status !== "open") {
    throw new Error("This festival is closed.");
  }
  const current = snap.data();
  if (current.voided) throw new Error("This expense is already voided.");
  const sponsoredAmount = input.sponsoredAmount ?? Number(current.sponsoredAmount ?? 0);
  const valid = validateExpenseFunding({
    totalAmount: input.totalAmount,
    godFundAmount: input.godFundAmount,
    personalAmount: input.personalAmount,
    sponsoredAmount,
  });
  if (!valid.ok) throw new Error(valid.error);
  const oldGod = Number(current.godFundAmount ?? 0);
  const oldPersonal = Number(current.personalAmount ?? 0);
  const oldSponsored = Number(current.sponsoredAmount ?? 0);
  const godDelta = input.godFundAmount - oldGod;
  const personalDelta = input.personalAmount - oldPersonal;
  const sponsoredDelta = sponsoredAmount - oldSponsored;
  const reimbursementRequired = current.reimbursementRequired !== false;
  const wasPurchase = current.expenseType === "asset_purchase" || Boolean(current.assetId);
  const oldCash = oldGod + oldPersonal;
  const newCash = input.godFundAmount + input.personalAmount;
  const paidByMemberId = current.paidByMemberId ? String(current.paidByMemberId) : undefined;
  const paymentMethod = resolveFundLocation(
    typeof current.paymentMethod === "string" ? current.paymentMethod : undefined
  );
  if (godDelta > 0 && !current.paymentMethod && input.godFundAmount > 0) {
    // Historical expenses have no method; new God Fund spend sits in Other.
  }

  const appendUpdate = (writer: GaneshWriter) => {
  writer.update(
    ref,
    omitUndefined({
      totalAmount: input.totalAmount,
      godFundAmount: input.godFundAmount,
      personalAmount: input.personalAmount,
      sponsoredAmount,
      paymentMethod: input.godFundAmount > 0 ? paymentMethod : current.paymentMethod,
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    })
  );
  bumpSummary(writer, db, pandalId, festivalId, {
    godFundExpenses: godDelta,
    personalMoneyUsed: personalDelta,
    pendingReimbursements: reimbursementRequired ? personalDelta : 0,
    assetPurchaseAmount: wasPurchase ? newCash - oldCash : 0,
    sponsoredExpenseAmount: sponsoredDelta,
    ...(godDelta !== 0 ? locationBump(paymentMethod, -godDelta) : {}),
  });
  if (reimbursementRequired && personalDelta !== 0 && paidByMemberId) {
    writer.set(
      pathRef(db, [...festivalCol(pandalId, festivalId, "members"), paidByMemberId]),
      {
        personalExpenses: increment(personalDelta),
        pendingReimbursement: increment(personalDelta),
        updatedBy: actor.uid,
      },
      { merge: true }
    );
  }
  if (wasPurchase && current.assetId) {
    appendAssetAcquisitionCost(
      writer,
      db,
      actor,
      pandalId,
      String(current.assetId),
      input.totalAmount
    );
  }
  audit(writer, db, pandalId, festivalId, actor.uid, "edited", "expense", expenseId, {
    oldValue: {
      totalAmount: current.totalAmount,
      godFundAmount: oldGod,
      personalAmount: oldPersonal,
    },
    newValue: input,
    reason: "Amount corrected",
  });
  };

  // Two things here need a live read: spending more God Fund than before, and
  // cutting the personal portion below what the member has already been
  // reimbursed (which is what drives `pendingReimbursement` negative — GS-009).
  const needsGodFundCheck = godDelta > 0;
  const needsPendingCheck = personalDelta < 0 && Boolean(paidByMemberId);
  if (needsGodFundCheck || needsPendingCheck) {
    await runTransaction(db, async (txn) => {
      // All reads first: a Firestore transaction refuses a read after a write.
      const summary = needsGodFundCheck
        ? await readSummaryInTxn(txn, db, pandalId, festivalId)
        : null;
      const member = needsPendingCheck
        ? await readMemberPendingInTxn(txn, db, pandalId, festivalId, paidByMemberId!)
        : null;

      if (summary) {
        const spendOk = validateGodFundLocationSpend(godDelta, paymentMethod, summary);
        if (!spendOk.ok) throw new Error(spendOk.error);
      }
      if (member) assertReimbursementReversible(-personalDelta, member.pending);
      appendUpdate(txn);
    });
    return;
  }

  const batch = writeBatch(db);
  appendUpdate(batch);
  await commitWrite(() => batch.commit(), { label: "expense amount" });
}

/** See attachContributionPhoto above — same reasoning, same GS-069. */
export async function attachExpenseReceipt(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  expenseId: string,
  receipt: GaneshFileMeta
): Promise<string | undefined> {
  const ref = pathRef(db, [...festivalCol(pandalId, festivalId, "expenses"), expenseId]);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Expense not found.");
  const data = snap.data();
  const previousPath = ganeshStoredPath(
    data.receipt as GaneshFileMeta | undefined,
    data.receiptPath as string | undefined
  );
  const batch = writeBatch(db);
  batch.update(ref, {
    receipt,
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  });
  audit(batch, db, pandalId, festivalId, actor.uid, "edited", "expense", expenseId, {
    oldValue: { receiptPath: previousPath ?? null },
    newValue: { receiptPath: receipt.path },
    reason: previousPath && previousPath !== receipt.path ? "Receipt replaced" : "Receipt attached",
  });
  // See attachContributionPhoto above for why this waits for a real ack.
  const outcome = await commitWrite(() => batch.commit(), { label: "expense receipt" });
  return outcome === "acked" && previousPath !== receipt.path ? previousPath : undefined;
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
    clientOpId?: string;
  }
): Promise<string> {
  await requireOpenFestival(db, pandalId, festivalId);
  // `input.pendingPersonalExpense` comes from a locally cached member document.
  // Check it early so the user gets the friendly copy, but never let it be the
  // thing that authorizes the payout — the ceiling is re-read below, inside the
  // transaction, and the God Fund must also be able to cover the cash going out.
  const valid = validateReimbursement(input.amount, input.pendingPersonalExpense);
  if (!valid.ok) throw new Error(valid.error);
  const id = input.clientOpId?.trim() || newId();

  await runTransaction(db, async (txn) => {
    // All reads first: a Firestore transaction refuses a read after a write.
    const reimbursementRef = pathRef(db, [...festivalCol(pandalId, festivalId, "reimbursements"), id]);
    if (input.clientOpId) {
      const existing = await txn.get(reimbursementRef);
      if (existing.exists()) {
        if (existing.data().voided) throw new Error("This reimbursement operation was already voided.");
        return;
      }
    }
    const member = await readMemberPendingInTxn(
      txn,
      db,
      pandalId,
      festivalId,
      input.memberId
    );
    const summary = await readSummaryInTxn(txn, db, pandalId, festivalId);

    const serverValid = validateReimbursement(input.amount, member.pending);
    if (!serverValid.ok) throw new Error(serverValid.error);

    // A reimbursement is cash leaving the God Fund, so it has to clear the same
    // solvency check an expense does. Without this the fund goes negative with
    // no warning anywhere (GS-008). Routed through validateGodFundSpend so the
    // rounding stays the one central formula — see GS-080 on local money() copies.
    const available = availableGodFund(summary);
    const locOk = validateGodFundLocationSpend(
      input.amount,
      resolveFundLocation(input.paymentMethod),
      summary
    );
    if (!locOk.ok) {
      if (!validateGodFundSpend(input.amount, available).ok) {
        throw new InsufficientFundError("festival", available, input.amount);
      }
      throw new Error(locOk.error);
    }

    txn.set(
      reimbursementRef,
      omitUndefined({
        memberId: input.memberId,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        date: input.date,
        notes: input.notes?.trim() || undefined,
        status: "paid",
        clientOpId: input.clientOpId?.trim() || id,
        ledgerType: "REIMBURSEMENT",
        voided: false,
        createdBy: actor.uid,
        createdAt: serverTimestamp(),
        updatedBy: actor.uid,
        updatedAt: serverTimestamp(),
      })
    );
    bumpSummary(txn, db, pandalId, festivalId, {
      reimbursements: input.amount,
      pendingReimbursements: -input.amount,
      ...locationBump(input.paymentMethod, -input.amount),
    });
    txn.set(
      pathRef(db, [...festivalCol(pandalId, festivalId, "members"), input.memberId]),
      {
        reimbursed: increment(input.amount),
        pendingReimbursement: increment(-input.amount),
        updatedBy: actor.uid,
      },
      { merge: true }
    );
    activity(txn, db, pandalId, festivalId, {
      title: "Reimbursement",
      subtitle: `Recorded by ${actor.displayName}`,
      amount: input.amount,
      actorId: actor.uid,
      entityType: "reimbursement",
      entityId: id,
    });
    audit(txn, db, pandalId, festivalId, actor.uid, "reimbursed", "reimbursement", id, {
      newValue: input,
    });
  });
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
  // Voiding rewrites balances, so it is a mutation like any other and must not
  // land on a settled year (GS-019). Every other mutation path already guards
  // this; the rules do not backstop it, because a void is an `update` and the
  // wildcard permits updates on a closed festival for anyone who may close it.
  await requireOpenFestival(db, pandalId, festivalId);

  const ref = pathRef(db, [...festivalCol(pandalId, festivalId, colName), input.entityId]);

  // A void is the one operation that puts money *back*, so voiding the same
  // record twice invents money that never existed. Reading the `voided` flag
  // outside the write made that reachable: two admins voiding one record both
  // saw `voided: false` and both reversed it. The read belongs inside the
  // transaction, so the second writer retries and then fails the guard.
  // `assertVoidOnline` already gates this path, so requiring a connection here
  // costs nothing that was not already required.
  await runTransaction(db, async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists()) throw new Error("Record not found.");
    if (snap.data().voided) throw new Error("This record is already voided.");
    const data = snap.data();
    if (input.entityType === "openingFund" && data.sourceType === "permanent_fund") {
      throw new Error(
        "Return Permanent Fund money from the Permanent Fund screen. Do not void this opening fund."
      );
    }

    // Every read has to happen before the first write in a transaction, so the
    // member and household lookups are hoisted here rather than sitting inside
    // the branches that use them.

    // Voiding an expense hands the member's personal money back, which subtracts
    // from what they are owed. If they have already been paid, that subtraction is
    // what drives the counter negative (GS-009), so re-read the live figure and
    // refuse rather than corrupt it.
    const voidsPersonalMoney =
      input.entityType === "expense"
      && Number(data.personalAmount ?? 0) > 0
      && data.reimbursementRequired !== false
      && Boolean(data.paidByMemberId);
    if (voidsPersonalMoney) {
      const memberSnap = await txn.get(
        pathRef(db, [
          ...festivalCol(pandalId, festivalId, "members"),
          String(data.paidByMemberId),
        ])
      );
      assertReimbursementReversible(
        Number(data.personalAmount ?? 0),
        memberSnap.exists() ? Number(memberSnap.data().pendingReimbursement ?? 0) : 0
      );
    }

    const householdRef =
      input.entityType === "collection" && data.householdId
        ? pathRef(db, [
            ...festivalCol(pandalId, festivalId, "households"),
            String(data.householdId),
          ])
        : null;
    const householdSnap = householdRef ? await txn.get(householdRef) : null;

    // An asset purchase creates a thing the Pandal owns. Voiding only the
    // expense used to leave that asset in inventory with its acquisition cost
    // and a link to a voided expense (GS-020) — the Pandal's estimated value
    // still counted chairs it had no record of buying.
    //
    // Refusing is the honest resolution: whether the Pandal still owns the item
    // is a fact only the committee knows, so they settle it on the Assets
    // screen first. Same treatment as voiding a Permanent Fund opening entry
    // above. Once the asset is disposed, lost, or gone, the void proceeds.
    if (input.entityType === "expense" && data.assetId) {
      const assetSnap = await txn.get(
        pathRef(db, [...pandalAssetsCol(pandalId), String(data.assetId)])
      );
      const assetStatus = assetSnap.exists() ? String(assetSnap.data().status ?? "") : null;
      const assetIsLive =
        assetSnap.exists()
        && !assetSnap.data().voided
        && assetStatus !== "disposed"
        && assetStatus !== "lost";
      if (assetIsLive) {
        throw new Error(
          "This expense bought a Pandal asset. Mark the asset disposed or lost on the Pandal assets screen first, then void this expense."
        );
      }
    }

    txn.update(ref, {
      voided: true,
      voidReason: input.reason.trim() || "Voided",
      voidedBy: actor.uid,
      voidedAt: serverTimestamp(),
      ...(input.entityType === "reimbursement" ? { status: "voided" } : {}),
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    });

    if (input.entityType === "openingFund") {
      const amount = Number(data.amount ?? 0);
      bumpSummary(txn, db, pandalId, festivalId, {
        openingFunds: -amount,
        // Mirror of the create path: `sourceType` is never a location.
        ...locationBump(
          typeof data.location === "string" ? data.location : undefined,
          -amount
        ),
      });
    } else if (input.entityType === "collection") {
      const amount = Number(data.amount ?? 0);
      bumpSummary(txn, db, pandalId, festivalId, {
        chanda: -amount,
        collectionCount: -1,
        ...locationBump(
          typeof data.paymentMethod === "string" ? data.paymentMethod : undefined,
          -amount
        ),
      });
      if (householdRef && householdSnap?.exists()) {
        const nextCollected = money(
          Math.max(0, Number(householdSnap.data().collectedAmount ?? 0) - amount)
        );
        txn.update(householdRef, {
          // Increment keeps concurrent voids from clobbering each other (GS-038).
          collectedAmount: increment(-amount),
          status: deriveHouseholdStatus({
            expectedAmount: Number(householdSnap.data().expectedAmount ?? 0),
            collectedAmount: nextCollected,
            forcedStatus: householdSnap.data().status as HouseholdStatus | undefined,
          }),
          updatedBy: actor.uid,
          updatedAt: serverTimestamp(),
        });
      }
    } else if (input.entityType === "contribution") {
      if (data.status === "received" && data.kind === "money") {
        const amount = Number(data.amount ?? 0);
        bumpSummary(txn, db, pandalId, festivalId, {
          committeeContributions: data.isCommitteeContribution ? -amount : 0,
          otherCashContributions: data.isCommitteeContribution ? 0 : -amount,
          ...locationBump(
            typeof data.paymentMethod === "string" ? data.paymentMethod : undefined,
            -amount
          ),
        });
        if (data.isCommitteeContribution && data.contributorMemberId) {
          txn.set(
            pathRef(db, [
              ...festivalCol(pandalId, festivalId, "members"),
              String(data.contributorMemberId),
            ]),
            { contributionPaid: increment(-amount), updatedBy: actor.uid },
            { merge: true }
          );
        }
      } else if (data.status === "received" && data.kind !== "money") {
        const estimatedValue = Number(data.estimatedValue ?? 0);
        bumpSummary(txn, db, pandalId, festivalId, {
          inKindValue: data.kind === "sponsorship" ? 0 : -estimatedValue,
          sponsoredValue: data.kind === "sponsorship" ? -estimatedValue : 0,
        });
      }
    } else if (input.entityType === "expense") {
      const godFundAmount = Number(data.godFundAmount ?? 0);
      const personalAmount = Number(data.personalAmount ?? 0);
      const wasPurchase = data.expenseType === "asset_purchase" || Boolean(data.assetId);
      bumpSummary(txn, db, pandalId, festivalId, {
        godFundExpenses: -godFundAmount,
        personalMoneyUsed: -personalAmount,
        pendingReimbursements: data.reimbursementRequired === false ? 0 : -personalAmount,
        expenseCount: -1,
        assetPurchaseAmount: wasPurchase ? -(godFundAmount + personalAmount) : 0,
        sponsoredExpenseAmount: -Number(data.sponsoredAmount ?? 0),
        ...(godFundAmount > 0
          ? locationBump(
              typeof data.paymentMethod === "string" ? data.paymentMethod : undefined,
              godFundAmount
            )
          : {}),
      });
      if (personalAmount > 0 && data.reimbursementRequired !== false && data.paidByMemberId) {
        txn.set(
          pathRef(db, [
            ...festivalCol(pandalId, festivalId, "members"),
            String(data.paidByMemberId),
          ]),
          {
            personalExpenses: increment(-personalAmount),
            pendingReimbursement: increment(-personalAmount),
            updatedBy: actor.uid,
          },
          { merge: true }
        );
      }
    } else if (input.entityType === "reimbursement") {
      const amount = Number(data.amount ?? 0);
      bumpSummary(txn, db, pandalId, festivalId, {
        reimbursements: -amount,
        pendingReimbursements: amount,
        ...locationBump(
          typeof data.paymentMethod === "string" ? data.paymentMethod : undefined,
          amount
        ),
      });
      txn.set(
        pathRef(db, [...festivalCol(pandalId, festivalId, "members"), String(data.memberId)]),
        {
          reimbursed: increment(-amount),
          pendingReimbursement: increment(amount),
          updatedBy: actor.uid,
        },
        { merge: true }
      );
    }

    audit(txn, db, pandalId, festivalId, actor.uid, "voided", input.entityType, input.entityId, {
      oldValue: data,
      reason: input.reason,
    });
  });
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
    // transferFestivalToPermanent already re-derives the closing balance inside
    // its transaction and rejects a transfer that exceeds it.
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

  // Transferring nothing is a legitimate settlement — the committee may want the
  // closing balance to stay with the festival. What is NOT legitimate is closing
  // while believing the balance is zero when it is not: that is what happens when
  // the screen acts on an unloaded summary (GS-007), and it is irreversible,
  // because the rules refuse every ledger write once the festival is closed.
  //
  // So the client does not get to assert the balance. It states what it expects
  // to be left behind, and the server checks that against its own read.
  await runTransaction(db, async (txn) => {
    const festivalRef = pathRef(db, festivalDoc(pandalId, festivalId));
    const festivalSnap = await txn.get(festivalRef);
    if (!festivalSnap.exists()) throw new Error("Festival not found.");
    if (festivalSnap.data().status !== "open") throw new Error("This festival is already closed.");

    const summary = await readSummaryInTxn(txn, db, pandalId, festivalId);
    const closing = availableGodFund(summary);
    const claimedRemaining = Number(settlement?.remainingAmount ?? 0);

    if (!settlement || !closeBalanceAgrees(claimedRemaining, closing)) {
      throw new Error(
        `This festival still holds ${formatInr(closing)}. Reopen the settlement screen so the ` +
          "totals load, then close with the correct figures."
      );
    }

    txn.update(festivalRef, {
      status: "closed",
      closedAt: serverTimestamp(),
      closedBy: actor.uid,
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    });
    audit(txn, db, pandalId, festivalId, actor.uid, "closed", "festival", festivalId, {
      reason: "Festival closed",
      newValue: { transferAmount: 0, remainingAmount: closing },
    });
  });
}

export async function reopenFestival(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string
): Promise<void> {
  await runTransaction(db, async (txn) => {
    const festivalRef = pathRef(db, festivalDoc(pandalId, festivalId));
    const festivalSnap = await txn.get(festivalRef);
    if (!festivalSnap.exists()) throw new Error("Festival not found.");
    if (festivalSnap.data().status !== "closed") {
      throw new Error("This festival is already open.");
    }
    txn.update(festivalRef, {
      status: "open",
      closedAt: deleteField(),
      closedBy: deleteField(),
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    });
    audit(txn, db, pandalId, festivalId, actor.uid, "reopened", "festival", festivalId, {
      reason: "Festival reopened",
      oldValue: {
        status: "closed",
        closedBy: festivalSnap.data().closedBy,
      },
    });
  });
}

function timestampMillis(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  const ts = value as { toMillis?: () => number; seconds?: number };
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  return null;
}

async function loadAllFestivalDocs(
  db: Firestore,
  pandalId: string,
  festivalId: string,
  name: Parameters<typeof festivalCol>[2]
): Promise<QueryDocumentSnapshot[]> {
  const out: QueryDocumentSnapshot[] = [];
  let last: QueryDocumentSnapshot | undefined;
  while (true) {
    const q = last
      ? query(
          colRef(db, festivalCol(pandalId, festivalId, name)),
          orderBy(documentId()),
          startAfter(last),
          limit(500)
        )
      : query(
          colRef(db, festivalCol(pandalId, festivalId, name)),
          orderBy(documentId()),
          limit(500)
        );
    const snap = await getDocs(q);
    out.push(...snap.docs);
    if (snap.size < 500) break;
    last = snap.docs[snap.docs.length - 1];
  }
  return out;
}

export async function recomputeFestivalSummary(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string
): Promise<void> {
  const summaryRef = pathRef(db, summaryDoc(pandalId, festivalId));
  const beforeSnap = await getDoc(summaryRef);
  const beforeUpdatedAt = timestampMillis(beforeSnap.exists() ? beforeSnap.data().updatedAt : null);

  const [opening, collections, contributions, expenses, reimbursements, fundTransfers, members] =
    await Promise.all([
      loadAllFestivalDocs(db, pandalId, festivalId, "openingFunds"),
      loadAllFestivalDocs(db, pandalId, festivalId, "collections"),
      loadAllFestivalDocs(db, pandalId, festivalId, "contributions"),
      loadAllFestivalDocs(db, pandalId, festivalId, "expenses"),
      loadAllFestivalDocs(db, pandalId, festivalId, "reimbursements"),
      loadAllFestivalDocs(db, pandalId, festivalId, "fundTransfers"),
      loadAllFestivalDocs(db, pandalId, festivalId, "members"),
    ]);

  const notVoided = (docSnap: QueryDocumentSnapshot) => !docSnap.data().voided;
  // The shared definition, not a second one (GS-072). This rolled its own as
  // "not cancelled and not promised", which counts a contribution with **no
  // status at all** as received — while `contributionStatusOf` in
  // ganeshContributions.ts defaults an absent status to *promised*. A statusless
  // document was therefore invisible-as-promised everywhere in the UI and
  // counted as cash the moment anyone pressed "Recalculate from ledger".
  //
  // Every current write path sets a status, so this reaches only legacy or
  // externally written data — which is precisely what a rebuild tool exists to
  // handle correctly.
  const received = (docSnap: QueryDocumentSnapshot) =>
    isReceived(docSnap.data() as Parameters<typeof isReceived>[0]);

  const locationDeltas: Array<{ location: PermanentFundLocation; amount: number }> = [];
  const addLoc = (location: string | undefined, amount: number) => {
    if (!amount) return;
    locationDeltas.push({ location: resolveFundLocation(location), amount });
  };

  for (const docSnap of opening.filter(notVoided)) {
    const data = docSnap.data();
    // Opening funds written before locations existed carry no `location`, so
    // they resolve to "other" and stay unclassified. Never fall back to
    // `sourceType`: it is a provenance, not a place money sits.
    addLoc(data.location, Number(data.amount ?? 0));
  }
  for (const docSnap of collections.filter(notVoided)) {
    const data = docSnap.data();
    addLoc(data.paymentMethod, Number(data.amount ?? 0));
  }
  for (const docSnap of contributions.filter((row) => received(row) && row.data().kind === "money")) {
    const data = docSnap.data();
    addLoc(data.paymentMethod, Number(data.amount ?? 0));
  }
  for (const docSnap of expenses.filter(notVoided)) {
    const data = docSnap.data();
    addLoc(data.paymentMethod, -Number(data.godFundAmount ?? 0));
  }
  for (const docSnap of reimbursements.filter(notVoided)) {
    const data = docSnap.data();
    addLoc(data.paymentMethod, -Number(data.amount ?? 0));
  }
  for (const docSnap of fundTransfers.filter((row) => row.data().direction === "to_permanent")) {
    const data = docSnap.data();
    addLoc(data.location, -Number(data.amount ?? 0));
  }

  const summary = summarizeLedger({
    openingFunds: opening.filter(notVoided).map((docSnap) => Number(docSnap.data().amount ?? 0)),
    collections: collections.filter(notVoided).map((docSnap) => Number(docSnap.data().amount ?? 0)),
    committeeContributions: contributions
      .filter((docSnap) => received(docSnap) && docSnap.data().kind === "money" && docSnap.data().isCommitteeContribution)
      .map((docSnap) => Number(docSnap.data().amount ?? 0)),
    otherCashContributions: contributions
      .filter((docSnap) => received(docSnap) && docSnap.data().kind === "money" && !docSnap.data().isCommitteeContribution)
      .map((docSnap) => Number(docSnap.data().amount ?? 0)),
    godFundExpenses: expenses.filter(notVoided).map((docSnap) => Number(docSnap.data().godFundAmount ?? 0)),
    reimbursements: reimbursements.filter(notVoided).map((docSnap) => Number(docSnap.data().amount ?? 0)),
    personalAmounts: expenses.filter(notVoided).map((docSnap) => Number(docSnap.data().personalAmount ?? 0)),
    reimbursementAmounts: expenses
      .filter(notVoided)
      .filter((docSnap) => docSnap.data().reimbursementRequired !== false)
      .map((docSnap) => Number(docSnap.data().personalAmount ?? 0)),
    assetPurchaseAmounts: expenses
      .filter(notVoided)
      .filter((docSnap) => docSnap.data().expenseType === "asset_purchase" || docSnap.data().assetId)
      .map(
        (docSnap) =>
          Number(docSnap.data().godFundAmount ?? 0) + Number(docSnap.data().personalAmount ?? 0)
      ),
    sponsoredExpenseAmounts: expenses
      .filter(notVoided)
      .map((docSnap) => Number(docSnap.data().sponsoredAmount ?? 0)),
    inKindValues: contributions
      .filter((docSnap) => received(docSnap) && docSnap.data().kind !== "money" && docSnap.data().kind !== "sponsorship")
      .map((docSnap) => Number(docSnap.data().estimatedValue ?? 0)),
    sponsoredValues: contributions
      .filter((docSnap) => received(docSnap) && docSnap.data().kind === "sponsorship")
      .map((docSnap) => Number(docSnap.data().estimatedValue ?? 0)),
    locationDeltas,
  });
  summary.promisedCashContributions = money(
    contributions
      .filter((row) => notVoided(row) && row.data().status === "promised" && row.data().kind === "money")
      .reduce((total, row) => total + Number(row.data().amount ?? 0), 0)
  );
  summary.promisedInKindValue = money(
    contributions
      .filter((row) => notVoided(row) && row.data().status === "promised" && row.data().kind !== "money")
      .reduce((total, row) => total + Number(row.data().estimatedValue ?? 0), 0)
  );
  // Monotonic counters are not derivable from the ledger, and this write
  // replaces the whole document. Dropping either one restarts numbering and
  // duplicates receipt/contribution numbers already handed to donors (GS-077).
  summary.nextContributionNumber = Number(beforeSnap.data()?.nextContributionNumber ?? 0);
  summary.nextReceiptNumber = Number(beforeSnap.data()?.nextReceiptNumber ?? 0);
  // Rounded like every other field summarizeLedger produces; these two were
  // the exceptions (GS-081).
  summary.transferredToPermanentFund = money(
    fundTransfers
      .filter((docSnap) => docSnap.data().direction === "to_permanent")
      .reduce((sum, docSnap) => sum + Number(docSnap.data().amount ?? 0), 0)
  );
  summary.receivedFromPermanentFund = money(
    fundTransfers
      .filter((docSnap) => docSnap.data().direction === "from_permanent")
      .reduce((sum, docSnap) => sum + Number(docSnap.data().amount ?? 0), 0)
  );

  const contributionPaid = new Map<string, number>();
  const personalExpenses = new Map<string, number>();
  const reimbursed = new Map<string, number>();
  const bumpMember = (map: Map<string, number>, id: string | undefined, amount: number) => {
    if (!id || !amount) return;
    map.set(id, money((map.get(id) ?? 0) + amount));
  };
  for (const docSnap of contributions.filter(
    (row) => received(row) && row.data().kind === "money" && row.data().isCommitteeContribution
  )) {
    bumpMember(contributionPaid, docSnap.data().contributorMemberId, Number(docSnap.data().amount ?? 0));
  }
  for (const docSnap of expenses.filter(notVoided)) {
    bumpMember(
      personalExpenses,
      docSnap.data().paidByMemberId,
      Number(docSnap.data().personalAmount ?? 0)
    );
  }
  for (const docSnap of reimbursements.filter(notVoided)) {
    bumpMember(reimbursed, docSnap.data().memberId, Number(docSnap.data().amount ?? 0));
  }

  await runTransaction(db, async (txn) => {
    const current = await txn.get(summaryRef);
    const currentUpdatedAt = timestampMillis(current.exists() ? current.data().updatedAt : null);
    if (
      beforeUpdatedAt != null &&
      currentUpdatedAt != null &&
      currentUpdatedAt !== beforeUpdatedAt
    ) {
      throw new Error("Festival totals changed while recalculating. Try again.");
    }
    txn.set(summaryRef, {
      ...summary,
      updatedAt: serverTimestamp(),
    });

    // This rewrites every total on the festival, and until now left no record
    // that it happened or who did it (GS-053). It is also the documented repair
    // path for the God Fund location split, so it is the write most likely to
    // be reached for when the numbers already look wrong — exactly when a
    // committee needs to see what changed.
    //
    // Only the fields that actually moved are recorded. A recompute that
    // changes nothing is the common case, and an audit entry listing every
    // unchanged total would bury the one that did move.
    const before = parseGaneshSummary(
      current.exists() ? (current.data() as Partial<typeof EMPTY_GANESH_SUMMARY>) : null
    );
    // Same key-walk parseGaneshSummary uses: EMPTY_GANESH_SUMMARY's keys are
    // exactly the numeric totals, so they index both sides cleanly.
    const movedKeys = (
      Object.keys(EMPTY_GANESH_SUMMARY) as Array<keyof typeof EMPTY_GANESH_SUMMARY>
    ).filter((key) => before[key] !== summary[key]);
    audit(txn, db, pandalId, festivalId, actor.uid, "adjusted", "summary", "summary", {
      oldValue: Object.fromEntries(movedKeys.map((key) => [key, before[key]])),
      newValue: Object.fromEntries(movedKeys.map((key) => [key, summary[key]])),
      reason:
        movedKeys.length === 0
          ? "Recalculated from ledger; every total already agreed"
          : `Recalculated from ledger; ${movedKeys.length} total(s) changed`,
    });
  });

  for (let i = 0; i < members.length; i += 400) {
    const slice = members.slice(i, i + 400);
    const batch = writeBatch(db);
    for (const memberSnap of slice) {
      const paid = contributionPaid.get(memberSnap.id) ?? 0;
      const personal = personalExpenses.get(memberSnap.id) ?? 0;
      const repaid = reimbursed.get(memberSnap.id) ?? 0;
      batch.set(
        memberSnap.ref,
        {
          contributionPaid: paid,
          personalExpenses: personal,
          reimbursed: repaid,
          pendingReimbursement: money(Math.max(0, personal - repaid)),
        },
        { merge: true }
      );
    }
    await commitWrite(() => batch.commit(), { label: "recompute members" });
  }
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
  audit(categoryBatch, db, pandalId, festivalId, actor.uid, "created", "category", id, {
    newValue: { name: trimmed },
  });
  await commitWrite(() => categoryBatch.commit(), { label: "category" });
  return id;
}

export async function updateCategory(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  categoryId: string,
  input: { name?: string; disabled?: boolean }
): Promise<void> {
  const categoryRef = pathRef(db, [...festivalCol(pandalId, festivalId, "categories"), categoryId]);
  const snap = await getDoc(categoryRef);
  if (!snap.exists()) throw new Error("Category not found.");
  const name = input.name?.trim();
  if (input.name != null && !name) throw new Error("Enter a category name.");
  const batch = writeBatch(db);
  batch.update(categoryRef, omitUndefined({
    name: name || undefined,
    disabled: input.disabled,
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  }));
  audit(batch, db, pandalId, festivalId, actor.uid, "adjusted", "category", categoryId, {
    oldValue: { name: snap.data().name, disabled: snap.data().disabled ?? false },
    newValue: { name: name || snap.data().name, disabled: input.disabled ?? snap.data().disabled ?? false },
    reason:
      input.disabled === true
        ? "Disabled category"
        : input.disabled === false
          ? "Enabled category"
          : name
            ? "Renamed category"
            : "Updated category",
  });
  await commitWrite(() => batch.commit(), { label: "category update" });
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
