import { beforeEach, describe, expect, it, vi } from "vitest";

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
  handleSnapshotError,
  isAuthError,
  isTransientNetworkError,
  resetSnapshotErrorNotices,
} from "./firestoreErrors";

const toastError = vi.mocked(toast.error);

describe("handleSnapshotError", () => {
  beforeEach(() => {
    toastError.mockClear();
    resetSnapshotErrorNotices();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("stays silent when the listener drops because the device is offline", () => {
    handleSnapshotError("expenses", { code: "unavailable" });
    expect(toastError).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("tells the user once when the session can no longer read", () => {
    handleSnapshotError("expenses", { code: "permission-denied" }, 1000);
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it("does not repeat the session notice for every listener in the same burst", () => {
    handleSnapshotError("expenses", { code: "unauthenticated" }, 1000);
    handleSnapshotError("incomes", { code: "unauthenticated" }, 1200);
    handleSnapshotError("accounts", { code: "unauthenticated" }, 1400);
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it("notices again once the throttle window has passed", () => {
    handleSnapshotError("expenses", { code: "unauthenticated" }, 1000);
    handleSnapshotError("expenses", { code: "unauthenticated" }, 20_000);
    expect(toastError).toHaveBeenCalledTimes(2);
  });

  it("logs unexpected errors without a user-facing toast", () => {
    handleSnapshotError("expenses", { code: "failed-precondition" });
    expect(console.error).toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });
});

describe("error classification", () => {
  it("recognises the auth codes Firestore uses for a dead session", () => {
    expect(isAuthError({ code: "permission-denied" })).toBe(true);
    expect(isAuthError({ code: "unauthenticated" })).toBe(true);
    expect(isAuthError({ code: "unavailable" })).toBe(false);
    expect(isAuthError(new Error("boom"))).toBe(false);
  });

  it("recognises the codes that just mean the network is down", () => {
    expect(isTransientNetworkError({ code: "unavailable" })).toBe(true);
    expect(isTransientNetworkError({ code: "deadline-exceeded" })).toBe(true);
    expect(isTransientNetworkError({ code: "permission-denied" })).toBe(false);
  });
});
