import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Bell } from "lucide-react-native";

import { ThemedSwitch } from "@/components/settings/SettingsControls";

import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { useSettings } from "@/providers/SettingsProvider";
import { askForNotifications } from "@/lib/notificationPermission";
import { useTheme } from "@/theme/ThemeProvider";
import { haptic } from "@/lib/haptics";

const DAY_OPTIONS = [7, 3, 1] as const;
const OVERDUE_OPTIONS = [1, 2, 3] as const;

export function CreditCardBillReminderSettings() {
  const { theme } = useTheme();
  const { settings, setCreditCardBillReminders } = useSettings();
  const prefs = settings.creditCardBillReminders;
  const [permHint, setPermHint] = useState<string | null>(null);

  const toggleDay = (day: number) => {
    haptic.selection().catch(() => undefined);
    const has = prefs.daysBefore.includes(day);
    const daysBefore = has
      ? prefs.daysBefore.filter((d) => d !== day)
      : [...prefs.daysBefore, day].sort((a, b) => b - a);
    setCreditCardBillReminders({ daysBefore });
  };

  return (
    <Card>
      <View style={{ gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Bell size={18} color={theme.colors.primary} />
          <Text
            style={{
              color: theme.colors.foreground,
              fontWeight: "700",
              fontSize: theme.typography.md,
              flex: 1,
            }}
          >
            Credit Card Bills
          </Text>
          <ThemedSwitch
            value={prefs.enabled}
            onValueChange={async (enabled) => {
              setCreditCardBillReminders({ enabled });
              if (enabled) {
                // SPENDLY-225: explained first; "Open settings" if the phone won't ask again.
                const ok = await askForNotifications("bills");
                setPermHint(
                  ok
                    ? null
                    : "Notifications aren't allowed yet. Turn them on from Notifications, above, to get these reminders."
                );
              }
            }}
          />
        </View>

        <Text style={{ color: theme.colors.mutedForeground, fontSize: theme.typography.sm }}>
          Reminders fire on the calendar day chosen in your timezone (
          {settings.timezone}), at the start of your notification window (Notifications, above).
        </Text>

        {permHint ? (
          <Text style={{ color: theme.colors.destructive, fontSize: theme.typography.sm }}>
            {permHint}
          </Text>
        ) : null}

        <Text style={{ color: theme.colors.foreground, fontWeight: "600" }}>
          Remind me
        </Text>
        <View style={styles.row}>
          {DAY_OPTIONS.map((day) => {
            const selected = prefs.daysBefore.includes(day);
            return (
              <Chip
                key={day}
                label={`${day}d before`}
                selected={selected}
                appearance="outline"
                onPress={() => toggleDay(day)}
                disabled={!prefs.enabled}
              />
            );
          })}
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={{ color: theme.colors.foreground }}>On due date</Text>
          <ThemedSwitch
            value={prefs.onDueDate}
            disabled={!prefs.enabled}
            onValueChange={(onDueDate) =>
              setCreditCardBillReminders({ onDueDate })
            }
          />
        </View>

        <Text style={{ color: theme.colors.foreground, fontWeight: "600" }}>
          Overdue frequency
        </Text>
        <View style={styles.row}>
          {OVERDUE_OPTIONS.map((n) => {
            const selected = prefs.overdueEveryDays === n;
            return (
              <Chip
                key={n}
                label={`Every ${n}d`}
                selected={selected}
                appearance="outline"
                onPress={() => {
                  setCreditCardBillReminders({
                    overdueEveryDays: n as 1 | 2 | 3,
                  });
                }}
                disabled={!prefs.enabled}
              />
            );
          })}
        </View>

      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: "continuous",
  },
});
