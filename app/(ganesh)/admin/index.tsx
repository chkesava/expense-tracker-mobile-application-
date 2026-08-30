import { useEffect, useMemo } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AdminGlyph, ADMIN_ART } from "@/components/ganesh/admin/adminArt";
import { AdminHero } from "@/components/ganesh/admin/AdminHero";
import { AdminSection } from "@/components/ganesh/admin/AdminSection";
import { AdminSummary } from "@/components/ganesh/admin/AdminSummary";
import { AdminQueryState } from "@/components/ganesh/AdminQueryState";
import { ganeshStackLayout } from "@/components/ganesh/chrome/stackLayout";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshSyncChip } from "@/components/ganesh/GaneshSyncChip";
import {
  NavRow,
  SectionPair,
  useGaneshTokens,
  type StatusKind,
} from "@/components/ganesh/ui";
import { useTheme } from "@/theme/ThemeProvider";
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

type NeedTone = "attention" | "critical";

type Need = {
  title: string;
  subtitle: string;
  href: string;
  tone: NeedTone;
};

/**
 * Pandal administration. Live status first, then the destinations that change
 * people, money, property, and settings. Predicates and routes are unchanged.
 */
export default function AdminDashboardScreen() {
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

  const membersMeta = requests.length > 0 ? `${requests.length} waiting` : "All approved";
  const reimbMeta = pendingReimb > 0 ? "Owed to members" : "All settled";
  const assetsMeta = `${assetSummary.available} available`;
  const contributionMeta =
    festival && ((festival.contributionTargetAmount ?? 0) > 0 || (festival.householdTargetAmount ?? 0) > 0)
      ? `Committee ${formatInr(festival.contributionTargetAmount ?? 0)} · household ${formatInr(festival.householdTargetAmount ?? 0)}`
      : "Default committee and household targets";
  const festivalMeta = festival
    ? `${festival.name} — create, switch, or close`
    : "Create a festival";

  return (
    <GaneshScreen contentContainerStyle={ganeshStackLayout.bleed}>
      <AdminHero
        pandalName={pandal?.name}
        festivalName={festival?.name}
        onBack={back}
        rightAccessory={<GaneshSyncChip onDark />}
      />

      <View style={styles.body}>
        <View pointerEvents="none" style={styles.lotusWash}>
          <Image
            source={ADMIN_ART.lotusWatermark}
            resizeMode="contain"
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={styles.lotusImage}
          />
        </View>
        <AdminQueryState
          loading={loading}
          error={error}
          onRetry={() => {
            retryFestivals();
            retryMembers();
            retryRequests();
          }}
        >
          <AdminSummary
            memberCount={activeMembers.length}
            membersMeta={membersMeta}
            fundTotal={fund.total ?? 0}
            pendingReimb={pendingReimb}
            reimbMeta={reimbMeta}
            assetCount={assetSummary.totalItems}
            assetsMeta={assetsMeta}
          />

          <AdminSection
            title="Needs attention"
            icon={<AdminGlyph name="iconRoles" size={30} />}
            subtitle={
              needs.length > 0
                ? `${needs.length} open item${needs.length === 1 ? "" : "s"}`
                : "All clear"
            }
          >
            {needs.length === 0 ? (
              <AllClearBanner />
            ) : (
              needs.map((item, index) => {
                const kind: StatusKind = item.tone === "critical" ? "overdue" : "pending";
                return (
                  <NavRow
                    key={item.title}
                    title={item.title}
                    meta={item.subtitle}
                    divider={index < needs.length - 1}
                    chevronColor={g.saffron}
                    badge={{ kind, label: item.tone === "critical" ? "Act now" : "Review" }}
                    onPress={() => push(item.href as never)}
                  />
                );
              })
            )}
          </AdminSection>

          <SectionPair>
            <AdminSection
              title="People"
              icon={<AdminGlyph name="iconMembers" size={30} />}
            >
              <NavRow
                title="Members"
                meta="Roles, status, and who paid"
                icon={<AdminGlyph name="iconMembers" />}
                chevronColor={g.saffron}
                divider
                onPress={() => push("/(ganesh)/members" as never)}
              />
              <NavRow
                title="Join requests"
                meta="People waiting with the Pandal code"
                icon={<AdminGlyph name="iconJoin" />}
                chevronColor={g.saffron}
                divider
                badge={
                  requests.length > 0
                    ? { kind: "overdue", label: `${requests.length} pending` }
                    : undefined
                }
                onPress={() => push("/(ganesh)/join-requests" as never)}
              />
              <NavRow
                title="Roles & permissions"
                meta={`${roles.length} role${roles.length === 1 ? "" : "s"} — choose what each can do`}
                icon={<AdminGlyph name="iconRoles" />}
                chevronColor={g.saffron}
                divider
                onPress={() => push("/(ganesh)/admin/roles" as never)}
              />
              <NavRow
                title="Committee tracker"
                meta="Who paid their share this festival"
                icon={<AdminGlyph name="iconCommittee" />}
                chevronColor={g.saffron}
                onPress={() => push("/(ganesh)/committee" as never)}
              />
            </AdminSection>

            <AdminSection
              title="Festival & funds"
              icon={<AdminGlyph name="iconFestival" size={30} />}
            >
              <NavRow
                title="Festival"
                meta={festivalMeta}
                icon={<AdminGlyph name="iconFestival" />}
                chevronColor={g.saffron}
                divider
                onPress={() => push("/(ganesh)/admin/festivals" as never)}
              />
              <NavRow
                title="Permanent Fund"
                meta={formatInr(fund.total)}
                icon={<AdminGlyph name="iconFund" />}
                chevronColor={g.saffron}
                divider
                onPress={() => push("/(ganesh)/permanent-fund" as never)}
              />
              <NavRow
                title="Contribution setup"
                meta={contributionMeta}
                icon={<AdminGlyph name="iconContribution" />}
                chevronColor={g.saffron}
                onPress={() => push("/(ganesh)/admin/setup" as never)}
              />
            </AdminSection>
          </SectionPair>

          <SectionPair>
            <AdminSection
              title="Pandal property"
              icon={<AdminGlyph name="iconAssets" size={30} />}
            >
              <NavRow
                title="Assets"
                meta={`${assetSummary.totalItems} items · ${formatInr(assetSummary.estimatedValue)} estimated`}
                icon={<AdminGlyph name="iconAssets" />}
                chevronColor={g.saffron}
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
                icon={<AdminGlyph name="iconSponsors" />}
                chevronColor={g.saffron}
                onPress={() => push("/(ganesh)/sponsors" as never)}
              />
            </AdminSection>

            <AdminSection
              title="Review & settings"
              icon={<AdminGlyph name="iconSettings" size={30} />}
            >
              <NavRow
                title="Reports"
                meta="Festival and money summaries"
                icon={<AdminGlyph name="iconReports" />}
                chevronColor={g.saffron}
                divider
                onPress={() => push("/(ganesh)/admin/reports" as never)}
              />
              <NavRow
                title="Audit log"
                meta="Who changed what"
                icon={<AdminGlyph name="iconAudit" />}
                chevronColor={g.saffron}
                divider
                onPress={() => push("/(ganesh)/admin/audit" as never)}
              />
              <NavRow
                title="Expense categories"
                meta="Add, rename, or disable"
                icon={<AdminGlyph name="iconCategories" />}
                chevronColor={g.saffron}
                divider
                onPress={() => push("/(ganesh)/admin/categories" as never)}
              />
              <NavRow
                title="Pandal settings"
                meta="Name, area, join rules"
                icon={<AdminGlyph name="iconSettings" />}
                chevronColor={g.saffron}
                onPress={() => push("/(ganesh)/admin/settings" as never)}
              />
            </AdminSection>
          </SectionPair>
        </AdminQueryState>
      </View>
    </GaneshScreen>
  );
}

function AllClearBanner() {
  const { theme } = useTheme();
  const g = useGaneshTokens();

  return (
    <View
      style={[
        styles.infoBanner,
        { backgroundColor: g.wash(g.saffron), borderColor: g.gold },
      ]}
      accessibilityRole="summary"
    >
      <View style={[styles.infoMark, { backgroundColor: g.saffron }]}>
        <Text style={[styles.infoMarkLabel, { fontFamily: theme.fontFamily.bold }]}>i</Text>
      </View>
      <View style={styles.infoCopy}>
        <Text
          style={[
            styles.infoTitle,
            { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold },
          ]}
        >
          You're all caught up
        </Text>
        <Text style={[styles.infoMeta, { color: theme.colors.mutedForeground }]}>
          No join requests or urgent money items right now.
        </Text>
      </View>
      <Image source={ADMIN_ART.diya} resizeMode="contain" style={[styles.diya, { backgroundColor: "transparent" }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 16,
    paddingTop: 0,
    marginTop: -8,
    gap: 12,
    overflow: "visible",
  },
  lotusWash: {
    position: "absolute",
    right: -20,
    top: 120,
    width: 220,
    height: 220,
    opacity: 0.08,
  },
  lotusImage: {
    width: 220,
    height: 220,
  },
  infoBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
  },
  infoMark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  infoMarkLabel: {
    color: "#FFF8F1",
    fontSize: 14,
  },
  infoCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  infoTitle: {
    fontSize: 14.5,
    letterSpacing: -0.15,
  },
  infoMeta: {
    fontSize: 12,
    lineHeight: 16,
  },
  diya: {
    width: 36,
    height: 36,
  },
});
