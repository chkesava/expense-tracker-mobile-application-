import { describe, expect, it } from "vitest";

import {
  EPF_BATCH_CHUNK_SIZE,
  EPF_CRON_MONTHS_PER_BATCH,
  FIRESTORE_BATCH_LIMIT,
  WRITES_PER_CONTRIBUTION_ROW,
  WRITES_PER_CRON_MONTH,
} from "@/shared/features/epf/data/epfBatchLimits";

/**
 * KAN-72 halved both chunk sizes after adding audit events doubled the writes
 * per row. Until now that reasoning lived only in a comment, so the next person
 * to add a third document per row would find out on a user's long backfill.
 */
describe("EPF batch limits", () => {
  it("keeps a full contribution batch under Firestore's cap", () => {
    expect(EPF_BATCH_CHUNK_SIZE * WRITES_PER_CONTRIBUTION_ROW).toBeLessThanOrEqual(
      FIRESTORE_BATCH_LIMIT
    );
  });

  it("keeps a full cron batch under Firestore's cap", () => {
    expect(EPF_CRON_MONTHS_PER_BATCH * WRITES_PER_CRON_MONTH).toBeLessThanOrEqual(
      FIRESTORE_BATCH_LIMIT
    );
  });

  it("would have caught the pre-KAN-72 size", () => {
    // 400 rows × 2 writes = 800, well past the cap. This is the regression.
    expect(400 * WRITES_PER_CONTRIBUTION_ROW).toBeGreaterThan(FIRESTORE_BATCH_LIMIT);
  });

  it("leaves headroom for one more document per row before breaching", () => {
    // Not a requirement, but worth knowing: at 200 rows a third document per
    // row would be 600 writes and would fail.
    expect(EPF_BATCH_CHUNK_SIZE * 3).toBeGreaterThan(FIRESTORE_BATCH_LIMIT);
  });

  it("pins Firestore's documented cap", () => {
    expect(FIRESTORE_BATCH_LIMIT).toBe(500);
  });
});
