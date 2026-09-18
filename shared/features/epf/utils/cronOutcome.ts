/**
 * How the EPF cron decides whether a failed commit matters — SPENDLY-20.
 *
 * `netlify/functions/epf-cron.ts` used bare `catch {}` around every commit, so
 * a permission error, a quota error or an over-sized batch skipped the
 * establishment every month forever while the workflow saw HTTP 200 and
 * `written: 0`. The fix needs a rule for which failures are the design working
 * and which are the job broken, and that rule has to be testable — `netlify/**`
 * is deliberately outside `vitest.config.ts` so the handler stays a thin shell
 * (KAN-67). It lives here, next to the other pure EPF logic, for the same
 * reason `supabase/functions/**\/handler.ts` keeps its authorization rules in
 * plain TypeScript.
 */

/**
 * gRPC `ALREADY_EXISTS`. `batch.create` throwing this is idempotency working:
 * a concurrent client catch-up wrote the month first and nothing was lost.
 */
export const ALREADY_EXISTS_CODE = 6;

/** The string spelling some Firestore surfaces use for the same condition. */
export const ALREADY_EXISTS_STRING = "already-exists";

/**
 * gRPC `NOT_FOUND` and `FAILED_PRECONDITION`.
 *
 * On a commit — the only thing this module classifies — both mean the same
 * thing as `ALREADY_EXISTS`: another writer got to the document first. A
 * rejected `lastUpdateTime` precondition is the release pass *succeeding* at
 * its job, which is to not demote a contribution the user just credited; a
 * `NOT_FOUND` from `update` means the row was deleted and there is nothing to
 * release. Neither is the cron being broken, so neither reds the run.
 *
 * This classifier must therefore never be pointed at a *query* error, where
 * `FAILED_PRECONDITION` means a missing index and is very much fatal.
 */
export const NOT_FOUND_CODE = 5;
export const FAILED_PRECONDITION_CODE = 9;

const BENIGN_COMMIT_CODES: ReadonlySet<number | string> = new Set([
  ALREADY_EXISTS_CODE,
  ALREADY_EXISTS_STRING,
  NOT_FOUND_CODE,
  "not-found",
  FAILED_PRECONDITION_CODE,
  "failed-precondition",
]);

export type FirestoreFailureKind = "benign" | "fatal";

export type ClassifiedFirestoreError = {
  kind: FirestoreFailureKind;
  code: number | string | null;
  message: string;
};

/**
 * Classify a rejected Firestore commit.
 *
 * Benign means "another writer got there first" — see
 * {@link BENIGN_COMMIT_CODES}. `PERMISSION_DENIED` (7), `RESOURCE_EXHAUSTED`
 * (8), `INVALID_ARGUMENT` (3) — the over-sized batch this ticket also fixes —
 * `ABORTED` (10), `UNAVAILABLE` (14) and **anything unrecognised** are fatal.
 * Defaulting the unknown to fatal is the whole point: a code nobody
 * anticipated must show up in the run summary rather than reopen this ticket
 * in silence.
 */
export function classifyFirestoreError(error: unknown): ClassifiedFirestoreError {
  const raw = (error as { code?: unknown } | null | undefined)?.code;
  const code =
    typeof raw === "number" || typeof raw === "string" ? raw : null;
  const benign = code !== null && BENIGN_COMMIT_CODES.has(code);
  return {
    kind: benign ? "benign" : "fatal",
    code,
    message: error instanceof Error ? error.message : String(error),
  };
}

/** The three commits the cron makes, named for the log. */
export type CronStage =
  | "credit-window-repair"
  | "lifecycle-release"
  | "generation";

export type CronFailureLogInput = {
  stage: CronStage;
  uid: string;
  establishmentId: string;
  month: string | null;
  rows: number;
  error: unknown;
};

/**
 * The structured record for a swallowed commit error.
 *
 * Carries uid, establishment and month so a repeatedly failing establishment
 * can be found, and nothing else — no stack, no amount. A cron log is not the
 * place for either.
 */
export function cronFailureLog(
  input: CronFailureLogInput,
): Record<string, unknown> {
  const classified = classifyFirestoreError(input.error);
  return {
    event: "epf-cron.failure",
    stage: input.stage,
    uid: input.uid,
    establishmentId: input.establishmentId,
    month: input.month,
    rows: input.rows,
    kind: classified.kind,
    code: classified.code,
    message: classified.message,
  };
}
