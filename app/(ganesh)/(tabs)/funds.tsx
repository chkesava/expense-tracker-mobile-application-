import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";

import { CollectionsList, ContributionsList, ExpensesList } from "@/components/ganesh/funds";
import { FestivalFinancialDashboard } from "@/components/ganesh/funds/FestivalFinancialDashboard";
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
import { ListStateView } from "@/components/ganesh/ui";
import { useCollections } from "@/hooks/useCollections";
import { useContributions } from "@/hooks/useContributions";
import { useFestivalMembers } from "@/hooks/useFestivalMembers";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshActivity } from "@/hooks/useGaneshActivity";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshSummary } from "@/hooks/useGaneshSummary";
import { useHouseholds } from "@/hooks/useHouseholds";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { usePermanentFund } from "@/hooks/usePermanentFund";
import { useSponsorships } from "@/hooks/useSponsorships";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { memberDisplayName, todayDateInput } from "@/shared/utils/ganeshIdentity";
import { buildFinancialOverview } from "@/shared/utils/ganeshFinancialOverview";

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
  const { summary, loading: summaryLoading, error: summaryError, retry: retrySummary } =
    useGaneshSummary(pandalId, festivalId);
  const { contributions } = useContributions(pandalId, festivalId);
  const { sponsorships } = useSponsorships(pandalId, festivalId);
  const { members: festivalMembers } = useFestivalMembers(pandalId, festivalId);
  const { members: pandalMembers } = usePandalMembers(pandalId);
  const { households } = useHouseholds(pandalId, festivalId);
  const { collections } = useCollections(pandalId, festivalId);
  const { fund } = usePermanentFund(pandalId);
  const { activity } = useGaneshActivity(pandalId, festivalId);
  const { can } = useGaneshPermissions();

  const festival = festivals.find((item) => item.id === festivalId);
  const overview = useMemo(
    () =>
      buildFinancialOverview({
        summary,
        permanentFund: fund,
        contributions,
        sponsorships,
        members: festivalMembers,
        households,
        collections,
        activity,
        festival,
        today: todayDateInput(),
      }),
    [
      summary,
      fund,
      contributions,
      sponsorships,
      festivalMembers,
      households,
      collections,
      activity,
      festival,
    ]
  );

  const ledgers = useMemo(() => {
    const options: Array<{ id: FundLedger; label: string; badge?: number }> = [];
    if (can("contributions.read")) {
      options.push({
        id: "contributions",
        label: "Contributions",
        badge: overview.contributionTotals.promisedCount > 0
          ? overview.contributionTotals.promisedCount
          : undefined,
      });
    }
    if (can("collections.read")) {
      options.push({ id: "collections", label: "Collections" });
    }
    if (can("expenses.read")) {
      options.push({ id: "expenses", label: "Expenses" });
    }
    return options;
  }, [can, overview.contributionTotals.promisedCount]);

  const [ledger, setLedger] = useState<FundLedger | undefined>(undefined);
  const selected = ledger ?? ledgers[0]?.id;

  const shortcuts = useMemo(() => {
    const items: FundShortcut[] = [];
    if (can("sponsors.read")) {
      items.push(sponsorShortcut(() => push("/(ganesh)/sponsors")));
    }
    if (can("permanentFund.read")) {
      items.push(permanentFundShortcut(() => push("/(ganesh)/permanent-fund")));
    }
    items.push(recordedShortcut(() => push("/(ganesh)/report")));
    return items;
  }, [can, push]);

  const prefix = (
    <View style={styles.prefix}>
      {summaryLoading ? (
        <ListStateView loading title="Loading financial summary" skeletonCount={4} />
      ) : summaryError ? (
        <ListStateView
          error={summaryError}
          onRetry={retrySummary}
          title="We couldn't load the financial summary."
          description="Please check your connection and try again."
        />
      ) : (
        <FestivalFinancialDashboard
          overview={overview}
          festivalName={festival?.name}
          canSeePermanentFund={can("permanentFund.read")}
          canSeeReimbursements={can("reimbursements.read")}
          canSeeContributions={can("contributions.read")}
          canSeeCollections={can("collections.read")}
          activityActors={(actorId) => memberDisplayName(pandalMembers, actorId)}
          onReport={() => push("/(ganesh)/report")}
          onPermanentFund={() => push("/(ganesh)/permanent-fund")}
          onReimburse={() => push("/(ganesh)/add-reimbursement")}
          onPromised={() => push("/(ganesh)/(tabs)/contributions?status=promised")}
          onHouses={() => push("/(ganesh)/(tabs)/collections")}
          onCommittee={() => push("/(ganesh)/(tabs)/committee")}
        />
      )}
      <FundLedgerTabs options={ledgers} selected={selected} onChange={setLedger} />
      <FundShortcuts items={shortcuts} />
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
