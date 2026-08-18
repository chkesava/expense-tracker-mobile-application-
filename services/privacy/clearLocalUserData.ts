import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import { lastRouteStorageKey } from "@/shared/config/routeRestoration";
import { SMS_AUTOMATION_PREFS_DEFAULTS, saveSmsAutomationPrefs } from "@/services/sms/smsAutomationPrefs";
import { SMS_INBOUND_STATUS_DEFAULTS, saveSmsInboundStatus } from "@/services/sms/smsInboundStatus";

const BIOMETRIC_KEY = "vault_biometric_id";

const SMS_KEYS = [
  "vault_sms_automation_prefs_v1",
  "vault_sms_review_inbox_v1",
  "vault_sms_dedupe_keys_v1",
  "vault_sms_recurring_dismissed_v1",
  "vault_sms_recurring_occurrences_v1",
  "vault_sms_inbound_status_v1",
];

export async function clearSmsLocalStores(): Promise<void> {
  await saveSmsAutomationPrefs({ ...SMS_AUTOMATION_PREFS_DEFAULTS });
  await saveSmsInboundStatus({ ...SMS_INBOUND_STATUS_DEFAULTS });
  await AsyncStorage.multiRemove(SMS_KEYS).catch(() => undefined);
}

export async function clearLocalUserData(uid: string): Promise<void> {
  await clearSmsLocalStores();
  const extra = [
    lastRouteStorageKey(uid),
    `ai_advisor_chat_${uid}_real`,
    `ai_advisor_chat_${uid}_duress`,
    "@active_workspace",
  ];
  await AsyncStorage.multiRemove(extra).catch(() => undefined);
  try {
    await SecureStore.deleteItemAsync(BIOMETRIC_KEY);
  } catch {
    /* ignore */
  }
}
