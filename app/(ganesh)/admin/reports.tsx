import { Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AdminLinkRow } from "@/components/ganesh/AdminLinkRow";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { MetricGrid } from "@/components/ganesh/MetricGrid";
import { useContributions } from "@/hooks/useContributions";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshSummary } from "@/hooks/useGaneshSummary";
import { usePandalAssets } from "@/hooks/usePandalAssets";
import { usePandalSponsors } from "@/hooks/usePandalSponsors";
import { usePermanentFund } from "@/hooks/usePermanentFund";
import { useSponsorships } from "@/hooks/useSponsorships";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { summarizeAssets } from "@/shared/utils/ganeshAssets";
import { summarizeContributions } from "@/shared/utils/ganeshContributions";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { breakdownSponsors, summarizeSponsorships } from "@/shared/utils/ganeshSponsors";
import {
  assetPurchaseAmountOf,
  availableGodFund,
  regularExpenseAmount,
  totalCashIn,
  totalExpenses,
} from "@/shared/utils/ganeshMath";
import { useTheme } from "@/theme/ThemeProvider";

export default function AdminReportsScreen() {
  const { theme } = useTheme();
  const { push } = useRouter();
  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const { summary } = useGaneshSummary(pandalId, festivalId);
  const { contributions } = useContributions(pandalId, festivalId);
  const contributionTotals = summarizeContributions(contributions);
  const { sponsorships } = useSponsorships(pandalId, festivalId);
  const { sponsors } = usePandalSponsors(pandalId);
  const sponsorTotals = summarizeSponsorships(sponsorships);
  const sponsorRows = breakdownSponsors(sponsorships, sponsors);
  const { assets } = usePandalAssets(pandalId);
  const { fund } = usePermanentFund(pandalId);
  const assetSummary = summarizeAssets(assets);
  const festival = festivals.find((item) => item.id === festivalId);

  return (
    <GaneshScreen>
      <Text style={{ color: theme.colors.foreground, fontSize: 22, fontWeight: "800" }}>
        {festival?.name || "Festival reports"}
      </Text>
      <Text style={{ color: theme.colors.mutedForeground, lineHeight: 22 }}>
        Quick totals for the current festival. Open a section when you need the list behind the
        number.
      </Text>
      <MetricGrid
        items={[
          { label: "Total cash in", value: totalCashIn(summary) },
          { label: "God Fund expenses", value: summary.godFundExpenses },
          { label: "Reimbursements", value: summary.reimbursements },
          { label: "Closing / God Fund", value: availableGodFund(summary) },
          { label: "Festival expenses", value: totalExpenses(summary) },
          { label: "Regular", value: regularExpenseAmount(summary) },
          { label: "Asset purchases", value: assetPurchaseAmountOf(summary) },
          { label: "Pandal estimated value", value: assetSummary.estimatedValue },
          { label: "To Permanent Fund", value: summary.transferredToPermanentFund },
          { label: "Permanent Fund", value: fund.total },
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
      <View style={{ gap: 10 }}>
        <AdminLinkRow
          title="Festival summary"
          subtitle="Cash in, expenses, and closing balance"
          onPress={() => push("/(ganesh)/report" as never)}
        />
        <AdminLinkRow
          title="Collection summary"
          subtitle="Households, collectors, and payment methods"
          onPress={() => push("/(ganesh)/collections" as never)}
        />
        <AdminLinkRow
          title="Expense summary"
          subtitle="God Fund, personal, and pending reimbursements"
          onPress={() => push("/(ganesh)/expenses" as never)}
        />
        <AdminLinkRow
          title="Committee contribution summary"
          subtitle="Who paid this festival"
          onPress={() => push("/(ganesh)/committee" as never)}
        />
        <AdminLinkRow
          title="Contribution summary"
          subtitle="Cash received, promised, in-kind, and cancelled. Promises do not add cash."
          onPress={() => push("/(ganesh)/contributions" as never)}
        />
        <AdminLinkRow
          title="Sponsor summary"
          subtitle="Cash received, promised cash, in-kind, and cancelled. Separate from God Fund."
          onPress={() => push("/(ganesh)/sponsors" as never)}
        />
        <AdminLinkRow
          title="Reimbursement summary"
          subtitle="Personal money still to be paid back"
          onPress={() => push("/(ganesh)/committee" as never)}
        />
        <AdminLinkRow
          title="Permanent Fund history"
          subtitle="Donations and festival transfers"
          onPress={() => push("/(ganesh)/permanent-fund" as never)}
        />
      </View>
    </GaneshScreen>
  );
}
