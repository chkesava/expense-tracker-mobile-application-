/**
 * Spendly home-screen Quick Actions / App Shortcuts.
 *
 * Identifiers are the routing keys — never the display labels. Adding a new
 * action: extend `APP_SHORTCUT_IDS` + `SPENDLY_SHORTCUTS` here, add the same
 * id to the expo-quick-actions `iosActions` in app.json / products/expense.json,
 * handle it in `resolveShortcutAction`, then apply it in useAppShortcutHandler.
 *
 * `qr.open` is intentionally absent: Spendly has no scan-to-pay destination.
 */

import type { Product } from "@/lib/activeProduct";

export const APP_SHORTCUT_IDS = [
  "expense.add",
  "income.add",
  "receipt.add",
  "accounts.open",
] as const;

export type AppShortcutId = (typeof APP_SHORTCUT_IDS)[number];

export type ShortcutLaunch = "cold" | "warm";

export type ShortcutPlatform = "ios" | "android" | "web";

export type ShortcutDefinition = {
  id: AppShortcutId;
  title: string;
  subtitle: string;
  /** iOS SF Symbol / built-in Quick Action icon name. */
  iosIcon: string;
  /** Android adaptive-icon key registered by the expo-quick-actions plugin. */
  androidIcon: string;
};

export const SPENDLY_SHORTCUTS: readonly ShortcutDefinition[] = [
  {
    id: "expense.add",
    title: "Add Expense",
    subtitle: "Log a new expense",
    iosIcon: "add",
    androidIcon: "shortcut_expense",
  },
  {
    id: "income.add",
    title: "Add Income",
    subtitle: "Log a new income",
    iosIcon: "compose",
    androidIcon: "shortcut_income",
  },
  {
    id: "receipt.add",
    title: "Scan Receipt",
    subtitle: "Capture a receipt",
    iosIcon: "capturePhoto",
    androidIcon: "shortcut_receipt",
  },
  {
    id: "accounts.open",
    title: "Accounts",
    subtitle: "Open accounts",
    iosIcon: "home",
    androidIcon: "shortcut_accounts",
  },
];

export const ACCOUNTS_SHORTCUT_HREF = "/ledger?tab=accounts";
export const SHORTCUT_FALLBACK_HREF = "/dashboard";

/** Combined (null) and expense-only builds. Never nutrition/ganesh-only. */
export function shouldRegisterSpendlyShortcuts(
  product: Product | null
): boolean {
  return product === null || product === "expense";
}

export function isAppShortcutId(value: string): value is AppShortcutId {
  return (APP_SHORTCUT_IDS as readonly string[]).includes(value);
}

/** Dynamic menu: hide receipt when AI/OCR is off so the action is never dead. */
export function listSpendlyShortcuts(options: {
  enableAIFeatures: boolean;
}): ShortcutDefinition[] {
  return SPENDLY_SHORTCUTS.filter(
    (shortcut) => shortcut.id !== "receipt.add" || options.enableAIFeatures
  );
}

export type ResolvedShortcut =
  | {
      id: AppShortcutId;
      kind: "open-add";
      transactionKind: "expense" | "income";
      openReceipt: boolean;
      destination: "add-expense" | "add-income" | "add-receipt";
      result: "success" | "fallback";
    }
  | {
      id: AppShortcutId | string;
      kind: "navigate";
      href: typeof ACCOUNTS_SHORTCUT_HREF | typeof SHORTCUT_FALLBACK_HREF;
      destination: "accounts" | "dashboard";
      result: "success" | "fallback";
    };

/**
 * Maps a stable shortcut id to an existing Spendly destination.
 * Does not open screens — the handler applies this via ModalProvider / router.
 */
export function resolveShortcutAction(
  rawId: string,
  options: { enableAIFeatures: boolean }
): ResolvedShortcut {
  if (rawId === "expense.add") {
    return {
      id: "expense.add",
      kind: "open-add",
      transactionKind: "expense",
      openReceipt: false,
      destination: "add-expense",
      result: "success",
    };
  }
  if (rawId === "income.add") {
    return {
      id: "income.add",
      kind: "open-add",
      transactionKind: "income",
      openReceipt: false,
      destination: "add-income",
      result: "success",
    };
  }
  if (rawId === "receipt.add") {
    if (!options.enableAIFeatures) {
      return {
        id: "receipt.add",
        kind: "open-add",
        transactionKind: "expense",
        openReceipt: false,
        destination: "add-expense",
        result: "fallback",
      };
    }
    return {
      id: "receipt.add",
      kind: "open-add",
      transactionKind: "expense",
      openReceipt: true,
      destination: "add-receipt",
      result: "success",
    };
  }
  if (rawId === "accounts.open") {
    return {
      id: "accounts.open",
      kind: "navigate",
      href: ACCOUNTS_SHORTCUT_HREF,
      destination: "accounts",
      result: "success",
    };
  }
  return {
    id: rawId,
    kind: "navigate",
    href: SHORTCUT_FALLBACK_HREF,
    destination: "dashboard",
    result: "fallback",
  };
}
