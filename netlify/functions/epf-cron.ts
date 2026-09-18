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
import {
  contributionDocId,
  normalizeEpfContribution,
} from "../../shared/features/epf/utils/contributions";
import { normalizeEstablishment } from "../../shared/features/epf/utils";
import {
  EPF_CRON_MONTHS_PER_BATCH,
  EPF_CRON_RELEASE_CHUNK_SIZE,
  EPF_CRON_REPAIR_CHUNK_SIZE,
} from "../../shared/features/epf/data/epfBatchLimits";
import {
  classifyFirestoreError,
  cronFailureLog,
  type CronStage,
} from "../../shared/features/epf/utils/cronOutcome";
import { chunk } from "../../shared/utils/chunk";
import { isDuressUid } from "../../shared/utils/duress";
import { buildContributionEvent } from "../../shared/features/epf/utils/lifecycle";
import { epfCurrentMonth } from "../../shared/features/epf/utils/epfClock";
import { planScheduledContributions } from "../../shared/features/epf/utils/schedule";
import {
  contributionsMissingCreditWindow,
  contributionsNeedingLifecycleRepair,
  contributionsWithFabricatedCredit,
  creditWindowRepairFor,
} from "../../shared/features/epf/utils/creditWindowRepair";

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

function json(
  statusCode: number,
  payload: Record<string, unknown>,
): NetlifyResult {
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
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT is not set on this Netlify site.",
    );
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
  if (
    !secretMatches(
      header(event, "x-epf-cron-secret"),
      process.env.EPF_CRON_SECRET ?? "",
    )
  ) {
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
    const body = JSON.parse(event.body || "{}") as {
      cursor?: string;
      limit?: number;
    };
    cursor =
      typeof body.cursor === "string" && body.cursor ? body.cursor : undefined;
    if (typeof body.limit === "number" && Number.isFinite(body.limit)) {
      limit = Math.min(Math.max(Math.trunc(body.limit), 1), MAX_PAGE_SIZE);
    }
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const pageStartedAt = Date.now();
  const db = getFirestore();
  // IST, not UTC: EPF months are defined in India, and the client uses the same
  // helper so the two cannot disagree about which month it is (KAN-72).
  const throughMonth = epfCurrentMonth();

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
    let repaired = 0;
    let released = 0;
    let skipped = 0;
    let failed = 0;
    let duressSkipped = 0;
    let maxEstablishmentMs = 0;
    let lastPath: string | null = null;

    /**
     * SPENDLY-20: every swallowed commit error is now counted and logged.
     * Benign means another writer got there first — the idempotency design, or
     * a precondition that correctly refused to overwrite a user edit. Fatal is
     * the job being broken, and the workflow fails the run on it.
     */
    const recordFailure = (
      stage: CronStage,
      args: {
        uid: string;
        establishmentId: string;
        month: string | null;
        rows: number;
        error: unknown;
      },
    ) => {
      const classified = classifyFirestoreError(args.error);
      const line = JSON.stringify(cronFailureLog({ stage, ...args }));
      if (classified.kind === "benign") {
        skipped += args.rows;
        console.warn(line);
      } else {
        failed += args.rows;
        console.error(line);
      }
    };

    for (const docSnap of page.docs) {
      lastPath = docSnap.ref.path;
      processed += 1;
      const establishmentStartedAt = Date.now();

      // Normalized rather than cast: a document written by an earlier build
      // may not carry every field, and the cast asserted otherwise (KAN-73).
      const establishment = normalizeEstablishment(
        docSnap.id,
        docSnap.data() as Record<string, unknown>,
      );
      if (establishment.archived === true) continue;

      const uid = uidFromEstablishmentPath(docSnap.ref.path);
      if (!uid) continue;

      // SPENDLY-20: the collection group sweeps `users/{uid}_duress/...` decoy
      // trees too. Skip before the two unbounded reads below, not after — the
      // wasted work is the point. A uid predicate is not expressible in the
      // query, so the slot is still consumed; `duressSkipped` makes that visible.
      if (isDuressUid(uid)) {
        duressSkipped += 1;
        continue;
      }

      // The job-change rule needs every live employment, not just this one.
      const siblingsSnap = await db
        .collection(`users/${uid}/${EPF_ESTABLISHMENTS_COLLECTION}`)
        .get();
      const allEstablishments: EpfEstablishment[] = siblingsSnap.docs.map((sibling) =>
        normalizeEstablishment(sibling.id, sibling.data() as Record<string, unknown>),
      );

      const existingSnap = await db
        .collection(`users/${uid}/${EPF_CONTRIBUTIONS_COLLECTION}`)
        .where("establishmentId", "==", docSnap.id)
        .get();
      const existing: EpfContribution[] = existingSnap.docs.map((row) =>
        normalizeEpfContribution(row.id, row.data() as Record<string, unknown>),
      );
      // SPENDLY-20: the precondition for the release pass below. "Nothing has
      // touched this document since I read it" is strictly stronger than
      // re-checking the selector, which would miss an edit to a field the
      // selector ignores.
      const updateTimes = new Map(
        existingSnap.docs.map((row) => [row.id, row.updateTime] as const),
      );

      // SPENDLY-1: heal rows the client catch-up wrote before the credit
      // window was persisted. Those months can never read as overdue on their
      // own — `monthsToGenerate` skips anything already present, so the planner
      // never revisits them. Doing it here as well as in the app covers users
      // who never open it. Must run *before* the pass below, which stamps the
      // same field onto rows it releases.
      const stale = contributionsMissingCreditWindow(existing);
      // SPENDLY-20: chunked. `stale` is drawn from every contribution row the
      // establishment has, so a long history sent one batch past Firestore's
      // 500-write cap and the old bare catch dropped the INVALID_ARGUMENT.
      //
      // This pass keeps `set(..., { merge: true })` deliberately, with no
      // precondition: it writes `expectedCreditFrom`/`expectedCreditTo`, both a
      // pure function of `row.month` via `creditWindowRepairFor`, and no
      // status. Neither field is user-editable anywhere in the app, so a merge
      // here cannot clobber a user edit the way the release pass could.
      for (const group of chunk(stale, EPF_CRON_REPAIR_CHUNK_SIZE)) {
        const repairBatch = db.batch();
        const repairs = group.map((row) => ({
          row,
          repair: creditWindowRepairFor(row),
        }));
        for (const { row, repair } of repairs) {
          repairBatch.set(
            db.doc(
              `users/${uid}/${EPF_CONTRIBUTIONS_COLLECTION}/${contributionDocId(
                establishment.id,
                row.month,
              )}`,
            ),
            { ...repair, updatedAt: new Date() },
            { merge: true },
          );
        }
        try {
          const results = await repairBatch.commit();
          repaired += group.length;
          // Mirror onto the in-memory copies so this run can act on the fix
          // rather than making it wait for next month — but only now the write
          // has landed. Mirroring before the commit left the rest of the run
          // reasoning about state that was never persisted.
          repairs.forEach(({ row, repair }, index) => {
            row.expectedCreditFrom = repair.expectedCreditFrom;
            row.expectedCreditTo = repair.expectedCreditTo;
            // This write just invalidated the row's precondition for the
            // release pass below. `WriteResult` comes back in the order the
            // writes were added, so carry the new time forward rather than
            // letting the release fail on a precondition we ourselves broke.
            const writeTime = results[index]?.writeTime;
            if (writeTime) {
              updateTimes.set(
                contributionDocId(establishment.id, row.month),
                writeTime,
              );
            }
          });
        } catch (error) {
          // The rows stay stale and the next run retries. No audit event —
          // nothing about the money changed.
          recordFailure("credit-window-repair", {
            uid,
            establishmentId: establishment.id,
            month: group[0]?.month ?? null,
            rows: group.length,
            error,
          });
        }
      }

      // SPENDLY-72: withdraw credits the old auto-advance invented, and
      // release drafts the old Backfill range stranded in the current month.
      // Same pure selectors the client catch-up uses, so the two cannot
      // disagree. Both are status changes, so both write an audit event —
      // a withdrawal lowers a reported balance and must be traceable.
      const fabricated = contributionsWithFabricatedCredit(existing);
      const stranded = contributionsNeedingLifecycleRepair(existing, throughMonth);
      const releases = [
        ...fabricated.map((row) => ({
          row,
          fields: {} as Record<string, unknown>,
          reason: "auto-credit withdrawn (SPENDLY-72)",
        })),
        ...stranded.map((row) => ({
          row,
          fields: creditWindowRepairFor(row) as Record<string, unknown>,
          reason: "current-month draft released to the scheduler (SPENDLY-72)",
        })),
      ];
      // SPENDLY-20: chunked, and written with a `lastUpdateTime` precondition
      // rather than an unconditional merge. This pass demotes a row to
      // `expected`, so an unconditional write based on a read taken earlier in
      // this request could undo a credit the user recorded in between — the
      // clobber the audit found on the old auto-credit path, which SPENDLY-72
      // moved here rather than removed.
      //
      // A precondition, not a transaction: `updateTime` is already in hand from
      // the read above, so this costs no extra reads inside Netlify's
      // synchronous window, and a WriteBatch is atomic — a rejected
      // precondition rejects the misleading audit event along with the row.
      // The trade-off is that one contested row fails its whole chunk; nothing
      // is written, nothing is corrupted, and the next run retries.
      for (const group of chunk(releases, EPF_CRON_RELEASE_CHUNK_SIZE)) {
        const releaseBatch = db.batch();
        const applied: typeof group = [];
        for (const item of group) {
          const contributionId = contributionDocId(
            establishment.id,
            item.row.month,
          );
          const lastUpdateTime = updateTimes.get(contributionId);
          if (!lastUpdateTime) {
            // The row this release targets did not come from the read above, so
            // there is no safe precondition to write under. Leave it.
            skipped += 1;
            continue;
          }
          releaseBatch.update(
            db.doc(
              `users/${uid}/${EPF_CONTRIBUTIONS_COLLECTION}/${contributionId}`,
            ),
            {
              ...item.fields,
              status: "expected",
              statusUpdatedAt: new Date(),
              updatedAt: new Date(),
            },
            // `update`, not `set`: it also fails if the row was deleted, which
            // is correct — there is nothing left to release.
            { lastUpdateTime },
          );
          releaseBatch.create(
            db
              .collection(`users/${uid}/${EPF_CONTRIBUTION_EVENTS_COLLECTION}`)
              .doc(),
            {
              ...buildContributionEvent(item.row, item.row.status, "expected", {
                actor: "system",
                reason: item.reason,
              }),
              at: new Date(),
            },
          );
          applied.push(item);
        }
        if (applied.length === 0) continue;
        try {
          await releaseBatch.commit();
          released += applied.length;
          // Mirror onto the in-memory copies so `planScheduledContributions`
          // below sees the months as present and does not regenerate them —
          // after the commit, and only for what actually landed.
          for (const item of applied) item.row.status = "expected";
        } catch (error) {
          recordFailure("lifecycle-release", {
            uid,
            establishmentId: establishment.id,
            month: applied[0]?.row.month ?? null,
            rows: applied.length,
            error,
          });
        }
      }

      const planned = planScheduledContributions({
        establishment,
        allEstablishments,
        existing,
        throughMonth,
      });
      // SPENDLY-19: the planner calls isEligibleForAutomatedProcessing, so a
      // 2019 dateJoined cannot mint ~80 simulated months for this batch.
      if (planned.length === 0) continue;

      for (const group of chunk(planned, EPF_CRON_MONTHS_PER_BATCH)) {
        const batch = db.batch();
        for (const row of group) {
          const contributionId = contributionDocId(establishment.id, row.month);
          const ref = db.doc(
            `users/${uid}/${EPF_CONTRIBUTIONS_COLLECTION}/${contributionId}`,
          );
          const { persisted, ...payload } = row;

          // KAN-72: generation is a money-moving event, so it is audited like
          // every other one. `from: "none"` — the row did not exist before.
          batch.create(
            db
              .collection(`users/${uid}/${EPF_CONTRIBUTION_EVENTS_COLLECTION}`)
              .doc(),
            {
              ...buildContributionEvent(
                {
                  id: contributionId,
                  establishmentId: establishment.id,
                  month: row.month,
                },
                "none",
                row.status,
                { actor: "system", amount: row.epfCredit },
              ),
              at: new Date(),
            },
          );
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
          written += group.length;
        } catch (error) {
          // SPENDLY-20: a collision means someone else already wrote the month
          // and is counted as skipped; anything else is a real failure and reds
          // the run. Either way keep going — the old `break` abandoned every
          // remaining month for this establishment until the next monthly run.
          recordFailure("generation", {
            uid,
            establishmentId: establishment.id,
            month: group[0]?.month ?? null,
            rows: group.length,
            error,
          });
        }
      }

      maxEstablishmentMs = Math.max(
        maxEstablishmentMs,
        Date.now() - establishmentStartedAt,
      );
    }

    const nextCursor = page.size === limit ? lastPath : null;
    // SPENDLY-20: 200 even when `failed > 0`. A 5xx would make the workflow
    // abandon every remaining page, so one broken establishment would cost
    // every later user their month. The workflow totals `failed` across pages
    // and fails the run at the end instead.
    return json(200, {
      processed,
      written,
      // Always 0 since SPENDLY-72 removed auto-crediting. Kept in the response
      // so the workflow summary and any existing log parsing keep working.
      credited: 0,
      // Credit-window repairs only. Lifecycle releases are `released`; the two
      // shared this counter before SPENDLY-20, under the repair label.
      repaired,
      released,
      skipped,
      failed,
      duressSkipped,
      elapsedMs: Date.now() - pageStartedAt,
      maxEstablishmentMs,
      throughMonth,
      nextCursor,
    });
  } catch (error) {
    return json(500, { error: (error as Error).message });
  }
}
