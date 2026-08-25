import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { FileBarChart } from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import {
  DataRow,
  FundHero,
  GaneshHeader,
  MetaLabel,
  Money,
  Section,
  StatusStrip,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { useContributions } from "@/hooks/useContributions";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshSummary } from "@/hooks/useGaneshSummary";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePandalAssets } from "@/hooks/usePandalAssets";
import { usePandalSponsors } from "@/hooks/usePandalSponsors";
import { usePandals } from "@/hooks/usePandals";
import { useSponsorships } from "@/hooks/useSponsorships";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { summarizeAssets } from "@/shared/utils/ganeshAssets";
import { summarizeContributions } from "@/shared/utils/ganeshContributions";
import { breakdownSponsors, summarizeSponsorships } from "@/shared/utils/ganeshSponsors";
import {
  assetPurchaseAmountOf,
  availableGodFund,
  regularExpenseAmount,
  totalCashIn,
  totalExpenses,
} from "@/shared/utils/ganeshMath";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useTheme } from "@/theme/ThemeProvider";

/** A statement line: label left, amount right-aligned in a tabular column. */
function Line({
  label,
  value,
  meta,
  divider,
  emphasis,
}: {
  label: string;
  value: number;
  meta?: string;
  divider?: boolean;
  emphasis?: boolean;
}) {
  return (
    <DataRow
      title={label}
      meta={meta}
      divider={divider}
      value={<Money value={value} size={emphasis ? "primary" : "secondary"} />}
    />
  );
}

export default function FestivalReportScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { back } = useRouter();
  const { pandalId, festivalId } = useGaneshSession();

  const { pandals } = usePandals();
  const { festivals } = useFestivals(pandalId);
  const { summary } = useGaneshSummary(pandalId, festivalId);
  const { contributions } = useContributions(pandalId, festivalId);
  const { sponsorships } = useSponsorships(pandalId, festivalId);
  const { sponsors } = usePandalSponsors(pandalId);
  const { assets } = usePandalAssets(pandalId);
  const writes = useGaneshWrites();
  const { can } = useGaneshPermissions();

  const contributionTotals = useMemo(
    () => summarizeContributions(contributions),
    [contributions]
  );
  const sponsorTotals = useMemo(() => summarizeSponsorships(sponsorships), [sponsorships]);
  const sponsorRows = useMemo(
    () => breakdownSponsors(sponsorships, sponsors),
    [sponsors, sponsorships]
  );
  const assetSummary = useMemo(() => summarizeAssets(assets), [assets]);

  const pandal = pandals.find((item) => item.id === pandalId);
  const festival = festivals.find((item) => item.id === festivalId);

  return (
    <GaneshScreen safeTop>
      <GaneshHeader
        title="Festival report"
        subtitle={[festival?.name, pandal?.name].filter(Boolean).join(" · ") || undefined}
        icon={<FileBarChart size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
      />

      <FundHero
        eyebrow="Closing God Fund"
        amount={availableGodFund(summary)}
        kind="god"
        breakdown={[
          { label: "Cash in", value: totalCashIn(summary) },
          { label: "Cash out", value: summary.godFundExpenses + summary.reimbursements },
        ]}
      />

      {/* A statement reads as rows, not tiles — one label, one right-aligned amount. */}
      <Section title="Money in">
        <Line label="Opening funds" value={summary.openingFunds} divider />
        <Line label="Household chanda" value={summary.chanda} divider />
        <Line label="Committee contributions" value={summary.committeeContributions} divider />
        <Line label="Other cash contributions" value={summary.otherCashContributions} divider />
        <Line label="Total cash in" value={totalCashIn(summary)} emphasis />
      </Section>

      <Section title="Money out">
        <Line label="God Fund expenses" value={summary.godFundExpenses} divider />
        <Line label="Reimbursements paid" value={summary.reimbursements} divider />
        <Line
          label="Total cash out"
          value={summary.godFundExpenses + summary.reimbursements}
          emphasis
        />
      </Section>

      <Section title="Permanent Fund movement">
        <Line label="Taken from Permanent Fund" value={summary.receivedFromPermanentFund} divider />
        <Line label="Returned to Permanent Fund" value={summary.transferredToPermanentFund} />
      </Section>

      <Section
        title="Personal money"
        subtitle="Money members fronted from their own pockets"
      >
        <Line label="Personal money used" value={summary.personalMoneyUsed} divider />
        <Line
          label="Still to be reimbursed"
          value={summary.pendingReimbursements}
          emphasis
        />
      </Section>

      <Section title="Spending breakdown">
        <Line label="All expenses" value={totalExpenses(summary)} divider />
        <Line label="Regular spending" value={regularExpenseAmount(summary)} divider />
        <Line label="Asset purchases" value={assetPurchaseAmountOf(summary)} />
      </Section>

      <Section
        title="Promised vs received"
        subtitle="Promised and cancelled amounts are not cash and are not in the closing balance."
      >
        <Line label="Cash received" value={contributionTotals.cashReceived} divider />
        <Line label="Promised cash" value={contributionTotals.promisedCash} divider />
        <Line label="In-kind received" value={contributionTotals.inKindReceived} divider />
        <Line label="Promised in-kind" value={contributionTotals.promisedInKind} divider />
        <Line label="Cancelled" value={contributionTotals.cancelledValue} />
      </Section>

      <Section
        title="Sponsors"
        subtitle="Separate from the closing balance. Expense sponsorship is never income."
      >
        <Line label="Cash received" value={sponsorTotals.cashReceived} divider />
        <Line label="Promised cash" value={sponsorTotals.promisedCash} divider />
        <Line label="In-kind received" value={sponsorTotals.inKindReceived} divider />
        <Line label="Promised in-kind" value={sponsorTotals.promisedInKind} divider />
        <Line label="Cancelled" value={sponsorTotals.cancelledValue} />
      </Section>

      {sponsorRows.length > 0 ? (
        <Section title="By sponsor" subtitle={`${sponsorRows.length} this festival`}>
          {sponsorRows.map((row, index) => (
            <View
              key={row.sponsorId}
              style={[
                styles.sponsorRow,
                index < sponsorRows.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: g.divider,
                },
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.sponsorName,
                  { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium },
                ]}
              >
                {row.name}
              </Text>
              <View style={styles.sponsorCells}>
                <View style={styles.sponsorCell}>
                  <MetaLabel>Received</MetaLabel>
                  <Money value={row.received} size="secondary" tone="positive" />
                </View>
                <View style={styles.sponsorCell}>
                  <MetaLabel>Promised</MetaLabel>
                  <Money value={row.promised} size="secondary" />
                </View>
                {row.inKind > 0 ? (
                  <View style={styles.sponsorCell}>
                    <MetaLabel>In-kind</MetaLabel>
                    <Money value={row.inKind} size="secondary" />
                  </View>
                ) : null}
              </View>
            </View>
          ))}
        </Section>
      ) : null}

      <Section title="Pandal assets" subtitle="Inventory value, not festival cash">
        <Line
          label="Estimated worth"
          value={assetSummary.estimatedValue}
          meta={`${assetSummary.totalItems} items · ${assetSummary.available} available`}
          emphasis
        />
      </Section>

      {can("festival.update") ? (
        <>
          <StatusStrip
            tone="muted"
            message="Recalculating rebuilds these totals from the ledger entries. It never changes an entry."
          />
          <Button variant="outline" onPress={() => void writes.recomputeFestivalSummary()}>
            Recalculate from ledger
          </Button>
        </>
      ) : null}
    </GaneshScreen>
  );
}

const styles = StyleSheet.create({
  sponsorRow: {
    paddingVertical: 12,
    gap: 8,
  },
  sponsorName: {
    fontSize: 14,
  },
  sponsorCells: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  sponsorCell: {
    minWidth: 76,
    gap: 1,
  },
});
