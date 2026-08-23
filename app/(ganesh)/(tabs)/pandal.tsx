import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshSyncChip } from "@/components/ganesh/GaneshSyncChip";
import { MetricGrid } from "@/components/ganesh/MetricGrid";
import { PermanentFundCard } from "@/components/ganesh/PermanentFundCard";
import { usePermanentFund } from "@/hooks/usePermanentFund";
import { useState } from "react";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { useFestivalMembers } from "@/hooks/useFestivalMembers";
import { useJoinRequests } from "@/hooks/useJoinRequests";
import { usePandals } from "@/hooks/usePandals";
import { useAuth } from "@/providers/AuthProvider";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { useWorkspace } from "@/providers/WorkspaceProvider";
import { formatPandalCode } from "@/shared/utils/ganeshIdentity";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { ganeshRoleLabel } from "@/shared/utils/ganeshPermissions";
import { useTheme } from "@/theme/ThemeProvider";

export default function PandalScreen() {
  const { theme } = useTheme();
  const { push } = useRouter();
  const { logout } = useAuth();
  const { setActiveWorkspace } = useWorkspace();
  const { pandalId, festivalId } = useGaneshSession();
  const { pandals } = usePandals();
  const { festivals } = useFestivals(pandalId);
  const { members } = useFestivalMembers(pandalId, festivalId);
  const { requests } = useJoinRequests(pandalId);
  const { fund } = usePermanentFund(pandalId);
  const { can, role } = useGaneshPermissions();
  const pandal = pandals.find((item) => item.id === pandalId);
  const festival = festivals.find((item) => item.id === festivalId);
  const writes = useGaneshWrites();
  const joinMode = pandal?.joinMode ?? "approval";
  const target = members.reduce((sum, member) => sum + member.contributionTarget, 0);
  const collected = members.reduce((sum, member) => sum + member.contributionPaid, 0);
  const [memberTarget, setMemberTarget] = useState(String(festival?.contributionTargetAmount ?? 0));
  const [houseTarget, setHouseTarget] = useState(String(festival?.householdTargetAmount ?? 0));

  return (
    <GaneshScreen>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: theme.colors.foreground, fontSize: 22, fontWeight: "800" }}>
          {pandal?.name || "Pandal"}
        </Text>
        <GaneshSyncChip />
      </View>
      <Text style={{ color: theme.colors.mutedForeground }}>
        Code {pandal?.code ? formatPandalCode(pandal.code) : "—"} · {festival?.name}
        {role ? ` · ${ganeshRoleLabel(role)}` : ""}
      </Text>
      <PermanentFundCard fund={fund} onPress={() => push("/(ganesh)/permanent-fund" as never)} />
      <MetricGrid
        items={[
          { label: "Members", value: `${members.length}` },
          { label: "Target", value: target },
          { label: "Collected", value: collected },
        ]}
      />
      {can("members.assignRole") ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>Who can join</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button
              variant={joinMode === "approval" ? "primary" : "outline"}
              onPress={() => void writes.updatePandalJoinMode("approval")}
            >
              Approval
            </Button>
            <Button
              variant={joinMode === "open" ? "primary" : "outline"}
              onPress={() => void writes.updatePandalJoinMode("open")}
            >
              Open
            </Button>
          </View>
        </View>
      ) : null}
      {can("festival.update") ? (
        <View style={{ gap: 10 }}>
          <Input
            label="Member contribution target"
            value={memberTarget}
            onChangeText={setMemberTarget}
            keyboardType="numeric"
          />
          <Input
            label="Household chanda target"
            value={houseTarget}
            onChangeText={setHouseTarget}
            keyboardType="numeric"
          />
          <Button
            variant="outline"
            onPress={() =>
              void writes.updateFestivalTargets({
                contributionMode: "same",
                contributionTargetAmount: Number(memberTarget),
                householdTargetAmount: Number(houseTarget),
              })
            }
          >
            Save targets
          </Button>
        </View>
      ) : null}
      {can("members.read") ? (
        <Button variant="outline" onPress={() => push("/(ganesh)/members" as never)}>
          Members and roles
        </Button>
      ) : null}
      {can("members.approve") && requests.length > 0 ? (
        <Button onPress={() => push("/(ganesh)/join-requests" as never)}>
          {requests.length} join request{requests.length === 1 ? "" : "s"}
        </Button>
      ) : null}
      {members.map((member) => (
        <Pressable
          key={member.id}
          onPress={() => push(`/(ganesh)/member/${member.userId}` as never)}
          style={{
            backgroundColor: theme.colors.card,
            borderRadius: 16,
            padding: 14,
            borderWidth: 1,
            borderColor: theme.colors.border,
            gap: 4,
          }}
        >
          <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
            {member.displayName}
          </Text>
          <Text style={{ color: theme.colors.mutedForeground }}>
            {formatInr(member.contributionPaid)} / {formatInr(member.contributionTarget)}
          </Text>
          <Text style={{ color: theme.colors.mutedForeground }}>
            Pending reimbursement {formatInr(member.pendingReimbursement)}
          </Text>
        </Pressable>
      ))}
      <Button variant="outline" onPress={() => push("/(ganesh)/setup" as never)}>
        Switch Pandal or festival
      </Button>
      {can("festival.create") ? (
        <Button variant="outline" onPress={() => push("/(ganesh)/create-festival" as never)}>
          Create festival
        </Button>
      ) : null}
      <Button variant="outline" onPress={() => push("/(ganesh)/report" as never)}>
        Festival report
      </Button>
      {can("festival.close") && festival?.status === "open" ? (
        <Button variant="outline" onPress={() => push("/(ganesh)/close-festival" as never)}>
          Close festival
        </Button>
      ) : null}
      <Button
        variant="ghost"
        onPress={() => {
          void setActiveWorkspace("expense");
        }}
      >
        Switch app
      </Button>
      <Button variant="ghost" onPress={() => void logout()}>
        Log out
      </Button>
    </GaneshScreen>
  );
}
