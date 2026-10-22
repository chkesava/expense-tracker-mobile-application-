import { describe, expect, it } from "vitest";

import { readModelFreshness } from "./readModelFreshness";
import { configuredReadModelMode, effectiveReadModelMode } from "./readModelMode";
import { overlayLocalRows } from "./readModelOverlay";

const base = { configured: "supabase" as const, online: true, duress: false, available: true, fellBack: false };

describe("read-model mode (SPENDLY-511)", () => {
  it("reads the remote setting per screen and defaults to firestore", () => {
    expect(configuredReadModelMode(undefined, "journal")).toBe("firestore");
    expect(configuredReadModelMode({}, "journal")).toBe("firestore");
    expect(configuredReadModelMode({ journal: "supabase" }, "journal")).toBe("supabase");
    expect(configuredReadModelMode({ journal: "shadow" }, "journal")).toBe("shadow");
    expect(configuredReadModelMode({ journal: "SUPABASE" }, "journal")).toBe("firestore");
    expect(configuredReadModelMode({ journal: true }, "journal")).toBe("firestore");
    expect(configuredReadModelMode("supabase", "journal")).toBe("firestore");
  });

  it("uses the configured mode only when every condition allows it", () => {
    expect(effectiveReadModelMode(base)).toBe("supabase");
    expect(effectiveReadModelMode({ ...base, configured: "shadow" })).toBe("shadow");
    expect(effectiveReadModelMode({ ...base, configured: "firestore" })).toBe("firestore");
  });

  it.each([
    ["a duress session", { duress: true }],
    ["offline", { online: false }],
    ["no read model in this build", { available: false }],
    ["a session that already fell back", { fellBack: true }],
  ])("reads Firestore for %s", (_name, override) => {
    expect(effectiveReadModelMode({ ...base, ...override })).toBe("firestore");
    expect(effectiveReadModelMode({ ...base, configured: "shadow", ...override })).toBe("firestore");
  });
});

describe("pending-write overlay (SPENDLY-511)", () => {
  it("keeps a just-saved local row the read model doesn't have yet, marked pending", () => {
    const { rows, pendingIds } = overlayLocalRows(
      [{ id: "a", amount: 1, createdAt: 1000 }],
      [{ id: "new", amount: 9, createdAt: 5000 }]
    );
    expect(rows.map((r) => r.id).sort()).toEqual(["a", "new"]);
    expect([...pendingIds]).toEqual(["new"]);
  });

  it("a newer local edit beats the older synced copy, with no duplicate", () => {
    const { rows, pendingIds } = overlayLocalRows(
      [{ id: "a", amount: 1, createdAt: 1000, updatedAt: 2000 }],
      [{ id: "a", amount: 5, createdAt: 1000, updatedAt: 3000 }]
    );
    expect(rows).toEqual([{ id: "a", amount: 5, createdAt: 1000, updatedAt: 3000 }]);
    expect(pendingIds.has("a")).toBe(true);
  });

  it("drops the overlay once the read model catches up", () => {
    const synced = { id: "a", amount: 5, createdAt: 1000, updatedAt: 3000 };
    const { rows, pendingIds } = overlayLocalRows([synced], [{ ...synced }]);
    expect(rows).toHaveLength(1);
    expect(pendingIds.size).toBe(0);
  });

  it("a newer remote version (another device) wins over an older local copy", () => {
    const { rows } = overlayLocalRows(
      [{ id: "a", amount: 7, updatedAt: { seconds: 5, nanoseconds: 0 } }],
      [{ id: "a", amount: 5, updatedAt: { seconds: 3, nanoseconds: 0 } }]
    );
    expect(rows[0].amount).toBe(7);
  });

  it("an unknown version keeps the local row (never hide what the user sees)", () => {
    const { rows } = overlayLocalRows([{ id: "a", amount: 7, updatedAt: 9000 }], [{ id: "a", amount: 5 }]);
    expect(rows[0].amount).toBe(5);
  });
});

describe("read-model freshness (SPENDLY-511)", () => {
  const H = 3600 * 1000;
  const fmt = () => "14:05";

  it("is fresh within the SLO with nothing newer locally", () => {
    expect(readModelFreshness({ lastSyncedAtMs: 10 * H, newestLocalWriteMs: 9 * H, nowMs: 11 * H, formatTime: fmt })).toEqual({ state: "fresh", label: null });
  });

  it("shows Updating… when this device wrote after the last sync", () => {
    expect(readModelFreshness({ lastSyncedAtMs: 10 * H, newestLocalWriteMs: 10.5 * H, nowMs: 11 * H, formatTime: fmt }))
      .toEqual({ state: "updating", label: "Updating…" });
  });

  it("is stale past the 3-hour SLO, saying when it last synced, even with local writes", () => {
    expect(readModelFreshness({ lastSyncedAtMs: 10 * H, newestLocalWriteMs: 14 * H, nowMs: 13.5 * H, formatTime: fmt }))
      .toEqual({ state: "stale", label: "Data may be out of date — last synced 14:05" });
  });

  it("is stale before the first sync", () => {
    expect(readModelFreshness({ lastSyncedAtMs: null, newestLocalWriteMs: null, nowMs: 0, formatTime: fmt }).state).toBe("stale");
  });
});
