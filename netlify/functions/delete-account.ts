import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import {
  FieldValue,
  getFirestore,
  type BulkWriter,
  type CollectionReference,
  type Firestore,
  type Query,
} from "firebase-admin/firestore";

import {
  EMPTY_DELETE_COUNTS,
  isReauthFresh,
  nextDeletePhase,
  parseDeleteRequest,
  type DeleteCounts,
  type DeletePhase,
} from "../../shared/utils/deleteAccountRemote";
import { planMembershipRemoval } from "../../shared/utils/ganeshAccountRemoval";
import { duressUid, isDuressUid } from "../../shared/utils/duress";

type NetlifyEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  body?: string | null;
};

type NetlifyResult = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Wall-clock budget for one invocation.
 *
 * Netlify's synchronous limit is 10s. Stopping at 7s leaves room to finish the
 * write in flight and serialise a response, so the client gets a cursor back
 * rather than a timeout it has to guess about.
 */
const PHASE_BUDGET_MS = 7_000;

/** Documents per query page in the shared and ganesh phases. */
const PAGE_SIZE = 200;

function json(statusCode: number, payload: Record<string, unknown>): NetlifyResult {
  return {
    statusCode,
    headers: { ...CORS, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}

function header(event: NetlifyEvent, name: string): string {
  const headers = event.headers ?? {};
  const match = Object.keys(headers).find(
    (key) => key.toLowerCase() === name.toLowerCase(),
  );
  return match ? String(headers[match] ?? "") : "";
}

function initAdmin() {
  if (getApps().length > 0) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT ?? "";
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not set on this Netlify site.");
  }
  const creds = JSON.parse(raw) as { project_id?: string; projectId?: string };
  initializeApp({
    credential: cert(creds as Parameters<typeof cert>[0]),
    projectId: creds.project_id ?? creds.projectId,
  });
}

type RunState = {
  deleted: DeleteCounts;
  orphanedPandals: string[];
  skippedSharedVaults: string[];
  failedPaths: string[];
};

/**
 * A BulkWriter that records a poisoned document instead of aborting.
 *
 * The default gives up after five attempts and throws, which would take the
 * whole phase down with it. One stuck document must not be able to make an
 * account permanently undeletable — "one of your documents is wedged" is not an
 * answer Play policy accepts.
 */
function makeBulkWriter(db: Firestore, state: RunState): BulkWriter {
  const writer = db.bulkWriter();
  writer.onWriteError((error) => {
    if (error.failedAttempts < 5) return true;
    state.failedPaths.push(error.documentRef.path);
    return false;
  });
  return writer;
}

/** Delete a query's documents in pages until it is empty or the clock runs out. */
async function drainQuery(
  db: Firestore,
  query: Query,
  startedAt: number,
  state: RunState,
  onDeleted: (n: number) => void,
): Promise<boolean> {
  for (;;) {
    const page = await query.limit(PAGE_SIZE).get();
    if (page.empty) return true;

    const writer = makeBulkWriter(db, state);
    for (const doc of page.docs) void writer.delete(doc.ref);
    await writer.close();
    onDeleted(page.size);

    // Deleted documents drop out of the same query, so re-running it is the
    // cursor. No startAfter, and a resumed call picks up where this left off.
    if (page.size < PAGE_SIZE) return true;
    if (Date.now() - startedAt > PHASE_BUDGET_MS) return false;
  }
}

/**
 * Phase 1 — everything other people can see.
 *
 * First on purpose: if the run stalls after this, the friend-visible splits
 * carrying this person's name, photo and UPI id are gone and only their own
 * private data is left. That is the right way round.
 *
 * These documents are deleted rather than orphaned because `createdBy` is
 * immutable in `firestore.rules` and only the creator may update or delete —
 * so a split outliving its creator can never be settled or removed by anyone.
 */
async function runSharedPhase(
  db: Firestore,
  uid: string,
  startedAt: number,
  state: RunState,
): Promise<boolean> {
  const byCreator: Array<[string, keyof DeleteCounts]> = [
    ["splits", "splits"],
    ["paymentRequests", "paymentRequests"],
    ["splitPublicShares", "splitPublicShares"],
  ];
  for (const [collection, counter] of byCreator) {
    const done = await drainQuery(
      db,
      db.collection(collection).where("createdBy", "==", uid),
      startedAt,
      state,
      (n) => {
        state.deleted[counter] += n;
      },
    );
    if (!done) return false;
  }

  const vaults = await db.collection("vaults").where("ownerId", "==", uid).get();
  for (const vault of vaults.docs) {
    const memberIds = vault.get("memberIds");
    if (Array.isArray(memberIds) && memberIds.length > 1) {
      // Impossible today — `keepsOwnershipStable()` freezes memberIds after a
      // create that requires [self]. Kept because the day an invite flow ships,
      // silently destroying someone else's vault would be far worse than
      // leaving a row behind for an operator to look at.
      state.skippedSharedVaults.push(vault.id);
      continue;
    }
    await db.recursiveDelete(vault.ref, makeBulkWriter(db, state));
    state.deleted.vaults += 1;
    if (Date.now() - startedAt > PHASE_BUDGET_MS) return false;
  }
  return true;
}

/**
 * Phase 2 — Ganesh Seva membership.
 *
 * Found by `userId`, not by document id: the self-join path pins the member doc
 * id to the uid, but the `canManageMembers()` create branch does not, so an
 * admin who added someone else produced a doc under a different id. Enumerating
 * by id would quietly miss those.
 *
 * Needs the `members.userId` collection-group index override in
 * `firestore.indexes.json` — without it this throws FAILED_PRECONDITION at
 * runtime and only at runtime.
 */
async function runGaneshPhase(
  db: Firestore,
  uid: string,
  startedAt: number,
  state: RunState,
): Promise<boolean> {
  const members = await db
    .collectionGroup("members")
    .where("userId", "==", uid)
    .limit(PAGE_SIZE)
    .get();

  for (const member of members.docs) {
    const pandalRef = member.ref.parent.parent;
    // Defensive: another feature adding its own `members` subcollection would
    // otherwise be swept up by the same collection-group query.
    if (!pandalRef || pandalRef.parent.id !== "pandals") continue;

    const pandalSnap = await pandalRef.get();
    const plan = planMembershipRemoval({
      role: member.get("role"),
      status: member.get("status"),
      adminCount: pandalSnap.get("adminCount"),
    });
    if (!plan.changed) continue;

    const batch = db.batch();
    // Marked removed, never deleted: `allow delete: if false` on member docs,
    // and the Pandal's ledger references them by `collectorId`. Deleting would
    // break history for a committee that is not deleting anything.
    batch.update(member.ref, {
      status: "removed",
      deletedAccount: true,
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (plan.wasActiveAdmin) {
      batch.update(pandalRef, {
        adminCount: plan.nextAdminCount,
        memberIds: FieldValue.arrayRemove(uid),
        ...(plan.orphansPandal
          ? { needsAdmin: true, needsAdminSince: FieldValue.serverTimestamp() }
          : {}),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    for (const audit of plan.audits) {
      batch.create(pandalRef.collection("memberAudits").doc(), {
        actorId: uid,
        targetUserId: uid,
        action: audit.action,
        reason: audit.reason,
        oldRole: member.get("role") ?? "member",
        newRole: member.get("role") ?? "member",
        oldStatus: member.get("status") ?? "active",
        newStatus: "removed",
        at: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();

    state.deleted.memberships += 1;
    if (plan.orphansPandal) state.orphanedPandals.push(pandalRef.id);
    if (Date.now() - startedAt > PHASE_BUDGET_MS) return false;
  }
  // A full page means there may be more; the next call re-queries and the
  // already-removed ones are skipped by `planMembershipRemoval`.
  return members.size < PAGE_SIZE;
}

/**
 * Phase 3/4 — a user document tree, one subcollection per pass.
 *
 * `listCollections()` is the cursor and it is self-healing: a subcollection
 * emptied by a previous invocation simply is not in the next listing, so resume
 * needs no bookkeeping. `recursiveDelete` is monotonic — what it removed before
 * being cut off stays removed — which makes a timeout an ordinary retry that
 * converges rather than a corrupted half-state.
 */
async function runTreePhase(
  db: Firestore,
  path: string,
  startedAt: number,
  state: RunState,
): Promise<boolean> {
  const userRef = db.doc(path);
  const collections: CollectionReference[] = await userRef.listCollections();
  for (const collection of collections) {
    await db.recursiveDelete(collection, makeBulkWriter(db, state));
    state.deleted.userCollections += 1;
    if (Date.now() - startedAt > PHASE_BUDGET_MS) return false;
  }
  // The document itself only once every subcollection under it is gone.
  await userRef.delete();
  return true;
}

/**
 * Account deletion (SPENDLY-7 / AUTH-06).
 *
 * Google Play requires an in-app deletion path. Deleting an account here means
 * a `users/{uid}` tree of ~45 subcollections, the `_duress` decoy tree beside
 * it, every shared document the person created, and their membership of every
 * Pandal — none of which a client can do, because `firestore.rules` rightly
 * refuses most of it.
 *
 * One phase per invocation; the caller loops until `done`. See
 * `shared/utils/deleteAccountRemote.ts` for why the order is what it is.
 *
 * Deployed as CJS. firebase-admin@14 pulls jwks-rsa which `require()`s jose;
 * the bundle script pins a CJS jose so this module can load on Netlify.
 */
export async function handler(event: NetlifyEvent): Promise<NetlifyResult> {
  const startedAt = Date.now();

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const token = header(event, "authorization").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "Sign in first." });

  try {
    initAdmin();
  } catch (error) {
    return json(500, { error: (error as Error).message });
  }

  let uid: string;
  let authTimeSec: number | undefined;
  try {
    const decoded = await getAuth().verifyIdToken(token);
    uid = decoded.uid;
    authTimeSec = typeof decoded.auth_time === "number" ? decoded.auth_time : undefined;
  } catch {
    return json(401, { error: "Sign in first." });
  }

  // The verified token is the entire authorization model here: the Admin SDK
  // bypasses firestore.rules, and uids are visible to co-participants through
  // `splits.participantIds` and Pandal member lists. Taking a uid from the body
  // would let any signed-in account delete any other.
  if (isDuressUid(uid)) {
    return json(400, { error: "Not available in this mode." });
  }

  // Re-auth, enforced. `lib/reauthenticate.ts` is the prompt; this is the gate.
  // `auth_time` is stamped by Firebase when a credential is presented and is
  // not client-controllable, so a tampered build cannot skip it.
  if (!isReauthFresh(authTimeSec, Date.now())) {
    return json(401, { error: "Confirm it is you first.", code: "reauth-required" });
  }

  let body: unknown;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }
  const parsed = parseDeleteRequest(body);
  if (!parsed.ok) return json(400, { error: parsed.error });

  const db = getFirestore();
  const state: RunState = {
    deleted: { ...EMPTY_DELETE_COUNTS },
    orphanedPandals: [],
    skippedSharedVaults: [],
    failedPaths: [],
  };

  try {
    const phase: DeletePhase = parsed.phase;
    let finished = false;

    switch (phase) {
      case "shared":
        finished = await runSharedPhase(db, uid, startedAt, state);
        break;
      case "ganesh":
        finished = await runGaneshPhase(db, uid, startedAt, state);
        break;
      case "user-tree":
        finished = await runTreePhase(db, `users/${uid}`, startedAt, state);
        break;
      case "duress-tree":
        finished = await runTreePhase(db, `users/${duressUid(uid)}`, startedAt, state);
        break;
      case "auth":
        try {
          await getAuth().deleteUser(uid);
        } catch (error) {
          // A client that lost the response to a successful final call must not
          // be shown an error on its retry.
          const code = (error as { code?: string }).code;
          if (code !== "auth/user-not-found") throw error;
        }
        finished = true;
        break;
      case "complete":
        finished = true;
        break;
    }

    const nextPhase = finished ? nextDeletePhase(phase) : phase;
    return json(200, {
      done: nextPhase === "complete",
      phase: nextPhase,
      // A phase that ran out of clock resumes from its own re-run; only the
      // tree phases carry a meaningful cursor, and listCollections rebuilds it.
      cursor: null,
      deleted: state.deleted,
      orphanedPandals: state.orphanedPandals,
      skippedSharedVaults: state.skippedSharedVaults,
      failedPaths: state.failedPaths,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    return json(500, { error: (error as Error).message });
  }
}
