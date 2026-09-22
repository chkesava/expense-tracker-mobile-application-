import { afterEach, describe, expect, it, vi } from "vitest";

import { reportError, setErrorReporter, type ErrorReport } from "./errorReporting";

afterEach(() => {
  setErrorReporter(null);
});

describe("errorReporting", () => {
  it("defaults to a no-op", () => {
    expect(() =>
      reportError({
        scope: "auth.login",
        message: "nope",
        kind: "auth",
        level: "error",
      })
    ).not.toThrow();
  });

  it("forwards the report to the injected sink", () => {
    const sink = vi.fn();
    setErrorReporter(sink);

    const report: ErrorReport = {
      scope: "firestoreWrite.lateFailure",
      message: "It could not be synced.",
      kind: "network",
      level: "error",
      code: "unavailable",
    };
    reportError(report);

    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith(report);
  });

  it("swallows a throwing sink so the caller stays intact", () => {
    setErrorReporter(() => {
      throw new Error("sink down");
    });

    expect(() =>
      reportError({
        scope: "ui.render",
        message: "nope",
        kind: "unknown",
        level: "warning",
      })
    ).not.toThrow();
  });

  it("restores the no-op when setErrorReporter(null)", () => {
    const sink = vi.fn();
    setErrorReporter(sink);
    setErrorReporter(null);

    reportError({
      scope: "auth.login",
      message: "nope",
      kind: "auth",
      level: "error",
    });

    expect(sink).not.toHaveBeenCalled();
  });
});
