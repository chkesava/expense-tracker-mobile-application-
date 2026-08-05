import { StyleSheet, Text, View } from "react-native";
import { Compass, Flame } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Card } from "@/components/ui/Card";
import { useTheme } from "@/theme/ThemeProvider";

export interface FocusWidgetProps {
  todaySpent: number;
  dailyTarget: number;
  currency: string;
}

export function FocusWidget({
  todaySpent,
  dailyTarget,
  currency,
}: FocusWidgetProps) {
  const { theme } = useTheme();

  const isUnderTarget = dailyTarget <= 0 || todaySpent <= dailyTarget;
  const progressPct =
    dailyTarget > 0 ? Math.min(100, Math.round((todaySpent / dailyTarget) * 100)) : 0;

  return (
    <Card
      title="Daily Focus"
      subtitle={
        dailyTarget > 0
          ? `Daily budget target: ${currency} ${dailyTarget.toFixed(0)}`
          : "Today's discretionary spending"
      }
    >
      <View style={styles.content}>
        <View style={styles.row}>
          <View style={{ gap: 2 }}>
            <Text
              style={{
                fontSize: theme.typography.xs,
                color: theme.colors.mutedForeground,
              }}
            >
              Spent Today
            </Text>
            <Amount
              value={todaySpent}
              currency={currency}
              ghostable
              style={{
                fontSize: theme.typography.lg,
                fontWeight: "800",
                color: isUnderTarget
                  ? theme.colors.foreground
                  : theme.colors.destructive,
              }}
            />
          </View>

          {dailyTarget > 0 ? (
            <View style={{ alignItems: "flex-end", gap: 2 }}>
              <Text
                style={{
                  fontSize: theme.typography.xs,
                  fontWeight: "700",
                  color: isUnderTarget
                    ? theme.colors.success
                    : theme.colors.destructive,
                }}
              >
                {progressPct}% utilized
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  color: theme.colors.mutedForeground,
                }}
              >
                Limit: {currency} {dailyTarget.toFixed(0)}
              </Text>
            </View>
          ) : null}
        </View>

        {dailyTarget > 0 ? (
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
                  width: `${Math.min(100, Math.max(2, progressPct))}%`,
                  backgroundColor: isUnderTarget
                    ? theme.colors.primary
                    : theme.colors.destructive,
                },
              ]}
            />
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
