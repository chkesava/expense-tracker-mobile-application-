import { timingSafeEqual } from "node:crypto";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import {
  EPF_CONTRIBUTION_EVENTS_COLLECTION,
  EPF_CONTRIBUTIONS_COLLECTION,
  EPF_ESTABLISHMENTS_COLLECTION,
  type EpfContribution,
  type EpfEstablishment,
} from "../../shared/features/epf/types";
import { contributionDocId } from "../../shared/features/epf/utils/contributions";
import {
  applyAutoCredit,
  buildContributionEvent,
  contributionsToAutoCredit,
} from "../../shared/features/epf/utils/lifecycle";
import { planScheduledContributions } from "../../shared/features/epf/utils/schedule";

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
  "Access-Control-Allow-Headers": "Content-Type, x-epf-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Establishments per invocation. Keeps a run well inside the function timeout. */
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

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

/** Constant-time compare, so a wrong secret cannot be discovered by timing. */
function secretMatches(provided: string, expected: string): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** `users/{uid}/epfEstablishments/{id}` -> `uid`. */
function uidFromEstablishmentPath(path: string): string | null {
  const segments = path.split("/");
  return segments[0] === "users" && segments[1] ? segments[1] : null;
}

/** YYYY-MM in UTC. Month boundaries are explicit, never locale-dependent. */
function currentMonthUtc(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** YYYY-MM-DD in UTC, for comparing against a credit window. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Monthly EPF contribution generator (KAN-67).
 *
 * Triggered by `.github/workflows/epf-cron.yml` rather than a Netlify schedule:
 * this site is deployed with `netlify deploy --functions` from outside the repo,
 * so `netlify.toml` is never read and Netlify's own bundler — which is what
 * detects an in-code `schedule()` — is bypassed. GitHub Actions provides the
 * clock; Netlify still does the work.
 *
 * Processes one bounded page per call and returns a cursor, so a large user base
 * can never exhaust the function timeout. The caller loops until `nextCursor` is
 * null.
 *
 * Deployed as CJS. firebase-admin@14 pulls jwks-rsa which `require()`s jose;
 * the bundle script pins a CJS jose so this module can load on Netlify.
 */
export async function handler(event: NetlifyEvent): Promise<NetlifyResult> {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  // Checked before anything touches Firestore.
  if (!secretMatches(header(event, "x-epf-cron-secret"), process.env.EPF_CRON_SECRET ?? "")) {
    return json(401, { error: "Unauthorized" });
  }

  try {
    initAdmin();
  } catch (error) {
    return json(500, { error: (error as Error).message });
  }

  let cursor: string | undefined;
  let limit = DEFAULT_PAGE_SIZE;
  try {
    const body = JSON.parse(event.body || "{}") as { cursor?: string; limit?: number };
    cursor = typeof body.cursor === "string" && body.cursor ? body.cursor : undefined;
    if (typeof body.limit === "number" && Number.isFinite(body.limit)) {
      limit = Math.min(Math.max(Math.trunc(body.limit), 1), MAX_PAGE_SIZE);
    }
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const db = getFirestore();
  const throughMonth = currentMonthUtc();
  const todayKey = todayUtc();

  try {
    // Only users with a live employment — not the whole user base.
    let query = db
      .collectionGroup(EPF_ESTABLISHMENTS_COLLECTION)
      .where("employmentStatus", "==", "current")
      .orderBy("__name__")
      .limit(limit);
    if (cursor) query = query.startAfter(cursor);

    const page = await query.get();

    let processed = 0;
    let written = 0;
    let credited = 0;
    let lastPath: string | null = null;

    for (const docSnap of page.docs) {
      lastPath = docSnap.ref.path;
      processed += 1;

      const data = docSnap.data() as Omit<EpfEstablishment, "id">;
      if (data.archived === true) continue;

      const uid = uidFromEstablishmentPath(docSnap.ref.path);
      if (!uid) continue;

      const establishment: EpfEstablishment = { id: docSnap.id, ...data };

      // The job-change rule needs every live employment, not just this one.
      const siblingsSnap = await db
        .collection(`users/${uid}/${EPF_ESTABLISHMENTS_COLLECTION}`)
        .get();
      const allEstablishments: EpfEstablishment[] = siblingsSnap.docs.map((sibling) => ({
        id: sibling.id,
        ...(sibling.data() as Omit<EpfEstablishment, "id">),
      }));

      const existingSnap = await db
        .collection(`users/${uid}/${EPF_CONTRIBUTIONS_COLLECTION}`)
        .where("establishmentId", "==", docSnap.id)
        .get();
      const existing: EpfContribution[] = existingSnap.docs.map((row) => ({
        id: row.id,
        ...(row.data() as Omit<EpfContribution, "id">),
      }));

      // KAN-68: age any month whose expected credit window has passed. Same
      // pure selector the client catch-up uses, so the two cannot disagree.
      const due = contributionsToAutoCredit(existing, todayKey);
      if (due.length > 0) {
        const creditBatch = db.batch();
        for (const row of due) {
          const next = applyAutoCredit(row);
          creditBatch.set(
            db.doc(
              `users/${uid}/${EPF_CONTRIBUTIONS_COLLECTION}/${contributionDocId(
                establishment.id,
                row.month
              )}`
            ),
            { status: next.status, statusUpdatedAt: new Date(), updatedAt: new Date() },
            { merge: true }
          );
          creditBatch.create(
            db.collection(`users/${uid}/${EPF_CONTRIBUTION_EVENTS_COLLECTION}`).doc(),
            {
              ...buildContributionEvent(row, row.status, next.status, {
                actor: "system",
                amount: row.epfCredit,
              }),
              at: new Date(),
            }
          );
        }
        try {
          await creditBatch.commit();
          credited += due.length;
        } catch {
          // Another writer got there first. Next run reconciles.
        }
      }

      const planned = planScheduledContributions({
        establishment,
        allEstablishments,
        existing,
        throughMonth,
      });
      if (planned.length === 0) continue;

      const batch = db.batch();
      for (const row of planned) {
        const ref = db.doc(
          `users/${uid}/${EPF_CONTRIBUTIONS_COLLECTION}/${contributionDocId(
            establishment.id,
            row.month
          )}`
        );
        const { persisted, ...payload } = row;
        // `create` rather than `set`: if the row appeared since the read — a
        // concurrent client catch-up, say — this throws instead of clobbering
        // whatever the user has there.
        batch.create(ref, {
          ...payload,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      try {
        await batch.commit();
        written += planned.length;
      } catch {
        // A collision means someone else already wrote the month. Skip this
        // establishment and let the next run reconcile rather than failing the
        // whole page.
        continue;
      }
    }

    const nextCursor = page.size === limit ? lastPath : null;
    return json(200, { processed, written, credited, throughMonth, nextCursor });
  } catch (error) {
    return json(500, { error: (error as Error).message });
  }
}
