import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AccountabilityLine } from "@/components/ganesh/AccountabilityLine";
import { GaneshQuickActions } from "@/components/ganesh/GaneshQuickActions";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshSyncChip } from "@/components/ganesh/GaneshSyncChip";
import { GodFundHero } from "@/components/ganesh/GodFundHero";
import { MetricGrid } from "@/components/ganesh/MetricGrid";
import { PendingHint } from "@/components/ganesh/GaneshSyncChip";
import { EmptyState } from "@/components/common/EmptyState";
import { useGaneshActivity } from "@/hooks/useGaneshActivity";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshSummary } from "@/hooks/useGaneshSummary";
import { usePandals } from "@/hooks/usePandals";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { availableGodFund, totalCashIn } from "@/shared/utils/ganeshMath";
import { memberDisplayName } from "@/shared/utils/ganeshIdentity";
import { useTheme } from "@/theme/ThemeProvider";

export default function GaneshHomeScreen() {
  const { theme } = useTheme();
  const { push } = useRouter();
  const { pandalId, festivalId } = useGaneshSession();
  const { pandals } = usePandals();
  const { festivals } = useFestivals(pandalId);
  const { members } = usePandalMembers(pandalId);
  const { summary } = useGaneshSummary(pandalId, festivalId);
  const { activity } = useGaneshActivity(pandalId, festivalId);
  const pandal = pandals.find((item) => item.id === pandalId);
  const festival = festivals.find((item) => item.id === festivalId);
  const closed = festival?.status === "closed";
  const godFund = availableGodFund(summary);

  return (
    <GaneshScreen>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: theme.colors.foreground, fontSize: 22, fontWeight: "800" }}>
          Ganesh Seva
        </Text>
        <GaneshSyncChip />
      </View>
      <GodFundHero
        amount={godFund}
        festivalName={festival?.name}
        pandalName={pandal?.name}
      />
      <MetricGrid
        items={[
          { label: "Opening funds", value: summary.openingFunds },
          { label: "Chanda", value: summary.chanda },
          { label: "Member contributions", value: summary.committeeContributions },
          { label: "Other cash", value: summary.otherCashContributions },
          { label: "God Fund expenses", value: summary.godFundExpenses },
          { label: "Reimbursements", value: summary.reimbursements },
          { label: "Personal money", value: summary.personalMoneyUsed },
          { label: "Pending reimbursement", value: summary.pendingReimbursements },
          { label: "In-kind value", value: summary.inKindValue },
          { label: "Money in", value: totalCashIn(summary) },
        ]}
      />
      <GaneshQuickActions disabled={closed} />
      <Pressable onPress={() => push("/(ganesh)/report" as never)}>
        <Text style={{ color: theme.colors.primary, fontWeight: "700" }}>View festival report</Text>
      </Pressable>
      <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>Recent activity</Text>
      {activity.length === 0 ? (
        <EmptyState
          title="No activity yet"
          description="Add an opening fund or the first collection to start this festival's ledger."
        />
      ) : (
        activity.map((item) => (
          <View
            key={item.id}
            style={{
              backgroundColor: theme.colors.card,
              borderRadius: 16,
              padding: 14,
              gap: 4,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>{item.title}</Text>
            {item.amount != null ? (
              <Text style={{ color: theme.colors.primary, fontWeight: "800" }}>{formatInr(item.amount)}</Text>
            ) : null}
            {item.estimatedValue != null ? (
              <Text style={{ color: theme.colors.mutedForeground }}>
                Estimated {formatInr(item.estimatedValue)}
              </Text>
            ) : null}
            <AccountabilityLine
              enteredBy={memberDisplayName(members, item.actorId)}
              at={item.createdAt}
            />
            <PendingHint pending={item.pendingWrite} />
          </View>
        ))
      )}
    </GaneshScreen>
  );
}
