import { describe, expect, it } from "vitest";
import {
  formatLastServerSyncAt,
  getBannerLabel,
} from "./offlineBannerLabel";

describe("getBannerLabel", () => {
  it("keeps the offline copy when there is no server stamp", () => {
    expect(getBannerLabel("offline", 3)).toBe("No Internet Connection");
    expect(getBannerLabel("offline", 3, null)).toBe("No Internet Connection");
  });

  it("appends as of time when offline with a stamp", () => {
    const at = Date.UTC(2026, 8, 21, 10, 11, 0);
    expect(getBannerLabel("offline", 2, at)).toBe(
      `No Internet Connection · as of ${formatLastServerSyncAt(at)}`
    );
  });

  it("does not attach as of time while syncing or after a successful sync", () => {
    const at = Date.UTC(2026, 8, 21, 10, 11, 0);
    expect(getBannerLabel("syncing", 1, at)).toBe("Syncing 1 change…");
    expect(getBannerLabel("syncing", 4, at)).toBe("Syncing 4 changes…");
    expect(getBannerLabel("synced", 0, at)).toBe("Back Online — All Synced!");
    expect(getBannerLabel("hidden", 0, at)).toBe("");
  });
});
