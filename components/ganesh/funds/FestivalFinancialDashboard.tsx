import { StyleSheet, Text, View } from "react-native";
import { Wallet } from "lucide-react-native";

import { GodFundHero } from "@/components/ganesh/GodFundHero";
import { PermanentFundCard } from "@/components/ganesh/PermanentFundCard";
import {
  DataRow,
  MetaLabel,
  Money,
  ProgressTrack,
  Section,
  SectionPair,
  StatStrip,
  StatTile,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import type { GaneshActivity } from "@/shared/types/ganesh";
import { formatGaneshWhen } from "@/shared/utils/ganeshIdentity";
import { fundLocationLabel } from "@/shared/utils/ganeshMath";
import type { FinancialOverview, MoneyLine } from "@/shared/utils/ganeshFinancialOverview";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { useTheme } from "@/theme/ThemeProvider";

function visibleLines(lines: MoneyLine[]): MoneyLine[] {
  return lines.filter((line) => line.amount > 0);
}

export function FestivalFinancialDashboard({
  overview,
  festivalName,
  canSeePermanentFund,
  canSeeReimbursements,
  canSeeContributions,
  canSeeCollections,
  activityActors,
  onReport,
  onPermanentFund,
  onReimburse,
  onPromised,
  onHouses,
  onCommittee,
}: {
  overview: FinancialOverview;
  festivalName?: string;
  canSeePermanentFund: boolean;
  canSeeReimbursements: boolean;
  canSeeContributions: boolean;
  canSeeCollections: boolean;
  activityActors: (actorId: string) => string;
  onReport: () => void;
  onPermanentFund: () => void;
  onReimburse: () => void;
  onPromised: () => void;
  onHouses: () => void;
  onCommittee: () => void;
}) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const locations = overview.locations;
  const locationItems = (
    [
      { key: "cash" as const, label: fundLocationLabel("cash"), value: locations.cash },
      { key: "upi" as const, label: fundLocationLabel("upi"), value: locations.upi },
      { key: "bank" as const, label: fundLocationLabel("bank"), value: locations.bank },
      { key: "other" as const, label: fundLocationLabel("other"), value: locations.other },
    ] as const
  ).filter((item) => item.value > 0);
  const moneyInLines = visibleLines(overview.moneyInLines);
  const moneyOutLines = visibleLines(overview.moneyOutLines);
  const spendPct = overview.health.spentPct;
  const attention: Array<{ id: string; title: string; meta: string; onPress: () => void; amount?: number }> = [];
  if (canSeeReimbursements && overview.pendingReimbursements > 0) {
    attention.push({
      id: "reimburse",
      title: "Pending reimbursements",
      meta: `${overview.pendingReimbursementMembers.length || "Committee"} to settle`,
      amount: overview.pendingReimbursements,
      onPress: onReimburse,
    });
  }
  if (canSeeContributions && overview.contributionTotals.promisedCount > 0) {
    attention.push({
      id: "promised",
      title: "Promised contributions",
      meta: `${overview.contributionTotals.promisedCount} not yet received · not cash`,
      amount: overview.contributionTotals.promisedCash,
      onPress: onPromised,
    });
  }
  if (canSeeCollections && overview.collections.pendingHouses > 0) {
    attention.push({
      id: "houses",
      title: "Pending houses",
      meta: `${overview.collections.pendingHouses} still to collect`,
      onPress: onHouses,
    });
  }
  if (overview.committee.pending > 0) {
    attention.push({
      id: "committee",
      title: "Committee contribution pending",
      meta: `${formatInr(overview.committee.received)} of ${formatInr(overview.committee.target)} received`,
      amount: overview.committee.pending,
      onPress: onCommittee,
    });
  }

  return (
    <View style={styles.root}>
      <GodFundHero
        amount={overview.availableGodFund}
        festivalName={festivalName}
        breakdown={
          locationItems.length > 0
            ? locationItems.map((item) => ({ label: item.label, value: item.value }))
            : undefined
        }
        emptyHint={
          overview.hasFinancialActivity
            ? undefined
            : "No financial activity yet. Start by adding a collection, contribution, or opening fund."
        }
        onPress={onReport}
      />

      {canSeePermanentFund ? (
        <PermanentFundCard fund={overview.permanentFund} onPress={onPermanentFund} />
      ) : null}

      {overview.hasFinancialActivity ? (
        <SectionPair>
          <Section title="Money in" subtitle="Received cash only">
            <StatStrip>
              {moneyInLines.map((line) => (
                <StatTile key={line.id} label={line.label}>
                  <Money value={line.amount} size="secondary" />
                </StatTile>
              ))}
            </StatStrip>
          </Section>
          <Section title="Money out" subtitle="God Fund cash that left">
            <StatStrip>
              {moneyOutLines.length > 0 ? (
                moneyOutLines.map((line) => (
                  <StatTile key={line.id} label={line.label}>
                    <Money value={line.amount} size="secondary" />
                  </StatTile>
                ))
              ) : (
                <StatTile label="None yet">
                  <Money value={0} size="secondary" />
                </StatTile>
              )}
            </StatStrip>
          </Section>
        </SectionPair>
      ) : null}

      {spendPct != null ? (
        <View style={styles.health}>
          <MetaLabel>
            {Math.round(spendPct)}% of received cash has been spent
            {overview.health.committeePct != null
              ? ` · Committee ${Math.round(overview.health.committeePct)}%`
              : ""}
          </MetaLabel>
          <ProgressTrack pct={Math.min(100, spendPct)} color={g.saffron} />
        </View>
      ) : null}

      {canSeeReimbursements && overview.pendingReimbursements > 0 ? (
        <Section title="Pending reimbursements" subtitle="Personal money still owed">
          <DataRow
            leading={
              <View style={[styles.glyph, { backgroundColor: g.wash(g.promised) }]}>
                <Wallet size={16} color={g.promised} strokeWidth={2.2} />
              </View>
            }
            title="Total pending"
            value={<Money value={overview.pendingReimbursements} size="secondary" tone="warning" />}
            onPress={onReimburse}
          />
          {overview.pendingReimbursementMembers.slice(0, 4).map((member) => (
            <DataRow
              key={member.memberId}
              divider={false}
              title={member.displayName}
              value={<Money value={member.amount} size="secondary" />}
            />
          ))}
        </Section>
      ) : null}

      {canSeeContributions && overview.inKindEstimated > 0 ? (
        <Text style={[styles.hint, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
          In-kind contributions {formatInr(overview.inKindEstimated)} estimated — not cash
        </Text>
      ) : null}

      {attention.length > 0 ? (
        <Section title="Needs attention">
          {attention.map((row, index) => (
            <DataRow
              key={row.id}
              divider={index < attention.length - 1}
              title={row.title}
              meta={row.meta}
              value={
                row.amount != null ? (
                  <Money value={row.amount} size="secondary" tone="warning" />
                ) : undefined
              }
              onPress={row.onPress}
            />
          ))}
        </Section>
      ) : null}

      {overview.recentActivity.length > 0 ? (
        <Section title="Recent activity">
          {overview.recentActivity.map((item, index) => (
            <ActivityRow
              key={item.id}
              item={item}
              actor={activityActors(item.actorId)}
              divider={index < overview.recentActivity.length - 1}
            />
          ))}
        </Section>
      ) : null}
    </View>
  );
}

function ActivityRow({
  item,
  actor,
  divider,
}: {
  item: GaneshActivity;
  actor: string;
  divider: boolean;
}) {
  return (
    <DataRow
      divider={divider}
      title={item.title}
      meta={[actor ? `By ${actor}` : null, formatGaneshWhen(item.createdAt)].filter(Boolean).join(" · ") || undefined}
      value={
        item.amount != null ? (
          <Money value={item.amount} size="secondary" />
        ) : item.estimatedValue != null ? (
          <Money value={item.estimatedValue} size="secondary" tone="muted" />
        ) : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 10,
    paddingBottom: 4,
  },
  health: {
    gap: 6,
    paddingHorizontal: 2,
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 2,
  },
  glyph: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});
