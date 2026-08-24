import { useEffect } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AdminLinkRow } from "@/components/ganesh/AdminLinkRow";
import { AdminQueryState } from "@/components/ganesh/AdminQueryState";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { MetricGrid } from "@/components/ganesh/MetricGrid";
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
import { assetPurchaseAmountOf, regularExpenseAmount, totalExpenses } from "@/shared/utils/ganeshMath";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { useTheme } from "@/theme/ThemeProvider";

export default function AdminDashboardScreen() {
  const { theme } = useTheme();
  const { push } = useRouter();
  const { pandalId, festivalId } = useGaneshSession();
  const { pandals, loading: pandalsLoading, error: pandalsError } = usePandals();
  const { festivals, loading: festivalsLoading, error: festivalsError, retry: retryFestivals } =
    useFestivals(pandalId);
  const { members, loading: membersLoading, error: membersError, retry: retryMembers } =
    usePandalMembers(pandalId);
  const { roles } = usePandalRoles(pandalId);
  const { requests, loading: requestsLoading, error: requestsError, retry: retryRequests } =
    useJoinRequests(pandalId);
  const { fund } = usePermanentFund(pandalId);
  const { assets } = usePandalAssets(pandalId);
  const { isAdmin } = useGaneshPermissions();
  const writes = useGaneshWrites();
  const { summary } = useGaneshSummary(pandalId, festivalId);
  const { contributions } = useContributions(pandalId, festivalId);
  const { sponsorships } = useSponsorships(pandalId, festivalId);
  const { households } = useHouseholds(pandalId, festivalId);
  const contributionTotals = summarizeContributions(contributions);
  const sponsorTotals = summarizeSponsorships(sponsorships);
  const assetSummary = summarizeAssets(assets);
  const pandal = pandals.find((item) => item.id === pandalId);
  const festival = festivals.find((item) => item.id === festivalId);
  const activeMembers = members.filter((member) => member.status === "active" || member.status == null);
  const pendingHouses = households.filter((house) => house.status === "pending").length;
  const pendingReimb = summary.pendingReimbursements ?? 0;
  const needs: Array<{
    title: string;
    subtitle: string;
    href: string;
    tone: "attention" | "critical";
  }> = [];

  if (requests.length > 0) {
    needs.push({
      title: `${requests.length} member${requests.length === 1 ? "" : "s"} waiting for approval`,
      subtitle: "Review join requests before they can see the ledger.",
      href: "/(ganesh)/join-requests",
      tone: "critical",
    });
  }
  if (pendingReimb > 0) {
    needs.push({
      title: `${formatInr(pendingReimb)} reimbursement pending`,
      subtitle: "Committee people are waiting to be paid back.",
      href: "/(ganesh)/committee",
      tone: "attention",
    });
  }
  if (!festival) {
    needs.push({
      title: "Festival has not been created",
      subtitle: "Create this year's Ganesh festival to start the ledger.",
      href: "/(ganesh)/create-festival",
      tone: "critical",
    });
  } else if (festival.status === "closed") {
    needs.push({
      title: "Festival settlement may be needed",
      subtitle: "This festival is closed. Create the next one when you are ready.",
      href: "/(ganesh)/admin/festivals",
      tone: "attention",
    });
  } else if ((festival.contributionTargetAmount ?? 0) <= 0) {
    needs.push({
      title: "Contribution target not configured",
      subtitle: "Set the default committee amount for this festival.",
      href: "/(ganesh)/admin/setup",
      tone: "attention",
    });
  }
  if ((fund.total ?? 0) <= 0) {
    needs.push({
      title: "Permanent Fund is empty",
      subtitle: "Add existing Pandal money if you have any.",
      href: "/(ganesh)/add-permanent-fund",
      tone: "attention",
    });
  }
  if (pendingHouses > 0) {
    needs.push({
      title: `${pendingHouses} household${pendingHouses === 1 ? "" : "s"} still pending`,
      subtitle: "Chanda not collected yet.",
      href: "/(ganesh)/collections",
      tone: "attention",
    });
  }
  if (contributionTotals.promisedCount > 0) {
    needs.push({
      title: `${contributionTotals.promisedCount} contribution${contributionTotals.promisedCount === 1 ? "" : "s"} promised`,
      subtitle: "Promised gifts are not cash until they are received.",
      href: "/(ganesh)/contributions?status=promised",
      tone: "attention",
    });
  }
  if (contributionTotals.overdueCount > 0) {
    needs.push({
      title: `${contributionTotals.overdueCount} contribution${contributionTotals.overdueCount === 1 ? "" : "s"} overdue`,
      subtitle: "Still promised after the expected date. They are not cancelled automatically.",
      href: "/(ganesh)/contributions?status=overdue",
      tone: "critical",
    });
  }
  if (sponsorTotals.prospectiveCount > 0) {
    needs.push({
      title: `${sponsorTotals.prospectiveCount} prospective sponsor${sponsorTotals.prospectiveCount === 1 ? "" : "s"}`,
      subtitle: "Leads that have not been promised yet.",
      href: "/(ganesh)/sponsors?status=prospective",
      tone: "attention",
    });
  }
  if (sponsorTotals.overdueCount > 0) {
    needs.push({
      title: `${sponsorTotals.overdueCount} promised sponsor${sponsorTotals.overdueCount === 1 ? "" : "s"} overdue`,
      subtitle: "Still promised after the expected date. They are not cancelled automatically.",
      href: "/(ganesh)/sponsors?status=overdue",
      tone: "critical",
    });
  }
  if (sponsorTotals.promisedCount > 0) {
    needs.push({
      title: `${sponsorTotals.promisedCount} awaiting confirmation`,
      subtitle: "Promised sponsorships that have not been confirmed or received.",
      href: "/(ganesh)/sponsors?status=promised",
      tone: "attention",
    });
  }

  useEffect(() => {
    if (!isAdmin) return;
    void writes.ensurePandalRoles().catch((error) => {
      logError("ganesh.admin.ensureRoles", error);
    });
  }, [isAdmin, pandalId]);

  const loading =
    (pandalsLoading && !pandal) ||
    (festivalsLoading && festivals.length === 0) ||
    (membersLoading && members.length === 0) ||
    (requestsLoading && requests.length === 0 && !requestsError);
  const error = pandalsError ?? festivalsError ?? membersError ?? requestsError;

  return (
    <GaneshScreen>
      <Text style={{ color: theme.colors.mutedForeground, lineHeight: 22 }}>
        {pandal?.name || "Pandal"}
        {festival ? ` · ${festival.name}` : ""}
      </Text>

      <AdminQueryState
        loading={loading}
        error={error}
        onRetry={() => {
          retryFestivals();
          retryMembers();
          retryRequests();
        }}
      >
        <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>Pandal overview</Text>
        <MetricGrid
          items={[
            { label: "Members", value: `${activeMembers.length}` },
            { label: "Pending", value: `${requests.length}` },
            { label: "Permanent Fund", value: fund.total },
            { label: "Pending reimb.", value: pendingReimb },
          ]}
        />

        <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>Festival spend</Text>
        <MetricGrid
          items={[
            { label: "Festival expenses", value: totalExpenses(summary) },
            { label: "Regular", value: regularExpenseAmount(summary) },
            { label: "Asset purchases", value: assetPurchaseAmountOf(summary) },
          ]}
        />

        <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>Pandal assets</Text>
        <MetricGrid
          items={[
            { label: "Total", value: `${assetSummary.totalItems}` },
            { label: "Available", value: `${assetSummary.available}` },
            { label: "Damaged", value: `${assetSummary.damaged}` },
            { label: "Disposed", value: `${assetSummary.disposed}` },
            { label: "Estimated value", value: assetSummary.estimatedValue },
          ]}
        />
        <AdminLinkRow
          title="Pandal assets"
          subtitle="Inventory that stays with the Pandal across years"
          onPress={() => push("/(ganesh)/assets" as never)}
        />
        <AdminLinkRow
          title="Sponsors"
          subtitle="Profiles and this festival's deals. Promises are not cash."
          onPress={() => push("/(ganesh)/sponsors" as never)}
        />

        <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>Needs attention</Text>
        {needs.length === 0 ? (
          <AdminQueryState
            empty={{
              title: "You're all caught up",
              description: "No join requests or urgent money items right now.",
            }}
          />
        ) : (
          <View style={{ gap: 10 }}>
            {needs.map((item) => (
              <AdminLinkRow
                key={item.title}
                title={item.title}
                subtitle={item.subtitle}
                badge="Review"
                tone={item.tone}
                onPress={() => push(item.href as never)}
              />
            ))}
          </View>
        )}

        <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>Quick actions</Text>
        <View style={{ gap: 10 }}>
          {requests.length > 0 ? (
            <AdminLinkRow
              title="Approve members"
              subtitle="Review pending join requests"
              badge={`${requests.length}`}
              tone="critical"
              onPress={() => push("/(ganesh)/join-requests" as never)}
            />
          ) : null}
          <AdminLinkRow
            title="Members"
            subtitle="Roles, status, and who paid"
            onPress={() => push("/(ganesh)/members" as never)}
          />
          <AdminLinkRow
            title="Permanent Fund"
            subtitle={formatInr(fund.total)}
            onPress={() => push("/(ganesh)/permanent-fund" as never)}
          />
          <AdminLinkRow
            title="Festivals"
            subtitle={festival ? festival.name : "Create a festival"}
            onPress={() => push("/(ganesh)/admin/festivals" as never)}
          />
          <AdminLinkRow
            title="Contribution setup"
            subtitle="Default committee and household targets"
            onPress={() => push("/(ganesh)/admin/setup" as never)}
          />
          <AdminLinkRow
            title="View reports"
            subtitle="Festival and money summaries"
            onPress={() => push("/(ganesh)/admin/reports" as never)}
          />
        </View>

        <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>User management</Text>
        <MetricGrid
          items={[
            { label: "Members", value: `${activeMembers.length}` },
            { label: "Pending requests", value: `${requests.length}` },
            { label: "Roles", value: `${roles.length}` },
          ]}
        />
        <View style={{ gap: 10 }}>
          <AdminLinkRow
            title="Manage members"
            subtitle="Approve, assign roles, or make Admin"
            badge={requests.length > 0 ? `${requests.length} pending` : undefined}
            tone={requests.length > 0 ? "critical" : "normal"}
            onPress={() => push("/(ganesh)/members" as never)}
          />
          <AdminLinkRow
            title="Roles & permissions"
            subtitle="Create roles and choose what they can do"
            onPress={() => push("/(ganesh)/admin/roles" as never)}
          />
        </View>

        <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>People</Text>
        <View style={{ gap: 10 }}>
          <AdminLinkRow
            title="Members"
            subtitle="Approve, change roles, suspend"
            badge={requests.length > 0 ? `${requests.length} pending` : undefined}
            tone={requests.length > 0 ? "critical" : "normal"}
            onPress={() => push("/(ganesh)/members" as never)}
          />
          <AdminLinkRow
            title="Join requests"
            subtitle="People waiting with the Pandal code"
            onPress={() => push("/(ganesh)/join-requests" as never)}
          />
          <AdminLinkRow
            title="Committee tracker"
            subtitle="Who paid this festival"
            onPress={() => push("/(ganesh)/committee" as never)}
          />
        </View>

        <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>Festival & money</Text>
        <View style={{ gap: 10 }}>
          <AdminLinkRow
            title="Festival"
            subtitle="Create, switch, or close"
            onPress={() => push("/(ganesh)/admin/festivals" as never)}
          />
          <AdminLinkRow
            title="Money & funds"
            subtitle="Permanent Fund and festival cash"
            onPress={() => push("/(ganesh)/permanent-fund" as never)}
          />
          <AdminLinkRow
            title="Contribution setup"
            subtitle="Committee and household targets"
            onPress={() => push("/(ganesh)/admin/setup" as never)}
          />
          <AdminLinkRow
            title="Collections"
            subtitle="Household chanda"
            onPress={() => push("/(ganesh)/collections" as never)}
          />
          <AdminLinkRow
            title="Expenses"
            subtitle="God Fund and personal spend"
            onPress={() => push("/(ganesh)/expenses" as never)}
          />
          <AdminLinkRow
            title="Contributions"
            subtitle="Cash, in-kind, and one-off gifts"
            onPress={() => push("/(ganesh)/contributions" as never)}
          />
          <AdminLinkRow
            title="Sponsors"
            subtitle="Festival sponsorships and profiles"
            onPress={() => push("/(ganesh)/sponsors" as never)}
          />
        </View>

        <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>Review</Text>
        <View style={{ gap: 10 }}>
          <AdminLinkRow
            title="Reports"
            subtitle="This festival summary"
            onPress={() => push("/(ganesh)/admin/reports" as never)}
          />
          <AdminLinkRow
            title="Audit log"
            subtitle="Who changed what"
            onPress={() => push("/(ganesh)/admin/audit" as never)}
          />
          <AdminLinkRow
            title="Expense categories"
            subtitle="Add, rename, or disable"
            onPress={() => push("/(ganesh)/admin/categories" as never)}
          />
          <AdminLinkRow
            title="Pandal settings"
            subtitle="Name, area, join rules"
            onPress={() => push("/(ganesh)/admin/settings" as never)}
          />
        </View>
      </AdminQueryState>
    </GaneshScreen>
  );
}
