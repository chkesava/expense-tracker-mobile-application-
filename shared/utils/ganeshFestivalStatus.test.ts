import { describe, expect, it } from "vitest";

import {
  FESTIVAL_DISPLAY_LABEL,
  festivalDisplayLabel,
  festivalDisplayStatus,
  festivalWriteLocked,
} from "@/shared/utils/ganeshFestivalStatus";

describe("festival display status", () => {
  const today = "2026-08-31";

  it("marks a closed festival Closed even if dates are in the future", () => {
    expect(
      festivalDisplayStatus({ status: "closed", startDate: "2026-09-10" }, today)
    ).toBe("closed");
    expect(festivalDisplayLabel({ status: "closed" }, today)).toBe("Closed");
  });

  it("marks an open festival Upcoming when startDate is after today", () => {
    expect(
      festivalDisplayStatus({ status: "open", startDate: "2026-09-14" }, today)
    ).toBe("upcoming");
    expect(festivalDisplayLabel({ status: "open", startDate: "2026-09-14" }, today)).toBe(
      "Upcoming"
    );
  });

  it("marks an open festival Active in the window or with no dates", () => {
    expect(
      festivalDisplayStatus({ status: "open", startDate: "2026-08-20" }, today)
    ).toBe("active");
    expect(festivalDisplayStatus({ status: "open" }, today)).toBe("active");
    expect(festivalDisplayLabel({ status: "open" }, today)).toBe("Active");
  });

  it("never surfaces the stored open label", () => {
    expect(Object.values(FESTIVAL_DISPLAY_LABEL)).not.toContain("open");
    expect(Object.values(FESTIVAL_DISPLAY_LABEL)).not.toContain("Open");
  });

  it("locks writes only when stored status is closed", () => {
    expect(festivalWriteLocked("closed")).toBe(true);
    expect(festivalWriteLocked("open")).toBe(false);
    expect(festivalWriteLocked(undefined)).toBe(false);
  });
});
