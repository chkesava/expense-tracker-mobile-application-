import { describe, expect, it } from "vitest";

import { reminderMode } from "./reminderMode";

describe("reminderMode", () => {
  const ok = { pushRemindersLive: true, registeredForUser: true, permissionGranted: true };

  it("hands reminders to push only when live, registered and allowed", () => {
    expect(reminderMode(ok)).toBe("push");
  });

  it.each([
    ["push not live yet (before switch-on, or kill switch)", { pushRemindersLive: false }],
    ["flag missing", { pushRemindersLive: undefined }],
    ["flag not a real true", { pushRemindersLive: "true" }],
    ["this install isn't registered for the user", { registeredForUser: false }],
    ["permission revoked", { permissionGranted: false }],
  ])("keeps local reminders when %s", (_label, patch) => {
    expect(reminderMode({ ...ok, ...patch })).toBe("local");
  });

  it("staged rollout: testers listed in pushRemindersLiveFor switch before everyone (SPENDLY-233)", () => {
    const staged = { ...ok, pushRemindersLive: false, pushRemindersLiveFor: ["tester"] };
    expect(reminderMode({ ...staged, uid: "tester" })).toBe("push");
    expect(reminderMode({ ...staged, uid: "someone" })).toBe("local");
    expect(reminderMode({ ...staged, uid: null })).toBe("local");
    expect(reminderMode({ ...staged, pushRemindersLiveFor: "tester", uid: "tester" })).toBe("local");
  });
});
