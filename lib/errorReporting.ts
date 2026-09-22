/**
 * Optional sink for redacted error reports.
 *
 * `logError` / `logWarning` always call `reportError` after redaction.
 * The default sink is a no-op so release builds stay console-only until an
 * SDK (Sentry, Crashlytics, …) is wired via `setErrorReporter`.
 *
 * A throwing sink must not hide the original console path.
 */

export type ErrorReport = {
  scope: string;
  message: string;
  kind: string;
  level: "error" | "warning";
  code?: string;
  name?: string;
  context?: Record<string, unknown>;
};

export type ErrorReporter = (report: ErrorReport) => void;

const noopReporter: ErrorReporter = () => {};

let reporter: ErrorReporter = noopReporter;

/** Replace the sink. Pass `null` to restore the no-op (tests). */
export function setErrorReporter(next: ErrorReporter | null): void {
  reporter = next ?? noopReporter;
}

export function reportError(report: ErrorReport): void {
  try {
    reporter(report);
  } catch {
    // Broken sink must not swallow the original error path.
  }
}
