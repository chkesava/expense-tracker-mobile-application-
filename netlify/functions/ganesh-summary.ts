import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

import { rebuildFestivalSummary, seedFestivalSummary } from "../../functions/src/summary";
import {
  canRequestFestivalSummary,
  parseSummaryRemoteMode,
} from "../../shared/utils/ganeshSummaryRemote";

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
 * Trusted festival-summary writer (KAN-36). Replaces Firebase Cloud Functions
 * so Spark-plan projects do not need `cloudfunctions.googleapis.com`.
 *
 * Deployed as CJS. firebase-admin@14 pulls jwks-rsa which `require()`s jose;
 * the bundle script pins a CJS jose so this module can load on Netlify.
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
    return json(500, { error: error instanceof Error ? error.message : "Admin SDK failed to start." });
  }

  const authHeader = header(event, "authorization");
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!token) return json(401, { error: "Sign in first." });

  let uid: string;
  try {
    const decoded = await getAuth().verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return json(401, { error: "Sign in first." });
  }

  let body: { pandalId?: unknown; festivalId?: unknown; mode?: unknown } = {};
  try {
    body = event.body ? (JSON.parse(event.body) as typeof body) : {};
  } catch {
    return json(400, { error: "pandalId and festivalId are required." });
  }

  const pandalId = String(body.pandalId ?? "");
  const festivalId = String(body.festivalId ?? "");
  const mode = parseSummaryRemoteMode(body.mode) ?? "rebuild";
  if (!pandalId || !festivalId) {
    return json(400, { error: "pandalId and festivalId are required." });
  }

  const db = getFirestore();
  const memberSnap = await db.doc(`pandals/${pandalId}/members/${uid}`).get();
  if (!canRequestFestivalSummary(mode, memberSnap.data() ?? null)) {
    return json(403, { error: "You cannot update this festival's totals." });
  }

  if (mode === "seed") {
    await seedFestivalSummary(db, pandalId, festivalId);
    return json(200, { seeded: true });
  }

  const result = await rebuildFestivalSummary(
    db,
    pandalId,
    festivalId,
    Date.now(),
    mode === "recompute" ? uid : undefined
  );
  return json(200, {
    skipped: result.skipped,
    membersWritten: result.membersWritten,
  });
}
