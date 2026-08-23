import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshSyncChip } from "@/components/ganesh/GaneshSyncChip";
import { MetricGrid } from "@/components/ganesh/MetricGrid";
import { PermanentFundCard } from "@/components/ganesh/PermanentFundCard";
import { usePermanentFund } from "@/hooks/usePermanentFund";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { useFestivalMembers } from "@/hooks/useFestivalMembers";
import { useJoinRequests } from "@/hooks/useJoinRequests";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { usePandals } from "@/hooks/usePandals";
import { useAuth } from "@/providers/AuthProvider";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { useWorkspace } from "@/providers/WorkspaceProvider";
import { formatPandalCode } from "@/shared/utils/ganeshIdentity";
import { effectiveCommitteeTarget } from "@/shared/utils/ganeshMath";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { ganeshRoleLabel } from "@/shared/utils/ganeshPermissions";
import { useTheme } from "@/theme/ThemeProvider";

const ROLE_ORDER: Record<string, number> = {
  admin: 0,
  treasurer: 1,
  member: 2,
  collector: 3,
  viewer: 4,
};

export default function PandalScreen() {
  const { theme } = useTheme();
  const { push } = useRouter();
  const { logout } = useAuth();
  const { setActiveWorkspace } = useWorkspace();
  const { pandalId, festivalId } = useGaneshSession();
  const { pandals } = usePandals();
  const { festivals } = useFestivals(pandalId);
  const { members: festivalMembers } = useFestivalMembers(pandalId, festivalId);
  const { members: pandalMembers } = usePandalMembers(pandalId);
  const { requests } = useJoinRequests(pandalId);
  const { fund } = usePermanentFund(pandalId);
  const { can, role } = useGaneshPermissions();
  const pandal = pandals.find((item) => item.id === pandalId);
  const festival = festivals.find((item) => item.id === festivalId);
  const writes = useGaneshWrites();
  const joinMode = pandal?.joinMode ?? "approval";
  const collected = festivalMembers.reduce((sum, member) => sum + member.contributionPaid, 0);
  const [memberTarget, setMemberTarget] = useState(String(festival?.contributionTargetAmount ?? 0));
  const [houseTarget, setHouseTarget] = useState(String(festival?.householdTargetAmount ?? 0));
  const committee = pandalMembers
    .filter((member) => member.status === "active" || member.status == null)
    .slice()
    .sort((a, b) => {
      const roleDiff = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9);
      if (roleDiff !== 0) return roleDiff;
      return a.displayName.localeCompare(b.displayName);
    });
  const defaultTarget = festival?.contributionTargetAmount ?? 0;
  const target = committee.reduce((sum, member) => {
    const festivalMember = festivalMembers.find((item) => item.userId === member.userId);
    return sum + effectiveCommitteeTarget(festivalMember, defaultTarget);
  }, 0);
  const isAdmin = can("members.assignRole");
  const showAdmin =
    isAdmin ||
    can("festival.update") ||
    can("members.approve") ||
    can("festival.create") ||
    can("festival.close") ||
    can("permanentFund.transfer");

  return (
    <GaneshScreen safeTop>
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

      <Pressable
        onPress={() => push("/(ganesh)/committee" as never)}
        style={{
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          borderWidth: 1,
          borderRadius: 16,
          padding: 14,
          gap: 6,
        }}
      >
        <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>Committee tracker</Text>
        <Text style={{ color: theme.colors.mutedForeground }}>
          {committee.length} people · {formatInr(collected)} collected this festival
        </Text>
        <Text style={{ color: theme.colors.primary, fontWeight: "700" }}>
          Open who paid / not paid
        </Text>
      </Pressable>

      <PermanentFundCard
        fund={fund}
        onPress={() => push("/(ganesh)/permanent-fund" as never)}
        onAddPress={
          can("permanentFund.transfer") && fund.total === 0
            ? () => push("/(ganesh)/add-permanent-fund" as never)
            : undefined
        }
      />
      <MetricGrid
        items={[
          {
            label: "Committee",
            value: `${committee.length}`,
            onPress: () => push("/(ganesh)/committee" as never),
          },
          { label: "Target", value: target },
          { label: "Collected", value: collected },
        ]}
      />

      {showAdmin ? (
        <View style={{ gap: 12 }}>
          <Text style={{ color: theme.colors.foreground, fontSize: 18, fontWeight: "800" }}>
            Admin
          </Text>
          <Text style={{ color: theme.colors.mutedForeground, lineHeight: 20 }}>
            Only a Pandal Admin can change roles, join rules, and the Permanent Fund. Treasurers can
            update festival targets and close the festival.
          </Text>
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
              <Text style={{ color: theme.colors.mutedForeground, lineHeight: 20 }}>
                This is the default for most committee people. For a child or anyone who should pay
                less, open them on the Committee tab and set a custom target.
              </Text>
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
              {isAdmin ? "Manage committee roles" : "View committee roles"}
            </Button>
          ) : null}
          {can("members.approve") ? (
            <Button
              variant={requests.length > 0 ? "primary" : "outline"}
              onPress={() => push("/(ganesh)/join-requests" as never)}
            >
              {requests.length > 0
                ? `${requests.length} join request${requests.length === 1 ? "" : "s"}`
                : "Join requests"}
            </Button>
          ) : null}
          {can("festival.create") ? (
            <Button variant="outline" onPress={() => push("/(ganesh)/create-festival" as never)}>
              Create festival
            </Button>
          ) : null}
          {can("festival.close") && festival?.status === "open" ? (
            <Button variant="outline" onPress={() => push("/(ganesh)/close-festival" as never)}>
              Close festival
            </Button>
          ) : null}
        </View>
      ) : null}

      <Button variant="outline" onPress={() => push("/(ganesh)/report" as never)}>
        Festival report
      </Button>
      <Button variant="outline" onPress={() => push("/(ganesh)/setup" as never)}>
        Switch Pandal or festival
      </Button>
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
