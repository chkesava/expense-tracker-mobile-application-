import { describe, expect, it } from "vitest";

import {
  duplicateFestivalYearMessage,
  planFestivalYearClaim,
  yearTakenByAnotherFestival,
} from "@/shared/utils/ganeshFestivalYear";

describe("festival year uniqueness", () => {
  it("rejects a sentinel already claimed by another festival", () => {
    expect(
      planFestivalYearClaim({
        year: 2026,
        claimingFestivalId: "new",
        sentinel: { festivalId: "existing" },
        festivalExists: false,
      })
    ).toEqual({ ok: false, error: duplicateFestivalYearMessage(2026) });
  });

  it("writes festival and year docs when the sentinel is empty", () => {
    expect(
      planFestivalYearClaim({
        year: 2026,
        claimingFestivalId: "fest-1",
        sentinel: undefined,
        festivalExists: false,
      })
    ).toEqual({ ok: true, writeFestival: true, writeSentinel: true });
  });

  it("only writes the sentinel on retry when the festival already exists", () => {
    expect(
      planFestivalYearClaim({
        year: 2026,
        claimingFestivalId: "fest-1",
        sentinel: undefined,
        festivalExists: true,
      })
    ).toEqual({ ok: true, writeFestival: false, writeSentinel: true });
  });

  it("is a no-op when this festival already owns the year", () => {
    expect(
      planFestivalYearClaim({
        year: 2026,
        claimingFestivalId: "fest-1",
        sentinel: { festivalId: "fest-1" },
        festivalExists: true,
      })
    ).toEqual({ ok: true, writeFestival: false, writeSentinel: false });
  });

  it("treats an existing festival list year as taken", () => {
    expect(
      yearTakenByAnotherFestival(
        [
          { id: "a", year: 2025 },
          { id: "b", year: 2026 },
        ],
        2026
      )
    ).toBe(true);
    expect(yearTakenByAnotherFestival([{ id: "b", year: 2026 }], 2026, "b")).toBe(false);
  });
});
