/**
 * SPENDLY-636 — the one-time "please sign in again" moment when native builds
 * move to the native Firebase SDK (decision logic:
 * `shared/utils/nativeAuthMigration.ts`).
 *
 * On for native builds since SPENDLY-638 (`lib/nativeAuthFlag.native.ts`):
 * the hook reads the leftover JS-SDK session record, shows the note on the
 * sign-in screen, and removes the record once it is no longer needed.
 */

import { useCallback, useEffect, useState } from "react";

import { env, isLocalTestMode } from "@/lib/env";
import { NATIVE_AUTH_ENABLED } from "@/lib/nativeAuthFlag";
import { logWarning } from "@/lib/errors";
import {
  legacyAuthSessionKey,
  nativeAuthMigrationDecision,
  type NativeAuthMigrationDecision,
} from "@/shared/utils/nativeAuthMigration";

export { NATIVE_AUTH_ENABLED };

const NOTICE_DISMISSED_KEY = "spendly.nativeAuthMigration.noticeDismissed.v1";

async function getStorage() {
  return (await import("@react-native-async-storage/async-storage")).default;
}

function sessionKey(): string {
  // Spendly Test's JS SDK runs with the demo key (lib/firebase.ts).
  return legacyAuthSessionKey(isLocalTestMode() ? "demo-api-key" : env.firebase.apiKey);
}

const NOTHING: NativeAuthMigrationDecision = { showReSignInNotice: false, clearLegacySession: false };

/** Reads the device state and applies the decision. Never rejects. */
export async function resolveNativeAuthMigration(input: {
  enabled: boolean;
  nativeUserPresent: boolean;
}): Promise<NativeAuthMigrationDecision> {
  if (!input.enabled) return NOTHING;
  try {
    const storage = await getStorage();
    const [legacy, dismissed] = await Promise.all([
      storage.getItem(sessionKey()),
      storage.getItem(NOTICE_DISMISSED_KEY),
    ]);
    const decision = nativeAuthMigrationDecision({
      nativeAuthEnabled: true,
      nativeUserPresent: input.nativeUserPresent,
      legacySessionPresent: legacy !== null,
      noticeDismissed: dismissed === "1",
    });
    if (decision.clearLegacySession) await storage.removeItem(sessionKey());
    return decision;
  } catch (error) {
    logWarning("nativeAuthMigration.resolve", error);
    return NOTHING;
  }
}

/** For the sign-in screen: whether to show the one-time note, and how to dismiss it. */
export function useReSignInNotice(nativeUserPresent: boolean, enabled: boolean = NATIVE_AUTH_ENABLED) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void resolveNativeAuthMigration({ enabled, nativeUserPresent }).then((decision) => {
      if (!cancelled) setVisible(decision.showReSignInNotice);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, nativeUserPresent]);

  const dismiss = useCallback(() => {
    setVisible(false);
    void (async () => {
      try {
        const storage = await getStorage();
        await storage.setItem(NOTICE_DISMISSED_KEY, "1");
        await storage.removeItem(sessionKey());
      } catch (error) {
        logWarning("nativeAuthMigration.dismiss", error);
      }
    })();
  }, []);

  return { visible, dismiss };
}
