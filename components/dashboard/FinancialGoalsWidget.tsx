import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Calendar, ChevronRight, Sprout, Target } from "lucide-react-native";

import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { ProgressIndicator } from "@/components/dashboard/ProgressIndicator";
import {
  MetaLabel,
  Section,
  SectionAction,
  useSurfaces,
} from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/Button";
import { useFinancialGoals } from "@/hooks/useFinancialGoals";
import { useSaveGoalsEnabled } from "@/hooks/useSaveGoalsEnabled";
import { haptic } from "@/lib/haptics";
import { useSettings } from "@/providers/SettingsProvider";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import { dashboardGoals, goalProgress } from "@/shared/utils/goalModel";
import { useTheme } from "@/theme/ThemeProvider";

export interface FinancialGoalsWidgetProps {
  currency: string;
}

/**
 * Financial goals (SPENDLY-533): name, target date and a progress row per goal,
 * with saved / target as real amounts and the status spelled out.
 *
 * SPENDLY-608: the dedicated active-goals section. Only in-progress goals
 * (active or paused), pinned first; completed, archived and cancelled goals
 * never look active here. Reads summaries only — no goal history.
 */
export const FinancialGoalsWidget = memo(function FinancialGoalsWidget({
  currency,
}: FinancialGoalsWidgetProps) {
  const { goals, loading } = useFinancialGoals();
  const saveGoals = useSaveGoalsEnabled();
  const router = useRouter();
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { settings } = useSettings();
  const { shown, total } = dashboardGoals(goals, 2);

  const openGoals = () => {
    void haptic.selection();
    router.push((saveGoals ? "/goals" : "/settings/money") as never);
  };

  const openGoal = (id: string) => {
    void haptic.selection();
    router.push(`/goals/${id}` as never);
  };

  if (loading && goals.length === 0) {
    return <DashboardSkeleton variant="progress" rows={2} />;
  }

  if (total === 0) {
    return (
      <Section
        title="Financial Goals"
        icon={<Sprout size={16} color={theme.colors.success} strokeWidth={2.3} />}
        iconTint={surfaces.wash(theme.colors.success)}
      >
        <View style={styles.empty}>
          <View style={[styles.emptyGlyph, { backgroundColor: surfaces.wash(theme.colors.success) }]}>
            <Target size={20} color={theme.colors.success} strokeWidth={2.2} />
          </View>
          <Text
            style={[styles.emptyTitle, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}
          >
            No savings goals yet
          </Text>
          <Text
            style={[styles.emptyText, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
          >
            Set a target, like an emergency fund or a trip, and watch it fill up.
          </Text>
          <Button variant="primary" size="sm" onPress={openGoals} style={styles.emptyButton}>
            Create goal
          </Button>
        </View>
      </Section>
    );
  }

  return (
    <Section
      title="Financial Goals"
      subtitle={`${total} active savings ${total === 1 ? "target" : "targets"}`}
      icon={<Target size={16} color={theme.colors.success} strokeWidth={2.3} />}
      iconTint={surfaces.wash(theme.colors.success)}
      action={<SectionAction label={saveGoals ? "All goals" : "Manage"} onPress={openGoals} />}
      contentStyle={styles.list}
    >
      {shown.map((goal) => {
        const progress = goalProgress(goal);
        const current = progress.saved;
        const target = progress.target;
        const pct = Math.floor(progress.percent);
        const isComplete = progress.reached;

        return (
          <Pressable
            key={goal.id}
            style={styles.goal}
            disabled={!saveGoals}
            onPress={() => openGoal(goal.id)}
            accessibilityRole={saveGoals ? "button" : undefined}
            accessibilityHint={saveGoals ? "Opens the goal" : undefined}
          >
            <View style={styles.goalTop}>
              <View style={styles.goalNameCol}>
                <Text
                  style={[styles.goalName, { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium }]}
                  numberOfLines={1}
                >
                  {goal.name}
                </Text>
                {goal.deadline ? (
                  <View style={styles.deadline}>
                    <Calendar size={11} color={theme.colors.mutedForeground} />
                    <MetaLabel>
                      By {formatDisplayDate(goal.deadline, settings.dateFormat)}
                    </MetaLabel>
                  </View>
                ) : null}
              </View>
              <View style={styles.goalValueCol}>
                <FinancialAmount value={current} currency={currency} size="sm" />
                <View style={styles.ofRow}>
                  <MetaLabel>of</MetaLabel>
                  <FinancialAmount
                    value={target}
                    currency={currency}
                    size="xs"
                    tone="muted"
                    weight="medium"
                  />
                </View>
              </View>
            </View>

            <ProgressIndicator
              pct={pct}
              status={isComplete ? "good" : "neutral"}
              statusLabel={isComplete ? "Goal reached" : "In progress"}
              trailing={`${pct}%`}
              accessibilityLabel={`${goal.name}, ${pct}% saved`}
            />
          </Pressable>
        );
      })}
      {/* SPENDLY-218: plan how to fund these goals */}
      <Pressable
        onPress={() => router.push("/goals/optimizer" as never)}
        accessibilityRole="link"
        accessibilityLabel="Plan how to fund your goals"
        hitSlop={8}
        style={({ pressed }) => [styles.link, pressed && { opacity: 0.7 }]}
      >
        <Text style={[styles.linkText, { color: theme.colors.primary, fontFamily: theme.fontFamily.semibold }]}>
          Plan funding
        </Text>
        <ChevronRight size={14} color={theme.colors.primary} strokeWidth={2.4} />
      </Pressable>
    </Section>
  );
});

const styles = StyleSheet.create({
  empty: {
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
  },
  emptyGlyph: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 15,
  },
  emptyText: {
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: "center",
    maxWidth: 280,
  },
  emptyButton: {
    marginTop: 8,
  },
  list: {
    gap: 16,
  },
  goal: {
    gap: 8,
  },
  goalTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  goalNameCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  goalName: {
    fontSize: 14,
  },
  deadline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  goalValueCol: {
    alignItems: "flex-end",
    gap: 1,
    maxWidth: "50%",
  },
  ofRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  link: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
    alignSelf: "flex-start",
    minHeight: 32,
  },
  linkText: {
    fontSize: 13,
  },
});
