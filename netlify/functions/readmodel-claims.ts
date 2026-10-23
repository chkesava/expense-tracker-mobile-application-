import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

import { bearerToken, claimsWithReadModelRole } from "../../shared/utils/readModelIdentity";
import { isDuressUid } from "../../shared/utils/duress";

/**
 * SPENDLY-505 — gives the signed-in caller the `role: "authenticated"` custom
 * claim Supabase third-party auth needs to map their Firebase ID token to the
 * `authenticated` role on the read model (ADR §7, option 1).
 *
 * - The uid comes only from the verified token (revocation checked), never
 *   from the request body.
 * - Idempotent: a caller who already has the claim gets `changed: false` and
 *   no write. Existing custom claims are kept.
 * - The claim grants nothing by itself. What a token can read is decided by
 *   the RLS policies, which only ever match the token's own uid.
 *
 * The client refreshes its ID token after `changed: true`; the claim appears
 * in tokens minted from then on.
 */

export type NetlifyEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
};

export type NetlifyResult = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

export type ClaimsPorts = {
  /** Resolves the verified uid; rejects a bad, expired or revoked token. */
  verifyIdToken(token: string): Promise<{ uid: string }>;
  getCustomClaims(uid: string): Promise<Record<string, unknown> | undefined>;
  setCustomClaims(uid: string, claims: Record<string, unknown>): Promise<void>;
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

export async function handleReadModelClaims(event: NetlifyEvent, ports: ClaimsPorts): Promise<NetlifyResult> {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });

  const token = bearerToken(header(event, "authorization"));
  if (!token) return json(401, { error: "Sign in first." });

  let uid: string;
  try {
    ({ uid } = await ports.verifyIdToken(token));
  } catch {
    return json(401, { error: "Your session has expired. Sign in again." });
  }
  // Firebase never issues a duress uid; refuse one rather than trust it.
  if (!uid || isDuressUid(uid)) return json(403, { error: "Not allowed." });

  const next = claimsWithReadModelRole(await ports.getCustomClaims(uid));
  if (!next) return json(200, { changed: false });
  await ports.setCustomClaims(uid, next);
  return json(200, { changed: true });
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
    return await handleReadModelClaims(event, {
      verifyIdToken: (token) => auth.verifyIdToken(token, true),
      getCustomClaims: async (uid) => (await auth.getUser(uid)).customClaims,
      setCustomClaims: (uid, claims) => auth.setCustomUserClaims(uid, claims),
    });
  } catch (error) {
    console.error("readmodel-claims failed", error instanceof Error ? error.message : error);
    return json(500, { error: "Could not prepare your account. Try again later." });
  }
};
