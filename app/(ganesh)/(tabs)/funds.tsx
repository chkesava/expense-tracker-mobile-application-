import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  Building2,
  Gift,
  IndianRupee,
  Landmark,
  Receipt,
  Wallet,
} from "lucide-react-native";

import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshSyncChip } from "@/components/ganesh/GaneshSyncChip";
import {
  GaneshHeader,
  MetaLabel,
  Money,
  NavRow,
  ProgressTrack,
  Section,
  StatTile,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { useContributions } from "@/hooks/useContributions";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshSummary } from "@/hooks/useGaneshSummary";
import { usePermanentFund } from "@/hooks/usePermanentFund";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { summarizeContributions } from "@/shared/utils/ganeshContributions";
import { todayDateInput } from "@/shared/utils/ganeshIdentity";
import { availableGodFund, festivalCashSpent, totalCashIn } from "@/shared/utils/ganeshMath";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Pandal Nidhi — the single money surface.
 *
 * Collections, Expenses and Contributions used to be three of the five bottom
 * tabs, which is what made a pandal operations app read as an expense tracker.
 * They are now one destination: this screen carries the festival's financial
 * position and routes into the three ledgers, which are unchanged and still
 * live at their original routes.
 *
 * Contributions lead, because promised-versus-received is the number a
 * committee is actually asked about.
 */
export default function FundsScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { push } = useRouter();
  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const { summary } = useGaneshSummary(pandalId, festivalId);
  const { contributions } = useContributions(pandalId, festivalId);
  const { fund } = usePermanentFund(pandalId);
  const { can } = useGaneshPermissions();

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  const festival = festivals.find((item) => item.id === festivalId);

  const godFund = availableGodFund(summary);
  const moneyIn = totalCashIn(summary);
  const spent = festivalCashSpent(summary);

  const totals = useMemo(
    () => summarizeContributions(contributions, todayDateInput()),
    [contributions]
  );

  // Promised money is not cash and never enters the God Fund — the label says
  // so out loud, because that distinction is the one committees get wrong.
  const promisedTotal = totals.promisedCash + totals.promisedInKind;
  const spendPct = moneyIn > 0 ? (spent / moneyIn) * 100 : 0;

  return (
    <GaneshScreen safeTop withTabBar refreshing={refreshing} onRefresh={handleRefresh}>
      <GaneshHeader
        title="Pandal Nidhi"
        subtitle={festival?.name}
        icon={<IndianRupee size={22} color={g.saffron} strokeWidth={2.2} />}
        rightElement={<GaneshSyncChip />}
      />

      <Section title="This festival" subtitle="Cash position">
        <View style={styles.statRow}>
          <StatTile label="Available">
            <Money value={godFund} size="primary" tone="positive" numberOfLines={1} adjustsFontSizeToFit />
          </StatTile>
          <StatTile label="Received">
            <Money value={moneyIn} size="primary" numberOfLines={1} adjustsFontSizeToFit />
          </StatTile>
          <StatTile label="Spent">
            <Money value={spent} size="primary" numberOfLines={1} adjustsFontSizeToFit />
          </StatTile>
        </View>

        <View style={styles.meter}>
          <ProgressTrack pct={spendPct} color={g.saffron} />
          <MetaLabel>
            {moneyIn > 0
              ? `${Math.round(spendPct)}% of what the Pandal received has been spent`
              : "Nothing received yet this festival"}
          </MetaLabel>
        </View>
      </Section>

      {promisedTotal > 0 ? (
        <Section title="Promised, not yet received">
          <View style={styles.statRow}>
            <StatTile label="Promised">
              <Money value={promisedTotal} size="primary" tone="warning" numberOfLines={1} adjustsFontSizeToFit />
            </StatTile>
            <StatTile label="Promises">
              <Text
                style={[styles.count, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}
              >
                {totals.promisedCount}
              </Text>
            </StatTile>
            <StatTile label="Overdue">
              <Text
                style={[
                  styles.count,
                  {
                    color: totals.overdueCount > 0 ? theme.colors.warning : theme.colors.foreground,
                    fontFamily: theme.fontFamily.semibold,
                  },
                ]}
              >
                {totals.overdueCount}
              </Text>
            </StatTile>
          </View>
          <MetaLabel>
            Promised amounts are not cash. They are not part of the available God Fund until
            somebody marks them received.
          </MetaLabel>
        </Section>
      ) : null}

      <Section title="Ledgers">
        {can("contributions.read") ? (
          <NavRow
            title="Contributions"
            meta="Donors and committee members — promised and received"
            icon={<Gift size={17} color={g.saffron} strokeWidth={2.2} />}
            iconTint={g.wash(g.saffron)}
            value={<Money value={totals.cashReceived} size="secondary" />}
            badge={
              totals.overdueCount > 0
                ? { kind: "overdue", label: `${totals.overdueCount} overdue` }
                : undefined
            }
            divider
            onPress={() => push("/(ganesh)/(tabs)/contributions" as never)}
          />
        ) : null}
        {can("collections.read") ? (
          <NavRow
            title="Collections"
            meta="Door-to-door chanda from households"
            icon={<Wallet size={17} color={theme.colors.mutedForeground} strokeWidth={2.2} />}
            value={<Money value={summary.chanda} size="secondary" />}
            divider
            onPress={() => push("/(ganesh)/(tabs)/collections" as never)}
          />
        ) : null}
        {can("expenses.read") ? (
          <NavRow
            title="Expenses"
            meta="What the festival spent, and on what"
            icon={<Receipt size={17} color={theme.colors.mutedForeground} strokeWidth={2.2} />}
            value={<Money value={spent} size="secondary" />}
            divider={can("sponsors.read")}
            onPress={() => push("/(ganesh)/(tabs)/expenses" as never)}
          />
        ) : null}
        {can("sponsors.read") ? (
          <NavRow
            title="Sponsors"
            meta="Who is backing this festival. Promised deals are not cash."
            icon={<Building2 size={17} color={theme.colors.mutedForeground} strokeWidth={2.2} />}
            onPress={() => push("/(ganesh)/sponsors" as never)}
          />
        ) : null}
      </Section>

      <Section title="Across festivals">
        {can("permanentFund.read") ? (
          <NavRow
            title="Permanent Fund"
            meta="The Pandal's standing corpus, kept between festivals"
            icon={<Landmark size={17} color={g.maroon} strokeWidth={2.2} />}
            iconTint={g.wash(g.maroon)}
            value={<Money value={fund.total} size="secondary" />}
            divider
            onPress={() => push("/(ganesh)/permanent-fund" as never)}
          />
        ) : null}
        <NavRow
          title="Festival report"
          meta="Where every rupee came from and went"
          icon={<IndianRupee size={17} color={theme.colors.mutedForeground} strokeWidth={2.2} />}
          onPress={() => push("/(ganesh)/report" as never)}
        />
      </Section>
    </GaneshScreen>
  );
}

const styles = StyleSheet.create({
  statRow: {
    flexDirection: "row",
    gap: 10,
  },
  meter: {
    marginTop: 12,
    gap: 6,
  },
  count: {
    fontSize: 17,
    letterSpacing: -0.2,
    fontVariant: ["tabular-nums"],
  },
});
