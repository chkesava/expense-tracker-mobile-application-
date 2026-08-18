import { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Bell } from "lucide-react-native";

import { NotificationConsentDialog } from "@/components/privacy/NotificationConsentDialog";
import { Card } from "@/components/ui/Card";
import { useDpdpConsent } from "@/hooks/useDpdpConsent";
import { useSettings } from "@/providers/SettingsProvider";
import { requestBillNotificationPermission } from "@/services/creditCardBills/billReminderScheduler";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

const DAY_OPTIONS = [7, 3, 1] as const;
const OVERDUE_OPTIONS = [1, 2, 3] as const;

export function CreditCardBillReminderSettings() {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { settings, setCreditCardBillReminders } = useSettings();
  const prefs = settings.creditCardBillReminders;
  const [permHint, setPermHint] = useState<string | null>(null);
  const [notifyConsentOpen, setNotifyConsentOpen] = useState(false);
  const { purposes, setPurposes } = useDpdpConsent();

  const toggleDay = (day: number) => {
    Haptics.selectionAsync().catch(() => undefined);
    const has = prefs.daysBefore.includes(day);
    const daysBefore = has
      ? prefs.daysBefore.filter((d) => d !== day)
      : [...prefs.daysBefore, day].sort((a, b) => b - a);
    setCreditCardBillReminders({ daysBefore });
  };

  return (
    <>
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
              if (enabled && !purposes.notifications) {
                setNotifyConsentOpen(true);
                return;
              }
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
          Local reminders use your timezone ({settings.timezone}). Quiet hours:{" "}
          {prefs.quietHoursStart}–{prefs.quietHoursEnd}.
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
              <Pressable
                key={day}
                disabled={!prefs.enabled}
                onPress={() => toggleDay(day)}
                style={[
                  styles.pill,
                  {
                    opacity: prefs.enabled ? 1 : 0.5,
                    backgroundColor: selected
                      ? theme.colors.primary
                      : isDark
                        ? "rgba(255,255,255,0.06)"
                        : "rgba(0,0,0,0.04)",
                    borderColor: selected
                      ? theme.colors.primary
                      : theme.colors.border,
                  },
                ]}
              >
                <Text
                  style={{
                    color: selected ? "#fff" : theme.colors.foreground,
                    fontSize: theme.typography.sm,
                  }}
                >
                  {day}d before
                </Text>
              </Pressable>
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
              <Pressable
                key={n}
                disabled={!prefs.enabled}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => undefined);
                  setCreditCardBillReminders({
                    overdueEveryDays: n as 1 | 2 | 3,
                  });
                }}
                style={[
                  styles.pill,
                  {
                    opacity: prefs.enabled ? 1 : 0.5,
                    backgroundColor: selected
                      ? theme.colors.primary
                      : isDark
                        ? "rgba(255,255,255,0.06)"
                        : "rgba(0,0,0,0.04)",
                    borderColor: selected
                      ? theme.colors.primary
                      : theme.colors.border,
                  },
                ]}
              >
                <Text
                  style={{
                    color: selected ? "#fff" : theme.colors.foreground,
                    fontSize: theme.typography.sm,
                  }}
                >
                  Every {n}d
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Card>
    <NotificationConsentDialog
      isOpen={notifyConsentOpen}
      onClose={() => setNotifyConsentOpen(false)}
      onConfirm={() => {
        void (async () => {
          await setPurposes({ notifications: true });
          setCreditCardBillReminders({ enabled: true });
          const ok = await requestBillNotificationPermission();
          setPermHint(
            ok
              ? null
              : "Notification permission is off — enable it in system settings."
          );
          setNotifyConsentOpen(false);
        })();
      }}
    />
    </>
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
