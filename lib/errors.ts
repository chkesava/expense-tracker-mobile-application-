/**
 * Central error normalization.
 *
 * Two jobs:
 *  1. Turn any thrown value into a message a person can act on — never a raw
 *     SDK string like `Firebase: Error (auth/invalid-credential).`
 *  2. Keep sensitive material out of logs. Errors from Firebase carry
 *     `customData` (email addresses, tokens), and request errors carry URLs
 *     with query strings. `logError` strips those before anything is written.
 *
 * Nothing here suppresses an error: callers still decide to retry, rethrow or
 * render a failure state. This only controls what a human sees.
 */

export type ErrorKind =
  | "network"
  | "permission"
  | "auth"
  | "notFound"
  | "validation"
  | "conflict"
  | "rateLimit"
  | "unknown";

type CodedError = { code?: unknown; message?: unknown; name?: unknown };

/** Reads a Firebase/Firestore-style `code` off an unknown thrown value. */
export function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const code = (error as CodedError).code;
  return typeof code === "string" ? code : undefined;
}

function rawMessage(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const message = (error as CodedError).message;
  return typeof message === "string" ? message : "";
}

/**
 * Firebase Auth codes → user-facing copy.
 *
 * `user-not-found` and `wrong-password` deliberately share one message: telling
 * the user which half was wrong confirms whether an account exists, which is an
 * account-enumeration oracle on a public sign-in form.
 */
const AUTH_MESSAGES: Record<string, string> = {
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/missing-email": "Enter your email address to continue.",
  "auth/missing-password": "Enter your password to continue.",
  "auth/user-disabled": "This account has been disabled. Contact support for help.",
  "auth/user-not-found": "Incorrect email or password.",
  "auth/wrong-password": "Incorrect email or password.",
  "auth/invalid-credential": "Incorrect email or password.",
  "auth/invalid-login-credentials": "Incorrect email or password.",
  "auth/email-already-in-use": "An account already exists with this email. Try signing in instead.",
  "auth/weak-password": "Choose a stronger password — at least 6 characters.",
  "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
  "auth/network-request-failed": "Couldn't reach the server. Check your connection and try again.",
  "auth/requires-recent-login": "For security, sign in again before making this change.",
  "auth/operation-not-allowed": "This sign-in method isn't enabled for this app.",
  "auth/account-exists-with-different-credential":
    "This email is already registered with a different sign-in method.",
  "auth/popup-closed-by-user": "Sign-in was cancelled.",
  "auth/cancelled-popup-request": "Sign-in was cancelled.",
  "auth/id-token-expired": "Your session expired. Sign in again.",
  "auth/user-token-expired": "Your session expired. Sign in again.",
  "auth/invalid-user-token": "Your session is no longer valid. Sign in again.",
  "auth/internal-error": "Sign-in failed unexpectedly. Please try again.",
};

/** Firestore / Google Cloud status codes → user-facing copy. */
const FIRESTORE_MESSAGES: Record<string, string> = {
  "permission-denied": "You don't have access to this. Sign in again or ask the owner for access.",
  unauthenticated: "Your session expired. Sign in again to continue.",
  unavailable: "Can't reach the server right now. Your changes are saved on this device and will sync automatically.",
  "deadline-exceeded": "The server took too long to respond. Please try again.",
  cancelled: "The request was cancelled.",
  "not-found": "We couldn't find that item — it may have been deleted.",
  "already-exists": "That item already exists.",
  "resource-exhausted": "You've hit a usage limit. Try again in a little while.",
  "failed-precondition": "This action can't be completed right now. Refresh and try again.",
  aborted: "Another change happened at the same time. Please try again.",
  "out-of-range": "Some of the values are outside the allowed range.",
  "invalid-argument": "Some of the details entered aren't valid. Check them and try again.",
  unimplemented: "This feature isn't available yet.",
  internal: "Something went wrong on the server. Please try again.",
  "data-loss": "Some data couldn't be read. Please try again.",
};

const NETWORK_HINTS =
  /network request failed|failed to fetch|networkerror|econnrefused|enotfound|etimedout|timeout|aborted|abort/i;

/** Classify a thrown value so callers can branch (retry, re-auth, show offline). */
export function classifyError(error: unknown): ErrorKind {
  const code = errorCode(error);

  if (code) {
    if (code === "permission-denied") return "permission";
    if (code === "unauthenticated" || code.startsWith("auth/")) {
      return code === "auth/network-request-failed" ? "network" : "auth";
    }
    if (code === "unavailable" || code === "deadline-exceeded") return "network";
    if (code === "not-found") return "notFound";
    if (code === "invalid-argument" || code === "out-of-range") return "validation";
    if (code === "already-exists" || code === "aborted") return "conflict";
    if (code === "resource-exhausted") return "rateLimit";
  }

  if (error instanceof Error) {
    if (error.name === "AbortError") return "network";
    if (NETWORK_HINTS.test(error.message)) return "network";
  }

  return "unknown";
}

export function isNetworkError(error: unknown): boolean {
  return classifyError(error) === "network";
}

export function isPermissionError(error: unknown): boolean {
  const kind = classifyError(error);
  return kind === "permission" || kind === "auth";
}

/**
 * True when the string still looks like SDK output rather than something we
 * wrote. Guards against leaking `Firebase: Error (auth/...)`, stack frames,
 * URLs or bare status codes into the UI.
 */
function looksTechnical(message: string): boolean {
  return (
    /firebase:|firestore|\bat\s+\w+\s*\(|https?:\/\/|\(auth\/|\[code=|error\s*\d{3}\b|^\w+error:/i.test(
      message
    ) || message.length > 220
  );
}

/**
 * Best user-facing message for any thrown value.
 *
 * Order: known code → an already-friendly message we threw ourselves →
 * `fallback`. A raw SDK message is never returned.
 */
export function friendlyErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again."
): string {
  const code = errorCode(error);
  if (code) {
    const mapped = AUTH_MESSAGES[code] ?? FIRESTORE_MESSAGES[code];
    if (mapped) return mapped;
  }

  const message = rawMessage(error).trim();
  if (message && !looksTechnical(message)) return message;

  // Un-mapped code, but we can still say something truthful about the shape.
  switch (classifyError(error)) {
    case "network":
      return "Couldn't reach the server. Check your connection and try again.";
    case "permission":
      return "You don't have access to this.";
    case "auth":
      return "Your session expired. Sign in again to continue.";
    default:
      return fallback;
  }
}

// ─── Logging ──────────────────────────────────────────────────────────────────

const REDACTED = "[redacted]";

/**
 * `__DEV__` is injected by the React Native bundler and is absent under plain
 * Node (unit tests, scripts), where referencing it bare would throw.
 */
const isDev = (): boolean =>
  typeof __DEV__ !== "undefined" ? __DEV__ : process.env.NODE_ENV !== "production";

/** Keys whose values must never reach a log sink. */
const SENSITIVE_KEY = /token|password|secret|credential|apikey|api_key|authorization|cookie|email|phone|otp|pin|body|idtoken/i;

function redactString(value: string): string {
  return (
    value
      // querystrings frequently carry ids/tokens
      .replace(/([?&][^=&\s]+)=[^&\s]+/g, `$1=${REDACTED}`)
      // bearer tokens / long opaque blobs
      .replace(/\b(?:bearer\s+)?[A-Za-z0-9_-]{24,}\.[A-Za-z0-9._-]{16,}\b/gi, REDACTED)
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, REDACTED)
  );
}

/**
 * Reduce an error to the parts that are safe to write out: name, code and a
 * redacted message. Firebase attaches `customData` (which can hold the email
 * that was attempted) — it is dropped entirely rather than filtered.
 */
export function safeErrorDetails(error: unknown): {
  name?: string;
  code?: string;
  message: string;
  kind: ErrorKind;
} {
  const code = errorCode(error);
  const name =
    error && typeof error === "object" && typeof (error as CodedError).name === "string"
      ? ((error as CodedError).name as string)
      : undefined;

  return {
    name,
    code,
    message: redactString(rawMessage(error) || String(error ?? "")).slice(0, 300),
    kind: classifyError(error),
  };
}

/** Extra context supplied by a call site. Values are redacted by key name. */
export type ErrorContext = Record<string, unknown>;

function redactContext(context?: ErrorContext): ErrorContext | undefined {
  if (!context) return undefined;
  const out: ErrorContext = {};
  for (const [key, value] of Object.entries(context)) {
    if (SENSITIVE_KEY.test(key)) {
      out[key] = REDACTED;
    } else if (typeof value === "string") {
      out[key] = redactString(value);
    } else if (typeof value === "number" || typeof value === "boolean" || value == null) {
      out[key] = value;
    } else {
      // Objects can hide anything; record only that something was passed.
      out[key] = "[object]";
    }
  }
  return out;
}

/**
 * The only sanctioned way to log an error.
 *
 * `scope` is a stable identifier like `"auth.login"` so logs stay greppable.
 * In development the original error is appended so stack traces stay usable;
 * release builds get the redacted summary only.
 */
export function logError(scope: string, error: unknown, context?: ErrorContext): void {
  const details = safeErrorDetails(error);
  const payload = { scope, ...details, ...redactContext(context) };

  if (isDev()) {
    console.error(`[${scope}]`, payload, error);
    return;
  }
  console.error(`[${scope}]`, payload);
}

/** Non-fatal counterpart of `logError` — same redaction, lower severity. */
export function logWarning(scope: string, error: unknown, context?: ErrorContext): void {
  const payload = { scope, ...safeErrorDetails(error), ...redactContext(context) };
  if (isDev()) {
    console.warn(`[${scope}]`, payload, error);
    return;
  }
  console.warn(`[${scope}]`, payload);
}
