import { StyleSheet, Text, View } from "react-native";
import { History } from "lucide-react-native";

import { ErrorState } from "@/components/common/ErrorState";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { Section } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/Button";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { useGoalHistory } from "@/hooks/useGoalHistory";
import { useSettings } from "@/providers/SettingsProvider";
import type { GoalEvent } from "@/shared/types/goal";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import { canOfferCorrection, describeGoalEvent, fillAmounts } from "@/shared/utils/goalHistory";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces } from "@/theme/surfaces";

/**
 * A goal's history timeline (SPENDLY-609, FRD FR-04): every contribution,
 * reduction, correction, target change, lifecycle change and milestone,
 * newest first, cursor-paged. The listener mounts with this section only.
 */
export function GoalHistorySection({
  goalId,
  currency,
  canCorrect,
  onCorrect,
}: {
  goalId: string;
  currency: string;
  /** False for closed goals: corrections need the goal to be active or paused. */
  canCorrect: boolean;
  onCorrect: (event: GoalEvent) => void;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const money = useGhostMoney(currency);
  const { settings } = useSettings();
  const { events, pendingIds, loading, error, retry, hasMore, loadingMore, loadMore } = useGoalHistory(goalId);
  const meta = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };

  let content;
  if (error) {
    content = <ErrorState title="Couldn't load the history" description={error.message} onRetry={error.retryable ? retry : undefined} />;
  } else if (loading && events.length === 0) {
    content = <DashboardSkeleton variant="section" rows={3} />;
  } else if (events.length === 0) {
    content = <Text style={meta}>No entries yet. Contributions, changes and milestones will appear here.</Text>;
  } else {
    content = (
      <View>
        {events.map((e, i) => {
          const view = describeGoalEvent(e);
          const detail = view.detail ? fillAmounts(view.detail, view.amounts, money) : undefined;
          const when = formatDisplayDate(new Date(e.createdAtMs), settings.dateFormat);
          const amountText = view.amount !== null ? `${view.amount > 0 ? "+" : "−"}${money(Math.abs(view.amount))}` : null;
          const color = view.tone === "positive" ? theme.colors.success : view.tone === "negative" ? theme.colors.destructive : theme.colors.foreground;
          const pending = pendingIds.has(e.id);
          return (
            <View
              key={e.id}
              style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border }]}
              accessible
              accessibilityLabel={[view.title, amountText, detail, when, pending ? "waiting to sync" : undefined].filter(Boolean).join(", ")}
            >
              <View style={styles.main}>
                <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.medium, fontSize: theme.typography.sm }}>{view.title}</Text>
                {detail ? <Text style={meta}>{detail}</Text> : null}
                <Text style={meta}>
                  {when}
                  {pending ? " · waiting to sync" : ""}
                </Text>
              </View>
              <View style={styles.side}>
                {amountText ? <Text style={{ color, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }}>{amountText}</Text> : null}
                {canCorrect && canOfferCorrection(e, events) ? (
                  <Button variant="ghost" size="sm" onPress={() => onCorrect(e)} accessibilityLabel={`Fix entry: ${view.title} ${amountText ?? ""}`}>
                    Fix
                  </Button>
                ) : null}
              </View>
            </View>
          );
        })}
        {hasMore ? (
          <Button variant="ghost" onPress={() => void loadMore()} loading={loadingMore} disabled={loadingMore}>
            Show older entries
          </Button>
        ) : null}
      </View>
    );
  }

  return (
    <Section title="History" icon={<History size={16} color={theme.colors.primary} />} iconTint={surfaces.wash(theme.colors.primary)}>
      {content}
    </Section>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12, paddingVertical: 10, alignItems: "flex-start" },
  main: { flex: 1, minWidth: 0, gap: 2 },
  side: { alignItems: "flex-end", gap: 2 },
});
