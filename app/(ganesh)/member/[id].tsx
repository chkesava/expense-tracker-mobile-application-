import { Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { MetricGrid } from "@/components/ganesh/MetricGrid";
import { Button } from "@/components/ui/Button";
import { useFestivalMembers } from "@/hooks/useFestivalMembers";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { useAuth } from "@/providers/AuthProvider";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { canManagePandal } from "@/shared/utils/ganeshMath";
import { useTheme } from "@/theme/ThemeProvider";

export default function MemberDetailScreen() {
  const { theme } = useTheme();
  const { push } = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { realUser } = useAuth();
  const { pandalId, festivalId } = useGaneshSession();
  const { members } = useFestivalMembers(pandalId, festivalId);
  const { members: pandalMembers } = usePandalMembers(pandalId);
  const member = members.find((item) => item.userId === id);
  const me = members.find((item) => item.userId === realUser?.uid);
  const role = pandalMembers.find((item) => item.userId === id)?.role;

  if (!member) {
    return (
      <GaneshScreen>
        <Text style={{ color: theme.colors.mutedForeground }}>Member not found.</Text>
      </GaneshScreen>
    );
  }

  return (
    <GaneshScreen>
      <Text style={{ color: theme.colors.foreground, fontSize: 24, fontWeight: "800" }}>
        {member.displayName}
      </Text>
      <Text style={{ color: theme.colors.mutedForeground }}>{role ?? member.role}</Text>
      <MetricGrid
        items={[
          { label: "Contribution", value: member.contributionPaid },
          { label: "Target", value: member.contributionTarget },
          { label: "Personal expenses", value: member.personalExpenses },
          { label: "Reimbursed", value: member.reimbursed },
          { label: "Pending reimbursement", value: member.pendingReimbursement },
        ]}
      />
      {canManagePandal(me?.role) && member.pendingReimbursement > 0 ? (
        <Button onPress={() => push(`/(ganesh)/add-reimbursement?memberId=${member.userId}` as never)}>
          Reimburse
        </Button>
      ) : null}
    </GaneshScreen>
  );
}
