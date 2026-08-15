/**
 * Tests for reconcileBillReminders orchestration.
 *
 * The scheduler wraps expo-notifications and react-native — both are mocked
 * here so the orchestration logic (skip/permission/slot gating) runs in Node.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Account } from "@/shared/types/expense";
import type {
  CreditCardBill,
  CreditCardBillRemindersSettings,
} from "@/shared/types/creditCardBill";

// ── mock expo-notifications ──────────────────────────────────────────────────
const mockScheduleNotification = vi.fn().mockResolvedValue("notif-id");
const mockGetPermissions = vi.fn().mockResolvedValue({ status: "granted" });
const mockRequestPermissions = vi.fn().mockResolvedValue({ status: "granted" });
const mockGetAllScheduled = vi.fn().mockResolvedValue([]);
const mockCancelScheduled = vi.fn().mockResolvedValue(undefined);
const mockSetNotificationHandler = vi.fn();
const mockSetNotificationChannel = vi.fn().mockResolvedValue(undefined);

vi.mock("expo-notifications", () => ({
  setNotificationHandler: mockSetNotificationHandler,
  getPermissionsAsync: mockGetPermissions,
  requestPermissionsAsync: mockRequestPermissions,
  getAllScheduledNotificationsAsync: mockGetAllScheduled,
  cancelScheduledNotificationAsync: mockCancelScheduled,
  scheduleNotificationAsync: mockScheduleNotification,
  setNotificationChannelAsync: mockSetNotificationChannel,
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: "date" },
}));

// ── mock react-native ─────────────────────────────────────────────────────────
vi.mock("react-native", () => ({
  Platform: { OS: "ios" }, // non-Android so channel setup is skipped
}));

import { reconcileBillReminders } from "./billReminderScheduler";

// ── fixture helpers ────────────────────────────────────────────────────────────

const account: Account = {
  id: "card-1",
  name: "HDFC Regalia",
  typeId: "credit",
  creditLimit: 100000,
  billGenerationDay: 15,
};

const globalPrefs: CreditCardBillRemindersSettings = {
  enabled: true,
  daysBefore: [3, 1],
  onDueDate: true,
  overdueEveryDays: 1,
  quietHoursStart: "08:00",
  quietHoursEnd: "21:00",
};

function makeBill(overrides: Partial<CreditCardBill> = {}): CreditCardBill {
  // Due date far in the future so slots are always in the future
  return {
    id: "bill-1",
    accountId: "card-1",
    statementDate: "2026-09-15",
    dueDate: "2099-10-05", // Far future — guarantees trigger date > now
    statementAmount: 12000,
    minimumDueAmount: 600,
    amountPaid: 0,
    remainingAmount: 12000,
    currency: "INR",
    status: "UPCOMING",
    reminderEnabled: true,
    reminderFrequency: { daysBefore: [], onDueDate: false, overdueEveryDays: 1 },
    ...overrides,
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("reconcileBillReminders orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPermissions.mockResolvedValue({ status: "granted" });
    mockRequestPermissions.mockResolvedValue({ status: "granted" });
    mockGetAllScheduled.mockResolvedValue([]);
  });

  it("skips scheduling when global reminders are disabled", async () => {
    const logs: unknown[] = [];
    await reconcileBillReminders({
      bills: [makeBill()],
      accountsById: new Map([["card-1", account]]),
      globalPrefs: { ...globalPrefs, enabled: false },
      onLog: (entry) => {
        logs.push(entry);
      },
    });

    expect(mockScheduleNotification).not.toHaveBeenCalled();
    const entry = logs[0] as { status: string; reason: string };
    expect(entry.status).toBe("skipped");
    expect(entry.reason).toBe("not_eligible");
  });

  it("skips scheduling when the bill has reminderEnabled = false", async () => {
    const logs: unknown[] = [];
    await reconcileBillReminders({
      bills: [makeBill({ reminderEnabled: false })],
      accountsById: new Map([["card-1", account]]),
      globalPrefs,
      onLog: (entry) => {
        logs.push(entry);
      },
    });

    expect(mockScheduleNotification).not.toHaveBeenCalled();
    const entry = logs[0] as { status: string };
    expect(entry.status).toBe("skipped");
  });

  it("skips scheduling when the bill is already PAID", async () => {
    const logs: unknown[] = [];
    await reconcileBillReminders({
      bills: [makeBill({ status: "PAID", remainingAmount: 0 })],
      accountsById: new Map([["card-1", account]]),
      globalPrefs,
      onLog: (entry) => {
        logs.push(entry);
      },
    });

    expect(mockScheduleNotification).not.toHaveBeenCalled();
  });

  it("logs a permission_denied failure when notification permission is not granted", async () => {
    mockGetPermissions.mockResolvedValue({ status: "denied" });
    mockRequestPermissions.mockResolvedValue({ status: "denied" });

    const logs: unknown[] = [];
    await reconcileBillReminders({
      bills: [makeBill()],
      accountsById: new Map([["card-1", account]]),
      globalPrefs,
      onLog: (entry) => {
        logs.push(entry);
      },
    });

    expect(mockScheduleNotification).not.toHaveBeenCalled();
    const failEntry = logs[0] as { status: string; reason: string };
    expect(failEntry.status).toBe("failed");
    expect(failEntry.reason).toBe("permission_denied");
  });

  it("schedules notifications when bill is eligible and permission is granted", async () => {
    await reconcileBillReminders({
      bills: [
        makeBill({
          reminderFrequency: {
            daysBefore: [3],
            onDueDate: true,
            overdueEveryDays: 1,
          },
        }),
      ],
      accountsById: new Map([["card-1", account]]),
      globalPrefs,
    });

    // At minimum the due_date slot should be scheduled
    expect(mockScheduleNotification).toHaveBeenCalled();
  });

  it("cancels existing reminders before rescheduling", async () => {
    const existingNotif = { identifier: "ccbill:bill-1:days_before:3" };
    mockGetAllScheduled.mockResolvedValue([existingNotif]);

    await reconcileBillReminders({
      bills: [makeBill()],
      accountsById: new Map([["card-1", account]]),
      globalPrefs,
    });

    expect(mockCancelScheduled).toHaveBeenCalledWith(existingNotif.identifier);
  });

  it("silently skips a bill whose account is not in the accountsById map", async () => {
    const logs: unknown[] = [];
    await reconcileBillReminders({
      bills: [makeBill({ accountId: "card-MISSING" })],
      accountsById: new Map([["card-1", account]]),
      globalPrefs,
      onLog: (entry) => {
        logs.push(entry);
      },
    });

    // No scheduling; no log entry for a missing account (quiet skip)
    expect(mockScheduleNotification).not.toHaveBeenCalled();
  });

  it("processes multiple bills independently", async () => {
    const bill1 = makeBill({ id: "bill-1", accountId: "card-1" });
    const bill2 = makeBill({
      id: "bill-2",
      accountId: "card-1",
      status: "PAID",
      remainingAmount: 0,
    });

    const logs: Array<{ billId: string; status: string }> = [];
    await reconcileBillReminders({
      bills: [bill1, bill2],
      accountsById: new Map([["card-1", account]]),
      globalPrefs,
      onLog: (entry) => {
        logs.push(entry as { billId: string; status: string });
      },
    });

    // bill1 is eligible; bill2 is PAID so skipped
    const bill2Log = logs.find((l) => l.billId === "bill-2");
    expect(bill2Log?.status).toBe("skipped");

    // bill1 must have triggered at least one scheduling call
    expect(mockScheduleNotification).toHaveBeenCalled();
  });
});
