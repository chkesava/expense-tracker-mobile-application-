import { Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { MetricGrid } from "@/components/ganesh/MetricGrid";
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
import { formatInr } from "@/shared/utils/ganeshMoney";
import { useTheme } from "@/theme/ThemeProvider";

export default function FestivalReportScreen() {
  const { theme } = useTheme();
  const { pandalId, festivalId } = useGaneshSession();
  const { pandals } = usePandals();
  const { festivals } = useFestivals(pandalId);
  const { summary } = useGaneshSummary(pandalId, festivalId);
  const { contributions } = useContributions(pandalId, festivalId);
  const contributionTotals = summarizeContributions(contributions);
  const { sponsorships } = useSponsorships(pandalId, festivalId);
  const { sponsors } = usePandalSponsors(pandalId);
  const sponsorTotals = summarizeSponsorships(sponsorships);
  const sponsorRows = breakdownSponsors(sponsorships, sponsors);
  const { assets } = usePandalAssets(pandalId);
  const assetSummary = summarizeAssets(assets);
  const writes = useGaneshWrites();
  const { can } = useGaneshPermissions();
  const pandal = pandals.find((item) => item.id === pandalId);
  const festival = festivals.find((item) => item.id === festivalId);

  return (
    <GaneshScreen>
      <Text style={{ color: theme.colors.foreground, fontSize: 22, fontWeight: "800" }}>
        {festival?.name}
      </Text>
      <Text style={{ color: theme.colors.mutedForeground }}>{pandal?.name}</Text>
      <MetricGrid
        items={[
          { label: "Opening funds", value: summary.openingFunds },
          { label: "Cash collections", value: summary.chanda },
          { label: "Committee contributions", value: summary.committeeContributions },
          { label: "Other cash contributions", value: summary.otherCashContributions },
          { label: "Total cash in", value: totalCashIn(summary) },
          { label: "God Fund expenses", value: summary.godFundExpenses },
          { label: "Reimbursements", value: summary.reimbursements },
          { label: "From Permanent Fund", value: summary.receivedFromPermanentFund },
          { label: "Returned to Permanent Fund", value: summary.transferredToPermanentFund },
          { label: "Closing cash / God Fund", value: availableGodFund(summary) },
          { label: "Personal money used", value: summary.personalMoneyUsed },
          { label: "Pending reimbursements", value: summary.pendingReimbursements },
          { label: "Festival expenses", value: totalExpenses(summary) },
          { label: "Regular", value: regularExpenseAmount(summary) },
          { label: "Asset purchases", value: assetPurchaseAmountOf(summary) },
          { label: "Pandal estimated value", value: assetSummary.estimatedValue },
        ]}
      />
      <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
        Promised vs received
      </Text>
      <Text style={{ color: theme.colors.mutedForeground }}>
        Promised and cancelled amounts are not cash and are not part of Closing / God Fund.
      </Text>
      <MetricGrid
        items={[
          { label: "Cash received", value: contributionTotals.cashReceived },
          { label: "Promised cash", value: contributionTotals.promisedCash },
          { label: "In-kind received", value: contributionTotals.inKindReceived },
          { label: "Promised in-kind", value: contributionTotals.promisedInKind },
          { label: "Cancelled", value: contributionTotals.cancelledValue },
        ]}
      />
      <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>Sponsors</Text>
      <Text style={{ color: theme.colors.mutedForeground }}>
        Separate from Closing / God Fund. Expense sponsorship is not income.
      </Text>
      <MetricGrid
        items={[
          { label: "Cash received", value: sponsorTotals.cashReceived },
          { label: "Promised cash", value: sponsorTotals.promisedCash },
          { label: "In-kind received", value: sponsorTotals.inKindReceived },
          { label: "Promised in-kind", value: sponsorTotals.promisedInKind },
          { label: "Cancelled", value: sponsorTotals.cancelledValue },
        ]}
      />
      {sponsorRows.length > 0 ? (
        <View style={{ gap: 10 }}>
          {sponsorRows.map((row) => (
            <View
              key={row.sponsorId}
              style={{
                backgroundColor: theme.colors.card,
                borderColor: theme.colors.border,
                borderWidth: 1,
                borderRadius: 16,
                padding: 14,
                gap: 4,
              }}
            >
              <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>{row.name}</Text>
              <Text style={{ color: theme.colors.mutedForeground }}>
                Received {formatInr(row.received)} · Promised {formatInr(row.promised)}
                {row.inKind > 0 ? ` · In-kind ${formatInr(row.inKind)}` : ""}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {can("festival.update") ? (
        <Button variant="outline" onPress={() => void writes.recomputeFestivalSummary()}>
          Recalculate from ledger
        </Button>
      ) : null}
    </GaneshScreen>
  );
}
