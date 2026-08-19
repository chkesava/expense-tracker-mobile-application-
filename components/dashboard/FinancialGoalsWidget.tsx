import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Calendar, Lightbulb, Sprout, Target } from "lucide-react-native";

import {
  MetaLabel,
  ProgressTrack,
  Section,
  SectionAction,
  useSurfaces,
} from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/Button";
import { haptic } from "@/lib/haptics";
import type { FinancialGoal } from "@/shared/types/expense";
import { useTheme } from "@/theme/ThemeProvider";

export interface FinancialGoalsWidgetProps {
  goals: FinancialGoal[];
  currency: string;
}

export function FinancialGoalsWidget({
  goals,
  currency,
}: FinancialGoalsWidgetProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const surfaces = useSurfaces();

  const openGoals = () => {
    void haptic.selection();
    router.push("/settings/money" as never);
  };

  /**
   * Compact empty state — the illustration-heavy version used ~3x the height
   * for the same two affordances (explain, create).
   */
  if (goals.length === 0) {
    return (
      <Section
        title="Financial Goals"
        subtitle="Create savings targets to visualise progress."
        icon={<Sprout size={16} color={theme.colors.success} strokeWidth={2.3} />}
        iconTint={surfaces.wash(theme.colors.success)}
      >
        <Button variant="primary" size="sm" onPress={openGoals}>
          <Text
            style={[
              styles.ctaText,
              { color: "#FFFFFF", fontFamily: theme.fontFamily.semibold },
            ]}
          >
            Create goal
          </Text>
        </Button>

        <View style={[styles.tip, { backgroundColor: surfaces.tile }]}>
          <Lightbulb size={13} color={theme.colors.warning} strokeWidth={2.2} />
          <Text
            style={[
              styles.tipText,
              {
                color: theme.colors.mutedForeground,
                fontFamily: theme.fontFamily.regular,
              },
            ]}
          >
            Tracking dedicated savings goals keeps you motivated and discourages
            impulse buying.
          </Text>
        </View>
      </Section>
    );
  }

  return (
    <Section
      title="Financial Goals"
      subtitle={`${goals.length} active savings ${goals.length === 1 ? "target" : "targets"}`}
      icon={<Target size={16} color={theme.colors.success} strokeWidth={2.3} />}
      iconTint={surfaces.wash(theme.colors.success)}
      action={<SectionAction label="Manage" onPress={openGoals} />}
      contentStyle={styles.list}
    >
      {goals.map((goal) => {
        const current = goal.currentAmount || 0;
        const target = goal.targetAmount || 1;
        const pct = Math.min(100, Math.round((current / target) * 100));
        const isComplete = current >= target;
        const color = isComplete ? theme.colors.success : theme.colors.primary;

        return (
          <View key={goal.id} style={styles.goal}>
            <View style={styles.goalTop}>
              <View style={styles.goalNameCol}>
                <Text
                  style={[
                    styles.goalName,
                    {
                      color: theme.colors.foreground,
                      fontFamily: theme.fontFamily.medium,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {goal.name}
                </Text>
                {goal.deadline ? (
                  <View style={styles.deadline}>
                    <Calendar size={11} color={theme.colors.mutedForeground} />
                    <MetaLabel>Target {goal.deadline}</MetaLabel>
                  </View>
                ) : null}
              </View>

              <View style={styles.goalValueCol}>
                <Text
                  style={[
                    styles.goalPct,
                    { color, fontFamily: theme.fontFamily.semibold },
                  ]}
                >
                  {pct}%
                </Text>
                <MetaLabel>
                  {currency} {current.toLocaleString()} /{" "}
                  {target.toLocaleString()}
                </MetaLabel>
              </View>
            </View>

            <ProgressTrack pct={pct} color={color} height={5} />
          </View>
        );
      })}
    </Section>
  );
}

const styles = StyleSheet.create({
  ctaText: {
    fontSize: 13.5,
  },
  tip: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 12,
    padding: 11,
    borderRadius: 14,
    borderCurve: "continuous",
  },
  tipText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  list: {
    gap: 14,
  },
  goal: {
    gap: 7,
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
  },
  goalPct: {
    fontSize: 14,
  },
});
