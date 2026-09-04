import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { AdminGlyph } from "@/components/ganesh/admin/adminArt";
import { AdminQueryState } from "@/components/ganesh/AdminQueryState";
import { FestivalStackHero } from "@/components/ganesh/chrome/FestivalStackHero";
import { ganeshStackLayout } from "@/components/ganesh/chrome/stackLayout";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import {
  DataRow,
  FilterChips,
} from "@/components/ganesh/ui";
import { useFestivalAuditLogs } from "@/hooks/useFestivalAuditLogs";
import { useMemberAudits } from "@/hooks/useMemberAudits";
import { usePandalAssetAudits } from "@/hooks/usePandalAssets";
import { usePandalSponsorAudits } from "@/hooks/usePandalSponsors";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import type { GaneshFestivalAudit, PandalMember, PandalMemberAudit } from "@/shared/types/ganesh";
import { formatGaneshWhen, memberDisplayName } from "@/shared/utils/ganeshIdentity";
import { memberAuditLine } from "@/shared/utils/ganeshMemberCopy";
import { ganeshRoleLabel } from "@/shared/utils/ganeshPermissions";
import { useTheme } from "@/theme/ThemeProvider";

type Row = {
  id: string;
  title: string;
  detail?: string;
  actorId: string;
  action: "members" | "money" | "festival" | "property";
  at?: PandalMemberAudit["at"];
};

function memberLine(audit: PandalMemberAudit, members: PandalMember[]): string {
  return memberAuditLine(audit, members);
}

function festivalLine(audit: GaneshFestivalAudit, members: PandalMember[]): string {
  const actor = memberDisplayName(members, audit.actorId);
  if (audit.action === "reopened") return `${actor} reopened the festival`;
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

export default function AdminAuditScreen() {
  const { theme } = useTheme();
  const { back } = useRouter();
  const { pandalId, festivalId } = useGaneshSession();
  const { members } = usePandalMembers(pandalId);
  const memberAudits = useMemberAudits(pandalId, true);
  const festivalAudits = useFestivalAuditLogs(pandalId, festivalId, true);
  // Four audit trails exist; this screen merged two (GS-052). Asset disposals,
  // quantity write-downs and sponsor edits appeared nowhere Pandal-wide — the
  // asset ones only on an individual asset's detail screen, the sponsor ones
  // not at all. Both hooks already existed and both are readable under
  // `audit.read` per the rules.
  const assetAudits = usePandalAssetAudits(pandalId);
  const sponsorAudits = usePandalSponsorAudits(pandalId);
  const [actionFilter, setActionFilter] =
    useState<"all" | "members" | "money" | "festival" | "property">("all");
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
        audit.action === "transferred" || audit.action === "voided" || audit.action === "reimbursed"
          ? "money"
          : "festival",
      at: audit.at,
    }));
    const assetRows: Row[] = assetAudits.audits.map((audit) => ({
      id: `asset-${audit.id}`,
      title: `${memberDisplayName(members, audit.actorId)} ${
        audit.action === "disposed"
          ? "disposed of an asset"
          : audit.action === "quantity"
            ? "changed an asset quantity"
            : audit.action === "status"
              ? "changed an asset status"
              : audit.action === "created"
                ? "added an asset"
                : audit.action === "photo"
                  ? "changed an asset photo"
                  : "edited an asset"
      }`,
      detail: changeText(audit.oldValue, audit.newValue) ?? audit.reason,
      actorId: audit.actorId,
      action: "property",
      at: audit.at,
    }));
    const sponsorRows: Row[] = sponsorAudits.audits.map((audit) => ({
      id: `sponsor-${audit.id}`,
      title: `${memberDisplayName(members, audit.actorId)} ${
        audit.action === "created"
          ? "added a sponsor"
          : audit.action === "photo"
            ? "changed a sponsor photo"
            : "edited a sponsor"
      }`,
      detail: changeText(audit.oldValue, audit.newValue) ?? audit.reason,
      actorId: audit.actorId,
      action: "property",
      at: audit.at,
    }));
    return [...memberRows, ...festivalRows, ...assetRows, ...sponsorRows].sort(
      (a, b) => (b.at?.seconds ?? 0) - (a.at?.seconds ?? 0)
    );
  }, [
    assetAudits.audits,
    festivalAudits.audits,
    memberAudits.audits,
    sponsorAudits.audits,
    members,
  ]);

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
    (memberAudits.loading && memberAudits.audits.length === 0) ||
    (festivalAudits.loading && festivalAudits.audits.length === 0) ||
    (assetAudits.loading && assetAudits.audits.length === 0) ||
    (sponsorAudits.loading && sponsorAudits.audits.length === 0);
  const error =
    memberAudits.error ?? festivalAudits.error ?? assetAudits.error ?? sponsorAudits.error;

  return (
    <GaneshScreen contentContainerStyle={ganeshStackLayout.bleed}>
      <FestivalStackHero
        title="Audit log"
        onBack={back}
        mark={<AdminGlyph name="iconAudit" size={40} />}
      />
      <View style={ganeshStackLayout.body}>
      <Text style={{ color: theme.colors.mutedForeground, lineHeight: 22 }}>
        Important Pandal changes. This is for the committee, not a technical log.
      </Text>
      <FilterChips
        layout="wrap"
        value={actionFilter}
        options={[
          { id: "all", label: "All" },
          { id: "members", label: "Members" },
          { id: "money", label: "Money" },
          { id: "property", label: "Property" },
          { id: "festival", label: "Festival" },
        ]}
        onChange={setActionFilter}
      />
      <FilterChips
        layout="wrap"
        value={day}
        options={[
          { id: "all", label: "All days" },
          { id: "today", label: "Today" },
        ]}
        onChange={setDay}
      />
      {actors.length > 1 ? (
        <FilterChips
          layout="wrap"
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
            ? { title: "No administrative activity yet", description: "Approvals, role changes, and money moves will show here." }
            : null
        }
      >
        {visible.map((row, index) => (
          <DataRow
            key={row.id}
            title={row.title}
            meta={[row.detail, row.at ? formatGaneshWhen(row.at) : null].filter(Boolean).join(" · ")}
            divider={index < visible.length - 1}
          />
        ))}
      </AdminQueryState>
      </View>
    </GaneshScreen>
  );
}
