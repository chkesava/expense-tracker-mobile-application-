import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/toast", () => ({
  toast: {
    show: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    dismiss: vi.fn(),
  },
}));

import { toast } from "@/lib/toast";
import {
  commitWrite,
  setWriteQueueDurable,
  writeSavedMessage,
} from "./firestoreWrite";

const toastError = vi.mocked(toast.error);

describe("commitWrite", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    toastError.mockClear();
    // These cases are about the grace window, not durability. The durable
    // branch is what they have always asserted, so state it explicitly now
    // that it is no longer the default (SPENDLY-1).
    setWriteQueueDurable(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    setWriteQueueDurable(false);
  });

  it("reports 'acked' when the server confirms before the grace window", async () => {
    const outcome = await commitWrite(() => Promise.resolve("ref"), {
      graceMs: 1000,
    });
    expect(outcome).toBe("acked");
  });

  it("reports 'queued' when the write is still pending after the grace window", async () => {
    // Offline Firestore writes never settle — the promise stays pending forever.
    const pending = commitWrite(() => new Promise(() => undefined), {
      graceMs: 1000,
    });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toBe("queued");
  });

  it("rejects when the write fails inside the grace window", async () => {
    const failing = commitWrite(
      () => Promise.reject(new Error("permission-denied")),
      { graceMs: 1000 }
    );
    await expect(failing).rejects.toThrow("permission-denied");
  });

  it("rejects when the write function throws synchronously", async () => {
    await expect(
      commitWrite(() => {
        throw new Error("invalid payload");
      })
    ).rejects.toThrow("invalid payload");
  });

  it("reports a failure that lands after the write was already queued", async () => {
    let rejectWrite: ((error: unknown) => void) | undefined;
    const onLateFailure = vi.fn();

    const pending = commitWrite(
      () =>
        new Promise((_resolve, reject) => {
          rejectWrite = reject;
        }),
      { graceMs: 1000, onLateFailure }
    );

    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toBe("queued");

    rejectWrite?.(new Error("unavailable"));
    await vi.advanceTimersByTimeAsync(0);

    expect(onLateFailure).toHaveBeenCalledTimes(1);
  });

  it("does not leave a late failure unhandled when no reporter is given", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let rejectWrite: ((error: unknown) => void) | undefined;

    const pending = commitWrite(
      () =>
        new Promise((_resolve, reject) => {
          rejectWrite = reject;
        }),
      { graceMs: 1000, label: "expense" }
    );

    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toBe("queued");

    rejectWrite?.(new Error("unavailable"));
    await vi.advanceTimersByTimeAsync(0);

    expect(consoleError).toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});

describe("writeSavedMessage", () => {
  it("keeps the plain message once the server acknowledged", () => {
    expect(writeSavedMessage("acked", "Expense logged")).toBe("Expense logged");
  });

  it("flags a queued write as pending sync", () => {
    expect(writeSavedMessage("queued", "Expense logged")).toBe(
      "Expense logged — offline, will sync"
    );
  });
});

describe("commitWrite durability — SPENDLY-1 / KAN-112", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    setWriteQueueDurable(false);
  });

  it("reports 'unsafe' when nothing durable is backing the queue", async () => {
    setWriteQueueDurable(false);
    const pending = commitWrite(() => new Promise(() => undefined), {
      graceMs: 1000,
    });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toBe("unsafe");
  });

  it("still reports 'acked' without a durable queue when the server answers", async () => {
    setWriteQueueDurable(false);
    const outcome = await commitWrite(() => Promise.resolve("ref"), {
      graceMs: 1000,
    });
    expect(outcome).toBe("acked");
  });

  it("defaults to pessimistic before anything registers durability", async () => {
    const pending = commitWrite(() => new Promise(() => undefined), {
      graceMs: 1000,
    });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toBe("unsafe");
  });

  it("reports 'queued' for an undurable SDK cache when this write was journaled", async () => {
    setWriteQueueDurable(false);
    const pending = commitWrite(() => new Promise(() => undefined), {
      graceMs: 1000,
      durable: true,
    });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toBe("queued");
  });
});

describe("writeSavedMessage — SPENDLY-1", () => {
  it("never promises a sync for an unsafe write", () => {
    const message = writeSavedMessage("unsafe", "Expense logged");
    expect(message).not.toContain("will sync");
    expect(message).toBe(
      "Expense logged on this device — keep the app open until it syncs"
    );
  });

  it("leaves the acked and queued wording untouched", () => {
    setWriteQueueDurable(true);
    expect(writeSavedMessage("acked", "Expense logged")).toBe("Expense logged");
    expect(writeSavedMessage("queued", "Expense logged")).toBe(
      "Expense logged — offline, will sync"
    );
  });
});
