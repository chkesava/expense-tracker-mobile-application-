import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Button } from "@/components/ui/Button";
import { AdminGlyph } from "@/components/ganesh/admin/adminArt";
import { AdminLinkRow } from "@/components/ganesh/AdminLinkRow";
import { FestivalStackHero } from "@/components/ganesh/chrome/FestivalStackHero";
import { ganeshStackLayout } from "@/components/ganesh/chrome/stackLayout";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import {
  DataRow,
  ListStateView,
  Money,
  Section,
  SectionPair,
  StatStrip,
  StatTile,
} from "@/components/ganesh/ui";
import { useContributions } from "@/hooks/useContributions";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshSummary } from "@/hooks/useGaneshSummary";
import { usePandalAssets } from "@/hooks/usePandalAssets";
import { usePandalSponsors } from "@/hooks/usePandalSponsors";
import { usePermanentFund } from "@/hooks/usePermanentFund";
import { useSponsorships } from "@/hooks/useSponsorships";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { summarizeAssets } from "@/shared/utils/ganeshAssets";
import { buildFinancialOverview } from "@/shared/utils/ganeshFinancialOverview";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { breakdownSponsors } from "@/shared/utils/ganeshSponsors";
import {
  assetPurchaseAmountOf,
  regularExpenseAmount,
  totalExpenses,
} from "@/shared/utils/ganeshMath";
import { useTheme } from "@/theme/ThemeProvider";

export default function AdminReportsScreen() {
  const { theme } = useTheme();
  const { push, back } = useRouter();
  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const {
    summary,
    loading: summaryLoading,
    error: summaryError,
    retry: retrySummary,
  } = useGaneshSummary(pandalId, festivalId);
  const { contributions } = useContributions(pandalId, festivalId);
  const { sponsorships } = useSponsorships(pandalId, festivalId);
  const { sponsors } = usePandalSponsors(pandalId);
  const { assets } = usePandalAssets(pandalId);
  const { fund } = usePermanentFund(pandalId);
  const festival = festivals.find((item) => item.id === festivalId);
  const overview = buildFinancialOverview({
    summary,
    permanentFund: fund,
    contributions,
    sponsorships,
    festival,
  });
  const contributionTotals = overview.contributionTotals;
  const sponsorTotals = overview.sponsorTotals;
  const sponsorRows = breakdownSponsors(sponsorships, sponsors);
  const assetSummary = summarizeAssets(assets);

  return (
    <GaneshScreen contentContainerStyle={ganeshStackLayout.bleed}>
      <FestivalStackHero
        title="Reports"
        subtitle={festival?.name}
        onBack={back}
        mark={<AdminGlyph name="iconReports" size={40} />}
      />
      <View style={ganeshStackLayout.body}>
      <Text style={{ color: theme.colors.mutedForeground, lineHeight: 22 }}>
        Quick totals for the current festival. Open a section when you need the list behind the
        number.
      </Text>

      {summaryLoading ? (
        <ListStateView loading title="Loading totals" skeletonCount={4} />
      ) : summaryError ? (
        <ListStateView
          error={summaryError}
          onRetry={retrySummary}
          title="We couldn't load these totals."
          description="Nothing is shown rather than showing zero."
        />
      ) : (
        <>

      {/* GS-079 */}
      <Button variant="outline" onPress={() => push("/(ganesh)/export-report")}>
        Export or print this report
      </Button>

      <SectionPair>
        <Section title="Cash this festival">
          <StatStrip>
            <StatTile label="Total cash in">
              <Money value={overview.moneyIn} size="secondary" />
            </StatTile>
            <StatTile label="God Fund expenses">
              <Money value={summary.godFundExpenses} size="secondary" />
            </StatTile>
            <StatTile label="Reimbursements">
              <Money value={summary.reimbursements} size="secondary" />
            </StatTile>
            <StatTile label="Closing / God Fund">
              <Money value={overview.availableGodFund} size="secondary" />
            </StatTile>
          </StatStrip>
        </Section>
        <Section title="Spend and property">
          <StatStrip>
            <StatTile label="Festival expenses">
              <Money value={totalExpenses(summary)} size="secondary" />
            </StatTile>
            <StatTile label="Regular">
              <Money value={regularExpenseAmount(summary)} size="secondary" />
            </StatTile>
            <StatTile label="Asset purchases">
              <Money value={assetPurchaseAmountOf(summary)} size="secondary" />
            </StatTile>
            <StatTile label="Pandal estimated value">
              <Money value={assetSummary.estimatedValue} size="secondary" />
            </StatTile>
            <StatTile label="To Permanent Fund">
              <Money value={summary.transferredToPermanentFund} size="secondary" />
            </StatTile>
            <StatTile label="Permanent Fund">
              <Money value={fund.total} size="secondary" />
            </StatTile>
          </StatStrip>
        </Section>
      </SectionPair>

      <Section
        title="Promised vs received"
        subtitle="Promised and cancelled amounts are not cash and are not part of Closing / God Fund."
      >
        <StatStrip>
          <StatTile label="Cash received">
            <Money value={contributionTotals.cashReceived} size="secondary" />
          </StatTile>
          <StatTile label="Promised cash">
            <Money value={contributionTotals.promisedCash} size="secondary" />
          </StatTile>
          <StatTile label="In-kind received">
            <Money value={contributionTotals.inKindReceived} size="secondary" />
          </StatTile>
          <StatTile label="Promised in-kind">
            <Money value={contributionTotals.promisedInKind} size="secondary" />
          </StatTile>
          <StatTile label="Cancelled">
            <Money value={contributionTotals.cancelledValue} size="secondary" />
          </StatTile>
        </StatStrip>
      </Section>

      <Section
        title="Sponsors"
        subtitle="Sponsor cash is already counted above, in Cash received. Only expenses a sponsor paid directly stay outside the God Fund."
      >
        <StatStrip>
          <StatTile label="Of which from sponsors">
            <Money value={sponsorTotals.cashReceived} size="secondary" />
          </StatTile>
          <StatTile label="Promised cash">
            <Money value={sponsorTotals.promisedCash} size="secondary" />
          </StatTile>
          <StatTile label="In-kind received">
            <Money value={sponsorTotals.inKindReceived} size="secondary" />
          </StatTile>
          <StatTile label="Promised in-kind">
            <Money value={sponsorTotals.promisedInKind} size="secondary" />
          </StatTile>
          <StatTile label="Cancelled">
            <Money value={sponsorTotals.cancelledValue} size="secondary" />
          </StatTile>
        </StatStrip>
        {sponsorRows.length > 0
          ? sponsorRows.map((row, index) => (
              <DataRow
                key={row.sponsorId}
                title={row.name}
                meta={[
                  `Received ${formatInr(row.received)}`,
                  `Promised ${formatInr(row.promised)}`,
                  row.inKind > 0 ? `In-kind ${formatInr(row.inKind)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                divider={index < sponsorRows.length - 1}
              />
            ))
          : null}
      </Section>

      <Section title="Reports">
        <AdminLinkRow
          divider
          title="Festival summary"
          subtitle="Cash in, expenses, and closing balance"
          onPress={() => push("/(ganesh)/report")}
        />
        <AdminLinkRow
          divider
          title="Collection summary"
          subtitle="Households, collectors, and payment methods"
          onPress={() => push("/(ganesh)/(tabs)/collections")}
        />
        <AdminLinkRow
          divider
          title="Expense summary"
          subtitle="God Fund, personal, and pending reimbursements"
          onPress={() => push("/(ganesh)/(tabs)/expenses")}
        />
        <AdminLinkRow
          divider
          title="Committee contribution summary"
          subtitle="Who paid this festival"
          onPress={() => push("/(ganesh)/(tabs)/committee")}
        />
        <AdminLinkRow
          divider
          title="Contribution summary"
          subtitle="Cash received, promised, in-kind, and cancelled. Promises do not add cash."
          onPress={() => push("/(ganesh)/(tabs)/contributions")}
        />
        <AdminLinkRow
          divider
          title="Sponsor summary"
          subtitle="Sponsor cash is inside the God Fund and already counted in Cash received; only directly-paid expenses sit outside it."
          onPress={() => push("/(ganesh)/sponsors")}
        />
        <AdminLinkRow
          divider
          title="Reimbursement summary"
          subtitle="Personal money still to be paid back"
          onPress={() => push("/(ganesh)/(tabs)/committee")}
        />
        <AdminLinkRow
          title="Permanent Fund history"
          subtitle="Donations and festival transfers"
          onPress={() => push("/(ganesh)/permanent-fund")}
        />
      </Section>
        </>
      )}
      </View>
    </GaneshScreen>
  );
}
