import { describe, expect, it } from "vitest";

import { nightlyMode, nightlySetting } from "./readmodelNightlyMode";

// The schedule fires at 20:30 UTC = 02:00 IST the next day.
const at = (iso: string) => new Date(iso);

describe("nightly sync mode (SPENDLY-672)", () => {
  it("defaults to today's nightly full pass: unset, empty, unknown or 'full'", () => {
    for (const raw of [undefined, "", "full", "incremental", "SAFETY-NET", "yes"]) {
      expect(nightlyMode(raw, at("2026-11-04T20:30:00Z"))).toBe("full");
    }
    expect(nightlySetting(" safety-net ")).toBe("safety-net");
  });

  it("safety-net: changed-only nights, a full pass on Sunday IST", () => {
    // Saturday 20:30 UTC is Sunday 02:00 IST.
    expect(nightlyMode("safety-net", at("2026-11-07T20:30:00Z"))).toBe("full");
    // Every other night of that week is changed-only.
    for (const day of ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]) {
      expect(nightlyMode("safety-net", at(`${day}T20:30:00Z`))).toBe("incremental");
    }
  });
});
