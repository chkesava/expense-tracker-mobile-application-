import { useEffect, useMemo } from "react";
import { Text } from "react-native";
import { useRouter } from "expo-router";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  ClipboardList,
  FileBarChart,
  Landmark,
  Package,
  ScrollText,
  Settings,
  ShieldCheck,
  Tags,
  Target,
  UserPlus,
  Users,
} from "lucide-react-native";

import { AdminQueryState } from "@/components/ganesh/AdminQueryState";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import {
  GaneshEmptyState,
  GaneshHeader,
  Money,
  NavRow,
  Section,
  SectionPair,
  StatStrip,
  StatTile,
  useGaneshTokens,
  type StatusKind,
} from "@/components/ganesh/ui";
import { useContributions } from "@/hooks/useContributions";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshSummary } from "@/hooks/useGaneshSummary";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { useHouseholds } from "@/hooks/useHouseholds";
import { useJoinRequests } from "@/hooks/useJoinRequests";
import { usePandalAssets } from "@/hooks/usePandalAssets";
import { useSponsorships } from "@/hooks/useSponsorships";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { usePandalRoles } from "@/hooks/usePandalRoles";
import { usePandals } from "@/hooks/usePandals";
import { usePermanentFund } from "@/hooks/usePermanentFund";
import { logError } from "@/lib/errors";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { summarizeAssets } from "@/shared/utils/ganeshAssets";
import { summarizeContributions } from "@/shared/utils/ganeshContributions";
import { summarizeSponsorships } from "@/shared/utils/ganeshSponsors";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { useTheme } from "@/theme/ThemeProvider";

type NeedTone = "attention" | "critical";

type Need = {
  title: string;
  subtitle: string;
  href: string;
  tone: NeedTone;
};

export default function AdminDashboardScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { push, back } = useRouter();
  const { pandalId, festivalId } = useGaneshSession();

  const { pandals, loading: pandalsLoading, error: pandalsError } = usePandals();
  const {
    festivals,
    loading: festivalsLoading,
    error: festivalsError,
    retry: retryFestivals,
  } = useFestivals(pandalId);
  const {
    members,
    loading: membersLoading,
    error: membersError,
    retry: retryMembers,
  } = usePandalMembers(pandalId);
  const { roles } = usePandalRoles(pandalId);
  const {
    requests,
    loading: requestsLoading,
    error: requestsError,
    retry: retryRequests,
  } = useJoinRequests(pandalId);
  const { fund } = usePermanentFund(pandalId);
  const { assets } = usePandalAssets(pandalId);
  const { isAdmin } = useGaneshPermissions();
  const writes = useGaneshWrites();
  const { summary } = useGaneshSummary(pandalId, festivalId);
  const { contributions } = useContributions(pandalId, festivalId);
  const { sponsorships } = useSponsorships(pandalId, festivalId);
  const { households } = useHouseholds(pandalId, festivalId);

  const pandal = pandals.find((item) => item.id === pandalId);
  const festival = festivals.find((item) => item.id === festivalId);
  const activeMembers = members.filter(
    (member) => member.status === "active" || member.status == null
  );
  const pendingReimb = summary.pendingReimbursements ?? 0;

  const contributionTotals = useMemo(
    () => summarizeContributions(contributions),
    [contributions]
  );
  const sponsorTotals = useMemo(() => summarizeSponsorships(sponsorships), [sponsorships]);
  const assetSummary = useMemo(() => summarizeAssets(assets), [assets]);
  const pendingHouses = households.filter((house) => house.status === "pending").length;

  /**
   * Everything an admin has to act on, critical first. The predicates are
   * unchanged from before the redesign — only the presentation moved.
   */
  const needs = useMemo(() => {
    const rows: Need[] = [];

    if (requests.length > 0) {
      rows.push({
        title: `${requests.length} member${requests.length === 1 ? "" : "s"} waiting for approval`,
        subtitle: "Review join requests before they can see the ledger.",
        href: "/(ganesh)/join-requests",
        tone: "critical",
      });
    }
    if (!festival) {
      rows.push({
        title: "Festival has not been created",
        subtitle: "Create this year's Ganesh festival to start the ledger.",
        href: "/(ganesh)/create-festival",
        tone: "critical",
      });
    } else if (festival.status === "closed") {
      rows.push({
        title: "Festival settlement may be needed",
        subtitle: "This festival is closed. Create the next one when you are ready.",
        href: "/(ganesh)/admin/festivals",
        tone: "attention",
      });
    } else if ((festival.contributionTargetAmount ?? 0) <= 0) {
      rows.push({
        title: "Contribution target not configured",
        subtitle: "Set the default committee amount for this festival.",
        href: "/(ganesh)/admin/setup",
        tone: "attention",
      });
    }
    if (contributionTotals.overdueCount > 0) {
      rows.push({
        title: `${contributionTotals.overdueCount} contribution${
          contributionTotals.overdueCount === 1 ? "" : "s"
        } overdue`,
        subtitle: "Still promised after the expected date. They are not cancelled automatically.",
        href: "/(ganesh)/contributions?status=overdue",
        tone: "critical",
      });
    }
    if (sponsorTotals.overdueCount > 0) {
      rows.push({
        title: `${sponsorTotals.overdueCount} promised sponsor${
          sponsorTotals.overdueCount === 1 ? "" : "s"
        } overdue`,
        subtitle: "Still promised after the expected date. They are not cancelled automatically.",
        href: "/(ganesh)/sponsors?status=overdue",
        tone: "critical",
      });
    }
    if (pendingReimb > 0) {
      rows.push({
        title: `${formatInr(pendingReimb)} reimbursement pending`,
        subtitle: "Committee people are waiting to be paid back.",
        href: "/(ganesh)/committee",
        tone: "attention",
      });
    }
    if ((fund.total ?? 0) <= 0) {
      rows.push({
        title: "Permanent Fund is empty",
        subtitle: "Add existing Pandal money if you have any.",
        href: "/(ganesh)/add-permanent-fund",
        tone: "attention",
      });
    }
    if (pendingHouses > 0) {
      rows.push({
        title: `${pendingHouses} household${pendingHouses === 1 ? "" : "s"} still pending`,
        subtitle: "Chanda not collected yet.",
        href: "/(ganesh)/collections",
        tone: "attention",
      });
    }
    if (contributionTotals.promisedCount > 0) {
      rows.push({
        title: `${contributionTotals.promisedCount} contribution${
          contributionTotals.promisedCount === 1 ? "" : "s"
        } promised`,
        subtitle: "Promised gifts are not cash until they are received.",
        href: "/(ganesh)/contributions?status=promised",
        tone: "attention",
      });
    }
    if (sponsorTotals.promisedCount > 0) {
      rows.push({
        title: `${sponsorTotals.promisedCount} awaiting confirmation`,
        subtitle: "Promised sponsorships that have not been confirmed or received.",
        href: "/(ganesh)/sponsors?status=promised",
        tone: "attention",
      });
    }
    if (sponsorTotals.prospectiveCount > 0) {
      rows.push({
        title: `${sponsorTotals.prospectiveCount} prospective sponsor${
          sponsorTotals.prospectiveCount === 1 ? "" : "s"
        }`,
        subtitle: "Leads that have not been promised yet.",
        href: "/(ganesh)/sponsors?status=prospective",
        tone: "attention",
      });
    }

    return rows;
  }, [
    contributionTotals.overdueCount,
    contributionTotals.promisedCount,
    festival,
    fund.total,
    pendingHouses,
    pendingReimb,
    requests.length,
    sponsorTotals.overdueCount,
    sponsorTotals.promisedCount,
    sponsorTotals.prospectiveCount,
  ]);

  useEffect(() => {
    if (!isAdmin) return;
    void writes.ensurePandalRoles().catch((error) => {
      logError("ganesh.admin.ensureRoles", error);
    });
  }, [isAdmin, pandalId]);

  const loading =
    (pandalsLoading && !pandal)
    || (festivalsLoading && festivals.length === 0)
    || (membersLoading && members.length === 0)
    || (requestsLoading && requests.length === 0 && !requestsError);
  const error = pandalsError ?? festivalsError ?? membersError ?? requestsError;

  const glyph = (Icon: typeof Users, tint?: string) => (
    <Icon size={17} color={tint ?? theme.colors.mutedForeground} strokeWidth={2.2} />
  );

  return (
    <GaneshScreen safeTop>
      <GaneshHeader
        title="Admin"
        subtitle={[pandal?.name, festival?.name].filter(Boolean).join(" · ") || undefined}
        icon={<ShieldCheck size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
      />

      <AdminQueryState
        loading={loading}
        error={error}
        onRetry={() => {
          retryFestivals();
          retryMembers();
          retryRequests();
        }}
      >
        <StatStrip>
          <StatTile
            label="Members"
            meta={
              <Text style={{ color: theme.colors.mutedForeground, fontSize: 12 }}>
                {requests.length > 0 ? `${requests.length} waiting` : "All approved"}
              </Text>
            }
          >
            <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.bold, fontSize: 22 }}>
              {activeMembers.length}
            </Text>
          </StatTile>
          <StatTile
            label="Permanent Fund"
            meta={
              <Text style={{ color: theme.colors.mutedForeground, fontSize: 12 }}>
                Carries across festivals
              </Text>
            }
          >
            <Money value={fund.total} size="title" />
          </StatTile>
          <StatTile
            label="Pending reimbursement"
            meta={
              <Text style={{ color: theme.colors.mutedForeground, fontSize: 12 }}>
                {pendingReimb > 0 ? "Owed to members" : "All settled"}
              </Text>
            }
          >
            <Money value={pendingReimb} size="title" />
          </StatTile>
          <StatTile
            label="Pandal assets"
            meta={
              <Text style={{ color: theme.colors.mutedForeground, fontSize: 12 }}>
                {assetSummary.available} available
              </Text>
            }
          >
            <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.bold, fontSize: 22 }}>
              {assetSummary.totalItems}
            </Text>
          </StatTile>
        </StatStrip>

        <Section
          title="Needs attention"
          subtitle={
            needs.length > 0
              ? `${needs.length} open item${needs.length === 1 ? "" : "s"}`
              : undefined
          }
          icon={
            needs.length > 0 ? (
              <AlertTriangle size={16} color={theme.colors.warning} strokeWidth={2.2} />
            ) : undefined
          }
          iconTint={needs.length > 0 ? g.wash(theme.colors.warning) : undefined}
        >
          {needs.length === 0 ? (
            <GaneshEmptyState
              compact
              icon={<ShieldCheck size={20} color={g.saffron} strokeWidth={2.2} />}
              title="You're all caught up"
              description="No join requests or urgent money items right now."
            />
          ) : (
            needs.map((item, index) => {
              const kind: StatusKind = item.tone === "critical" ? "overdue" : "pending";
              return (
                <NavRow
                  key={item.title}
                  title={item.title}
                  meta={item.subtitle}
                  divider={index < needs.length - 1}
                  badge={{ kind, label: item.tone === "critical" ? "Act now" : "Review" }}
                  onPress={() => push(item.href as never)}
                />
              );
            })
          )}
        </Section>

        <SectionPair>
        <Section title="People">
          <NavRow
            title="Members"
            meta="Roles, status, and who paid"
            icon={glyph(Users)}
            divider
            badge={
              requests.length > 0
                ? { kind: "overdue", label: `${requests.length} pending` }
                : undefined
            }
            onPress={() => push("/(ganesh)/members" as never)}
          />
          <NavRow
            title="Join requests"
            meta="People waiting with the Pandal code"
            icon={glyph(UserPlus)}
            divider
            onPress={() => push("/(ganesh)/join-requests" as never)}
          />
          <NavRow
            title="Roles & permissions"
            meta={`${roles.length} role${roles.length === 1 ? "" : "s"} — choose what each can do`}
            icon={glyph(ShieldCheck)}
            divider
            onPress={() => push("/(ganesh)/admin/roles" as never)}
          />
          <NavRow
            title="Committee tracker"
            meta="Who paid their share this festival"
            icon={glyph(ClipboardList)}
            onPress={() => push("/(ganesh)/committee" as never)}
          />
        </Section>

        <Section title="Festival & funds">
          <NavRow
            title="Festival"
            meta={festival ? `${festival.name} — create, switch, or close` : "Create a festival"}
            icon={glyph(CalendarDays)}
            divider
            onPress={() => push("/(ganesh)/admin/festivals" as never)}
          />
          <NavRow
            title="Permanent Fund"
            meta={formatInr(fund.total)}
            icon={glyph(Landmark, g.maroon)}
            iconTint={g.wash(g.maroon)}
            divider
            onPress={() => push("/(ganesh)/permanent-fund" as never)}
          />
          <NavRow
            title="Contribution setup"
            meta="Default committee and household targets"
            icon={glyph(Target)}
            onPress={() => push("/(ganesh)/admin/setup" as never)}
          />
        </Section>
        </SectionPair>

        <SectionPair>
        <Section title="Pandal property">
          <NavRow
            title="Assets"
            meta={`${assetSummary.totalItems} items · ${formatInr(assetSummary.estimatedValue)} estimated`}
            icon={glyph(Package)}
            divider
            badge={
              assetSummary.damaged > 0
                ? { kind: "pending", label: `${assetSummary.damaged} damaged` }
                : undefined
            }
            onPress={() => push("/(ganesh)/assets" as never)}
          />
          <NavRow
            title="Sponsors"
            meta="Profiles and this festival's deals. Promises are not cash."
            icon={glyph(Building2)}
            onPress={() => push("/(ganesh)/sponsors" as never)}
          />
        </Section>

        <Section title="Review & settings">
          <NavRow
            title="Reports"
            meta="Festival and money summaries"
            icon={glyph(FileBarChart)}
            divider
            onPress={() => push("/(ganesh)/admin/reports" as never)}
          />
          <NavRow
            title="Audit log"
            meta="Who changed what"
            icon={glyph(ScrollText)}
            divider
            onPress={() => push("/(ganesh)/admin/audit" as never)}
          />
          <NavRow
            title="Expense categories"
            meta="Add, rename, or disable"
            icon={glyph(Tags)}
            divider
            onPress={() => push("/(ganesh)/admin/categories" as never)}
          />
          <NavRow
            title="Pandal settings"
            meta="Name, area, join rules"
            icon={glyph(Settings)}
            onPress={() => push("/(ganesh)/admin/settings" as never)}
          />
        </Section>
        </SectionPair>
      </AdminQueryState>
    </GaneshScreen>
  );
}
