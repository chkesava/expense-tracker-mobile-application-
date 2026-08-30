import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";

import { CollectionsList, ContributionsList, ExpensesList } from "@/components/ganesh/funds";
import { FestivalCashPosition } from "@/components/ganesh/funds/FestivalCashPosition";
import { FestivalReportStrip } from "@/components/ganesh/funds/FestivalReportStrip";
import { FundLedgerTabs, type FundLedger } from "@/components/ganesh/funds/FundLedgerTabs";
import {
  FundShortcuts,
  permanentFundShortcut,
  recordedShortcut,
  sponsorShortcut,
  type FundShortcut,
} from "@/components/ganesh/funds/FundShortcuts";
import { PandalNidhiHero } from "@/components/ganesh/funds/PandalNidhiHero";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshSyncChip } from "@/components/ganesh/GaneshSyncChip";
import { useContributions } from "@/hooks/useContributions";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshSummary } from "@/hooks/useGaneshSummary";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { summarizeContributions } from "@/shared/utils/ganeshContributions";
import { todayDateInput } from "@/shared/utils/ganeshIdentity";
import { availableGodFund, festivalCashSpent, totalCashIn } from "@/shared/utils/ganeshMath";

/**
 * Pandal Nidhi — the single money surface.
 *
 * The three ledgers used to be three of five bottom tabs. They now live here
 * under one control, so money is one destination. The original routes stay
 * registered as thin wrappers around the same list components, which is how
 * `?status=promised` from the Command Center keeps working.
 */
export default function FundsScreen() {
  const { push } = useRouter();
  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const { summary } = useGaneshSummary(pandalId, festivalId);
  const { contributions } = useContributions(pandalId, festivalId);
  const { can } = useGaneshPermissions();

  const festival = festivals.find((item) => item.id === festivalId);
  const godFund = availableGodFund(summary);
  const moneyIn = totalCashIn(summary);
  const spent = festivalCashSpent(summary);

  const totals = useMemo(
    () => summarizeContributions(contributions, todayDateInput()),
    [contributions]
  );

  const ledgers = useMemo(() => {
    const options: Array<{ id: FundLedger; label: string; badge?: number }> = [];
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

  const [ledger, setLedger] = useState<FundLedger | undefined>(undefined);
  const selected = ledger ?? ledgers[0]?.id;

  const shortcuts = useMemo(() => {
    const items: FundShortcut[] = [];
    if (can("sponsors.read")) {
      items.push(sponsorShortcut(() => push("/(ganesh)/sponsors" as never)));
    }
    if (can("permanentFund.read")) {
      items.push(permanentFundShortcut(() => push("/(ganesh)/permanent-fund" as never)));
    }
    items.push(recordedShortcut(() => push("/(ganesh)/report" as never)));
    return items;
  }, [can, push]);

  const prefix = (
    <View style={styles.prefix}>
      <FestivalCashPosition available={godFund} received={moneyIn} spent={spent} />
      <FundLedgerTabs options={ledgers} selected={selected} onChange={setLedger} />
      <FundShortcuts items={shortcuts} />
      {can("contributions.read") ? (
        <FestivalReportStrip totals={totals} onDetails={() => push("/(ganesh)/report" as never)} />
      ) : null}
    </View>
  );

  return (
    <GaneshScreen withTabBar scroll={false} contentContainerStyle={styles.bleed}>
      <PandalNidhiHero festivalName={festival?.name} rightAccessory={<GaneshSyncChip onDark />} />

      <View style={styles.list}>
        {selected === "contributions" ? (
          <ContributionsList embedded hideSummary prefix={prefix} />
        ) : null}
        {selected === "collections" ? <CollectionsList embedded prefix={prefix} /> : null}
        {selected === "expenses" ? <ExpensesList embedded prefix={prefix} /> : null}
      </View>
    </GaneshScreen>
  );
}

const styles = StyleSheet.create({
  bleed: {
    paddingHorizontal: 0,
    paddingTop: 0,
    gap: 0,
  },
  prefix: {
    gap: 10,
    paddingBottom: 4,
  },
  list: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 16,
    paddingTop: 4,
  },
});
