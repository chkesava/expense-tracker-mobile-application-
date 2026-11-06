import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { MoreHorizontal, Users } from "lucide-react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { MetaLabel, Section } from "@/components/dashboard/primitives";
import { GroupFundEventSheet, type GroupFundEventMode, type GroupFundEventValues } from "@/components/groupFunds/GroupFundEventSheet";
import { GroupFundFormSheet } from "@/components/groupFunds/GroupFundFormSheet";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/Button";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useAccounts } from "@/hooks/useAccounts";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { useGroupFundActions } from "@/hooks/useGroupFundActions";
import { useGroupFundHistory } from "@/hooks/useGroupFundHistory";
import { useGroupFunds } from "@/hooks/useGroupFunds";
import { appDialog } from "@/lib/appDialog";
import type { GroupFundEvent } from "@/shared/types/groupFund";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import { todayDateKey } from "@/shared/utils/dates";
import { groupFundAccountOptions } from "@/shared/utils/groupFundDocs";
import { reversedGroupFundEventIds } from "@/shared/utils/groupFundMath";
import { canReverseGroupFundEvent, describeGroupFundEvent, GROUP_FUND_EVENT_LABELS } from "@/shared/utils/groupFundMessages";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * One Group Fund (SPENDLY-687): what it holds, by purpose, the money actions,
 * and its history (the newest 25 live, older pages on demand). Amounts are the
 * fund's stored totals; history rows are shown, never added up.
 */
export default function GroupFundScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const currency = useDisplayCurrency();
  const money = useGhostMoney(currency);
  const { funds, loading, error, retry } = useGroupFunds();
  const fund = funds.find((f) => f.id === id) ?? null;
  const history = useGroupFundHistory(fund ? fund.id : undefined);
  const { accounts } = useAccounts();
  const { accountTypes } = useAccountTypes();
  const actions = useGroupFundActions();
  const [sheet, setSheet] = useState<GroupFundEventMode | null>(null);
  const [editing, setEditing] = useState(false);

  const typeNames = useMemo(() => new Map(accountTypes.map((t) => [t.id, t.name])), [accountTypes]);
  const accountOptions = useMemo(() => groupFundAccountOptions(accounts, typeNames), [accounts, typeNames]);
  const accountName = useMemo(() => {
    const names = new Map(accounts.map((a) => [a.id, a.name]));
    return (accountId: string) => names.get(accountId) ?? "Deleted account";
  }, [accounts]);
  const reversed = useMemo(() => reversedGroupFundEventIds(history.events), [history.events]);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/ledger?tab=groupFunds" as Href));
  const header = (title: string) => (
    <PageHeader title={title} icon={<Users size={20} color={theme.colors.primary} />} onBack={back} />
  );

  if (error) {
    return (
      <PageShell scrollable={false}>
        {header("Group fund")}
        <ErrorState title="Couldn't load this fund" description={error.message} onRetry={error.retryable ? retry : undefined} />
      </PageShell>
    );
  }
  if (loading) {
    return (
      <PageShell scrollable={false}>
        {header("Group fund")}
        <LoadingState variant="spinner" />
      </PageShell>
    );
  }
  if (!fund) {
    return (
      <PageShell scrollable={false}>
        {header("Group fund")}
        <EmptyState
          title="This fund isn't here"
          description="It may have been deleted, or the link is out of date."
          primaryAction={{ label: "Back to group funds", onPress: () => router.replace("/ledger?tab=groupFunds" as Href) }}
        />
      </PageShell>
    );
  }

  const archived = fund.status === "archived";
  const muted = { color: theme.colors.mutedForeground };

  const submitEvent = (mode: GroupFundEventMode) => (eventId: string, v: GroupFundEventValues) => {
    const note = v.note || undefined;
    switch (mode) {
      case "contribution":
        return actions.addContribution(fund.id, eventId, {
          purposeId: v.purposeId,
          memberId: v.memberId,
          amount: v.amount,
          date: v.date,
          period: v.period,
          accountId: v.accountId,
          note,
        });
      case "payout":
        return actions.recordPayout(fund.id, eventId, {
          purposeId: v.purposeId,
          amount: v.amount,
          date: v.date,
          accountId: v.accountId,
          recipient: v.recipient || undefined,
          reference: v.reference || undefined,
          note,
        });
      case "opening":
        return actions.recordOpening(fund.id, eventId, {
          purposeId: v.purposeId,
          amount: v.amount,
          date: v.date,
          accountId: v.accountId || undefined,
          note,
        });
      case "transfer":
        return actions.movePurpose(fund.id, eventId, {
          fromPurposeId: v.purposeId,
          toPurposeId: v.toPurposeId,
          amount: v.amount,
          date: v.date,
          note,
        });
      case "move":
        return actions.moveAccount(fund.id, eventId, {
          purposeId: v.purposeId,
          fromAccountId: v.accountId,
          toAccountId: v.toAccountId,
          amount: v.amount,
          date: v.date,
          note,
        });
    }
  };

  const openMore = () =>
    appDialog.actionMenu(fund.name, [
      { text: "Opening balance", onPress: () => setSheet("opening"), disabled: archived },
      { text: "Move between purposes", onPress: () => setSheet("transfer"), disabled: archived },
      { text: "Move between accounts", onPress: () => setSheet("move"), disabled: archived },
      { text: "Edit fund", onPress: () => setEditing(true) },
      archived
        ? { text: "Restore fund", onPress: () => void actions.editFund(fund.id, { status: "active" }, "Fund restored") }
        : { text: "Archive fund", style: "destructive", onPress: confirmArchive },
    ]);

  function confirmArchive() {
    appDialog.show({
      title: "Archive this fund?",
      message:
        fund!.totals.held > 0
          ? `It still holds ${money(fund!.totals.held)}, which stays counted as held for others. No new money can be recorded until you restore it.`
          : "No new money can be recorded until you restore it. Its history is kept.",
      buttons: [
        { text: "Not now", style: "cancel" },
        { text: "Archive", style: "destructive", onPress: () => void actions.editFund(fund!.id, { status: "archived" }, "Fund archived") },
      ],
    });
  }

  const onEventPress = (event: GroupFundEvent) => {
    if (archived || !canReverseGroupFundEvent(event, reversed)) return;
    const pair = event.kind === "transfer_in" || event.kind === "transfer_out";
    appDialog.show({
      title: `Undo this ${GROUP_FUND_EVENT_LABELS[event.kind].toLowerCase()}?`,
      message: `A correction is added to the history${
        event.accountEntryIds?.length ? " and the account balance is put back" : ""
      }${pair ? ". Both sides of the move are undone" : ""}. The original entry is kept.`,
      buttons: [
        { text: "Keep it", style: "cancel" },
        { text: "Undo", style: "destructive", onPress: () => void actions.reverse(fund.id, event, todayDateKey()) },
      ],
    });
  };

  const purposes = fund.purposes.filter((p) => !p.archived || (fund.byPurpose[p.id]?.held ?? 0) !== 0);

  return (
    <PageShell>
      {header(fund.name)}
      <View style={{ gap: theme.space.md, paddingBottom: theme.space.xl }}>
        <Section title="Held for others" subtitle={archived ? "Archived" : "In your accounts, not counted as yours"}>
          <View style={{ gap: theme.space.sm }}>
            <FinancialAmount value={fund.totals.held} currency={currency} size="xl" weight="bold" />
            <View style={styles.stats}>
              <View style={styles.stat}>
                <MetaLabel>Collected</MetaLabel>
                <FinancialAmount value={fund.totals.contributions} currency={currency} size="sm" weight="semibold" />
              </View>
              <View style={styles.stat}>
                <MetaLabel>Paid out</MetaLabel>
                <FinancialAmount value={fund.totals.payouts} currency={currency} size="sm" weight="semibold" />
              </View>
              {fund.totals.opening > 0 ? (
                <View style={styles.stat}>
                  <MetaLabel>Opening</MetaLabel>
                  <FinancialAmount value={fund.totals.opening} currency={currency} size="sm" weight="semibold" />
                </View>
              ) : null}
            </View>
            {archived ? null : (
              <View style={styles.row}>
                <Button variant="primary" onPress={() => setSheet("contribution")} style={styles.flex}>
                  Add contribution
                </Button>
                <Button variant="secondary" onPress={() => setSheet("payout")} style={styles.flex}>
                  Record payout
                </Button>
                <Button variant="ghost" size="icon" onPress={openMore} accessibilityLabel="More actions">
                  <MoreHorizontal size={18} color={theme.colors.foreground} />
                </Button>
              </View>
            )}
            {archived ? (
              <Button variant="outline" onPress={openMore}>
                Manage fund
              </Button>
            ) : null}
          </View>
        </Section>

        <Section title="By purpose" subtitle="Each purpose keeps its own balance">
          <View>
            {purposes.map((p, i) => {
              const t = fund.byPurpose[p.id];
              return (
                <View
                  key={p.id}
                  style={[styles.line, i < purposes.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}
                >
                  <View style={styles.flex}>
                    <Text style={[styles.lineTitle, { color: theme.colors.foreground }]}>
                      {p.name}
                      {p.archived ? " (archived)" : ""}
                    </Text>
                    <Text style={[styles.lineDetail, muted]}>
                      {[
                        p.cadence === "monthly" ? "Monthly" : "Ad hoc",
                        p.expectedPerMember ? `${money(p.expectedPerMember)} per member` : null,
                        `collected ${money(t?.contributions ?? 0)}`,
                        `paid out ${money(t?.payouts ?? 0)}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </View>
                  <FinancialAmount value={t?.held ?? 0} currency={currency} size="sm" weight="bold" />
                </View>
              );
            })}
          </View>
        </Section>

        <Section title="History" subtitle={archived ? undefined : "Tap an entry to undo it"}>
          {history.error ? (
            <ErrorState title="Couldn't load the history" description={history.error.message} onRetry={history.error.retryable ? history.retry : undefined} />
          ) : history.loading ? (
            <LoadingState variant="spinner" />
          ) : history.events.length === 0 ? (
            <Text style={muted}>Nothing recorded yet. Add a contribution when a member pays in.</Text>
          ) : (
            <View>
              {history.events.map((event, i) => {
                const row = describeGroupFundEvent(event, fund, accountName);
                const undone = reversed.has(event.id);
                const pending = history.pendingIds.has(event.id);
                return (
                  <Pressable
                    key={event.id}
                    onPress={() => onEventPress(event)}
                    disabled={archived || !canReverseGroupFundEvent(event, reversed)}
                    accessibilityRole="button"
                    accessibilityLabel={`${row.title}, ${row.detail}, ${formatDisplayDate(event.date)}`}
                    style={[styles.line, i < history.events.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}
                  >
                    <View style={styles.flex}>
                      <Text style={[styles.lineTitle, { color: theme.colors.foreground }, undone && styles.struck]}>{row.title}</Text>
                      <Text style={[styles.lineDetail, muted]}>
                        {[formatDisplayDate(event.date), row.detail, undone ? "Undone" : null, pending ? "Waiting to sync" : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    </View>
                    <FinancialAmount
                      value={row.heldDelta === 0 ? event.amount : row.heldDelta}
                      currency={currency}
                      size="sm"
                      weight="semibold"
                      sign={row.heldDelta === 0 ? "none" : "auto"}
                      tone={row.heldDelta === 0 ? "muted" : "auto"}
                    />
                  </Pressable>
                );
              })}
              {history.hasMore ? (
                <Button variant="ghost" onPress={() => void history.loadMore()} disabled={history.loadingMore}>
                  {history.loadingMore ? "Loading…" : "Show older entries"}
                </Button>
              ) : null}
            </View>
          )}
        </Section>
      </View>

      {sheet ? (
        <GroupFundEventSheet
          visible
          mode={sheet}
          fund={fund}
          accounts={accountOptions}
          newEventId={actions.newEventId}
          onClose={() => setSheet(null)}
          onSubmit={submitEvent(sheet)}
        />
      ) : null}
      <GroupFundFormSheet
        visible={editing}
        fund={fund}
        newKey={actions.newKey}
        onClose={() => setEditing(false)}
        onSubmit={(input) => actions.editFund(fund.id, input)}
      />
    </PageShell>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  stat: { gap: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  flex: { flex: 1 },
  line: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  lineTitle: { fontSize: 14, fontWeight: "600" },
  lineDetail: { fontSize: 12, marginTop: 2 },
  struck: { textDecorationLine: "line-through" },
});
