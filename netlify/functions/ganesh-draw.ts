import { randomInt } from "node:crypto";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";

import {
  canRunTokenDraw,
  resolveDrawOutcome,
  type DrawResponse,
} from "../../shared/utils/ganeshDrawRemote";

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

function json(statusCode: number, payload: Record<string, unknown>): NetlifyResult {
  return {
    statusCode,
    headers: { ...CORS, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}

function header(event: NetlifyEvent, name: string): string {
  const headers = event.headers ?? {};
  const match = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());
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

/**
 * Commits one draw.
 *
 * Everything that decides the winner happens inside one Admin SDK transaction:
 * read the session, read the eligible pot, choose, write. A concurrent request
 * for the same sequence loses — the result document id encodes the sequence, so
 * the second write is a create against a document that now exists and the
 * transaction retries, re-reads a higher `completedDraws`, and either takes the
 * next sequence or refuses.
 *
 * Selection is `crypto.randomInt`, not `Math.random`. This picks a winner in
 * front of a crowd; a predictable PRNG is the wrong tool even when nobody is
 * actually trying to game it.
 */
async function runDraw(
  db: Firestore,
  input: { pandalId: string; festivalId: string; sessionId: string; uid: string; actorName: string }
): Promise<DrawResponse> {
  const festivalPath = `pandals/${input.pandalId}/festivals/${input.festivalId}`;
  const sessionRef = db.doc(`${festivalPath}/tokenDrawSessions/${input.sessionId}`);
  const tokensCol = db.collection(`${festivalPath}/tokenLadduTokens`);

  return db.runTransaction(async (txn) => {
    const sessionSnap = await txn.get(sessionRef);
    if (!sessionSnap.exists) throw new Error("That draw session no longer exists.");
    const session = sessionSnap.data() ?? {};

    // Read the whole eligible pot rather than sampling it. At pandal scale
    // (hundreds, occasionally a couple of thousand) one projected read is
    // cheap, and picking uniformly from a known set is trivially reviewable —
    // which matters more here than shaving a read off a once-a-year operation.
    const eligibleSnap = await txn.get(
      tokensCol.where("status", "==", "eligible").select("tokenNumber")
    );
    const eligibleCount = eligibleSnap.size;

    const plannedDraws = Number(session.plannedDraws ?? 0);
    const completedDraws = Number(session.completedDraws ?? 0);
    const outcome = resolveDrawOutcome({
      sessionStatus: String(session.status ?? ""),
      plannedDraws,
      completedDraws,
      eligibleCount,
    });

    if (!outcome.canDraw) {
      // A shortfall closes the session and records where it stopped, so the
      // history says why there are fewer winners than draws.
      if (outcome.refusal === "exhausted" || outcome.refusal === "complete") {
        txn.update(sessionRef, {
          status: "completed",
          completedAt: FieldValue.serverTimestamp(),
          completedBy: input.uid,
          updatedBy: input.uid,
          updatedAt: FieldValue.serverTimestamp(),
          ...(outcome.refusal === "exhausted" ? { shortfallAt: completedDraws } : {}),
        });
      }
      return { refusal: outcome.refusal, completedDraws, plannedDraws, eligibleCount };
    }

    const picked = eligibleSnap.docs[randomInt(eligibleSnap.size)];
    const tokenRef = tokensCol.doc(picked.id);
    // Re-read the chosen token in full: the projection carried only the number,
    // and the winner's details are announced out loud.
    const tokenSnap = await txn.get(tokenRef);
    const token = tokenSnap.data() ?? {};
    if (token.status !== "eligible") {
      // Lost a race with a cancellation. Retry rather than crown a cancelled
      // token; the transaction's own retry will re-read the pot.
      throw new Error("That Token Laddu changed while drawing. Try again.");
    }

    const sequence = outcome.sequence;
    const resultRef = db.doc(
      `${festivalPath}/tokenDrawResults/${input.sessionId}__${sequence}`
    );

    const winner = {
      tokenId: tokenSnap.id,
      tokenNumber: Number(token.tokenNumber ?? 0),
      participantName: String(token.participantName ?? ""),
      mobile: token.mobile ? String(token.mobile) : undefined,
      receiptNumberPhysical: String(token.receiptNumberPhysical ?? ""),
      sequence,
      registrationId: String(token.registrationId ?? ""),
    };

    // `create` rather than `set`: if this sequence already has a result, the
    // transaction fails instead of overwriting an announced winner.
    txn.create(resultRef, {
      drawSessionId: input.sessionId,
      sequence,
      tokenId: winner.tokenId,
      tokenNumber: winner.tokenNumber,
      registrationId: winner.registrationId,
      participantName: winner.participantName,
      ...(winner.mobile ? { mobile: winner.mobile } : {}),
      receiptNumberPhysical: winner.receiptNumberPhysical,
      drawnAt: FieldValue.serverTimestamp(),
      drawnBy: input.uid,
      drawnByName: input.actorName,
      eligibleCount,
    });

    txn.update(tokenRef, {
      status: "winner",
      wonAt: FieldValue.serverTimestamp(),
      wonDrawSessionId: input.sessionId,
      wonDrawSequence: sequence,
      updatedBy: input.uid,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const nextCompleted = sequence;
    txn.update(sessionRef, {
      completedDraws: nextCompleted,
      updatedBy: input.uid,
      updatedAt: FieldValue.serverTimestamp(),
      ...(nextCompleted >= plannedDraws
        ? {
            status: "completed",
            completedAt: FieldValue.serverTimestamp(),
            completedBy: input.uid,
          }
        : {}),
    });

    // The trail every other Ganesh write keeps. Same shape as `audit()`.
    txn.create(db.collection(`${festivalPath}/auditLogs`).doc(), {
      actorId: input.uid,
      action: "created",
      entityType: "tokenDrawResult",
      entityId: `${input.sessionId}__${sequence}`,
      oldValue: null,
      newValue: { tokenId: winner.tokenId, sequence, eligibleCount },
      at: FieldValue.serverTimestamp(),
    });

    return {
      winner,
      completedDraws: nextCompleted,
      plannedDraws,
      eligibleCount: eligibleCount - 1,
    };
  });
}

/**
 * Trusted Token Laddu draw (KAN-125).
 *
 * Deployed as CJS alongside `ganesh-summary`; see `scripts/bundle-netlify-fns.js`
 * for why the bundle pins a CJS jose.
 */
export async function handler(event: NetlifyEvent): Promise<NetlifyResult> {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Use POST." });
  }

  try {
    initAdmin();
  } catch (error) {
    return json(500, {
      error: error instanceof Error ? error.message : "Admin SDK failed to start.",
    });
  }

  const authHeader = header(event, "authorization");
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!token) return json(401, { error: "Sign in first." });

  let uid: string;
  let actorName: string;
  try {
    const decoded = await getAuth().verifyIdToken(token);
    uid = decoded.uid;
    actorName = typeof decoded.name === "string" ? decoded.name : "";
  } catch {
    return json(401, { error: "Sign in first." });
  }

  let body: { pandalId?: unknown; festivalId?: unknown; sessionId?: unknown } = {};
  try {
    body = event.body ? (JSON.parse(event.body) as typeof body) : {};
  } catch {
    return json(400, { error: "pandalId, festivalId and sessionId are required." });
  }

  const pandalId = String(body.pandalId ?? "");
  const festivalId = String(body.festivalId ?? "");
  const sessionId = String(body.sessionId ?? "");
  if (!pandalId || !festivalId || !sessionId) {
    return json(400, { error: "pandalId, festivalId and sessionId are required." });
  }

  const db = getFirestore();

  // Authorization is decided here, from the member document, because the Admin
  // SDK bypasses Firestore rules entirely — there is no second gate behind this
  // one.
  const memberSnap = await db.doc(`pandals/${pandalId}/members/${uid}`).get();
  if (!canRunTokenDraw(memberSnap.data() ?? null)) {
    return json(403, { error: "You cannot run the Token Laddu draw." });
  }

  const festivalSnap = await db.doc(`pandals/${pandalId}/festivals/${festivalId}`).get();
  if (!festivalSnap.exists || festivalSnap.data()?.status !== "open") {
    return json(409, { error: "This festival is closed." });
  }

  try {
    const result = await runDraw(db, {
      pandalId,
      festivalId,
      sessionId,
      uid,
      actorName: actorName || "A committee member",
    });
    return json(200, result as unknown as Record<string, unknown>);
  } catch (error) {
    return json(409, {
      error: error instanceof Error ? error.message : "Could not run the draw.",
    });
  }
}
