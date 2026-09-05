/**
 * KAN-34 membership facade.
 *
 * One import site for the ticket's canonical operations. Each function
 * delegates to the existing writer/reader — no second Firestore path, and no
 * top-level invitation or festival collections.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  type Firestore,
} from "firebase/firestore";

import type { GaneshActor } from "@/services/ganesh/ganeshWrites";
import {
  createPandalAndFestival,
  decideJoinRequest,
  leavePandal as leavePandalWrite,
  requestPandalJoin,
  updatePandalMember,
} from "@/services/ganesh/ganeshWrites";
import { upsertGaneshProfile } from "@/services/ganesh/ganeshProfile";
import { festivalDoc, membershipsCol } from "@/shared/utils/ganeshPaths";
import type { Festival, GaneshMemberStatus, GaneshRole, Pandal } from "@/shared/types/ganesh";

function pathRef(db: Firestore, segments: string[]) {
  const [first, ...rest] = segments;
  return doc(db, first, ...rest);
}

export async function getCurrentUser(
  db: Firestore,
  user: {
    uid: string;
    displayName?: string | null;
    email?: string | null;
    phoneNumber?: string | null;
    photoURL?: string | null;
  }
) {
  await upsertGaneshProfile(db, user);
  const snap = await getDoc(doc(db, "users", user.uid));
  return { uid: user.uid, ...(snap.data() ?? {}) };
}

export async function getPandalMembership(db: Firestore, pandalId: string, uid: string) {
  const snap = await getDoc(doc(db, "pandals", pandalId, "members", uid));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function listMyPandals(db: Firestore, uid: string) {
  const [root, ...rest] = membershipsCol(uid);
  const snap = await getDocs(collection(db, root, ...rest));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function getCurrentPandal(db: Firestore, pandalId: string): Promise<Pandal | null> {
  const snap = await getDoc(doc(db, "pandals", pandalId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<Pandal, "id">) };
}

export async function getCurrentFestival(
  db: Firestore,
  pandalId: string,
  festivalId: string
): Promise<Festival | null> {
  const snap = await getDoc(pathRef(db, festivalDoc(pandalId, festivalId)));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<Festival, "id">) };
}

export async function createPandal(
  db: Firestore,
  actor: GaneshActor,
  input: Parameters<typeof createPandalAndFestival>[2]
) {
  return createPandalAndFestival(db, actor, input);
}

/** The live invitation is the Pandal code (`pandalInvites/{code}`), not a new collection. */
export async function createInvitation(db: Firestore, pandalId: string) {
  const snap = await getDoc(doc(db, "pandals", pandalId));
  if (!snap.exists()) throw new Error("Pandal not found.");
  const code = String(snap.data().code ?? "");
  if (!code) throw new Error("This Pandal has no join code.");
  return { pandalId, code, joinMode: snap.data().joinMode ?? "approval" };
}

export async function acceptInvitation(
  db: Firestore,
  actor: GaneshActor,
  code: string
) {
  return requestPandalJoin(db, actor, code);
}

export async function approveInvitation(
  db: Firestore,
  actor: GaneshActor,
  requestId: string,
  assignment?: Parameters<typeof decideJoinRequest>[4]
) {
  return decideJoinRequest(db, actor, requestId, "approved", assignment);
}

export async function leavePandal(db: Firestore, actor: GaneshActor, pandalId: string) {
  return leavePandalWrite(db, actor, pandalId);
}

export async function updateMemberRole(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  targetUserId: string,
  input: { role?: GaneshRole; status?: GaneshMemberStatus; reason?: string }
) {
  return updatePandalMember(db, actor, pandalId, targetUserId, input);
}
