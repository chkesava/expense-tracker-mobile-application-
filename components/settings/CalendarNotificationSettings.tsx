import { useState } from "react";
import { Text, View } from "react-native";
import { CalendarDays } from "lucide-react-native";

import { ChipRow, RowSwitch } from "@/components/settings/SettingsControls";
import { Card } from "@/components/ui/Card";
import { useSettings } from "@/providers/SettingsProvider";
import { requestCalendarNotificationPermission } from "@/services/calendar/calendarNotificationScheduler";
import { useTheme } from "@/theme/ThemeProvider";

const QUIET_START = ["06:00", "07:00", "08:00", "09:00", "10:00"] as const;
const QUIET_END = ["18:00", "20:00", "21:00", "22:00", "23:00"] as const;

/**
 * Financial Calendar notification settings (SPENDLY-184). Card bills keep
 * their own settings above, so nothing is notified twice.
 */
export function CalendarNotificationSettings() {
  const { theme } = useTheme();
  const { settings, setCalendarNotifications } = useSettings();
  const prefs = settings.calendarNotifications;
  const [hint, setHint] = useState<string | null>(null);
  const muted = { color: theme.colors.mutedForeground, fontSize: theme.typography.xs };

  const enable = async (patch: Parameters<typeof setCalendarNotifications>[0]) => {
    setCalendarNotifications(patch);
    const ok = await requestCalendarNotificationPermission();
    setHint(ok ? null : "Notifications are off for Spendly in your phone's settings, so these can't be shown.");
  };

  return (
    <Card>
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <CalendarDays size={18} color={theme.colors.primary} />
          <Text style={{ color: theme.colors.foreground, fontWeight: "700", fontSize: theme.typography.md, flex: 1 }}>Financial calendar</Text>
        </View>
        <RowSwitch
          label="My reminders"
          description="Notify me about reminders I add to the calendar, using each reminder's own timing."
          value={prefs.remindersEnabled}
          onValueChange={(v) => (v ? void enable({ remindersEnabled: true }) : setCalendarNotifications({ remindersEnabled: false }))}
        />
        <RowSwitch
          label="Loans, money owed and recurring payments"
          description="Due dates for borrowings, money owed to you, subscriptions and EMIs. Card bills use the setting above."
          value={prefs.duesEnabled}
          onValueChange={(v) => (v ? void enable({ duesEnabled: true }) : setCalendarNotifications({ duesEnabled: false }))}
        />
        {prefs.duesEnabled ? (
          <View style={{ gap: 6 }}>
            <Text style={muted}>Notify before the due date</Text>
            <ChipRow<string>
              options={[
                { value: "0", label: "On the day" },
                { value: "1", label: "1 day before" },
                { value: "3", label: "3 days before" },
              ]}
              selected={String(prefs.duesDaysBefore)}
              onSelect={(v) => setCalendarNotifications({ duesDaysBefore: Number(v) as 0 | 1 | 3 })}
            />
          </View>
        ) : null}
        <View style={{ gap: 6 }}>
          <Text style={muted}>Quiet hours: not before</Text>
          <ChipRow<string> options={QUIET_START.map((t) => ({ value: t, label: t }))} selected={prefs.quietHoursStart} onSelect={(v) => setCalendarNotifications({ quietHoursStart: v })} />
          <Text style={muted}>…and not after</Text>
          <ChipRow<string> options={QUIET_END.map((t) => ({ value: t, label: t }))} selected={prefs.quietHoursEnd} onSelect={(v) => setCalendarNotifications({ quietHoursEnd: v })} />
        </View>
        <Text style={muted}>One notice before, one on the day, and one the day after if it's still open. Done or cancelled items stop notifying.</Text>
        {hint ? <Text style={[muted, { color: theme.colors.destructive }]}>{hint}</Text> : null}
      </View>
    </Card>
  );
}
