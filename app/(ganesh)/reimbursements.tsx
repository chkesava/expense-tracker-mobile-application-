import { useCallback, useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { Receipt, Wallet } from "lucide-react-native";

import { GaneshClosedBanner } from "@/components/ganesh/GaneshClosedBanner";
import { GaneshScreen, useGaneshListPadding } from "@/components/ganesh/GaneshScreen";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import {
  Avatar,
  GaneshHeader,
  LedgerRow,
  ListStateView,
  MetaLabel,
  Money,
  Section,
  StatTile,
  useGaneshTokens,
  type LedgerRowBadge,
} from "@/components/ganesh/ui";
import { Button } from "@/components/ui/Button";
import { useFestivalMembers } from "@/hooks/useFestivalMembers";
import { useFestivals } from "@/hooks/useFestivals";
import { useFestivalWriteLock } from "@/hooks/useFestivalWriteLock";
import { useGaneshExpenses } from "@/hooks/useGaneshExpenses";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { useReimbursements } from "@/hooks/useReimbursements";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import type { GaneshExpense, GaneshReimbursement } from "@/shared/types/ganesh";
import { buildFinancialOverview } from "@/shared/utils/ganeshFinancialOverview";
import { formatGaneshWhen, memberDisplayName } from "@/shared/utils/ganeshIdentity";
import {
  expenseCountsTowardReimbursement,
  fundLocationLabel,
  personalExpensesForMember,
} from "@/shared/utils/ganeshMath";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { useTheme } from "@/theme/ThemeProvider";

type QueueRow =
  | { type: "section"; id: string; title: string; subtitle?: string }
  | { type: "member"; id: string; memberId: string; displayName: string; amount: number }
  | { type: "payout"; id: string; payout: GaneshReimbursement }
  | { type: "empty"; id: string; title: string; description: string };

export default function ReimbursementsScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { back, push } = useRouter();
  const params = useLocalSearchParams<{ memberId?: string }>();
  const memberId = typeof params.memberId === "string" ? params.memberId : "";
  const listPadding = useGaneshListPadding();

  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const festival = festivals.find((item) => item.id === festivalId);
  const { members, loading: membersLoading, error: membersError } = useFestivalMembers(
    pandalId,
    festivalId
  );
  const { expenses, loading: expensesLoading, error: expensesError } = useGaneshExpenses(
    pandalId,
    festivalId
  );
  const {
    reimbursements,
    loading: payoutsLoading,
    error: payoutsError,
  } = useReimbursements(pandalId, festivalId);
  const { can } = useGaneshPermissions();
  const writes = useGaneshWrites();
  const { closed } = useFestivalWriteLock();
  const [busyId, setBusyId] = useState<string | null>(null);

  const overview = useMemo(
    () => buildFinancialOverview({ members }),
    [members]
  );
  const selectedMember = members.find((member) => member.userId === memberId);
  const memberExpenses = useMemo(
    () => personalExpensesForMember(expenses, memberId),
    [expenses, memberId]
  );
  const canPay = can("reimbursements.create") && !closed;
  const canVoid = can("expenses.void") && !closed;

  const openPay = useCallback(
    (id: string) => {
      push(`/(ganesh)/add-reimbursement?memberId=${encodeURIComponent(id)}` as Href);
    },
    [push]
  );
  const openMember = useCallback(
    (id: string) => {
      push(`/(ganesh)/reimbursements?memberId=${encodeURIComponent(id)}` as Href);
    },
    [push]
  );
  const openExpense = useCallback(
    (id: string) => {
      push(`/(ganesh)/expense/${id}` as Href);
    },
    [push]
  );

  const confirmVoid = useCallback(
    (payout: GaneshReimbursement) => {
      Alert.alert(
        "Void this reimbursement?",
        `This puts ${formatInr(payout.amount)} back on pending personal money and restores God Fund. The payout stays in history.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Void",
            style: "destructive",
            onPress: () => {
              setBusyId(payout.id);
              writes
                .voidFinancialRecord({
                  entityType: "reimbursement",
                  entityId: payout.id,
                  reason: "Voided from reimbursement queue",
                })
                .catch((error) => {
                  logError("ganesh.voidReimbursement", error);
                  toast.error(friendlyErrorMessage(error, "Could not void."));
                })
                .finally(() => setBusyId(null));
            },
          },
        ]
      );
    },
    [writes]
  );

  const queueRows = useMemo((): QueueRow[] => {
    const pending = overview.pendingReimbursementMembers;
    const rows: QueueRow[] = [
      {
        type: "section",
        id: "pending-section",
        title: "Pending",
        subtitle: "Personal money still owed",
      },
    ];
    if (pending.length === 0) {
      rows.push({
        type: "empty",
        id: "pending-empty",
        title: "Nobody is owed",
        description: "Personal festival spend is settled, or no one has asked for reimbursement yet.",
      });
    } else {
      for (const member of pending) {
        rows.push({
          type: "member",
          id: `pending-${member.memberId}`,
          memberId: member.memberId,
          displayName: member.displayName,
          amount: member.amount,
        });
      }
    }
    rows.push({
      type: "section",
      id: "payout-section",
      title: "Recent payouts",
      subtitle: "Paid from God Fund",
    });
    if (reimbursements.length === 0) {
      rows.push({
        type: "empty",
        id: "payout-empty",
        title: "No reimbursements yet",
        description: "When the treasurer pays a member back, the payout appears here.",
      });
    } else {
      for (const payout of reimbursements) {
        rows.push({ type: "payout", id: payout.id, payout });
      }
    }
    return rows;
  }, [overview.pendingReimbursementMembers, reimbursements]);

  const renderQueueItem = useCallback(
    ({ item }: { item: QueueRow }) => {
      if (item.type === "section") {
        return (
          <View style={styles.sectionHead}>
            <Text
              style={[
                styles.sectionTitle,
                { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold },
              ]}
            >
              {item.title}
            </Text>
            {item.subtitle ? (
              <MetaLabel>{item.subtitle}</MetaLabel>
            ) : null}
          </View>
        );
      }
      if (item.type === "empty") {
        return (
          <ListStateView title={item.title} description={item.description} icon={<Wallet size={22} color={g.saffron} strokeWidth={2.2} />} />
        );
      }
      if (item.type === "member") {
        return (
          <LedgerRow
            id={item.memberId}
            icon={<Avatar name={item.displayName} seed={item.memberId} />}
            iconTint="none"
            title={item.displayName}
            meta="Personal money still owed"
            amount={item.amount}
            onPress={openMember}
            action={
              canPay
                ? { label: "Pay", onPress: openPay }
                : undefined
            }
          />
        );
      }
      const payout = item.payout;
      const voided = Boolean(payout.voided) || payout.status === "voided";
      const badges: LedgerRowBadge[] = voided
        ? [{ kind: "cancelled", label: "Voided" }]
        : [{ kind: "paid" }];
      return (
        <LedgerRow
          id={payout.id}
          icon={<Wallet size={18} color={theme.colors.mutedForeground} strokeWidth={2.2} />}
          title={memberDisplayName(members, payout.memberId)}
          meta={`${fundLocationLabel(payout.paymentMethod)}${payout.notes ? ` · ${payout.notes}` : ""}`}
          badges={badges}
          amount={payout.amount}
          when={formatGaneshWhen(payout.createdAt, payout.date)}
          pending={payout.pendingWrite}
          action={
            canVoid && !voided
              ? {
                  label: busyId === payout.id ? "Voiding…" : "Void",
                  onPress: () => confirmVoid(payout),
                  disabled: Boolean(busyId),
                }
              : undefined
          }
        />
      );
    },
    [
      busyId,
      canPay,
      canVoid,
      confirmVoid,
      g.saffron,
      members,
      openMember,
      openPay,
      theme.colors.foreground,
      theme.colors.mutedForeground,
      theme.fontFamily.semibold,
    ]
  );

  const renderMemberExpense = useCallback(
    ({ item }: { item: GaneshExpense }) => (
      <LedgerRow
        id={item.id}
        icon={<Receipt size={18} color={theme.colors.mutedForeground} strokeWidth={2.2} />}
        title={item.name}
        meta={item.categoryName || undefined}
        badges={
          expenseCountsTowardReimbursement(item)
            ? [{ kind: "personal", label: "Pending personal" }]
            : undefined
        }
        amount={item.personalAmount}
        when={formatGaneshWhen(item.createdAt, item.date)}
        pending={item.pendingWrite}
        onPress={openExpense}
      />
    ),
    [openExpense, theme.colors.mutedForeground]
  );

  if (!can("reimbursements.read") && !can("reimbursements.create")) {
    return (
      <GaneshWriteLock message="Your role cannot see reimbursements." />
    );
  }

  if (memberId) {
    const pending = selectedMember?.pendingReimbursement ?? 0;
    return (
      <GaneshScreen safeTop scroll={false}>
        <GaneshHeader
          title={selectedMember?.displayName ?? "Member"}
          subtitle="Personal expenses"
          icon={<Wallet size={22} color={g.saffron} strokeWidth={2.2} />}
          onBack={back}
        />
        <GaneshClosedBanner />
        <View style={styles.statRow}>
          <StatTile label="Still owed">
            <Money
              value={pending}
              size="primary"
              tone={pending > 0 ? "warning" : "default"}
              numberOfLines={1}
              adjustsFontSizeToFit
            />
          </StatTile>
        </View>
        {canPay && pending > 0 ? (
          <Button onPress={() => openPay(memberId)}>Pay reimbursement</Button>
        ) : null}
        <FlashList
          data={memberExpenses}
          style={styles.list}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item.id}
          getItemType={() => "expense"}
          contentContainerStyle={{ paddingBottom: listPadding }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={renderMemberExpense}
          ListEmptyComponent={
            <ListStateView
              loading={expensesLoading}
              error={expensesError}
              title="No personal expenses"
              description="This member has no live personal spend counting toward reimbursement."
            />
          }
        />
      </GaneshScreen>
    );
  }

  return (
    <GaneshScreen safeTop scroll={false}>
      <GaneshHeader
        title="Reimbursements"
        subtitle={festival?.name}
        icon={<Wallet size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
      />
      <GaneshClosedBanner />
      <Section title="Owed from God Fund" subtitle="Pays back personal festival spend. Does not change the original expense.">
        <View style={styles.statRow}>
          <StatTile label="Pending">
            <Money
              value={overview.pendingReimbursements}
              size="primary"
              tone={overview.pendingReimbursements > 0 ? "warning" : "default"}
              numberOfLines={1}
              adjustsFontSizeToFit
            />
          </StatTile>
        </View>
      </Section>
      {membersLoading || payoutsLoading ? (
        <ListStateView loading title="Loading reimbursements" skeletonCount={4} />
      ) : membersError || payoutsError ? (
        <ListStateView
          error={membersError ?? payoutsError}
          title="We couldn't load reimbursements."
          description="Pending amounts stay on the member records. Try again."
        />
      ) : (
      <FlashList
        data={queueRows}
        style={styles.list}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item) => item.id}
        getItemType={(item) => item.type}
        contentContainerStyle={{ paddingBottom: listPadding }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={renderQueueItem}
        ListEmptyComponent={
          <ListStateView
            loading={membersLoading || payoutsLoading}
            error={membersError ?? payoutsError}
            title="Nobody is owed"
            description="Personal festival spend is settled, or no one has asked for reimbursement yet."
            icon={<Wallet size={22} color={g.saffron} strokeWidth={2.2} />}
          />
        }
      />
      )}
    </GaneshScreen>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  separator: {
    height: 10,
  },
  statRow: {
    flexDirection: "row",
    gap: 10,
  },
  sectionHead: {
    gap: 2,
    paddingTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    letterSpacing: -0.2,
  },
});
