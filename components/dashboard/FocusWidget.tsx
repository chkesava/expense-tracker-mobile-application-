import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Flame, Sparkles, Target } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { CircularProgress } from "@/components/dashboard/CircularProgress";
import {
  ACCENT_PURPLE,
  MetaLabel,
  Section,
  SectionAction,
  StatusStrip,
  useSurfaces,
} from "@/components/dashboard/primitives";
import { FocusConfigModal } from "@/components/focus/FocusConfigModal";
import { useExpenses } from "@/hooks/useExpenses";
import { useFocusMode } from "@/hooks/useFocusMode";
import { haptic } from "@/lib/haptics";
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
  const surfaces = useSurfaces();
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

  const ringColor = isUnderTarget ? ACCENT_PURPLE : theme.colors.destructive;

  return (
    <>
      <Section
        title={activeSession ? `Focus: ${activeSession.category}` : "Daily Focus"}
        subtitle={
          activeSession
            ? `${activeSession.durationDays}-day sprint · stay under your limit`
            : "Stay on track, every day."
        }
        icon={<Target size={16} color={ACCENT_PURPLE} strokeWidth={2.3} />}
        iconTint={surfaces.wash(ACCENT_PURPLE)}
        action={
          <SectionAction
            label="View details"
            onPress={() => setIsConfigOpen(true)}
            accessibilityLabel="Configure daily focus"
          />
        }
        footer={
          activeSession ? (
            <View style={styles.sprintFooter}>
              <View style={styles.sprintLeft}>
                <Flame size={14} color={theme.colors.warning} />
                <Text
                  style={[
                    styles.sprintLabel,
                    {
                      color: theme.colors.warning,
                      fontFamily: theme.fontFamily.semibold,
                    },
                  ]}
                >
                  Active sprint
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  void haptic.selection();
                  endFocusSession("completed");
                }}
                hitSlop={8}
                style={({ pressed }) => [pressed && { opacity: 0.6 }]}
                accessibilityRole="button"
              >
                <Text
                  style={{
                    fontSize: 12.5,
                    color: theme.colors.primary,
                    fontFamily: theme.fontFamily.semibold,
                  }}
                >
                  Complete sprint
                </Text>
              </Pressable>
            </View>
          ) : null
        }
      >
        <View style={styles.body}>
          {/* Spent today — the dominant figure, paired with the single ring. */}
          <View style={styles.leftCol}>
            <MetaLabel>Spent Today</MetaLabel>
            <Amount
              value={sprintTodaySpent}
              currency={currency}
              ghostable
              style={{
                fontSize: 26,
                letterSpacing: -0.8,
                fontFamily: theme.fontFamily.bold,
                color: isUnderTarget
                  ? theme.colors.foreground
                  : theme.colors.destructive,
              }}
            />
            {targetLimit > 0 ? (
              <Text
                style={[
                  styles.pctOfBudget,
                  { color: ringColor, fontFamily: theme.fontFamily.medium },
                ]}
                numberOfLines={2}
              >
                {progressPct}% of daily budget
              </Text>
            ) : null}
          </View>

          {/* Single progress visualisation — the horizontal bar was redundant. */}
          <CircularProgress
            progress={progressPct}
            size={84}
            strokeWidth={9}
            trackColor={surfaces.track}
            gradientFrom={ringColor}
            gradientTo={ringColor}
            valueColor={theme.colors.foreground}
          />

          <View style={styles.rightCol}>
            <View style={styles.rightItem}>
              <MetaLabel>Daily Budget</MetaLabel>
              <Amount
                value={targetLimit}
                currency={currency}
                ghostable
                style={{
                  fontSize: 15,
                  fontFamily: theme.fontFamily.semibold,
                  color: theme.colors.foreground,
                }}
              />
            </View>
            <View style={styles.rightItem}>
              <MetaLabel>Remaining</MetaLabel>
              <Amount
                value={remaining}
                currency={currency}
                ghostable
                style={{
                  fontSize: 15,
                  fontFamily: theme.fontFamily.semibold,
                  color: isUnderTarget
                    ? theme.colors.success
                    : theme.colors.destructive,
                }}
              />
            </View>
          </View>
        </View>

        <StatusStrip
          tone={isUnderTarget ? "accent" : "negative"}
          icon={
            <Sparkles
              size={14}
              color={isUnderTarget ? ACCENT_PURPLE : theme.colors.destructive}
            />
          }
          message={statusMessage}
        />
      </Section>

      <FocusConfigModal
        visible={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        onStart={startFocusSession}
      />
    </>
  );
}

const styles = StyleSheet.create({
  body: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    marginBottom: 14,
  },
  leftCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rightCol: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-end",
    gap: 10,
  },
  rightItem: {
    alignItems: "flex-end",
    gap: 1,
  },
  pctOfBudget: {
    fontSize: 11.5,
    lineHeight: 15,
    marginTop: 2,
  },
  sprintFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sprintLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sprintLabel: {
    fontSize: 12,
  },
});
