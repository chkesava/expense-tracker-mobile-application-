import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { IndianRupee } from "lucide-react-native";

import { CollectionsList, ContributionsList, ExpensesList } from "@/components/ganesh/funds";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshSyncChip } from "@/components/ganesh/GaneshSyncChip";
import {
  FilterChips,
  GaneshHeader,
  MetaLabel,
  Money,
  ProgressTrack,
  Section,
  StatTile,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { haptic } from "@/lib/haptics";
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

type Ledger = "contributions" | "collections" | "expenses";

/**
 * Pandal Nidhi — the single money surface.
 *
 * The three ledgers used to be three of five bottom tabs. They now live here
 * under one segmented control, so money is one destination. The original
 * routes stay registered as thin wrappers around the same list components,
 * which is how `?status=promised` from the Command Center keeps working.
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

  const festival = festivals.find((item) => item.id === festivalId);
  const godFund = availableGodFund(summary);
  const moneyIn = totalCashIn(summary);
  const spent = festivalCashSpent(summary);
  const spendPct = moneyIn > 0 ? (spent / moneyIn) * 100 : 0;

  const totals = useMemo(
    () => summarizeContributions(contributions, todayDateInput()),
    [contributions]
  );

  const ledgers = useMemo(() => {
    const options: Array<{ id: Ledger; label: string; badge?: number }> = [];
    if (can("contributions.read")) {
      options.push({
        id: "contributions",
        label: "Contributions",
        badge: totals.promisedCount > 0 ? totals.promisedCount : undefined,
      });
    }
    if (can("collections.read")) {
      options.push({ id: "collections", label: "Collections" });
    }
    if (can("expenses.read")) {
      options.push({ id: "expenses", label: "Expenses" });
    }
    return options;
  }, [can, totals.promisedCount]);

  const [ledger, setLedger] = useState<Ledger | undefined>(undefined);
  const selected = ledger ?? ledgers[0]?.id;

  return (
    <GaneshScreen safeTop withTabBar scroll={false}>
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

      {ledgers.length > 0 ? (
        <FilterChips
          value={selected ?? ledgers[0].id}
          options={ledgers}
          onChange={setLedger}
          layout="wrap"
        />
      ) : null}

      <View style={styles.more}>
        {can("sponsors.read") ? (
          <MoreLink label="Sponsors" onPress={() => push("/(ganesh)/sponsors" as never)} />
        ) : null}
        {can("permanentFund.read") ? (
          <MoreLink
            label={`Permanent Fund · ${fund.total > 0 ? "recorded" : "empty"}`}
            onPress={() => push("/(ganesh)/permanent-fund" as never)}
          />
        ) : null}
        <MoreLink label="Festival report" onPress={() => push("/(ganesh)/report" as never)} />
      </View>

      <View style={styles.list}>
        {selected === "contributions" ? <ContributionsList embedded /> : null}
        {selected === "collections" ? <CollectionsList embedded /> : null}
        {selected === "expenses" ? <ExpensesList embedded /> : null}
      </View>
    </GaneshScreen>
  );
}

function MoreLink({ label, onPress }: { label: string; onPress: () => void }) {
  const { theme } = useTheme();
  const g = useGaneshTokens();

  return (
    <Pressable
      onPress={() => {
        void haptic.selection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.moreLink, pressed && { opacity: 0.7 }]}
    >
      <Text style={[styles.moreText, { color: g.saffron, fontFamily: theme.fontFamily.semibold }]}>
        {label}
      </Text>
    </Pressable>
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
  list: {
    flex: 1,
    minHeight: 0,
  },
  more: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingTop: 4,
  },
  moreLink: {
    minHeight: 32,
    justifyContent: "center",
  },
  moreText: {
    fontSize: 13,
  },
});
