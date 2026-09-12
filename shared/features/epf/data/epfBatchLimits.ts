/**
 * Firestore batch sizing for EPF writes — KAN-73.
 *
 * These lived as a constant plus a prose comment inside
 * `hooks/useEpfContributions.ts`, which vitest never ran, so the invariant they
 * describe was documented and unenforced.
 *
 * The invariant: every saved month writes **two** documents — the contribution
 * and its audit event (KAN-72) — so the row chunk must be at most half
 * Firestore's cap. Getting this wrong fails only on a long backfill, which is
 * the worst place to find out.
 */

/** Firestore's hard cap on writes in one batch. Not ours to change. */
export const FIRESTORE_BATCH_LIMIT = 500;

/** Documents written per contribution row: the row plus its audit event. */
export const WRITES_PER_CONTRIBUTION_ROW = 2;

/** Contribution rows per batch. See {@link FIRESTORE_BATCH_LIMIT}. */
export const EPF_BATCH_CHUNK_SIZE = 200;

/** Documents written per establishment-month by the cron. */
export const WRITES_PER_CRON_MONTH = 2;

/** Months the cron generates per batch (`MONTHS_PER_BATCH` in `epf-cron.ts`). */
export const EPF_CRON_MONTHS_PER_BATCH = 200;
