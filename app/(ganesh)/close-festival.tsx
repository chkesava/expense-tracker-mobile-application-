import { Text } from "react-native";
import { useRouter } from "expo-router";

import { Button } from "@/components/ui/Button";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { MetricGrid } from "@/components/ganesh/MetricGrid";
import { useFestivalMembers } from "@/hooks/useFestivalMembers";
import { useGaneshSummary } from "@/hooks/useGaneshSummary";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { availableGodFund } from "@/shared/utils/ganeshMath";
import { useTheme } from "@/theme/ThemeProvider";

export default function CloseFestivalScreen() {
  const { theme } = useTheme();
  const { back } = useRouter();
  const { pandalId, festivalId } = useGaneshSession();
  const { summary } = useGaneshSummary(pandalId, festivalId);
  const { members } = useFestivalMembers(pandalId, festivalId);
  const writes = useGaneshWrites();

  return (
    <GaneshScreen>
      <Text style={{ color: theme.colors.foreground, fontSize: 22, fontWeight: "800" }}>
        Close this festival?
      </Text>
      <Text style={{ color: theme.colors.mutedForeground, lineHeight: 22 }}>
        It becomes historical and read-only. Nothing is deleted. You can still open it later and start a new year.
      </Text>
      <MetricGrid
        items={[
          { label: "Collections entered", value: `${summary.collectionCount}` },
          { label: "Expenses entered", value: `${summary.expenseCount}` },
          { label: "Pending reimbursements", value: summary.pendingReimbursements },
          { label: "Cash / God Fund", value: availableGodFund(summary) },
          { label: "Committee contributions", value: summary.committeeContributions },
          { label: "In-kind contributions", value: summary.inKindValue },
          { label: "Members", value: `${members.length}` },
        ]}
      />
      <Button
        onPress={() => {
          void writes.closeFestival().then(() => back());
        }}
      >
        Confirm close festival
      </Button>
    </GaneshScreen>
  );
}
