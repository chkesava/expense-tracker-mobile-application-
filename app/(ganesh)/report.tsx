import { Text } from "react-native";
import { useRouter } from "expo-router";
import { FileBarChart } from "lucide-react-native";

import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import {
  DataRow,
  GaneshHeader,
  MetaLabel,
  Money,
  Section,
  SectionPair,
  StatStrip,
  StatTile,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { Button } from "@/components/ui/Button";
import { useContributions } from "@/hooks/useContributions";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshSummary } from "@/hooks/useGaneshSummary";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePandalAssets } from "@/hooks/usePandalAssets";
import { usePandalSponsors } from "@/hooks/usePandalSponsors";
import { usePandals } from "@/hooks/usePandals";
import { usePermanentFund } from "@/hooks/usePermanentFund";
import { useSponsorships } from "@/hooks/useSponsorships";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { summarizeAssets } from "@/shared/utils/ganeshAssets";
import { buildFinancialOverview } from "@/shared/utils/ganeshFinancialOverview";
import {
  assetPurchaseAmountOf,
  fundLocationLabel,
  regularExpenseAmount,
  totalExpenses,
} from "@/shared/utils/ganeshMath";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { breakdownSponsors } from "@/shared/utils/ganeshSponsors";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Pandal Transparency — a committee-readable festival hisab.
 *
 * Same `buildFinancialOverview()` numbers as Funds. The layout is what you
 * would read aloud at a meeting: where money came from, where it went, what
 * the Pandal now owns. Promised-vs-received and the regular/asset split stay.
 */
export default function FestivalReportScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { back } = useRouter();
  const { pandalId, festivalId } = useGaneshSession();
  const { pandals } = usePandals();
  const { festivals } = useFestivals(pandalId);
  const writes = useGaneshWrites();
  const { can } = useGaneshPermissions();
  const pandal = pandals.find((item) => item.id === pandalId);
  const festival = festivals.find((item) => item.id === festivalId);
  const { summary } = useGaneshSummary(pandalId, festivalId);
  const { contributions } = useContributions(pandalId, festivalId);
  const { sponsorships } = useSponsorships(pandalId, festivalId);
  const { sponsors } = usePandalSponsors(pandalId);
  const { fund } = usePermanentFund(pandalId);
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
  const { assets } = usePandalAssets(pandalId);
  const assetSummary = summarizeAssets(assets);
  const canRecalculate = can("festival.update");

  return (
    <GaneshScreen>
      <GaneshHeader
        title="Pandal Transparency"
        subtitle={[pandal?.name, festival?.name].filter(Boolean).join(" · ") || undefined}
        icon={<FileBarChart size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
      />

      <Text style={{ color: theme.colors.mutedForeground, lineHeight: 21 }}>
        Read this aloud at a meeting: where the money came from, where it went, and what the
        Pandal now owns. Promises are not cash.
      </Text>

      <SectionPair>
        <Section title="Where money came from" subtitle="Cash that entered this festival">
          <StatStrip>
            {overview.moneyInLines.map((line) => (
              <StatTile key={line.id} label={line.label}>
                <Money value={line.amount} size="secondary" />
              </StatTile>
            ))}
            <StatTile label="Total cash in">
              <Money value={overview.moneyIn} size="secondary" />
            </StatTile>
          </StatStrip>
        </Section>

        <Section title="Where it went" subtitle="Spend and returns this festival">
          <StatStrip>
            {overview.moneyOutLines.map((line) => (
              <StatTile key={line.id} label={line.label}>
                <Money value={line.amount} size="secondary" />
              </StatTile>
            ))}
            <StatTile label="Festival expenses">
              <Money value={totalExpenses(summary)} size="secondary" />
            </StatTile>
            <StatTile label="Regular">
              <Money value={regularExpenseAmount(summary)} size="secondary" />
            </StatTile>
            <StatTile label="Asset purchases">
              <Money value={assetPurchaseAmountOf(summary)} size="secondary" />
            </StatTile>
          </StatStrip>
          <StatStrip>
            <StatTile label="Personal money used">
              <Money value={summary.personalMoneyUsed} size="secondary" />
            </StatTile>
            <StatTile label="Pending reimbursements">
              <Money value={overview.pendingReimbursements} size="secondary" />
            </StatTile>
          </StatStrip>
        </Section>
      </SectionPair>

      <Section title="What the Pandal owns" subtitle="After this festival's spend">
        <StatStrip>
          <StatTile label="Closing cash / God Fund">
            <Money value={overview.availableGodFund} size="secondary" />
          </StatTile>
          <StatTile label="Cash">
            <Money value={overview.locations.cash} size="secondary" />
          </StatTile>
          <StatTile label="UPI">
            <Money value={overview.locations.upi} size="secondary" />
          </StatTile>
          <StatTile label="Bank">
            <Money value={overview.locations.bank} size="secondary" />
          </StatTile>
          {overview.locations.other > 0 ? (
            <StatTile label={fundLocationLabel("other")}>
              <Money value={overview.locations.other} size="secondary" />
            </StatTile>
          ) : null}
          <StatTile label="Pandal estimated value">
            <Money value={assetSummary.estimatedValue} size="secondary" />
          </StatTile>
        </StatStrip>
      </Section>

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
        subtitle="Separate from Closing / God Fund. Expense sponsorship is not income."
      >
        <StatStrip>
          <StatTile label="Cash received">
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
        {sponsorRows.length > 0 ? (
          <>
            {sponsorRows.map((row, index) => (
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
            ))}
          </>
        ) : (
          <MetaLabel>No sponsor deals this festival.</MetaLabel>
        )}
      </Section>

      {canRecalculate ? (
        <Button variant="outline" onPress={() => void writes.recomputeFestivalSummary()}>
          Recalculate from ledger
        </Button>
      ) : null}
    </GaneshScreen>
  );
}
