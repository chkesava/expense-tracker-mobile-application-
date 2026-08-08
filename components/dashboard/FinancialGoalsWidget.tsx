import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Calendar, Target } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { Card } from "@/components/ui/Card";
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

  if (goals.length === 0) {
    return (
      <Card title="Financial Goals">
        <EmptyState
          illustration="investments"
          compact
          title="Set Your First Goal"
          description="Create savings targets (vacation, emergency fund, tech) to visualize progress."
          primaryAction={{
            label: "Create Goal",
            onPress: () => router.push("/settings"),
          }}
          tip="Tracking dedicated savings goals keeps you motivated and discourages impulse buying."
        />
      </Card>
    );
  }

  return (
    <Card
      title="Financial Goals"
      subtitle={`${goals.length} active savings targets`}
    >
      <View style={{ gap: 14 }}>
        {goals.map((goal) => {
          const current = goal.currentAmount || 0;
          const target = goal.targetAmount || 1;
          const pct = Math.min(100, Math.round((current / target) * 100));
          const isComplete = current >= target;

          return (
            <View key={goal.id} style={{ gap: 6 }}>
              <View style={styles.goalTopRow}>
                <View style={{ gap: 2, flex: 1 }}>
                  <Text
                    style={{
                      fontSize: theme.typography.sm,
                      fontWeight: "700",
                      color: theme.colors.foreground,
                    }}
                  >
                    {goal.name}
                  </Text>
                  {goal.deadline ? (
                    <View style={styles.deadlineContainer}>
                      <Calendar size={11} color={theme.colors.mutedForeground} />
                      <Text
                        style={{
                          fontSize: 10,
                          color: theme.colors.mutedForeground,
                          fontWeight: "500",
                        }}
                      >
                        Target: {goal.deadline}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View style={{ alignItems: "flex-end", gap: 2 }}>
                  <Text
                    style={{
                      fontSize: theme.typography.xs,
                      fontWeight: "700",
                      color: isComplete
                        ? theme.colors.success
                        : theme.colors.foreground,
                    }}
                  >
                    {pct}%
                  </Text>
                  <Text
                    style={{
                      fontSize: 11,
                      color: theme.colors.mutedForeground,
                    }}
                  >
                    {currency} {current.toLocaleString()} / {currency}{" "}
                    {target.toLocaleString()}
                  </Text>
                </View>
              </View>

              <View
                style={[
                  styles.progressBarBg,
                  { backgroundColor: theme.colors.muted },
                ]}
              >
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${Math.min(100, Math.max(2, pct))}%`,
                      backgroundColor: isComplete
                        ? theme.colors.success
                        : theme.colors.primary,
                    },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  goalTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  deadlineContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
  },
});
