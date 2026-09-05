// Must run before anything that imports a shared module: the shared code uses
// the `@/` specifier, which TypeScript resolves at compile time only.
import "module-alias/register";

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentCreated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";

import {
  LEDGER_SUBCOLLECTIONS,
  rebuildFestivalSummary,
  seedFestivalSummary,
} from "./summary";

initializeApp();
const db = getFirestore();

const LEDGER = new Set<string>(LEDGER_SUBCOLLECTIONS);
const REGION = "asia-south1";

/**
 * Trusted maintenance of the derived festival summary (GS-004).
 *
 * The client can no longer write the twenty-two derived summary fields — the
 * rules deny them — so this trigger is the only writer. It fires on any ledger
 * document change and rebuilds the summary from the ledger, which makes the
 * summary a function of the ledger by construction rather than by the client's
 * good behaviour.
 *
 * The wildcard has to be a single `{subcol}` segment because Firestore triggers
 * take one path; non-ledger subcollections are filtered out below rather than
 * registered as six separate functions, which would each pay a cold start.
 */
export const ganeshLedgerSummary = onDocumentWritten(
  {
    document: "pandals/{pandalId}/festivals/{festivalId}/{subcol}/{docId}",
    region: REGION,
    retry: false,
  },
  async (event) => {
    const { pandalId, festivalId, subcol } = event.params;
    if (!LEDGER.has(subcol)) return;

    const eventTimeMs = Date.parse(event.time);
    try {
      const result = await rebuildFestivalSummary(
        db,
        pandalId,
        festivalId,
        Number.isFinite(eventTimeMs) ? eventTimeMs : Date.now()
      );
      logger.info("ganesh.summary.rebuilt", {
        pandalId,
        festivalId,
        subcol,
        skipped: result.skipped,
        membersWritten: result.membersWritten,
      });
    } catch (error) {
      // Logged rather than rethrown: `retry: false` means a throw is simply
      // lost, and the next ledger write rebuilds from scratch anyway. A
      // permanently failing rebuild must be visible in the logs, not silent.
      logger.error("ganesh.summary.rebuildFailed", { pandalId, festivalId, subcol, error });
      throw error;
    }
  }
);

/** A new festival needs its summary document before anything reads it. */
export const ganeshFestivalSummarySeed = onDocumentCreated(
  { document: "pandals/{pandalId}/festivals/{festivalId}", region: REGION, retry: false },
  async (event) => {
    const { pandalId, festivalId } = event.params;
    await seedFestivalSummary(db, pandalId, festivalId);
    logger.info("ganesh.summary.seeded", { pandalId, festivalId });
  }
);

/**
 * "Recalculate from ledger", which used to run in the client.
 *
 * Authorization is re-checked here against the member document rather than
 * trusted from the caller: this runs with admin credentials, so the rules are
 * not in the path. It mirrors the rules' `canCloseOrUpdateFestival` — the
 * `festival.update` permission, with the legacy role fallback for member
 * documents written before the denormalized `permissions` array existed.
 */
export const recomputeGaneshSummary = onCall(
  { region: REGION },
  async (request): Promise<{ membersWritten: number }> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");

    const pandalId = String(request.data?.pandalId ?? "");
    const festivalId = String(request.data?.festivalId ?? "");
    if (!pandalId || !festivalId) {
      throw new HttpsError("invalid-argument", "pandalId and festivalId are required.");
    }

    const memberSnap = await db.doc(`pandals/${pandalId}/members/${uid}`).get();
    const member = memberSnap.data();
    if (!memberSnap.exists || member?.status !== "active") {
      throw new HttpsError("permission-denied", "You are not an active member of this pandal.");
    }
    const permissions: unknown = member?.permissions;
    const allowed =
      member?.role === "admin" ||
      (Array.isArray(permissions)
        ? permissions.includes("festival.update")
        : member?.role === "treasurer");
    if (!allowed) {
      throw new HttpsError("permission-denied", "You cannot recalculate this festival.");
    }

    const result = await rebuildFestivalSummary(db, pandalId, festivalId, Date.now(), uid);
    logger.info("ganesh.summary.recomputed", { pandalId, festivalId, uid, ...result });
    return { membersWritten: result.membersWritten };
  }
);
