import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  platform: { OS: "android" as string },
  setChannel: vi.fn(),
}));

vi.mock("react-native", () => ({ Platform: m.platform }));
vi.mock("expo-notifications", () => ({
  setNotificationChannelAsync: m.setChannel,
  AndroidImportance: { HIGH: 4, DEFAULT: 3 },
}));
vi.mock("@/lib/errors", () => ({ logWarning: vi.fn() }));

import { CALENDAR_CHANNEL_ID } from "@/services/calendar/calendarNotificationScheduler";
import { CREDIT_CARD_BILL_CHANNEL_ID } from "@/services/creditCardBills/billReminderScheduler";
import { GOALS_CHANNEL_ID } from "@/services/goals/goalReminderScheduler";
import { PUSH_CHANNELS } from "@/shared/utils/pushPreferences";

beforeEach(() => {
  vi.resetModules();
  m.platform.OS = "android";
  m.setChannel.mockReset().mockResolvedValue(undefined);
});

describe("ensurePushChannels", () => {
  it("creates each category's channel once, with the local reminders' importance", async () => {
    const { ensurePushChannels } = await import("./pushChannels");
    await ensurePushChannels();

    const created = Object.fromEntries(m.setChannel.mock.calls.map(([id, opts]) => [id, opts.importance]));
    expect(created).toEqual({
      "credit-card-bills": 4,
      "financial-calendar": 3,
      "savings-goals": 3,
      investments: 3,
      "shared-money": 3,
      "price-alerts": 4,
      "salary-payday": 3,
    });

    await ensurePushChannels();
    expect(m.setChannel).toHaveBeenCalledTimes(7);
  });

  it("does nothing off Android", async () => {
    m.platform.OS = "ios";
    const { ensurePushChannels } = await import("./pushChannels");
    await ensurePushChannels();
    expect(m.setChannel).not.toHaveBeenCalled();
  });

  it("uses the same channel ids as the local reminder schedulers", () => {
    expect(PUSH_CHANNELS.bills.id).toBe(CREDIT_CARD_BILL_CHANNEL_ID);
    expect(PUSH_CHANNELS.calendar.id).toBe(CALENDAR_CHANNEL_ID);
    expect(PUSH_CHANNELS.dues.id).toBe(CALENDAR_CHANNEL_ID);
    expect(PUSH_CHANNELS.goals.id).toBe(GOALS_CHANNEL_ID);
  });
});
