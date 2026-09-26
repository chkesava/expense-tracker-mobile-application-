/**
 * SPENDLY-175: in a local test build, the only backend the app may reach is
 * the Firebase Local Emulator Suite on the developer's machine. Netlify
 * functions (several run firebase-admin against production), Supabase, market
 * data and third-party APIs are refused here, so a test session cannot cost or
 * touch anything real. Release builds are unaffected: the check is a no-op
 * unless `isLocalTestMode()`.
 *
 * Local reads (`file://`, `content://`, `data:` and similar) always pass;
 * only http(s) requests are checked.
 */
import { env, isLocalTestMode } from "./env";

export class NetworkBlockedInTestMode extends Error {
  constructor(url: string) {
    super(`Blocked in local test mode (no production or third-party calls): ${url}`);
    this.name = "NetworkBlockedInTestMode";
  }
}

/** Host of an http(s) URL, or null for any other scheme. */
function httpHost(url: string): string | null {
  const match = /^https?:\/\/([^/:?#]+)/i.exec(url.trim());
  return match ? match[1].toLowerCase() : null;
}

/** Pure form for tests: is `url` allowed when the emulator runs on `emulatorHost`? */
export function isUrlAllowedInTestMode(url: string, emulatorHost: string): boolean {
  const host = httpHost(url);
  if (host === null) return true;
  return host === emulatorHost.trim().toLowerCase();
}

/** Throws `NetworkBlockedInTestMode` for a disallowed request in a test build. */
export function assertNetworkAllowed(url: string): void {
  if (!isLocalTestMode()) return;
  if (!isUrlAllowedInTestMode(url, env.firebaseEmulatorHost)) {
    throw new NetworkBlockedInTestMode(url);
  }
}
