import { Text } from "react-native";

import { Button } from "@/components/ui/Button";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { MetricGrid } from "@/components/ganesh/MetricGrid";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshSummary } from "@/hooks/useGaneshSummary";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePandals } from "@/hooks/usePandals";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { availableGodFund, totalCashIn, totalExpenses } from "@/shared/utils/ganeshMath";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useTheme } from "@/theme/ThemeProvider";

export default function FestivalReportScreen() {
  const { theme } = useTheme();
  const { pandalId, festivalId } = useGaneshSession();
  const { pandals } = usePandals();
  const { festivals } = useFestivals(pandalId);
  const { summary } = useGaneshSummary(pandalId, festivalId);
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
          { label: "In-kind contributions", value: summary.inKindValue },
          { label: "Total expenses", value: totalExpenses(summary) },
        ]}
      />
      {can("festival.update") ? (
        <Button variant="outline" onPress={() => void writes.recomputeFestivalSummary()}>
          Recalculate from ledger
        </Button>
      ) : null}
    </GaneshScreen>
  );
}
