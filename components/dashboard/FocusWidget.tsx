import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import {
  ChevronRight,
  Flame,
  Sparkles,
  Target,
} from "lucide-react-native";
import { Amount } from "@/components/common/Amount";
import { CircularProgress } from "@/components/dashboard/CircularProgress";
import { Card } from "@/components/ui/Card";
import { FocusConfigModal } from "@/components/focus/FocusConfigModal";
import { useExpenses } from "@/hooks/useExpenses";
import { useFocusMode } from "@/hooks/useFocusMode";
import { formatDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

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
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { activeSession, startFocusSession, endFocusSession } = useFocusMode();
  const { expenses } = useExpenses();

  const [isConfigOpen, setIsConfigOpen] = useState(false);

  const todayKey = formatDateKey(new Date());

  const sprintTodaySpent = useMemo(() => {
    if (!activeSession) return todaySpent;
    if (activeSession.category === "All Spending") return todaySpent;

    return expenses
      .filter((e) => e.date === todayKey && e.category === activeSession.category)
      .reduce((sum, e) => sum + (e.amount || 0), 0);
  }, [activeSession, expenses, todayKey, todaySpent]);

  const targetLimit = activeSession ? activeSession.dailyLimit : dailyTarget;
  const remaining = Math.max(0, targetLimit - sprintTodaySpent);
  const isUnderTarget = targetLimit <= 0 || sprintTodaySpent <= targetLimit;
  const progressPct =
    targetLimit > 0
      ? Math.min(100, Math.round((sprintTodaySpent / targetLimit) * 100))
      : 0;

  const statusMessage = !targetLimit
    ? "Set a monthly budget to unlock daily targets."
    : isUnderTarget
      ? "Great job! You're within your daily budget."
      : "You've exceeded today's allowance — adjust or pause.";

  return (
    <>
      <Card
        title={activeSession ? `Focus: ${activeSession.category}` : "Daily Focus"}
        subtitle={
          activeSession
            ? `${activeSession.durationDays}-day sprint · stay under your limit`
            : "Stay on track, every day."
        }
        icon={
          <View
            style={[
              styles.headerIcon,
              {
                backgroundColor: isDark
                  ? "rgba(168, 85, 247, 0.22)"
                  : "rgba(168, 85, 247, 0.12)",
              },
            ]}
          >
            <Target size={16} color="#A855F7" />
          </View>
        }
        headerRight={
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
              setIsConfigOpen(true);
            }}
            style={({ pressed }) => [
              styles.detailsBtn,
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Configure daily focus"
          >
            <Text style={[styles.detailsText, { color: theme.colors.primary }]}>
              View Details
            </Text>
            <ChevronRight size={14} color={theme.colors.primary} />
          </Pressable>
        }
        radius="xxl"
        contentStyle={styles.cardContent}
      >
        <View style={styles.metricsRow}>
          {/* Spent Today */}
          <View style={[styles.sideCol, styles.sideLeft]}>
            <Text
              style={[styles.metricLabel, { color: theme.colors.mutedForeground }]}
              numberOfLines={1}
            >
              Spent Today
            </Text>
            <Amount
              value={sprintTodaySpent}
              currency={currency}
              ghostable
              style={{
                fontSize: 22,
                fontWeight: "900",
                letterSpacing: -0.4,
                color: isUnderTarget
                  ? theme.colors.foreground
                  : theme.colors.destructive,
              }}
            />
            {targetLimit > 0 ? (
              <View style={styles.trendRow}>
                <Text
                  style={[
                    styles.trendText,
                    { color: isUnderTarget ? "#A855F7" : theme.colors.destructive },
                  ]}
                  numberOfLines={2}
                >
                  {isUnderTarget ? "↘" : "↗"} {progressPct}% of daily budget
                </Text>
              </View>
            ) : null}
          </View>

          {/* Circular gauge */}
          <View style={styles.gaugeCol}>
            <CircularProgress
              progress={progressPct}
              size={96}
              strokeWidth={10}
              trackColor={
                isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"
              }
              gradientFrom={isUnderTarget ? "#A855F7" : "#F97316"}
              gradientTo={isUnderTarget ? "#3B82F6" : "#EF4444"}
              valueColor={theme.colors.foreground}
            />
          </View>

          {/* Budget + Remaining */}
          <View style={[styles.sideCol, styles.sideRight]}>
            <Text
              style={[styles.metricLabel, { color: theme.colors.mutedForeground }]}
              numberOfLines={1}
            >
              Daily Budget
            </Text>
            <Amount
              value={targetLimit}
              currency={currency}
              ghostable
              style={{
                fontSize: 16,
                fontWeight: "800",
                color: theme.colors.foreground,
              }}
            />
            <Text
              style={[
                styles.metricLabel,
                { color: theme.colors.mutedForeground, marginTop: 8 },
              ]}
              numberOfLines={1}
            >
              Remaining
            </Text>
            <Amount
              value={remaining}
              currency={currency}
              ghostable
              style={{
                fontSize: 15,
                fontWeight: "800",
                color: isUnderTarget ? "#34D399" : theme.colors.destructive,
              }}
            />
          </View>
        </View>

        {/* Horizontal progress bar */}
        {targetLimit > 0 ? (
          <View style={styles.barSection}>
            <View
              style={[
                styles.barTrack,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.08)"
                    : "rgba(0,0,0,0.06)",
                },
              ]}
            >
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${progressPct}%`,
                    backgroundColor: isUnderTarget ? "#8B5CF6" : "#EF4444",
                  },
                ]}
              />
            </View>
          </View>
        ) : null}

        {/* Status banner */}
        <View
          style={[
            styles.statusBanner,
            {
              backgroundColor: isUnderTarget
                ? isDark
                  ? "rgba(168, 85, 247, 0.14)"
                  : "rgba(168, 85, 247, 0.1)"
                : isDark
                  ? "rgba(239, 68, 68, 0.12)"
                  : "rgba(239, 68, 68, 0.08)",
              borderColor: isUnderTarget
                ? "rgba(168, 85, 247, 0.28)"
                : "rgba(239, 68, 68, 0.25)",
            },
          ]}
        >
          <Sparkles
            size={14}
            color={isUnderTarget ? "#A855F7" : theme.colors.destructive}
          />
          <Text
            style={[
              styles.statusText,
              {
                color: isUnderTarget
                  ? isDark
                    ? "#E9D5FF"
                    : "#6B21A8"
                  : theme.colors.destructive,
              },
            ]}
            numberOfLines={2}
          >
            {statusMessage}
          </Text>
        </View>

        {activeSession ? (
          <View
            style={[
              styles.sprintFooter,
              { borderTopColor: theme.colors.border },
            ]}
          >
            <View style={styles.sprintLeft}>
              <Flame size={14} color="#F97316" />
              <Text style={styles.sprintLabel}>Active Sprint</Text>
            </View>
            <Pressable
              onPress={() => endFocusSession("completed")}
              style={({ pressed }) => [pressed && { opacity: 0.6 }]}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  color: theme.colors.primary,
                }}
              >
                Complete Sprint
              </Text>
            </Pressable>
          </View>
        ) : null}
      </Card>

      <FocusConfigModal
        visible={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        onStart={startFocusSession}
      />
    </>
  );
}

const styles = StyleSheet.create({
  cardContent: {
    paddingTop: 4,
  },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  detailsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 4,
    paddingLeft: 4,
  },
  detailsText: {
    fontSize: 12,
    fontWeight: "700",
  },
  metricsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 16,
  },
  sideCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  sideLeft: {
    alignItems: "flex-start",
  },
  sideRight: {
    alignItems: "flex-end",
  },
  gaugeCol: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  trendRow: {
    marginTop: 4,
  },
  trendText: {
    fontSize: 11,
    fontWeight: "700",
  },
  barSection: {
    marginBottom: 12,
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 4,
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  statusText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
  sprintFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    marginTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sprintLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sprintLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#F97316",
  },
});
