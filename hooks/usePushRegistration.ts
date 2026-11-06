/**
 * Keeps this install registered for Spendly push while a user is signed in
 * (SPENDLY-224). Mounted once in the Expense app shell, so Ganesh and
 * Nutrition never register.
 *
 * Runs on sign-in, whenever the app returns to the foreground (which also
 * picks up permission granted later, e.g. from the bill reminder settings),
 * and when the OS rotates the push token. Writes are throttled in
 * lib/pushRegistration, so frequent triggers are cheap. Never prompts.
 */

import { useEffect } from "react";
import { AppState, Platform } from "react-native";

import { registerPushDevice } from "@/lib/pushRegistration";
import { useAuth } from "@/providers/AuthProvider";

export function usePushRegistration() {
  const { realUser, isDuress } = useAuth();
  const uid = realUser?.uid ?? null;

  useEffect(() => {
    if (!uid || Platform.OS === "web") return;
    let cancelled = false;
    let running: Promise<unknown> | null = null;

    const run = () => {
      if (cancelled || running) return;
      running = registerPushDevice(uid, { duress: isDuress }).finally(() => {
        running = null;
      });
    };

    run();
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") run();
    });

    let tokenSub: { remove: () => void } | undefined;
    void import("expo-notifications")
      .then((Notifications) => {
        if (cancelled) return;
        tokenSub = Notifications.addPushTokenListener(() => run());
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      appState.remove();
      tokenSub?.remove();
    };
  }, [uid, isDuress]);
}
