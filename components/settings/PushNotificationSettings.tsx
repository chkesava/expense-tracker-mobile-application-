import { Text, View } from "react-native";
import { BellRing } from "lucide-react-native";

import { ChipRow, RowSwitch } from "@/components/settings/SettingsControls";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useNotificationPermission } from "@/hooks/useNotificationPermission";
import { askForNotifications, openNotificationSettings } from "@/lib/notificationPermission";
import { useSettings } from "@/providers/SettingsProvider";
import { resolveDeliveryWindow } from "@/shared/utils/pushPreferences";
import { useTheme } from "@/theme/ThemeProvider";

const WINDOW_START = ["06:00", "07:00", "08:00", "09:00", "10:00"] as const;
const WINDOW_END = ["18:00", "20:00", "21:00", "22:00", "23:00"] as const;

/**
 * Spendly notification preferences (SPENDLY-226): the one delivery window
 * every reminder and alert uses, the event types that had no switch of their
 * own, and whether amounts may show on the lock screen. Bill, calendar and
 * goal reminders keep their own switches below and on each goal.
 */
export function PushNotificationSettings() {
  const { theme } = useTheme();
  const { settings, setPushNotifications, setDeliveryWindow } = useSettings();
  const prefs = settings.pushNotifications;
  const current = resolveDeliveryWindow(settings);
  // SPENDLY-225: the phone's permission, shown with the way to fix it.
  const { state: permission, muted, refresh } = useNotificationPermission();
  const mutedText = { color: theme.colors.mutedForeground, fontSize: theme.typography.xs };

  const setCategory = (key: keyof typeof prefs.categories, value: boolean) =>
    setPushNotifications({ categories: { ...prefs.categories, [key]: value } });

  return (
    <Card>
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <BellRing size={18} color={theme.colors.primary} />
          <Text style={{ color: theme.colors.foreground, fontWeight: "700", fontSize: theme.typography.md, flex: 1 }}>
            Notifications
          </Text>
        </View>

        {permission ? (
          <View style={{ gap: 6 }}>
            <Text style={{ color: theme.colors.foreground, fontWeight: "600" }}>
              {permission === "granted"
                ? "Notifications are on"
                : permission === "unavailable"
                  ? "Phone notifications aren't available here"
                  : "Notifications are off"}
            </Text>
            <Text style={mutedText}>
              {permission === "granted"
                ? muted.length
                  ? `Muted in your phone's settings: ${muted.join(", ")}.`
                  : "Spendly can reach you on this phone."
                : permission === "blocked"
                  ? "Your phone won't ask again. Turn on notifications for Spendly in your phone's settings."
                  : permission === "unavailable"
                    ? "Use the Spendly app on your phone to get reminders and updates."
                    : "Allow notifications to get bill reminders and updates on this phone."}
            </Text>
            {permission === "undetermined" || permission === "denied" ? (
              <Button size="sm" onPress={() => void askForNotifications("general").then(() => refresh())}>
                Turn on notifications
              </Button>
            ) : permission === "blocked" || muted.length ? (
              <Button variant="ghost" size="sm" onPress={() => void openNotificationSettings()}>
                Open phone settings
              </Button>
            ) : null}
          </View>
        ) : null}

        <View style={{ gap: 6 }}>
          <Text style={{ color: theme.colors.foreground, fontWeight: "600" }}>When to notify me</Text>
          <Text style={mutedText}>
            Every Spendly reminder and alert arrives inside this window ({settings.timezone}). Anything due outside it
            waits until the window opens.
          </Text>
          <Text style={mutedText}>Not before</Text>
          <ChipRow<string>
            options={WINDOW_START.map((t) => ({ value: t, label: t }))}
            selected={current.start}
            onSelect={(start) => setDeliveryWindow({ start, end: current.end })}
          />
          <Text style={mutedText}>…and not after</Text>
          <ChipRow<string>
            options={WINDOW_END.map((t) => ({ value: t, label: t }))}
            selected={current.end}
            onSelect={(end) => setDeliveryWindow({ start: current.start, end })}
          />
        </View>

        <RowSwitch
          label="SIP and EPF updates"
          description="When a SIP runs, is skipped or fails, and when an EPF credit is expected or late."
          value={prefs.categories.investments}
          onValueChange={(v) => setCategory("investments", v)}
        />
        <RowSwitch
          label="Shared splits and vaults"
          description="When someone else adds, changes or settles something you share, or says they've paid you."
          value={prefs.categories.shared}
          onValueChange={(v) => setCategory("shared", v)}
        />
        <RowSwitch
          label="Price alerts"
          description="When a stock or fund crosses a price you set."
          value={prefs.categories.priceAlerts}
          onValueChange={(v) => setCategory("priceAlerts", v)}
        />
        <RowSwitch
          label="Show amounts on the lock screen"
          description="Off: notifications name the card or item but hide amounts and card digits until you open Spendly."
          value={prefs.showAmounts}
          onValueChange={(v) => setPushNotifications({ showAmounts: v })}
        />
        <Text style={mutedText}>
          Card bill, calendar and goal reminders have their own switches below and on each goal.
        </Text>
      </View>
    </Card>
  );
}
