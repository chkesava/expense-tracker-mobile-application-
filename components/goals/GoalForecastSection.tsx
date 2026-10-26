import { Text, View } from "react-native";
import { BellRing, CalendarClock } from "lucide-react-native";

import { Section } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/Button";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { useGoalEstimate } from "@/hooks/useGoalEstimate";
import { useSettings } from "@/providers/SettingsProvider";
import type { FinancialGoal } from "@/shared/types/expense";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import { ESTIMATE_MIN_CONTRIBUTIONS, ESTIMATE_MIN_SPAN_DAYS, ESTIMATE_WINDOW_DAYS } from "@/shared/utils/goalEstimate";
import { describeReminders, goalCanRemind, goalReminders } from "@/shared/utils/goalReminders";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces } from "@/theme/surfaces";

/**
 * Estimated completion and reminders for an open goal (SPENDLY-612).
 * The estimate is the average of the last 90 days of contributions; with too
 * little history it says so instead of inventing a date.
 */
export function GoalForecastSection({ goal, currency, onEditReminders }: { goal: FinancialGoal; currency: string; onEditReminders: () => void }) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const money = useGhostMoney(currency);
  const { settings } = useSettings();
  const estimate = useGoalEstimate(goal);
  const body = { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.sm };
  const meta = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };

  let forecast: { line: string; detail?: string } | null = null;
  if (estimate?.kind === "estimate") {
    forecast = {
      line: `Estimated to reach the target around ${formatDisplayDate(new Date(estimate.dateMs), settings.dateFormat)}`,
      detail: `At about ${money(estimate.perMonth)} a month, from ${estimate.contributions} contributions in the last ${ESTIMATE_WINDOW_DAYS} days.${estimate.afterTargetDate ? " That's after your target date." : ""}`,
    };
  } else if (estimate?.kind === "insufficient") {
    forecast = {
      line: "Not enough history to estimate a completion date yet",
      detail: `Needs at least ${ESTIMATE_MIN_CONTRIBUTIONS} contributions over ${ESTIMATE_MIN_SPAN_DAYS} days or more, within the last ${ESTIMATE_WINDOW_DAYS} days.`,
    };
  } else if (estimate?.kind === "not_growing") {
    forecast = { line: "No completion estimate: the saved amount hasn't grown over the last 90 days" };
  }

  const reminders = goalReminders(goal);
  const canRemind = goalCanRemind(goal);

  return (
    <Section title="Forecast & reminders" icon={<CalendarClock size={16} color={theme.colors.primary} />} iconTint={surfaces.wash(theme.colors.primary)}>
      <View style={{ gap: theme.space.sm }}>
        {forecast ? (
          <View accessible accessibilityLabel={[forecast.line, forecast.detail].filter(Boolean).join(". ")} style={{ gap: 2 }}>
            <Text style={[body, { fontFamily: theme.fontFamily.medium }]}>{forecast.line}</Text>
            {forecast.detail ? <Text style={meta}>{forecast.detail}</Text> : null}
          </View>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <BellRing size={16} color={theme.colors.mutedForeground} />
          <Text style={[body, { flex: 1 }]}>{describeReminders(reminders)}</Text>
          <Button variant="ghost" size="sm" onPress={onEditReminders} accessibilityLabel="Edit reminders">
            {reminders.frequency === "off" && !reminders.inactivityEnabled ? "Set up" : "Edit"}
          </Button>
        </View>
        {!canRemind && (reminders.frequency !== "off" || reminders.inactivityEnabled) ? (
          <Text style={meta}>Reminders are on hold while this goal isn't active.</Text>
        ) : null}
      </View>
    </Section>
  );
}
