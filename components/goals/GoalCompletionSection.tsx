import { StyleSheet, Text, View } from "react-native";
import { Trophy } from "lucide-react-native";

import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { Section } from "@/components/dashboard/primitives";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { useSettings } from "@/providers/SettingsProvider";
import type { FinancialGoal } from "@/shared/types/expense";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import { completionSummary } from "@/shared/utils/goalAchievements";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces } from "@/theme/surfaces";

/**
 * The completion summary (SPENDLY-610, FRD FR-08): target, final amount,
 * surplus, how long it took and milestones reached. Built from the summary
 * document alone; the achievement history is in the History section's
 * "Achievements" filter. The original completion event is never rewritten.
 */
export function GoalCompletionSection({ goal, currency }: { goal: FinancialGoal; currency: string }) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const money = useGhostMoney(currency);
  const { settings } = useSettings();
  const s = completionSummary(goal);
  const meta = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };
  const body = { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.sm };

  return (
    <Section
      title="Goal completed"
      subtitle={s.completedAtMs ? formatDisplayDate(new Date(s.completedAtMs), settings.dateFormat) : undefined}
      icon={<Trophy size={16} color={theme.colors.success} />}
      iconTint={surfaces.wash(theme.colors.success)}
    >
      <View style={{ gap: theme.space.sm }} accessibilityRole="summary">
        <View style={styles.amounts}>
          <FinancialAmount value={s.finalAmount} currency={currency} size="lg" />
          <Text style={meta}>saved of a</Text>
          <FinancialAmount value={s.target} currency={currency} size="sm" tone="muted" weight="medium" />
          <Text style={meta}>target</Text>
        </View>
        {s.surplus > 0 ? <Text style={body}>{money(s.surplus)} above the target.</Text> : null}
        {s.days !== null ? <Text style={body}>Reached in {s.days} {s.days === 1 ? "day" : "days"}.</Text> : null}
        <Text style={body}>
          {s.milestonesReached} of {s.milestonesTotal} milestones reached.
        </Text>
        <Text style={meta}>Completed goals don't take new contributions. Reopen it if you want to keep saving towards it.</Text>
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  amounts: { flexDirection: "row", alignItems: "baseline", gap: 6, flexWrap: "wrap" },
});
