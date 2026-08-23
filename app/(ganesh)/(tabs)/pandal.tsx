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
  const { can, isAdmin, role } = useGaneshPermissions();
  const pandal = pandals.find((item) => item.id === pandalId);
  const festival = festivals.find((item) => item.id === festivalId);
  const writes = useGaneshWrites();
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
  const showTreasurerTools = !isAdmin && can("festival.update");

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
          can("permanentFund.add") && fund.total === 0
            ? () => push("/(ganesh)/add-permanent-fund" as never)
            : undefined
        }
      />
      {can("assets.read") ? (
        <Pressable
          onPress={() => push("/(ganesh)/assets" as never)}
          style={{
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
            borderWidth: 1,
            borderRadius: 16,
            padding: 14,
            gap: 6,
          }}
        >
          <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>Pandal assets</Text>
          <Text style={{ color: theme.colors.mutedForeground }}>
            Chairs, speakers, and other items that stay with the Pandal
          </Text>
          <Text style={{ color: theme.colors.primary, fontWeight: "700" }}>Open</Text>
        </Pressable>
      ) : null}
      {can("sponsors.read") ? (
        <Pressable
          onPress={() => push("/(ganesh)/sponsors" as never)}
          style={{
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
            borderWidth: 1,
            borderRadius: 16,
            padding: 14,
            gap: 6,
          }}
        >
          <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>Sponsors</Text>
          <Text style={{ color: theme.colors.mutedForeground }}>
            Who is supporting this festival. Promised deals are not cash.
          </Text>
          <Text style={{ color: theme.colors.primary, fontWeight: "700" }}>Open</Text>
        </Pressable>
      ) : null}
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

      {isAdmin ? (
        <Pressable
          onPress={() => push("/(ganesh)/admin" as never)}
          style={{
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
            borderWidth: 1,
            borderRadius: 16,
            padding: 14,
            gap: 6,
            minHeight: 72,
          }}
        >
          <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>Admin Dashboard</Text>
          <Text style={{ color: theme.colors.mutedForeground, lineHeight: 20 }}>
            {requests.length > 0
              ? `${requests.length} join request${requests.length === 1 ? "" : "s"} need review`
              : "Members, festival, funds, and Pandal settings"}
          </Text>
          <Text style={{ color: theme.colors.primary, fontWeight: "700" }}>Open</Text>
        </Pressable>
      ) : null}

      {showTreasurerTools ? (
        <View style={{ gap: 12 }}>
          <Text style={{ color: theme.colors.foreground, fontSize: 18, fontWeight: "800" }}>
            Treasurer
          </Text>
          <Text style={{ color: theme.colors.mutedForeground, lineHeight: 20 }}>
            Set this festival’s contribution targets or close it. Pandal Admin handles roles and
            the Permanent Fund.
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
          {can("members.read") ? (
            <Button variant="outline" onPress={() => push("/(ganesh)/members" as never)}>
              View committee roles
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
