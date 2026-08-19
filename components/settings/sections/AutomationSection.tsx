import { View } from "react-native";

import { CreditCardBillReminderSettings } from "@/components/settings/CreditCardBillReminderSettings";
import { AutoCategorizationRulesManager } from "@/components/settings/SettingsSubmenus";
import { SmsAutomationSettings } from "@/components/settings/SmsAutomationSettings";

export function AutomationSection() {
  return (
    <View style={{ gap: 16 }}>
      <SmsAutomationSettings />
      <CreditCardBillReminderSettings />
      <AutoCategorizationRulesManager />
    </View>
  );
}
