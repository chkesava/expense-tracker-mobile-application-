import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ScrollText, ShieldCheck, Users, Wallet } from "lucide-react-native";

import { AdminQueryState } from "@/components/ganesh/AdminQueryState";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import {
  FilterChips,
  GaneshHeader,
  MetaLabel,
  RowGlyph,
  Section,
  StatusStrip,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { useFestivalAuditLogs } from "@/hooks/useFestivalAuditLogs";
import { useMemberAudits } from "@/hooks/useMemberAudits";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import type { GaneshFestivalAudit, PandalMember, PandalMemberAudit } from "@/shared/types/ganesh";
import { formatGaneshWhen, memberDisplayName } from "@/shared/utils/ganeshIdentity";
import { ganeshRoleLabel } from "@/shared/utils/ganeshPermissions";
import { useTheme } from "@/theme/ThemeProvider";

type ActionGroup = "members" | "money" | "festival";

type Row = {
  id: string;
  title: string;
  detail?: string;
  actorId: string;
  action: ActionGroup;
  at?: PandalMemberAudit["at"];
};

function memberLine(audit: PandalMemberAudit, members: PandalMember[]): string {
  const actor = memberDisplayName(members, audit.actorId);
  const target = memberDisplayName(members, audit.targetUserId);
  if (audit.action === "approved") return `${actor} approved ${target}`;
  if (audit.action === "suspended") return `${actor} suspended ${target}`;
  if (audit.action === "removed") return `${actor} removed ${target}`;
  if (audit.action === "join_mode") return `${actor} changed who can join`;
  if (audit.action === "make_admin") return `${actor} made ${target} a Pandal Admin`;
  if (audit.action === "remove_admin") return `${actor} removed Admin from ${target}`;
  if (audit.action === "role_assigned") {
    return `${actor} assigned ${audit.roleName ?? "a role"} to ${target}`;
  }
  if (audit.action === "role_unassigned") {
    return `${actor} removed ${audit.roleName ?? "a role"} from ${target}`;
  }
  if (audit.action === "role_permissions") {
    return `${actor} changed ${audit.roleName ?? "a role"}`;
  }
  if (audit.oldRole && audit.newRole && audit.oldRole !== audit.newRole) {
    return `${actor} changed ${target} to ${ganeshRoleLabel(audit.newRole)}`;
  }
  return `${actor} updated ${target}`;
}

function festivalLine(audit: GaneshFestivalAudit, members: PandalMember[]): string {
  const actor = memberDisplayName(members, audit.actorId);
  if (audit.action === "transferred") return `${actor} moved money`;
  if (audit.action === "closed") return `${actor} closed the festival`;
  if (audit.action === "voided") return `${actor} voided a ${audit.entityType}`;
  if (audit.action === "reimbursed") return `${actor} recorded a reimbursement`;
  if (audit.entityType === "category") {
    return `${actor} ${audit.reason === "Disabled category" ? "disabled" : "updated"} a category`;
  }
  if (audit.entityType === "festival") return `${actor} edited the festival`;
  if (audit.action === "created") return `${actor} added a ${audit.entityType}`;
  if (audit.action === "edited") return `${actor} edited a ${audit.entityType}`;
  return `${actor} ${audit.action} ${audit.entityType}`;
}

function changeText(oldValue?: unknown, newValue?: unknown): string | undefined {
  if (oldValue == null && newValue == null) return undefined;
  const oldText = oldValue == null ? "" : JSON.stringify(oldValue);
  const nextText = newValue == null ? "" : JSON.stringify(newValue);
  if (!oldText && !nextText) return undefined;
  return [oldText ? `Was ${oldText}` : null, nextText ? `Now ${nextText}` : null]
    .filter(Boolean)
    .join(" · ")
    .replace(/[{}"]/g, "")
    .replace(/,/g, ", ");
}

const ACTION_OPTIONS: Array<{ id: "all" | ActionGroup; label: string }> = [
  { id: "all", label: "Everything" },
  { id: "members", label: "People" },
  { id: "money", label: "Money" },
  { id: "festival", label: "Festival" },
];

const DAY_OPTIONS = [
  { id: "all" as const, label: "All time" },
  { id: "today" as const, label: "Today" },
];

function groupGlyph(action: ActionGroup) {
  if (action === "members") return Users;
  if (action === "money") return Wallet;
  return ShieldCheck;
}

export default function AdminAuditScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { back } = useRouter();
  const { pandalId, festivalId } = useGaneshSession();
  const { members } = usePandalMembers(pandalId);
  const memberAudits = useMemberAudits(pandalId, true);
  const festivalAudits = useFestivalAuditLogs(pandalId, festivalId, true);

  const [actionFilter, setActionFilter] = useState<"all" | ActionGroup>("all");
  const [actorId, setActorId] = useState<string>("all");
  const [day, setDay] = useState<"all" | "today">("all");

  const rows = useMemo<Row[]>(() => {
    const memberRows: Row[] = memberAudits.audits.map((audit) => ({
      id: `member-${audit.id}`,
      title: memberLine(audit, members),
      detail:
        audit.oldRole && audit.newRole && audit.oldRole !== audit.newRole
          ? `${ganeshRoleLabel(audit.oldRole)} → ${ganeshRoleLabel(audit.newRole)}`
          : audit.reason,
      actorId: audit.actorId,
      action: "members",
      at: audit.at,
    }));
    const festivalRows: Row[] = festivalAudits.audits.map((audit) => ({
      id: `festival-${audit.id}`,
      title: festivalLine(audit, members),
      detail: changeText(audit.oldValue, audit.newValue) ?? audit.reason,
      actorId: audit.actorId,
      action:
        audit.action === "transferred"
        || audit.action === "voided"
        || audit.action === "reimbursed"
          ? "money"
          : "festival",
      at: audit.at,
    }));
    return [...memberRows, ...festivalRows].sort(
      (a, b) => (b.at?.seconds ?? 0) - (a.at?.seconds ?? 0)
    );
  }, [festivalAudits.audits, memberAudits.audits, members]);

  const actors = useMemo(() => {
    const ids = new Set(rows.map((row) => row.actorId));
    return members.filter((member) => ids.has(member.userId));
  }, [members, rows]);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todaySeconds = Math.floor(startOfToday.getTime() / 1000);

  const visible = rows.filter((row) => {
    if (actionFilter !== "all" && row.action !== actionFilter) return false;
    if (actorId !== "all" && row.actorId !== actorId) return false;
    if (day === "today" && (row.at?.seconds ?? 0) < todaySeconds) return false;
    return true;
  });

  const loading =
    (memberAudits.loading && memberAudits.audits.length === 0)
    || (festivalAudits.loading && festivalAudits.audits.length === 0);
  const error = memberAudits.error ?? festivalAudits.error;

  return (
    <GaneshScreen safeTop>
      <GaneshHeader
        title="Audit log"
        subtitle={`${visible.length} ${visible.length === 1 ? "entry" : "entries"}`}
        icon={<ScrollText size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
      />

      <StatusStrip
        tone="info"
        message="Important Pandal changes, written for the committee — not a technical log."
      />

      <FilterChips value={actionFilter} options={ACTION_OPTIONS} onChange={setActionFilter} />
      <FilterChips value={day} options={DAY_OPTIONS} onChange={setDay} />

      {actors.length > 1 ? (
        <FilterChips
          label="Who did it"
          value={actorId}
          options={[
            { id: "all", label: "Everyone" },
            ...actors.map((member) => ({ id: member.userId, label: member.displayName })),
          ]}
          onChange={setActorId}
        />
      ) : null}

      <AdminQueryState
        loading={loading}
        error={error}
        onRetry={() => {
          memberAudits.retry();
          festivalAudits.retry();
        }}
        empty={
          visible.length === 0
            ? {
                title:
                  rows.length === 0
                    ? "No administrative activity yet"
                    : "Nothing matches these filters",
                description:
                  rows.length === 0
                    ? "Approvals, role changes, and money moves will show here."
                    : "Try a different filter, or switch back to All time.",
              }
            : null
        }
      >
        <Section title="Activity">
          {visible.map((row, index) => {
            const Glyph = groupGlyph(row.action);
            return (
              <View
                key={row.id}
                style={[
                  styles.row,
                  index < visible.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: g.divider,
                  },
                ]}
              >
                <RowGlyph tint={g.tile}>
                  <Glyph size={15} color={theme.colors.mutedForeground} strokeWidth={2.2} />
                </RowGlyph>

                <View style={styles.copy}>
                  <Text
                    style={[
                      styles.title,
                      { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular },
                    ]}
                  >
                    {row.title}
                  </Text>
                  {row.detail ? (
                    <Text
                      numberOfLines={3}
                      style={[
                        styles.detail,
                        {
                          color: theme.colors.mutedForeground,
                          fontFamily: theme.fontFamily.regular,
                        },
                      ]}
                    >
                      {row.detail}
                    </Text>
                  ) : null}
                  {row.at ? <MetaLabel>{formatGaneshWhen(row.at)}</MetaLabel> : null}
                </View>
              </View>
            );
          })}
        </Section>
      </AdminQueryState>
    </GaneshScreen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 11,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: 13.5,
    lineHeight: 19,
  },
  detail: {
    fontSize: 12,
    lineHeight: 17,
  },
});
