import { describe, expect, it } from "vitest";

import { formatDeliveryReport, summarizeSendLogs } from "./deliveryReport";

const log = (over: Record<string, unknown> = {}) => ({
  status: "done",
  category: "bills",
  recipients: 1,
  optedOut: 0,
  noDevice: 0,
  messages: 2,
  accepted: 2,
  pruned: 0,
  errors: {},
  ...over,
});

describe("summarizeSendLogs", () => {
  it("totals finished sends, errors (ticket and receipt) and categories; skips claims still sending", () => {
    const s = summarizeSendLogs([
      log(),
      log({ category: "investments", messages: 3, accepted: 2, pruned: 1, errors: { DeviceNotRegistered: 1 }, receiptErrors: { MessageRateExceeded: 2 } }),
      log({ status: "sending", messages: 99 }),
      log({ optedOut: 1, messages: 0, accepted: 0, noDevice: 1 }),
    ]);
    expect(s).toMatchObject({ sends: 3, messages: 5, accepted: 4, pruned: 1, optedOut: 1, noDevice: 1 });
    expect(s.errors).toEqual({ DeviceNotRegistered: 1, "receipt:MessageRateExceeded": 2 });
    expect(s.byCategory).toEqual({ bills: { sends: 2, messages: 2, accepted: 2 }, investments: { sends: 1, messages: 3, accepted: 2 } });
  });
});

describe("formatDeliveryReport", () => {
  it("prints the measures with rates, and never a token", () => {
    const text = formatDeliveryReport({
      days: 7,
      devices: 12,
      activeDevices: 9,
      usersWithDevice: 8,
      accounts: 10,
      logs: summarizeSendLogs([log(), log({ messages: 2, accepted: 1, errors: { MessageTooBig: 1 } })]),
    });
    expect(text).toContain("| Registered devices | 12 (9 seen in the last 7 days) |");
    expect(text).toContain("| Accounts with a registered device | 8 of 10 (80%) |");
    expect(text).toContain("| Accepted by Expo | 3 (75%; target ≥ 98%) |");
    expect(text).toContain("| MessageTooBig | 1 |");
    expect(text).not.toContain("ExponentPushToken");
  });

  it("handles a quiet week", () => {
    expect(formatDeliveryReport({ days: 7, devices: 0, activeDevices: 0, usersWithDevice: 0, accounts: 0, logs: summarizeSendLogs([]) })).toContain("None.");
  });
});
