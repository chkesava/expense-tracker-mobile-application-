/**
 * Device-local SMS automation preferences (AsyncStorage).
 * Defaults live here as plain data so unit tests can import without RN.
 */

export type SmsHandlingMode = "manual" | "review" | "auto";

export type SmsAutomationPrefs = {
  /** Master switch for SMS-based expense tracking */
  enabled: boolean;
  /** How detected transactions are handled */
  handlingMode: SmsHandlingMode;
  /** Derived: handlingMode === "auto" (kept for older call sites) */
  autoAdd: boolean;
  /** Derived: handlingMode === "review" */
  reviewBeforeAdding: boolean;
};

export const SMS_AUTOMATION_PREFS_DEFAULTS: SmsAutomationPrefs = {
  enabled: false,
  handlingMode: "review",
  autoAdd: false,
  reviewBeforeAdding: true,
};

const STORAGE_KEY = "vault_sms_automation_prefs_v1";

type PrefsListener = (prefs: SmsAutomationPrefs) => void;
const prefsListeners = new Set<PrefsListener>();

export function subscribeSmsAutomationPrefs(listener: PrefsListener): () => void {
  prefsListeners.add(listener);
  return () => {
    prefsListeners.delete(listener);
  };
}

function notifyPrefsListeners(prefs: SmsAutomationPrefs): void {
  for (const listener of prefsListeners) {
    try {
      listener(prefs);
    } catch {
      /* ignore subscriber errors */
    }
  }
}

export function flagsForHandlingMode(mode: SmsHandlingMode): {
  autoAdd: boolean;
  reviewBeforeAdding: boolean;
} {
  return {
    autoAdd: mode === "auto",
    reviewBeforeAdding: mode === "review",
  };
}

export function normalizeSmsAutomationPrefs(
  parsed: Partial<SmsAutomationPrefs> | null | undefined
): SmsAutomationPrefs {
  const enabled = Boolean(parsed?.enabled);
  let handlingMode: SmsHandlingMode;
  if (
    parsed?.handlingMode === "manual" ||
    parsed?.handlingMode === "review" ||
    parsed?.handlingMode === "auto"
  ) {
    handlingMode = parsed.handlingMode;
  } else if (parsed?.autoAdd) {
    handlingMode = "auto";
  } else if (parsed?.reviewBeforeAdding === false) {
    handlingMode = "manual";
  } else {
    handlingMode = "review";
  }
  return {
    enabled,
    handlingMode,
    ...flagsForHandlingMode(handlingMode),
  };
}

export async function loadSmsAutomationPrefs(): Promise<SmsAutomationPrefs> {
  try {
    const AsyncStorage = (
      await import("@react-native-async-storage/async-storage")
    ).default;
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...SMS_AUTOMATION_PREFS_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<SmsAutomationPrefs>;
    return normalizeSmsAutomationPrefs(parsed);
  } catch {
    return { ...SMS_AUTOMATION_PREFS_DEFAULTS };
  }
}

export async function saveSmsAutomationPrefs(
  prefs: SmsAutomationPrefs
): Promise<void> {
  const normalized = normalizeSmsAutomationPrefs(prefs);
  const AsyncStorage = (
    await import("@react-native-async-storage/async-storage")
  ).default;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  notifyPrefsListeners(normalized);
}

export async function updateSmsAutomationPrefs(
  patch: Partial<SmsAutomationPrefs>
): Promise<SmsAutomationPrefs> {
  const current = await loadSmsAutomationPrefs();
  const next = normalizeSmsAutomationPrefs({ ...current, ...patch });
  await saveSmsAutomationPrefs(next);
  return next;
}
