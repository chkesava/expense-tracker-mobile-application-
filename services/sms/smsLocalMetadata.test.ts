import { describe, expect, it } from "vitest";

import { toSmsLocalMetadata } from "./smsLocalMetadata";

describe("toSmsLocalMetadata", () => {
  it("maps native inbox rows to smsId, sender, body, and timestamp", () => {
    expect(
      toSmsLocalMetadata({
        id: "42",
        address: "VM-SBIINB",
        body: "Your A/c XX4521 is debited for Rs.100",
        receivedAtMs: 1_700_000_000_000,
      })
    ).toEqual({
      smsId: "42",
      sender: "VM-SBIINB",
      body: "Your A/c XX4521 is debited for Rs.100",
      timestamp: 1_700_000_000_000,
    });
  });

  it("prefers the Phase 4 field names when both aliases are present", () => {
    expect(
      toSmsLocalMetadata({
        id: "1",
        smsId: "99",
        address: "old",
        sender: "HDFCBK",
        body: "INR 50 spent",
        receivedAtMs: 1,
        timestamp: 2,
      })
    ).toEqual({
      smsId: "99",
      sender: "HDFCBK",
      body: "INR 50 spent",
      timestamp: 2,
    });
  });
});
