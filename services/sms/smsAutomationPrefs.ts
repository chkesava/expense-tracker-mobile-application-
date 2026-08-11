/**
 * Device-local SMS automation preferences (AsyncStorage).
 * Defaults live here as plain data so unit tests can import without RN.
 */

export type SmsAutomationPrefs = {
  /** Master switch for SMS-based expense tracking */
  enabled: boolean;
  /** When true (and reviewBeforeAdding is false), commit without prompting */
  autoAdd: boolean;
  /** When true, park candidates for user review before commit */
  reviewBeforeAdding: boolean;
};

export const SMS_AUTOMATION_PREFS_DEFAULTS: SmsAutomationPrefs = {
  enabled: false,
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

export async function loadSmsAutomationPrefs(): Promise<SmsAutomationPrefs> {
  try {
    const AsyncStorage = (
      await import("@react-native-async-storage/async-storage")
    ).default;
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...SMS_AUTOMATION_PREFS_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<SmsAutomationPrefs>;
    return {
      enabled: Boolean(parsed.enabled),
      autoAdd: Boolean(parsed.autoAdd),
      reviewBeforeAdding:
        parsed.reviewBeforeAdding === undefined
          ? SMS_AUTOMATION_PREFS_DEFAULTS.reviewBeforeAdding
          : Boolean(parsed.reviewBeforeAdding),
    };
  } catch {
    return { ...SMS_AUTOMATION_PREFS_DEFAULTS };
  }
}

export async function saveSmsAutomationPrefs(
  prefs: SmsAutomationPrefs
): Promise<void> {
  const AsyncStorage = (
    await import("@react-native-async-storage/async-storage")
  ).default;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  notifyPrefsListeners(prefs);
}

export async function updateSmsAutomationPrefs(
  patch: Partial<SmsAutomationPrefs>
): Promise<SmsAutomationPrefs> {
  const current = await loadSmsAutomationPrefs();
  const next: SmsAutomationPrefs = { ...current, ...patch };
  await saveSmsAutomationPrefs(next);
  return next;
}
