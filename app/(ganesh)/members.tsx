import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { History, UserPlus, Users } from "lucide-react-native";

import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import {
  Avatar,
  FilterChips,
  GaneshHeader,
  LedgerRow,
  ListStateView,
  MetaLabel,
  NavRow,
  Section,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { SearchBar } from "@/components/common/SearchBar";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useJoinRequests } from "@/hooks/useJoinRequests";
import { useMemberAudits } from "@/hooks/useMemberAudits";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { usePandalRoles } from "@/hooks/usePandalRoles";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import type { PandalMember, PandalMemberAudit, PandalRole } from "@/shared/types/ganesh";
import { formatGaneshWhen } from "@/shared/utils/ganeshIdentity";
import { memberAuditLine } from "@/shared/utils/ganeshMemberCopy";
import { ganeshRoleLabel, ganeshStatusLabel } from "@/shared/utils/ganeshPermissions";
import { useTheme } from "@/theme/ThemeProvider";

type Filter = "all" | "admin" | "active" | "suspended";

const FILTER_OPTIONS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "Everyone" },
  { id: "admin", label: "Admins" },
  { id: "active", label: "Active" },
  { id: "suspended", label: "Suspended" },
];

function memberRolesLabel(member: PandalMember, roles: PandalRole[]): string {
  if (member.role === "admin") return "Pandal Admin";
  const names = (member.roleIds ?? [])
    .map((roleId) => roles.find((role) => role.id === roleId)?.name)
    .filter(Boolean);
  if (names.length > 0) return names.join(" · ");
  return ganeshRoleLabel(member.role);
}

function auditLine(audit: PandalMemberAudit, members: PandalMember[]): string {
  return memberAuditLine(audit, members);
}

export default function GaneshMembersScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { push, back } = useRouter();
  const { pandalId } = useGaneshSession();
  const { members, loading, error } = usePandalMembers(pandalId);
  const { roles } = usePandalRoles(pandalId);
  const { requests } = useJoinRequests(pandalId);
  const { can } = useGaneshPermissions();
  const canReadAudit = can("audit.read");
  const { audits } = useMemberAudits(pandalId, canReadAudit);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const active = useMemo(
    () => members.filter((member) => member.status !== "removed"),
    [members]
  );

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return active
      .filter((member) => {
        if (filter === "admin" && member.role !== "admin") return false;
        if (filter === "active" && !(member.status === "active" || member.status == null)) {
          return false;
        }
        if (filter === "suspended" && member.status !== "suspended") return false;
        if (!needle) return true;
        return (
          member.displayName.toLowerCase().includes(needle)
          || memberRolesLabel(member, roles).toLowerCase().includes(needle)
        );
      })
      .slice()
      .sort((a, b) => {
        if (a.role === "admin" && b.role !== "admin") return -1;
        if (b.role === "admin" && a.role !== "admin") return 1;
        return a.displayName.localeCompare(b.displayName);
      });
  }, [active, filter, query, roles]);

  const adminCount = active.filter((member) => member.role === "admin").length;

  return (
    <GaneshScreen safeTop>
      <GaneshHeader
        title="Members"
        subtitle={`${active.length} ${active.length === 1 ? "person" : "people"} · ${adminCount} admin${
          adminCount === 1 ? "" : "s"
        }`}
        icon={<Users size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
      />

      {can("members.approve") ? (
        <Section plain>
          <NavRow
            title="Join requests"
            meta={
              requests.length > 0
                ? "Choose a role, then approve"
                : "Nobody is waiting right now"
            }
            icon={<UserPlus size={17} color={g.saffron} strokeWidth={2.2} />}
            iconTint={g.wash(g.saffron)}
            badge={
              requests.length > 0
                ? { kind: "overdue", label: `${requests.length} waiting` }
                : undefined
            }
            onPress={() => push("/(ganesh)/join-requests" as never)}
          />
        </Section>
      ) : null}

      <SearchBar value={query} onChangeText={setQuery} placeholder="Search name or role" />

      <FilterChips value={filter} options={FILTER_OPTIONS} onChange={setFilter} />

      {rows.length === 0 ? (
        <ListStateView
          loading={loading && active.length === 0}
          error={error}
          illustration="splits"
          title={query.trim() || filter !== "all" ? "Nobody matches" : "No members yet"}
          description={
            query.trim() || filter !== "all"
              ? "Try another filter or clear the search."
              : "Approve a join request to add the first person to this Pandal."
          }
          action={
            can("members.approve") && !query.trim() && filter === "all"
              ? { label: "Join requests", onPress: () => push("/(ganesh)/join-requests" as never) }
              : undefined
          }
        />
      ) : (
        <View style={styles.list}>
          {rows.map((member) => (
            <LedgerRow
              key={member.id}
              id={member.userId}
              icon={<Avatar name={member.displayName} seed={member.userId} />}
              iconTint="none"
              title={member.displayName}
              meta={memberRolesLabel(member, roles)}
              badges={
                member.role === "admin"
                  ? [{ kind: "permanent", label: "Admin" }]
                  : member.status === "suspended"
                    ? [{ kind: "cancelled", label: ganeshStatusLabel(member.status) }]
                    : undefined
              }
              when={member.createdAt ? `Joined ${formatGaneshWhen(member.createdAt)}` : undefined}
              onPress={(userId) => push(`/(ganesh)/member/${userId}` as never)}
            />
          ))}
        </View>
      )}

      {canReadAudit ? (
        <Section
          title="Member changes"
          icon={<History size={16} color={theme.colors.mutedForeground} strokeWidth={2.2} />}
        >
          {audits.length === 0 ? (
            <Text
              style={[
                styles.emptyAudit,
                { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
              ]}
            >
              No membership changes yet.
            </Text>
          ) : (
            audits.slice(0, 12).map((audit, index) => (
              <View
                key={audit.id}
                style={[
                  styles.auditRow,
                  index < Math.min(audits.length, 12) - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: g.divider,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.auditText,
                    { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular },
                  ]}
                >
                  {auditLine(audit, members)}
                </Text>
                {audit.at ? (
                  <MetaLabel>{formatGaneshWhen(audit.at)}</MetaLabel>
                ) : null}
              </View>
            ))
          )}
        </Section>
      ) : null}
    </GaneshScreen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 10,
  },
  emptyAudit: {
    fontSize: 13,
    lineHeight: 19,
  },
  auditRow: {
    paddingVertical: 9,
    gap: 2,
  },
  auditText: {
    fontSize: 13,
    lineHeight: 18,
  },
});
