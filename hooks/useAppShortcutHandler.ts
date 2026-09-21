/**
 * Registers Spendly icon shortcuts and applies a pending one after the
 * privacy lock is down. Does not use useQuickActionRouting — that navigates
 * immediately via href and cannot wait for auth / open the add modal.
 */

import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useRouter } from "expo-router";

import { ACTIVE_PRODUCT } from "@/lib/activeProduct";
import { logWarning } from "@/lib/errors";
import {
  hasPendingAppShortcut,
  peekPendingAppShortcut,
  setPendingAppShortcut,
  takePendingAppShortcut,
  subscribePendingAppShortcut,
} from "@/lib/pendingAppShortcut";
import { privacySession } from "@/lib/privacySession";
import { logShortcutEvent } from "@/lib/shortcutTelemetry";
import { usePrivacyPin } from "@/providers/PrivacyPinProvider";
import { useModals } from "@/providers/ModalProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import {
  listSpendlyShortcuts,
  resolveShortcutAction,
  shouldRegisterSpendlyShortcuts,
  type ShortcutPlatform,
} from "@/shared/config/appShortcuts";

let capturedInitial = false;

function shortcutPlatform(): ShortcutPlatform {
  if (Platform.OS === "ios" || Platform.OS === "android") return Platform.OS;
  return "web";
}

function canApplyShortcut(pinReady: boolean, hasRealPin: boolean): boolean {
  if (!pinReady) return false;
  if (!hasRealPin) return true;
  return privacySession.isUnlocked();
}

function captureInitialShortcutOnce() {
  if (capturedInitial) return;
  capturedInitial = true;
  if (Platform.OS === "web") return;
  if (!shouldRegisterSpendlyShortcuts(ACTIVE_PRODUCT)) return;
  try {
    // Sync read so route restoration (async) sees the pending action.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const QuickActions = require("expo-quick-actions") as typeof import("expo-quick-actions");
    const initial = QuickActions.initial;
    if (initial?.id) {
      setPendingAppShortcut({
        id: String(initial.id),
        platform: shortcutPlatform(),
        launch: "cold",
      });
    }
  } catch (error) {
    logWarning("appShortcuts.captureInitial", error);
  }
}

async function registerSpendlyQuickActions(enableAIFeatures: boolean) {
  if (Platform.OS === "web") return;
  if (!shouldRegisterSpendlyShortcuts(ACTIVE_PRODUCT)) return;
  try {
    const QuickActions = await import("expo-quick-actions");
    const items = listSpendlyShortcuts({ enableAIFeatures }).map((shortcut) => ({
      id: shortcut.id,
      title: shortcut.title,
      subtitle: shortcut.subtitle,
      icon: Platform.OS === "ios" ? shortcut.iosIcon : shortcut.androidIcon,
      params: { shortcutId: shortcut.id },
    }));
    // iOS static iosActions already show all four. Only call setItems there
    // when we need to drop receipt (AI off); otherwise Android-only.
    if (Platform.OS === "ios" && enableAIFeatures) return;
    await QuickActions.setItems(items);
  } catch (error) {
    logWarning("appShortcuts.setItems", error);
  }
}

export function useAppShortcutHandler() {
  captureInitialShortcutOnce();

  const { replace } = useRouter();
  const { settings } = useSystemSettings();
  const { ready: pinReady, hasRealPin } = usePrivacyPin();
  const {
    setIsAddExpenseOpen,
    setAddTransactionKind,
    setIsReceiptScannerOpen,
    setEditingExpense,
    setEditingIncome,
    setIsAddSheetOpen,
  } = useModals();
  const applyingRef = useRef(false);

  useEffect(() => {
    void registerSpendlyQuickActions(settings.enableAIFeatures);
  }, [settings.enableAIFeatures]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!shouldRegisterSpendlyShortcuts(ACTIVE_PRODUCT)) return;

    let subscription: { remove: () => void } | undefined;
    let cancelled = false;

    void import("expo-quick-actions")
      .then((QuickActions) => {
        if (cancelled) return;
        subscription = QuickActions.addListener((action) => {
          if (!action?.id) return;
          setPendingAppShortcut({
            id: String(action.id),
            platform: shortcutPlatform(),
            launch: "warm",
          });
        });
      })
      .catch((error) => {
        logWarning("appShortcuts.listen", error);
      });

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, []);

  useEffect(() => {
    const apply = () => {
      if (applyingRef.current) return;
      if (!canApplyShortcut(pinReady, hasRealPin)) return;
      if (!hasPendingAppShortcut()) return;

      const pending = peekPendingAppShortcut();
      if (!pending) return;
      applyingRef.current = true;
      const taken = takePendingAppShortcut();
      applyingRef.current = false;
      if (!taken) return;

      const resolved = resolveShortcutAction(taken.id, {
        enableAIFeatures: settings.enableAIFeatures,
      });

      if (resolved.kind === "open-add") {
        setIsAddSheetOpen(false);
        setEditingExpense(null);
        setEditingIncome(null);
        setAddTransactionKind(resolved.transactionKind);
        setIsReceiptScannerOpen(resolved.openReceipt);
        setIsAddExpenseOpen(true);
      } else {
        setIsAddExpenseOpen(false);
        setIsReceiptScannerOpen(false);
        replace(resolved.href as never);
      }

      logShortcutEvent({
        shortcutId: taken.id,
        platform: taken.platform,
        launch: taken.launch,
        destination: resolved.destination,
        result: resolved.result,
      });
    };

    apply();
    const unsubscribePending = subscribePendingAppShortcut(apply);
    const unsubscribeLock = privacySession.subscribe(apply);
    return () => {
      unsubscribePending();
      unsubscribeLock();
    };
  }, [
    pinReady,
    hasRealPin,
    settings.enableAIFeatures,
    replace,
    setAddTransactionKind,
    setEditingExpense,
    setEditingIncome,
    setIsAddExpenseOpen,
    setIsAddSheetOpen,
    setIsReceiptScannerOpen,
  ]);
}
