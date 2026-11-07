import { describe, expect, it } from "vitest";

import { fakeAdminDb } from "../shared/utils/push/testing/fakeAdminDb";
import { deleteExpiredSendLogs, readBudget, runPushReminders, SEND_LOG_CLEANUP_LIMIT } from "./lib/pushRunCore";

const NOW = new Date("2026-12-10T04:05:00Z"); // first quarter of the hour: the event pass
const DAY = 86_400_000;
const log = (expireOffsetMs: number) => ({ status: "done", expireAt: new Date(NOW.getTime() + expireOffsetMs) });
const budget = () => readBudget({ perRun: 1000, perDay: 6000, usedToday: 0 });

describe("deleteExpiredSendLogs (SPENDLY-713: Spark has no TTL policies)", () => {
  it("deletes only send logs past expireAt", async () => {
    const f = fakeAdminDb({
      "pushSendLogs/old": log(-DAY),
      "pushSendLogs/just-expired": log(-1),
      "pushSendLogs/live": log(DAY),
      "pushSendLogs/no-expiry": { status: "sending" },
    });
    expect(await deleteExpiredSendLogs(f.db, budget(), NOW, false)).toEqual({ deleted: 2 });
    expect([...f.docs.keys()].sort()).toEqual(["pushSendLogs/live", "pushSendLogs/no-expiry"]);
  });

  it("is bounded per run, so a backlog clears over later passes", async () => {
    const seed: Record<string, Record<string, unknown>> = {};
    for (let i = 0; i < SEND_LOG_CLEANUP_LIMIT + 5; i++) seed[`pushSendLogs/k${i}`] = log(-DAY);
    const f = fakeAdminDb(seed);
    expect(await deleteExpiredSendLogs(f.db, budget(), NOW, false)).toEqual({ deleted: SEND_LOG_CLEANUP_LIMIT });
    expect(f.docs.size).toBe(5);
  });

  it("deletes nothing in a dry run, and nothing once the read budget is spent", async () => {
    const f = fakeAdminDb({ "pushSendLogs/old": log(-DAY) });
    expect(await deleteExpiredSendLogs(f.db, budget(), NOW, true)).toEqual({ deleted: 0, wouldDelete: 1 });
    const spent = readBudget({ perRun: 10, perDay: 10, usedToday: 10 });
    expect(await deleteExpiredSendLogs(f.db, spent, NOW, false)).toEqual({ deleted: 0, skipped: "read budget spent" });
    expect(f.docs.has("pushSendLogs/old")).toBe(true);
  });
});

describe("runPushReminders send-log cleanup", () => {
  const run = (db: ReturnType<typeof fakeAdminDb>["db"], now: Date) =>
    runPushReminders({ db, sources: [], now, dryRun: false, maxReadsPerRun: 400, maxReadsPerDay: 6000, readModel: null, log: () => undefined });

  it("runs in the hourly pass and not in the other quarter-hours", async () => {
    const f = fakeAdminDb({ "pushSendLogs/old": log(-DAY) });
    const later = await run(f.db, new Date(NOW.getTime() + 20 * 60_000));
    expect(later.sendLogCleanup).toBeNull();
    expect(f.docs.has("pushSendLogs/old")).toBe(true);

    const hourly = await run(f.db, NOW);
    expect(hourly.sendLogCleanup).toEqual({ deleted: 1 });
    expect(f.docs.has("pushSendLogs/old")).toBe(false);
  });
});
