import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Check, Phone, Users } from "lucide-react-native";

import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { PermissionSummary } from "@/components/ganesh/PermissionChecklist";
import {
  Avatar,
  GaneshEmptyState,
  GaneshHeader,
  LedgerRow,
  MetaLabel,
  Money,
  ProgressTrack,
  Section,
  StatTile,
  StatusBadge,
  StatusStrip,
  useGaneshTokens,
} from "@/components/ganesh/ui";
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
import { haptic } from "@/lib/haptics";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { formatGaneshWhen } from "@/shared/utils/ganeshIdentity";
import { lastAdminSafetyMessage } from "@/shared/utils/ganeshMemberCopy";
import {
  committeePayStatus,
  effectiveCommitteeTarget,
  memberRemainingContribution,
} from "@/shared/utils/ganeshMath";
import { formatInr } from "@/shared/utils/ganeshMoney";
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
import type { GaneshMemberStatus } from "@/shared/types/ganesh";
import { useTheme } from "@/theme/ThemeProvider";

export default function MemberDetailScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { push, back } = useRouter();
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
  const waived = Boolean(festivalMember?.contributionWaived);
  const due = memberRemainingContribution({
    contributionPaid: paid,
    contributionTarget: target,
  }) * (waived ? 0 : 1);
  const status = committeePayStatus(paid, target, overridden, waived);

  const [_customTarget, setCustomTarget] = useState<string | undefined>(undefined);
  const customTarget = _customTarget ?? String(target);
  const [busy, setBusy] = useState(false);
  const [waiveReason, setWaiveReason] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [draftRoleIds, setDraftRoleIds] = useState<string[] | undefined>(undefined);

  const assignedIds = draftRoleIds ?? pandalMember?.roleIds ?? [];
  const isSelf = pandalMember?.userId === realUser?.uid;
  const targetIsAdmin = pandalMember?.role === "admin";
  const adminCount =
    pandal?.adminCount
    ?? pandalMembers.filter((member) => member.role === "admin" && member.status === "active")
      .length;
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
      !item.voided
      && item.contributorMemberId === id
      && item.isCommitteeContribution
      && item.kind === "money"
  );

  if (!name) {
    return (
      <GaneshScreen safeTop>
        <GaneshHeader
          title="Member"
          icon={<Users size={22} color={g.saffron} strokeWidth={2.2} />}
          onBack={back}
        />
        <GaneshEmptyState
          icon={<Users size={22} color={g.saffron} strokeWidth={2.2} />}
          title="Member not found"
          description="They may have been removed from this Pandal."
        />
      </GaneshScreen>
    );
  }

  const pct = target > 0 ? Math.min(100, Math.round((paid / target) * 100)) : 0;
  const trackColor =
    status === "paid" ? g.godFund : status === "partial" ? theme.colors.warning : g.divider;

  const saveWaiver = (waived: boolean) => {
    if (!id) return;
    if (waived && !waiveReason.trim()) {
      toast.error("Enter a reason before waiving the contribution.");
      return;
    }
    setBusy(true);
    writes
      .setCommitteeContributionWaiver(id, { waived, reason: waiveReason })
      .then(() => setWaiveReason(""))
      .catch((caught) => {
        logError("ganesh.member.waiver", caught);
        toast.error(friendlyErrorMessage(caught, "Could not update the waiver."));
      })
      .finally(() => setBusy(false));
  };

  const saveRoles = () => {
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
  };

  const setMemberStatus = (status: GaneshMemberStatus, failure: string) => {
    if (!id) return;
    writes.updatePandalMember(id, { status }).catch((caught) => {
      logError("ganesh.member.status", caught);
      toast.error(friendlyErrorMessage(caught, failure));
    });
  };

  const toggleAdmin = () => {
    if (!id || !pandalMember) return;
    if (targetIsAdmin && lastAdmin) {
      toast.error(lastAdminSafetyMessage(isSelf));
      return;
    }
    // Say where they land, not just what they lose. Demotion restores the roles
    // they held before being promoted, so an admin handing the seat back should
    // see that "Treasurer" is coming with them rather than assume they have to
    // re-assign it by hand.
    const returningTo = (pandalMember?.roleIdsBeforeAdmin ?? [])
      .map((roleId) => roles.find((item) => item.id === roleId)?.name)
      .filter(Boolean)
      .join(", ");
    Alert.alert(
      targetIsAdmin ? "Remove Admin?" : "Make Pandal Admin?",
      targetIsAdmin
        ? returningTo
          ? `${name} will lose full Pandal control and go back to ${returningTo}.`
          : `${name} will lose full Pandal control and become a regular member.`
        : `Making ${name} an Admin gives them full control over this Pandal.${
            assignedIds.length > 0
              ? " Their current roles are kept and restored if Admin is removed later."
              : ""
          }`,
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
  };

  return (
    <GaneshScreen safeTop>
      {/* Profile hero — the person is the subject, so the avatar leads. */}
      <View style={styles.heroRow}>
        <Pressable
          onPress={() => {
            void haptic.selection();
            back();
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={({ pressed }) => [styles.back, pressed && { opacity: 0.8 }]}
        >
          <ArrowLeft size={22} color={theme.colors.foreground} strokeWidth={2.2} />
        </Pressable>

        <Avatar name={name} seed={id ?? name} size={52} />

        <View style={styles.heroCopy}>
          <Text
            numberOfLines={1}
            style={[
              styles.heroName,
              { color: theme.colors.foreground, fontFamily: theme.fontFamily.bold },
            ]}
          >
            {name}
          </Text>
          <Text
            numberOfLines={2}
            style={[
              styles.heroMeta,
              { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
            ]}
          >
            {roleNames.length > 0 ? roleNames.join(" · ") : ganeshRoleLabel(role)}
            {pandalMember?.status ? ` · ${ganeshStatusLabel(pandalMember.status)}` : ""}
          </Text>
          <View style={styles.heroBadges}>
            {targetIsAdmin ? <StatusBadge kind="permanent" label="Pandal Admin" size="sm" /> : null}
            {pandalMember?.status === "suspended" ? (
              <StatusBadge kind="cancelled" label="Suspended" size="sm" />
            ) : null}
            {pandalMember?.phone ? (
              <View style={styles.phoneRow}>
                <Phone size={11} color={theme.colors.mutedForeground} strokeWidth={2.2} />
                <Text
                  style={[
                    styles.phone,
                    { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
                  ]}
                >
                  {pandalMember.phone}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      <Section
        title="This festival"
        subtitle={festival?.name}
        badge={
          <StatusBadge
            kind={status === "waived" ? "neutral" : status === "pending" ? "pending" : status}
            label={status === "waived" ? "Waived" : status === "paid" ? "Paid" : status === "partial" ? "Partial" : "Not paid"}
          />
        }
      >
        <View style={styles.statRow}>
          <StatTile label="Paid">
            <Money value={paid} size="primary" tone="positive" numberOfLines={1} adjustsFontSizeToFit />
          </StatTile>
          <StatTile label="Target" meta={overridden ? <MetaLabel>Custom</MetaLabel> : undefined}>
            <Money value={target} size="primary" numberOfLines={1} adjustsFontSizeToFit />
          </StatTile>
          <StatTile label="Due">
            <Money
              value={due}
              size="primary"
              tone={due > 0 ? "warning" : "default"}
              numberOfLines={1}
              adjustsFontSizeToFit
            />
          </StatTile>
        </View>

        {target > 0 ? <ProgressTrack pct={pct} color={trackColor} style={styles.track} /> : null}

        <View style={styles.statRow}>
          <StatTile label="Personal money spent">
            <Money
              value={festivalMember?.personalExpenses ?? 0}
              size="secondary"
              numberOfLines={1}
              adjustsFontSizeToFit
            />
          </StatTile>
          <StatTile label="Reimbursed">
            <Money
              value={festivalMember?.reimbursed ?? 0}
              size="secondary"
              numberOfLines={1}
              adjustsFontSizeToFit
            />
          </StatTile>
          <StatTile label="Still owed">
            <Money
              value={festivalMember?.pendingReimbursement ?? 0}
              size="secondary"
              tone={(festivalMember?.pendingReimbursement ?? 0) > 0 ? "warning" : "default"}
              numberOfLines={1}
              adjustsFontSizeToFit
            />
          </StatTile>
        </View>
      </Section>

      {can("festival.update") && festival?.status === "open" ? (
        <Section title="Committee contribution" subtitle="Waivers are audited and do not change festival cash.">
          {waived ? (
            <>
              <StatusStrip tone="muted" message={`Waived${festivalMember?.waiveReason ? `: ${festivalMember.waiveReason}` : ""}`} />
              <Button variant="outline" loading={busy} onPress={() => saveWaiver(false)}>
                Remove waiver
              </Button>
            </>
          ) : (
            <View style={styles.form}>
              <Input label="Waiver reason" value={waiveReason} onChangeText={setWaiveReason} placeholder="Optional contribution waived because..." />
              <Button variant="outline" loading={busy} onPress={() => saveWaiver(true)}>
                Waive contribution
              </Button>
            </View>
          )}
        </Section>
      ) : null}

      {(can("contributions.create") && festival?.status === "open")
      || (can("reimbursements.create") && (festivalMember?.pendingReimbursement ?? 0) > 0) ? (
        <View style={styles.actionRow}>
          {can("contributions.create") && festival?.status === "open" ? (
            <Button
              style={styles.actionButton}
              onPress={() => push(`/(ganesh)/add-member-payment?memberId=${id}` as never)}
            >
              Record payment
            </Button>
          ) : null}
          {can("reimbursements.create") && (festivalMember?.pendingReimbursement ?? 0) > 0 ? (
            <Button
              variant="outline"
              style={styles.actionButton}
              onPress={() => push(`/(ganesh)/add-reimbursement?memberId=${id}` as never)}
            >
              Reimburse
            </Button>
          ) : null}
        </View>
      ) : null}

      <Section
        title="Roles"
        subtitle={
          targetIsAdmin
            ? "Pandal Admin has full access. Extra roles are not needed."
            : roleNames.length > 0
              ? roleNames.join(", ")
              : "No custom roles assigned."
        }
      >
        {assigning && !targetIsAdmin ? (
          <View style={styles.form}>
            {roles.map((item, index) => {
              const on = assignedIds.includes(item.id);
              return (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    void haptic.selection();
                    setDraftRoleIds((prev) => {
                      const current = prev ?? pandalMember?.roleIds ?? [];
                      return on
                        ? current.filter((roleId) => roleId !== item.id)
                        : [...current, item.id];
                    });
                  }}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={item.name}
                  android_ripple={{
                    color: g.isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.05)",
                    borderless: false,
                  }}
                  style={({ pressed }) => [
                    styles.roleRow,
                    index < roles.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: g.divider,
                    },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <View
                    style={[
                      styles.checkbox,
                      on
                        ? { backgroundColor: g.saffron, borderColor: g.saffron }
                        : { borderColor: g.divider },
                    ]}
                  >
                    {on ? <Check size={13} color="#FFFFFF" strokeWidth={3} /> : null}
                  </View>
                  <View style={styles.roleCopy}>
                    <Text
                      style={[
                        styles.roleName,
                        { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium },
                      ]}
                    >
                      {item.name}
                    </Text>
                    <Text
                      numberOfLines={2}
                      style={[
                        styles.roleMeta,
                        {
                          color: theme.colors.mutedForeground,
                          fontFamily: theme.fontFamily.regular,
                        },
                      ]}
                    >
                      {item.permissions.length} permissions ·{" "}
                      {groupedPermissionPreview(item.permissions).join(", ") || "No access"}
                    </Text>
                  </View>
                </Pressable>
              );
            })}

            <Button loading={busy} onPress={saveRoles}>
              Save roles
            </Button>
            <Button
              variant="ghost"
              onPress={() => {
                setAssigning(false);
                setDraftRoleIds(undefined);
              }}
            >
              Cancel
            </Button>
          </View>
        ) : !targetIsAdmin && can("roles.assign") ? (
          <Button variant="outline" onPress={() => setAssigning(true)}>
            Assign roles
          </Button>
        ) : null}
      </Section>

      <PermissionSummary permissions={effective} />

      {can("festival.update") && festival?.status === "open" ? (
        <Section
          title="This person's target"
          subtitle={`Committee default is ${formatInr(
            defaultTarget
          )}. Set a lower amount for a child or anyone who should pay less — changing the default later will not overwrite this.`}
        >
          <View style={styles.form}>
            {overridden ? (
              <StatusStrip
                tone="accent"
                message={`Custom target · ${formatInr(target)}`}
              />
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
                    toast.error(
                      friendlyErrorMessage(error, "Could not save this person's target.")
                    );
                  })
                  .finally(() => setBusy(false));
              }}
            >
              Save target
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
        </Section>
      ) : null}

      {lastAdmin && isSelf ? (
        <StatusStrip tone="warning" message={lastAdminSafetyMessage(true)} />
      ) : null}

      {(isAdmin && !isSelf)
      || (can("members.suspend") && pandalMember && !isSelf && pandalMember.status !== "removed") ? (
        <Section title="Access" subtitle="Changes here take effect immediately">
          <View style={styles.form}>
            {isAdmin && !isSelf ? (
              <Button variant="outline" onPress={toggleAdmin}>
                {targetIsAdmin ? "Remove Admin" : "Make Pandal Admin"}
              </Button>
            ) : null}

            {can("members.suspend")
            && pandalMember
            && !isSelf
            && pandalMember.status !== "removed" ? (
              <View style={styles.actionRow}>
                {pandalMember.status === "active" ? (
                  <Button
                    variant="outline"
                    style={styles.actionButton}
                    disabled={lastAdmin}
                    onPress={() => {
                      Alert.alert(
                        "Suspend member?",
                        `${name} will lose access until you restore them.`,
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Suspend",
                            onPress: () =>
                              setMemberStatus("suspended", "Could not suspend this member."),
                          },
                        ]
                      );
                    }}
                  >
                    Suspend
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    style={styles.actionButton}
                    onPress={() => setMemberStatus("active", "Could not restore this member.")}
                  >
                    Restore
                  </Button>
                )}
                {can("members.remove") ? (
                  <Button
                    variant="outline"
                    style={styles.actionButton}
                    disabled={lastAdmin}
                    onPress={() => {
                      Alert.alert(
                        "Remove member?",
                        `${name} will lose access. Historical records keep their name.`,
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Remove",
                            style: "destructive",
                            onPress: () =>
                              setMemberStatus("removed", "Could not remove this member."),
                          },
                        ]
                      );
                    }}
                  >
                    Remove
                  </Button>
                ) : null}
              </View>
            ) : null}

            {lastAdmin ? (
              <StatusStrip
                tone="warning"
                message={lastAdminSafetyMessage(isSelf)}
              />
            ) : null}
          </View>
        </Section>
      ) : null}

      {can("contributions.read") ? (
      <Section title="Festival payments" subtitle={`${payments.length} recorded`}>
        {payments.length === 0 ? (
          <GaneshEmptyState
            compact
            icon={<Check size={20} color={g.saffron} strokeWidth={2.2} />}
            title="No payments yet"
            description="No committee payments recorded for this festival."
          />
        ) : (
          <View style={styles.payments}>
            {payments.map((item) => (
              <LedgerRow
                key={item.id}
                id={item.id}
                icon={<Check size={18} color={g.godFund} strokeWidth={2.4} />}
                iconTint={g.wash(g.godFund)}
                title={item.description || "Committee payment"}
                meta={item.paymentMethod ? item.paymentMethod.toUpperCase() : undefined}
                badges={[{ kind: item.status === "received" ? "received" : "promised" }]}
                amount={item.amount}
                when={formatGaneshWhen(item.createdAt, item.date)}
                pending={item.pendingWrite}
              />
            ))}
          </View>
        )}
      </Section>
      ) : null}
    </GaneshScreen>
  );
}

const styles = StyleSheet.create({
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  back: {
    width: 36,
    height: 44,
    alignItems: "flex-start",
    justifyContent: "center",
    flexShrink: 0,
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  heroName: {
    fontSize: 22,
    letterSpacing: -0.5,
  },
  heroMeta: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  heroBadges: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  phone: {
    fontSize: 12,
  },
  statRow: {
    flexDirection: "row",
    gap: 10,
  },
  track: {
    marginTop: 10,
    marginBottom: 4,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  actionButton: {
    flex: 1,
  },
  form: {
    gap: 12,
  },
  roleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    minHeight: 56,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderCurve: "continuous",
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  roleCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  roleName: {
    fontSize: 14,
  },
  roleMeta: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  payments: {
    gap: 10,
  },
});
