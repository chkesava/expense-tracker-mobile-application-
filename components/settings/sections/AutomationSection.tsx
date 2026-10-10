import { View } from "react-native";

import { CalendarNotificationSettings } from "@/components/settings/CalendarNotificationSettings";
import { CreditCardBillReminderSettings } from "@/components/settings/CreditCardBillReminderSettings";
import { AutoCategorizationRulesManager } from "@/components/settings/SettingsSubmenus";

export function AutomationSection() {
  return (
    <View style={{ gap: 16 }}>
      <CreditCardBillReminderSettings />
      <CalendarNotificationSettings />
      <AutoCategorizationRulesManager />
    </View>
  );
}
