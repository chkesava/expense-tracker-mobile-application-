import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { CheckCircle2, Compass, Flame, Settings2 } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Card } from "@/components/ui/Card";
import { FocusConfigModal } from "@/components/focus/FocusConfigModal";
import { useExpenses } from "@/hooks/useExpenses";
import { useFocusMode } from "@/hooks/useFocusMode";
import { formatDateKey } from "@/shared/utils/dates";
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
  const { activeSession, startFocusSession, endFocusSession } = useFocusMode();
  const { expenses } = useExpenses();

  const [isConfigOpen, setIsConfigOpen] = useState(false);

  const todayKey = formatDateKey(new Date());

  // Compute spend for active sprint category
  const sprintTodaySpent = useMemo(() => {
    if (!activeSession) return todaySpent;
    if (activeSession.category === "All Spending") return todaySpent;

    return expenses
      .filter((e) => e.date === todayKey && e.category === activeSession.category)
      .reduce((sum, e) => sum + (e.amount || 0), 0);
  }, [activeSession, expenses, todayKey, todaySpent]);

  const targetLimit = activeSession ? activeSession.dailyLimit : dailyTarget;
  const isUnderTarget = targetLimit <= 0 || sprintTodaySpent <= targetLimit;
  const progressPct =
    targetLimit > 0
      ? Math.min(100, Math.round((sprintTodaySpent / targetLimit) * 100))
      : 0;

  return (
    <>
      <Card
        title={activeSession ? `Focus: ${activeSession.category}` : "Daily Focus"}
        subtitle={
          activeSession
            ? `Daily limit: ${currency} ${activeSession.dailyLimit} • ${activeSession.durationDays}-Day Sprint`
            : targetLimit > 0
            ? `Daily budget target: ${currency} ${targetLimit.toFixed(0)}`
            : "Today's discretionary spending"
        }
        headerRight={
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
              setIsConfigOpen(true);
            }}
            style={styles.configBtn}
          >
            <Settings2 size={16} color={theme.colors.primary} />
          </Pressable>
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
                {activeSession ? "Spent Today (Target)" : "Spent Today"}
              </Text>
              <Amount
                value={sprintTodaySpent}
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

            {targetLimit > 0 ? (
              <View style={{ alignItems: "flex-end", gap: 2 }}>
                <Text
                  style={{
                    fontSize: theme.typography.xs,
                    color: theme.colors.mutedForeground,
                  }}
                >
                  Remaining
                </Text>
                <Amount
                  value={Math.max(0, targetLimit - sprintTodaySpent)}
                  currency={currency}
                  ghostable
                  style={{
                    fontSize: theme.typography.sm,
                    fontWeight: "700",
                    color: isUnderTarget ? "#10B981" : theme.colors.destructive,
                  }}
                />
              </View>
            ) : null}
          </View>

          {/* Target Progress Bar */}
          {targetLimit > 0 ? (
            <View style={styles.barContainer}>
              <View
                style={[
                  styles.barBackground,
                  { backgroundColor: theme.colors.muted },
                ]}
              >
                <View
                  style={[
                    styles.barFill,
                    {
                      width: `${progressPct}%`,
                      backgroundColor: isUnderTarget
                        ? theme.colors.primary
                        : theme.colors.destructive,
                    },
                  ]}
                />
              </View>
              <Text
                style={{
                  fontSize: 10,
                  color: theme.colors.mutedForeground,
                  textAlign: "right",
                }}
              >
                {progressPct}% of daily allowance used
              </Text>
            </View>
          ) : null}

          {/* Active sprint actions */}
          {activeSession && (
            <View
              style={[
                styles.sprintFooter,
                { borderTopColor: theme.colors.border },
              ]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Flame size={14} color="#F97316" />
                <Text style={{ fontSize: 11, fontWeight: "700", color: "#F97316" }}>
                  Active Sprint
                </Text>
              </View>

              <Pressable
                onPress={() => endFocusSession("completed")}
                style={({ pressed }) => [pressed && { opacity: 0.6 }]}
              >
                <Text style={{ fontSize: 11, fontWeight: "700", color: theme.colors.primary }}>
                  Complete Sprint 🎯
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </Card>

      {/* Focus Configuration Modal */}
      <FocusConfigModal
        visible={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        onStart={startFocusSession}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
  },
  configBtn: {
    padding: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  barContainer: {
    gap: 4,
  },
  barBackground: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 3,
  },
  sprintFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
