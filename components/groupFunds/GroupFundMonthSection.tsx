import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";

import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { Section } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { useGroupFundMonth } from "@/hooks/useGroupFundMonth";
import { useSettings } from "@/providers/SettingsProvider";
import type { GroupFund, GroupFundEvent } from "@/shared/types/groupFund";
import { formatMonthLabel } from "@/shared/utils/dateDisplay";
import { shiftMonthKey } from "@/shared/utils/dates";
import { groupFundMonthSummary, type MemberMonthState } from "@/shared/utils/groupFundMath";
import { fundStartPeriod } from "@/shared/utils/groupFundModel";
import { useTheme } from "@/theme/ThemeProvider";

const STATE_LABEL: Record<MemberMonthState, string> = { paid: "Paid", partial: "Partly paid", unpaid: "Not paid" };

export type GroupFundMonthSectionProps = {
  fund: GroupFund;
  currency: string;
  period: string;
  currentPeriod: string;
  onPeriodChange: (period: string) => void;
  /** This device's newest events (the history's live window), laid over the read-model copy. */
  recentEvents?: readonly GroupFundEvent[];
  /** Open the contribution sheet for someone who still owes. */
  onCollect?: (memberId: string, purposeId: string, period: string, pending: number) => void;
};

/**
 * SPENDLY-688: who paid this month, who partly paid and who didn't, for each
 * monthly purpose with an expected amount. Derived from the month's events
 * (one bounded read); nothing is created per month, so every month — past
 * ones included — is always there.
 */
export function GroupFundMonthSection({ fund, currency, period, currentPeriod, onPeriodChange, recentEvents, onCollect }: GroupFundMonthSectionProps) {
  const { theme } = useTheme();
  const { settings } = useSettings();
  const money = useGhostMoney(currency);
  const start = fundStartPeriod(fund);
  const tracked = fund.purposes.some((p) => !p.archived && p.cadence === "monthly" && (p.expectedPerMember ?? 0) > 0);
  const month = useGroupFundMonth(tracked ? fund.id : undefined, period, fund.version, recentEvents);
  const summary = useMemo(() => groupFundMonthSummary(fund, month.events, period), [fund, month.events, period]);
  const label = formatMonthLabel(period, settings.dateFormat, { long: true });
  const muted = { color: theme.colors.mutedForeground };
  const canGoBack = !start || period > start;
  const canGoForward = period < currentPeriod;

  const stateColor = (state: MemberMonthState) =>
    state === "paid" ? theme.colors.success : state === "partial" ? theme.colors.warning : theme.colors.destructive;

  const stepper = (
    <View style={styles.stepper}>
      <Button
        variant="ghost"
        size="icon"
        onPress={() => onPeriodChange(shiftMonthKey(period, -1))}
        disabled={!canGoBack}
        accessibilityLabel="Previous month"
      >
        <ChevronLeft size={18} color={canGoBack ? theme.colors.foreground : theme.colors.mutedForeground} />
      </Button>
      <Text style={[styles.month, { color: theme.colors.foreground }]} accessibilityLiveRegion="polite">
        {label}
      </Text>
      <Button
        variant="ghost"
        size="icon"
        onPress={() => onPeriodChange(shiftMonthKey(period, 1))}
        disabled={!canGoForward}
        accessibilityLabel="Next month"
      >
        <ChevronRight size={18} color={canGoForward ? theme.colors.foreground : theme.colors.mutedForeground} />
      </Button>
    </View>
  );

  let body;
  if (!tracked) {
    body = (
      <Text style={muted}>
        Set an expected amount per member on a monthly purpose (Edit fund) to see who has paid each month.
      </Text>
    );
  } else if (month.error) {
    body = <ErrorState title="Couldn't load this month" description={month.error.message} onRetry={month.error.retryable ? month.retry : undefined} />;
  } else if (month.loading) {
    body = <LoadingState variant="spinner" />;
  } else if (summary.length === 0) {
    body = (
      <Text style={muted}>
        {start && period < start ? `Collection starts in ${formatMonthLabel(start, settings.dateFormat, { long: true })}.` : "No members owe anything this month."}
      </Text>
    );
  } else {
    body = (
      <View style={{ gap: theme.space.md }}>
        {summary.map((purposeSummary) => {
          const purpose = fund.purposes.find((p) => p.id === purposeSummary.purposeId);
          return (
            <View key={purposeSummary.purposeId} style={{ gap: 6 }}>
              <Text style={[styles.purpose, { color: theme.colors.foreground }]}>{purpose?.name ?? "Purpose"}</Text>
              <Text style={[styles.detail, muted]}>
                {`${purposeSummary.paidCount} of ${purposeSummary.rows.length} paid · collected ${money(purposeSummary.collected)} of ${money(purposeSummary.expected)}`}
                {purposeSummary.pending > 0 ? ` · ${money(purposeSummary.pending)} pending` : ""}
              </Text>
              <View>
                {purposeSummary.rows.map((row, i) => {
                  const member = fund.members.find((m) => m.id === row.memberId);
                  const canCollect = Boolean(onCollect) && row.state !== "paid" && fund.status !== "archived";
                  return (
                    <Pressable
                      key={row.memberId}
                      onPress={canCollect ? () => onCollect!(row.memberId, row.purposeId, period, row.pending) : undefined}
                      disabled={!canCollect}
                      accessibilityRole={canCollect ? "button" : undefined}
                      accessibilityLabel={`${member?.name ?? "Member"}, ${STATE_LABEL[row.state]}, ${money(row.received)} of ${money(row.expected)}${canCollect ? ". Record their payment" : ""}`}
                      style={[
                        styles.row,
                        i < purposeSummary.rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
                      ]}
                    >
                      <View style={styles.flex}>
                        <Text style={[styles.name, { color: theme.colors.foreground }]}>{member?.name ?? "Member"}</Text>
                        <Text style={[styles.detail, muted]}>
                          {row.state === "paid"
                            ? `${money(row.received)} received`
                            : `${money(row.received)} of ${money(row.expected)} · ${money(row.pending)} due`}
                        </Text>
                      </View>
                      <Chip label={STATE_LABEL[row.state]} size="sm" selected appearance="tonal" accentColor={stateColor(row.state)} />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <Section title="This month" subtitle={tracked ? "Who has paid, and who still owes" : undefined}>
      <View style={{ gap: theme.space.sm }}>
        {tracked ? stepper : null}
        {body}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  month: { fontSize: 15, fontWeight: "700", minWidth: 140, textAlign: "center" },
  purpose: { fontSize: 14, fontWeight: "700" },
  detail: { fontSize: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  name: { fontSize: 14, fontWeight: "600" },
  flex: { flex: 1 },
});
