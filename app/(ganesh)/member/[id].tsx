import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { MetricGrid } from "@/components/ganesh/MetricGrid";
import { PendingHint } from "@/components/ganesh/GaneshSyncChip";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useContributions } from "@/hooks/useContributions";
import { useFestivalMembers } from "@/hooks/useFestivalMembers";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { usePandalRoles } from "@/hooks/usePandalRoles";
import { usePandals } from "@/hooks/usePandals";
import { useAuth } from "@/providers/AuthProvider";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { formatGaneshWhen } from "@/shared/utils/ganeshIdentity";
import {
  committeePayStatus,
  effectiveCommitteeTarget,
  memberRemainingContribution,
} from "@/shared/utils/ganeshMath";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { PermissionSummary } from "@/components/ganesh/PermissionChecklist";
import {
  CRITICAL_PERMISSIONS,
  expandPermissions,
  groupedPermissionPreview,
} from "@/shared/utils/ganeshPermissionRegistry";
import {
  ALL_GANESH_PERMISSIONS,
  ganeshRoleLabel,
  ganeshStatusLabel,
  getEffectivePermissions,
} from "@/shared/utils/ganeshPermissions";
import { useTheme } from "@/theme/ThemeProvider";

export default function MemberDetailScreen() {
  const { theme } = useTheme();
  const { push } = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const festival = festivals.find((item) => item.id === festivalId);
  const { members } = useFestivalMembers(pandalId, festivalId);
  const { members: pandalMembers } = usePandalMembers(pandalId);
  const { contributions } = useContributions(pandalId, festivalId);
  const writes = useGaneshWrites();
  const { can, isAdmin } = useGaneshPermissions();
  const { realUser } = useAuth();
  const { pandals } = usePandals();
  const { roles } = usePandalRoles(pandalId);
  const pandal = pandals.find((item) => item.id === pandalId);
  const festivalMember = members.find((item) => item.userId === id);
  const pandalMember = pandalMembers.find((item) => item.userId === id);
  const name = festivalMember?.displayName ?? pandalMember?.displayName;
  const role = pandalMember?.role ?? festivalMember?.role;
  const paid = festivalMember?.contributionPaid ?? 0;
  const defaultTarget = festival?.contributionTargetAmount ?? 0;
  const target = effectiveCommitteeTarget(festivalMember, defaultTarget);
  const overridden = Boolean(festivalMember?.contributionTargetOverridden);
  const due = memberRemainingContribution({
    contributionPaid: paid,
    contributionTarget: target,
  });
  const status = committeePayStatus(paid, target, overridden);
  const [_customTarget, setCustomTarget] = useState<string | undefined>(undefined);
  const customTarget = _customTarget ?? String(target);
  const [busy, setBusy] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [draftRoleIds, setDraftRoleIds] = useState<string[] | undefined>(undefined);
  const assignedIds = draftRoleIds ?? pandalMember?.roleIds ?? [];
  const isSelf = pandalMember?.userId === realUser?.uid;
  const targetIsAdmin = pandalMember?.role === "admin";
  const adminCount =
    pandal?.adminCount ??
    pandalMembers.filter((member) => member.role === "admin" && member.status === "active").length;
  const lastAdmin = targetIsAdmin && adminCount <= 1;
  const effective = targetIsAdmin
    ? ALL_GANESH_PERMISSIONS
    : pandalMember?.permissions?.length
      ? expandPermissions(pandalMember.permissions)
      : getEffectivePermissions({
          roleIds: pandalMember?.roleIds,
          roles,
          fallbackRole: pandalMember?.role,
        });
  const roleNames = targetIsAdmin
    ? ["Pandal Admin"]
    : (pandalMember?.roleIds ?? [])
        .map((roleId) => roles.find((item) => item.id === roleId)?.name)
        .filter(Boolean);
  const payments = contributions.filter(
    (item) =>
      !item.voided &&
      item.contributorMemberId === id &&
      item.isCommitteeContribution &&
      item.kind === "money"
  );

  if (!name) {
    return (
      <GaneshScreen>
        <Text style={{ color: theme.colors.mutedForeground }}>Member not found.</Text>
      </GaneshScreen>
    );
  }

  return (
    <GaneshScreen>
      <Text style={{ color: theme.colors.foreground, fontSize: 24, fontWeight: "800" }}>
        {name}
      </Text>
      <Text style={{ color: theme.colors.mutedForeground }}>
        {(roleNames.length > 0 ? roleNames.join(" · ") : ganeshRoleLabel(role))}
        {pandalMember?.status ? ` · ${ganeshStatusLabel(pandalMember.status)}` : ""}
        {pandalMember?.phone ? ` · ${pandalMember.phone}` : ""}
      </Text>
      <Text style={{ color: theme.colors.mutedForeground }}>
        {festival?.name ?? "Festival"} ·{" "}
        {status === "paid" ? "Paid" : status === "partial" ? "Partial" : "Not paid"}
      </Text>
      <View style={{ gap: 10 }}>
          <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>Roles</Text>
          <Text style={{ color: theme.colors.mutedForeground, lineHeight: 20 }}>
            {targetIsAdmin
              ? "Pandal Admin has full access. Extra roles are not needed."
              : roleNames.length > 0
                ? roleNames.join(", ")
                : "No custom roles assigned."}
          </Text>
          {assigning && !targetIsAdmin ? (
            <View style={{ gap: 10 }}>
              {roles.map((item) => {
                const on = assignedIds.includes(item.id);
                return (
                  <Pressable
                    key={item.id}
                    onPress={() =>
                      setDraftRoleIds((prev) => {
                        const current = prev ?? pandalMember?.roleIds ?? [];
                        return on
                          ? current.filter((roleId) => roleId !== item.id)
                          : [...current, item.id];
                      })
                    }
                    style={{
                      padding: 12,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      backgroundColor: on ? theme.colors.muted : theme.colors.card,
                    }}
                  >
                    <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
                      {on ? "☑" : "☐"} {item.name}
                    </Text>
                    <Text style={{ color: theme.colors.mutedForeground }}>
                      {item.permissions.length} permissions ·{" "}
                      {groupedPermissionPreview(item.permissions).join(", ") || "No access"}
                    </Text>
                  </Pressable>
                );
              })}
              <Button
                loading={busy}
                onPress={() => {
                  if (!id) return;
                  const nextEffective = getEffectivePermissions({
                    roleIds: assignedIds,
                    roles,
                    fallbackRole: pandalMember?.role,
                  });
                  const addedCritical = CRITICAL_PERMISSIONS.filter(
                    (item) => nextEffective.includes(item) && !effective.includes(item)
                  );
                  const save = () => {
                    setBusy(true);
                    writes
                      .setMemberRoleIds(id, assignedIds)
                      .then(() => {
                        setAssigning(false);
                        setDraftRoleIds(undefined);
                      })
                      .catch((caught) => {
                        logError("ganesh.member.roles", caught);
                        toast.error(friendlyErrorMessage(caught, "Could not save roles."));
                      })
                      .finally(() => setBusy(false));
                  };
                  if (addedCritical.length > 0) {
                    Alert.alert(
                      "Sensitive permissions",
                      "These roles can move money or manage the committee.",
                      [
                        { text: "Cancel", style: "cancel" },
                        { text: "Save roles", onPress: save },
                      ]
                    );
                    return;
                  }
                  save();
                }}
              >
                Save roles
              </Button>
              <Button variant="ghost" onPress={() => { setAssigning(false); setDraftRoleIds(undefined); }}>
                Cancel
              </Button>
            </View>
          ) : null}
          {!assigning && !targetIsAdmin && can("roles.assign") ? (
            <Button variant="outline" onPress={() => setAssigning(true)}>
              Assign roles
            </Button>
          ) : null}
          <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
            Effective permissions
          </Text>
          <PermissionSummary permissions={effective} />
          {isAdmin && !isSelf ? (
            <Button
              variant="outline"
              onPress={() => {
                if (!id || !pandalMember) return;
                if (targetIsAdmin && lastAdmin) {
                  toast.error("Assign another Pandal Admin first.");
                  return;
                }
                Alert.alert(
                  targetIsAdmin ? "Remove Admin?" : "Make Pandal Admin?",
                  targetIsAdmin
                    ? `${name} will lose full Pandal control.`
                    : `Making ${name} an Admin gives them full control over this Pandal.`,
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: targetIsAdmin ? "Remove Admin" : "Make Admin",
                      onPress: () => {
                        writes.setPandalAdmin(id, !targetIsAdmin).catch((caught) => {
                          logError("ganesh.member.admin", caught);
                          toast.error(friendlyErrorMessage(caught, "Could not change Admin access."));
                        });
                      },
                    },
                  ]
                );
              }}
            >
              {targetIsAdmin ? "Remove Admin" : "Make Pandal Admin"}
            </Button>
          ) : null}
          {can("members.suspend") && pandalMember && !isSelf && pandalMember.status !== "removed" ? (
            <View style={{ flexDirection: "row", gap: 10 }}>
              {pandalMember.status === "active" ? (
                <Button
                  variant="outline"
                  style={{ flex: 1 }}
                  disabled={lastAdmin}
                  onPress={() => {
                    Alert.alert("Suspend member?", `${name} will lose access until you restore them.`, [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Suspend",
                        onPress: () => void writes.updatePandalMember(id!, { status: "suspended" }),
                      },
                    ]);
                  }}
                >
                  Suspend
                </Button>
              ) : (
                <Button
                  variant="outline"
                  style={{ flex: 1 }}
                  onPress={() => void writes.updatePandalMember(id!, { status: "active" })}
                >
                  Restore
                </Button>
              )}
              {can("members.remove") ? (
                <Button
                  variant="outline"
                  style={{ flex: 1 }}
                  disabled={lastAdmin}
                  onPress={() => {
                    Alert.alert("Remove member?", `${name} will lose access. Historical records keep their name.`, [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Remove",
                        style: "destructive",
                        onPress: () => void writes.updatePandalMember(id!, { status: "removed" }),
                      },
                    ]);
                  }}
                >
                  Remove
                </Button>
              ) : null}
            </View>
          ) : null}
      </View>
      <MetricGrid
        items={[
          { label: "Paid", value: paid },
          { label: "Target", value: target },
          { label: "Due", value: due },
          { label: "Personal expenses", value: festivalMember?.personalExpenses ?? 0 },
          { label: "Reimbursed", value: festivalMember?.reimbursed ?? 0 },
          { label: "Pending reimbursement", value: festivalMember?.pendingReimbursement ?? 0 },
        ]}
      />
      {can("festival.update") && festival?.status === "open" ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
            This person's target
          </Text>
          <Text style={{ color: theme.colors.mutedForeground, lineHeight: 20 }}>
            Committee default is {formatInr(defaultTarget)}. Set a lower amount for a child or
            anyone who should pay less. Changing the default later will not overwrite this.
          </Text>
          {overridden ? (
            <Text style={{ color: theme.colors.primary, fontWeight: "700" }}>
              Custom target · {formatInr(target)}
            </Text>
          ) : null}
          <Input
            label="Target for this person"
            value={customTarget}
            onChangeText={setCustomTarget}
            keyboardType="numeric"
          />
          <Button
            loading={busy}
            onPress={() => {
              if (!id) return;
              setBusy(true);
              writes
                .setMemberContributionTarget(id, {
                  amount: Number(customTarget),
                  displayName: name,
                  role,
                })
                .then(() => setCustomTarget(undefined))
                .catch((error) => {
                  logError("ganesh.memberTarget", error);
                  toast.error(friendlyErrorMessage(error, "Could not save this person's target."));
                })
                .finally(() => setBusy(false));
            }}
          >
            Save this person's target
          </Button>
          {overridden ? (
            <Button
              variant="ghost"
              loading={busy}
              onPress={() => {
                if (!id) return;
                setBusy(true);
                writes
                  .setMemberContributionTarget(id, {
                    resetToDefault: true,
                    displayName: name,
                    role,
                  })
                  .then(() => setCustomTarget(undefined))
                  .catch((error) => {
                    logError("ganesh.memberTarget.reset", error);
                    toast.error(friendlyErrorMessage(error, "Could not reset this target."));
                  })
                  .finally(() => setBusy(false));
              }}
            >
              Use committee default
            </Button>
          ) : null}
        </View>
      ) : null}
      {can("contributions.create") && festival?.status === "open" ? (
        <Button onPress={() => push(`/(ganesh)/add-member-payment?memberId=${id}` as never)}>
          Record payment
        </Button>
      ) : null}
      {can("reimbursements.create") && (festivalMember?.pendingReimbursement ?? 0) > 0 ? (
        <Button onPress={() => push(`/(ganesh)/add-reimbursement?memberId=${id}` as never)}>
          Reimburse
        </Button>
      ) : null}
      <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
        Festival payments
      </Text>
      {payments.length === 0 ? (
        <Text style={{ color: theme.colors.mutedForeground }}>
          No committee payments recorded for this festival yet.
        </Text>
      ) : (
        payments.map((item) => (
          <View
            key={item.id}
            style={{
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
              borderWidth: 1,
              borderRadius: 16,
              padding: 14,
              gap: 4,
            }}
          >
            <Text style={{ color: theme.colors.primary, fontWeight: "800" }}>
              {formatInr(item.amount)}
            </Text>
            <Text style={{ color: theme.colors.mutedForeground }}>
              {item.status}
              {item.description ? ` · ${item.description}` : ""}
              {formatGaneshWhen(item.createdAt, item.date)
                ? ` · ${formatGaneshWhen(item.createdAt, item.date)}`
                : ""}
            </Text>
            <PendingHint pending={item.pendingWrite} />
          </View>
        ))
      )}
    </GaneshScreen>
  );
}
