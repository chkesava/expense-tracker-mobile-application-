import { useState } from "react";
import { Text, View } from "react-native";
import { CalendarDays } from "lucide-react-native";

import { ChipRow, RowSwitch } from "@/components/settings/SettingsControls";
import { Card } from "@/components/ui/Card";
import { useSettings } from "@/providers/SettingsProvider";
import { useTaxCenterFlag } from "@/hooks/useTaxCenterEnabled";
import { askForNotifications } from "@/lib/notificationPermission";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Financial Calendar notification settings (SPENDLY-184). Card bills keep
 * their own settings above, so nothing is notified twice.
 */
export function CalendarNotificationSettings() {
  const { theme } = useTheme();
  const { settings, setCalendarNotifications } = useSettings();
  const prefs = settings.calendarNotifications;
  const [hint, setHint] = useState<string | null>(null);
  const { enabled: taxCenter } = useTaxCenterFlag();
  const muted = { color: theme.colors.mutedForeground, fontSize: theme.typography.xs };

  const enable = async (patch: Parameters<typeof setCalendarNotifications>[0]) => {
    setCalendarNotifications(patch);
    // SPENDLY-225: explained first; "Open settings" if the phone won't ask again.
    const ok = await askForNotifications("calendar");
    setHint(ok ? null : "Notifications aren't allowed yet. Turn them on from Notifications, above, to get these.");
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
        <RowSwitch
          label="Salary & expected paydays"
          description="Remind me before and on expected paydays, and alert me if a paycheck appears late."
          value={prefs.salaryEnabled}
          onValueChange={(v) => (v ? void enable({ salaryEnabled: true }) : setCalendarNotifications({ salaryEnabled: false }))}
        />
        {prefs.salaryEnabled ? (
          <View style={{ gap: 6 }}>
            <Text style={muted}>Notify before expected payday</Text>
            <ChipRow<string>
              options={[
                { value: "0", label: "On the day" },
                { value: "1", label: "1 day before" },
                { value: "3", label: "3 days before" },
              ]}
              selected={String(prefs.salaryDaysBefore)}
              onSelect={(v) => setCalendarNotifications({ salaryDaysBefore: Number(v) as 0 | 1 | 3 })}
            />
          </View>
        ) : null}
        {taxCenter ? (
          <>
            <RowSwitch
              label="Tax deadlines"
              description="Advance-tax instalments, Form 16 and return dates from your tax center. No amounts are shown."
              value={prefs.taxEnabled}
              onValueChange={(v) => (v ? void enable({ taxEnabled: true }) : setCalendarNotifications({ taxEnabled: false }))}
            />
            {prefs.taxEnabled ? (
              <View style={{ gap: 6 }}>
                <Text style={muted}>Notify before a tax deadline</Text>
                <ChipRow<string>
                  options={[
                    { value: "1", label: "1 day before" },
                    { value: "3", label: "3 days before" },
                    { value: "7", label: "A week before" },
                  ]}
                  selected={String(prefs.taxDaysBefore)}
                  onSelect={(v) => setCalendarNotifications({ taxDaysBefore: Number(v) as 1 | 3 | 7 })}
                />
              </View>
            ) : null}
          </>
        ) : null}
        <Text style={muted}>Sent inside your notification window (Notifications, above). One notice before, one on the day, and one the day after if it's still open. Done or cancelled items stop notifying.</Text>
        {hint ? <Text style={[muted, { color: theme.colors.destructive }]}>{hint}</Text> : null}
      </View>
    </Card>
  );
}
