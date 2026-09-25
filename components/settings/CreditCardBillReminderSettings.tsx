import { useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { Bell } from "lucide-react-native";

import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { useSettings } from "@/providers/SettingsProvider";
import { requestBillNotificationPermission } from "@/services/creditCardBills/billReminderScheduler";
import { useTheme } from "@/theme/ThemeProvider";
import { haptic } from "@/lib/haptics";

const DAY_OPTIONS = [7, 3, 1] as const;
const OVERDUE_OPTIONS = [1, 2, 3] as const;

/**
 * Quiet hours were honoured by the scheduler and shown to the user as prose,
 * with no way to change them. These are the editable bounds.
 */
const QUIET_START_OPTIONS = ["06:00", "07:00", "08:00", "09:00", "10:00"] as const;
const QUIET_END_OPTIONS = ["18:00", "20:00", "21:00", "22:00", "23:00"] as const;

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
          <Switch
            value={prefs.enabled}
            onValueChange={async (enabled) => {
              setCreditCardBillReminders({ enabled });
              if (enabled) {
                const ok = await requestBillNotificationPermission();
                setPermHint(
                  ok
                    ? null
                    : "Notification permission is off — enable it in system settings."
                );
              }
            }}
            trackColor={{ true: theme.colors.primary }}
          />
        </View>

        <Text style={{ color: theme.colors.mutedForeground, fontSize: theme.typography.sm }}>
          Reminders fire on the calendar day chosen in your timezone (
          {settings.timezone}), at the start of your quiet-hours window.
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
          <Switch
            value={prefs.onDueDate}
            disabled={!prefs.enabled}
            onValueChange={(onDueDate) =>
              setCreditCardBillReminders({ onDueDate })
            }
            trackColor={{ true: theme.colors.primary }}
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

        <Text style={{ color: theme.colors.foreground, fontWeight: "600" }}>
          Quiet hours
        </Text>
        <Text
          style={{
            color: theme.colors.mutedForeground,
            fontSize: theme.typography.sm,
          }}
        >
          Reminders are held until the start of this window and never fire after
          it ends.
        </Text>
        <View style={styles.row}>
          {QUIET_START_OPTIONS.map((time) => (
            <TimePill
              key={`start-${time}`}
              label={`From ${time}`}
              selected={prefs.quietHoursStart === time}
              disabled={!prefs.enabled}
              onPress={() => {
                void haptic.selection();
                setCreditCardBillReminders({ quietHoursStart: time });
              }}
            />
          ))}
        </View>
        <View style={styles.row}>
          {QUIET_END_OPTIONS.map((time) => (
            <TimePill
              key={`end-${time}`}
              label={`Until ${time}`}
              selected={prefs.quietHoursEnd === time}
              disabled={!prefs.enabled}
              onPress={() => {
                void haptic.selection();
                setCreditCardBillReminders({ quietHoursEnd: time });
              }}
            />
          ))}
        </View>
      </View>
    </Card>
  );
}

function TimePill({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Chip
      label={label}
      selected={selected}
      onPress={onPress}
      disabled={disabled}
    />
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
