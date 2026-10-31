import { beforeEach, describe, expect, it, vi } from "vitest";

const disk = new Map<string, string>();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getAllKeys: async () => [...disk.keys()],
    multiRemove: async (keys: string[]) => {
      for (const key of keys) disk.delete(key);
    },
  },
}));
vi.mock("@/lib/errors", () => ({ logWarning: vi.fn() }));

const { purgeLegacyDashboardSnapshots, resetLegacyDashboardSnapshotPurgeForTests } = await import(
  "@/lib/legacyDashboardSnapshotPurge"
);

describe("purgeLegacyDashboardSnapshots (SPENDLY-641)", () => {
  beforeEach(() => {
    disk.clear();
    resetLegacyDashboardSnapshotPurgeForTests();
  });

  it("removes every user's leftover snapshot and nothing else", async () => {
    disk.set("spendly.dashboardSnapshot.v1:u1", "{}");
    disk.set("spendly.dashboardSnapshot.v1:u2", "{}");
    disk.set("spendly.stockHistory.v1.index", "[]");
    disk.set("firebase:authUser:key:[DEFAULT]", "{}");

    await expect(purgeLegacyDashboardSnapshots()).resolves.toBe(2);
    expect([...disk.keys()].sort()).toEqual(["firebase:authUser:key:[DEFAULT]", "spendly.stockHistory.v1.index"]);
  });

  it("runs once per app session", async () => {
    disk.set("spendly.dashboardSnapshot.v1:u1", "{}");
    await purgeLegacyDashboardSnapshots();
    disk.set("spendly.dashboardSnapshot.v1:u3", "{}");
    await expect(purgeLegacyDashboardSnapshots()).resolves.toBe(0);
  });
});
