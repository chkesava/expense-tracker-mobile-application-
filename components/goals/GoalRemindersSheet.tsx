import { useEffect, useRef, useState } from "react";
import { Linking, Text, View } from "react-native";

import { Modal } from "@/components/common/Modal";
import { SheetActions } from "@/components/common/SheetActions";
import { ChipRow, RowSwitch } from "@/components/settings/SettingsControls";
import { Button } from "@/components/ui/Button";
import {
  goalNotificationPermission,
  requestGoalNotificationPermission,
  type GoalNotificationPermission,
} from "@/services/goals/goalReminderScheduler";
import type { FinancialGoal } from "@/shared/types/expense";
import type { GoalReminderFrequency, GoalReminders } from "@/shared/types/goal";
import { goalReminders, WEEKDAY_LABELS, wantsNotifications } from "@/shared/utils/goalReminders";
import { useTheme } from "@/theme/ThemeProvider";

const FREQUENCIES: { value: GoalReminderFrequency; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];
const TIMES = ["07:00", "09:00", "12:00", "18:00", "20:00", "21:00"];
const MONTH_DAYS = [1, 5, 10, 15, 20, 25, 28];
const IDLE_DAYS = [7, 14, 30];

/**
 * A goal's reminders (SPENDLY-612, FRD FR-11): scheduled daily/weekly/monthly
 * reminders, milestone alerts and an inactivity alert, each independently on
 * or off. Stored on the goal (last-writer-wins settings; no history event).
 *
 * Push permission is asked only when a notification is turned on. If it's
 * denied — or on web — reminders still appear in the in-app inbox, and the
 * sheet says how to turn notifications on in device settings.
 */
export function GoalRemindersSheet({
  isOpen,
  goal,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  goal: FinancialGoal;
  onClose: () => void;
  onSave: (reminders: GoalReminders) => Promise<boolean>;
}) {
  const { theme } = useTheme();
  const [r, setR] = useState<GoalReminders>(goalReminders(goal));
  const [permission, setPermission] = useState<GoalNotificationPermission | null>(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    setR(goalReminders(goal));
    setSaving(false);
    inFlight.current = false;
    void goalNotificationPermission().then(setPermission);
    // Keyed on the goal id so a snapshot doesn't reset the edit in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, goal.id]);

  const set = (patch: Partial<GoalReminders>) => setR((prev) => ({ ...prev, ...patch }));

  const save = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    try {
      // Ask only now, and only if a notification is actually on.
      if (wantsNotifications(r) && permission !== "granted" && permission !== "unavailable") {
        setPermission(await requestGoalNotificationPermission());
      }
      if (await onSave(r)) onClose();
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  const hint = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };
  const label = { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm };

  return (
    <Modal
      isOpen={isOpen}
      onClose={saving ? () => undefined : onClose}
      title="Reminders"
      density="compact"
      maxHeight="92%"
      footer={<SheetActions secondary={{ label: "Cancel", onPress: onClose, disabled: saving }} primary={{ label: "Save reminders", onPress: () => void save(), loading: saving, disabled: saving }} />}
    >
      <View style={{ gap: theme.space.md }}>
        <View style={{ gap: theme.space.xs }}>
          <Text style={label}>Remind me to save</Text>
          <ChipRow<GoalReminderFrequency> options={FREQUENCIES} selected={r.frequency} onSelect={(v) => set({ frequency: v })} />
        </View>
        {r.frequency === "weekly" ? (
          <View style={{ gap: theme.space.xs }}>
            <Text style={label}>On</Text>
            <ChipRow<string> options={WEEKDAY_LABELS.map((d, i) => ({ value: String(i), label: d.slice(0, 3) }))} selected={String(r.weekday ?? 0)} onSelect={(v) => set({ weekday: Number(v) })} />
          </View>
        ) : null}
        {r.frequency === "monthly" ? (
          <View style={{ gap: theme.space.xs }}>
            <Text style={label}>Day of the month</Text>
            <ChipRow<string> options={MONTH_DAYS.map((d) => ({ value: String(d), label: String(d) }))} selected={String(r.monthDay ?? 1)} onSelect={(v) => set({ monthDay: Number(v) })} />
          </View>
        ) : null}
        {r.frequency !== "off" || r.inactivityEnabled ? (
          <View style={{ gap: theme.space.xs }}>
            <Text style={label}>At</Text>
            <ChipRow<string> options={TIMES.map((t) => ({ value: t, label: t }))} selected={r.time} onSelect={(v) => set({ time: v })} />
            <Text style={hint}>In your timezone setting.</Text>
          </View>
        ) : null}
        <RowSwitch
          label="Nudge me if I stop saving"
          description={`Once, after ${r.inactivityDays} days without a contribution`}
          value={r.inactivityEnabled}
          onValueChange={(v) => set({ inactivityEnabled: v })}
        />
        {r.inactivityEnabled ? (
          <ChipRow<string> options={IDLE_DAYS.map((d) => ({ value: String(d), label: `${d} days` }))} selected={String(r.inactivityDays)} onSelect={(v) => set({ inactivityDays: Number(v) })} />
        ) : null}
        <RowSwitch label="Milestone alerts" description="Celebrate each milestone this goal reaches" value={r.milestoneEnabled} onValueChange={(v) => set({ milestoneEnabled: v })} />

        <Text style={hint}>Reminders stop while the goal is paused, and once it's completed, archived or cancelled.</Text>
        {permission === "unavailable" ? (
          <Text style={hint}>Notifications aren't available here. Your reminders appear in the inbox (the bell) instead.</Text>
        ) : permission === "denied" && wantsNotifications(r) ? (
          <View style={{ gap: theme.space.xs }} accessibilityLiveRegion="polite">
            <Text style={[hint, { color: theme.colors.warning }]}>
              Notifications are turned off for Spendly on this device. Your reminders will still appear in the inbox (the bell).
            </Text>
            <Button variant="ghost" size="sm" onPress={() => void Linking.openSettings()}>
              Open device settings
            </Button>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
