import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import type { Investment } from "../../shared/types/investment";
import { authErrorCode, bearerToken } from "../../shared/utils/readModelIdentity";
import { isDuressUid } from "../../shared/utils/duress";
import { applyJobWrites, type JobDb, type JobPush } from "../../scripts/lib/dailyJobCore";
import { planFdInterestWrites, todayIst } from "../../scripts/lib/fdInterestDailyCore";
import { createServerPush } from "./_readmodelServerPush";
import { serverPushPorts } from "./readmodel-push";

/**
 * SPENDLY — instant recompute right after an FD interest-rate edit, instead
 * of waiting for the next fd-interest-daily run (up to ~24h). Calls the
 * SAME pure `planFdInterestWrites` the daily job uses, for the one caller's
 * one investment, and applies it through the SAME `applyJobWrites` the job
 * uses -- no second implementation of the interest math. The daily job
 * remains the fallback: a rate edit still clears `lastInterestCreditedDate`,
 * so if this call fails, the next scheduled run quietly finishes it.
 *
 * `interestCredits/{date}` stays server-only in firestore.rules; this
 * function is the Admin SDK, which bypasses rules entirely, same as the job.
 */

export type NetlifyEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  body?: string | null;
};

export type NetlifyResult = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

export type FdInterestRecomputePorts = {
  /** Resolves the verified uid; rejects a bad, expired or revoked token. */
  verifyIdToken(token: string): Promise<{ uid: string }>;
  /** `null` if the investment doesn't exist under this uid. */
  loadInvestment(uid: string, investmentId: string): Promise<Investment | null>;
  db: JobDb;
  stamp: () => unknown;
  push: JobPush | null;
  /** IST date key, computed once per request. */
  today: string;
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

export async function handleFdInterestRecompute(
  event: NetlifyEvent,
  ports: FdInterestRecomputePorts
): Promise<NetlifyResult> {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });

  const token = bearerToken(header(event, "authorization"));
  if (!token) return json(401, { error: "Sign in first." });

  let uid: string;
  try {
    ({ uid } = await ports.verifyIdToken(token));
  } catch (error) {
    console.warn(`[FD-INTEREST-RECOMPUTE] rejected: token ${authErrorCode(error)}`);
    return json(401, { error: "Your session has expired. Sign in again." });
  }
  // Firebase never issues a duress uid; refuse one rather than trust it.
  if (!uid || isDuressUid(uid)) return json(403, { error: "Not allowed." });

  let body: { investmentId?: unknown } = {};
  try {
    body = event.body ? (JSON.parse(event.body) as typeof body) : {};
  } catch {
    return json(400, { error: "investmentId is required." });
  }
  const investmentId = typeof body.investmentId === "string" ? body.investmentId.trim() : "";
  if (!investmentId) return json(400, { error: "investmentId is required." });

  const investment = await ports.loadInvestment(uid, investmentId);
  if (!investment) return json(404, { error: "Investment not found." });

  const { writes } = planFdInterestWrites(uid, [{ id: investmentId, data: investment }], ports.today);
  if (!writes.length) return json(200, { ok: true, creditedDays: 0 });

  const result = await applyJobWrites({
    db: ports.db,
    uid,
    writes,
    dryRun: false,
    stamp: ports.stamp,
    push: ports.push,
    log: () => {},
  });

  if (result.status === "written") {
    const creditedDays = writes.filter((w) => w.kind === "set").length;
    return json(200, { ok: true, creditedDays });
  }
  if (result.status === "conflict") {
    return json(409, { error: "This investment changed elsewhere. Try again." });
  }
  return json(500, { error: "Could not recalculate right now. It will catch up within a day." });
}

function initAdmin() {
  if (getApps().length > 0) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT ?? "";
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT is not set on this Netlify site.");
  const creds = JSON.parse(raw) as { project_id?: string; projectId?: string };
  initializeApp({
    credential: cert(creds as Parameters<typeof cert>[0]),
    projectId: creds.project_id ?? creds.projectId,
  });
}

export const handler = async (event: NetlifyEvent): Promise<NetlifyResult> => {
  try {
    initAdmin();
    const auth = getAuth();
    const db = getFirestore();
    const log = (line: string) => console.log(line);
    return await handleFdInterestRecompute(event, {
      verifyIdToken: (token) => auth.verifyIdToken(token, true),
      loadInvestment: async (uid, investmentId) => {
        const snap = await db.doc(`users/${uid}/investments/${investmentId}`).get();
        return snap.exists ? (snap.data() as Investment) : null;
      },
      db: db as unknown as JobDb,
      stamp: () => FieldValue.serverTimestamp(),
      push: createServerPush(serverPushPorts(db, log)),
      today: todayIst(),
    });
  } catch (error) {
    console.error("fd-interest-recompute failed", error instanceof Error ? error.message : error);
    return json(500, { error: "Could not recalculate right now. It will catch up within a day." });
  }
};
