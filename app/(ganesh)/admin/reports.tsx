import { Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AdminLinkRow } from "@/components/ganesh/AdminLinkRow";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { MetricGrid } from "@/components/ganesh/MetricGrid";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshSummary } from "@/hooks/useGaneshSummary";
import { usePandalAssets } from "@/hooks/usePandalAssets";
import { usePermanentFund } from "@/hooks/usePermanentFund";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { summarizeAssets } from "@/shared/utils/ganeshAssets";
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
          title="In-kind contribution summary"
          subtitle="Items and sponsors. Estimates do not add cash."
          onPress={() => push("/(ganesh)/contributions" as never)}
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
