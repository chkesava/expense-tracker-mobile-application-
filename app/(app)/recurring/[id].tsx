import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { ArrowLeft, ArrowLeftRight, ChevronRight, Pause, Pencil, Play, Trash2 } from "lucide-react-native";

import { ReadModelFreshnessBadge } from "@/components/common/ReadModelFreshnessBadge";
import { useJournalFreshness } from "@/hooks/useReadModelFreshness";
import { EmptyState } from "@/components/common/EmptyState";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { useSurfaces, withAlpha } from "@/components/dashboard/primitives";
import { PageShell } from "@/components/layout/PageShell";
import { CategoryIcon, DataNote, SurfaceCard } from "@/components/spending/SpendingParts";
import { EditSubscriptionModal } from "@/components/subscriptions/EditSubscriptionModal";
import { Card } from "@/components/ui/Card";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccountTransfers } from "@/hooks/useAccountTransfers";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useExpenses } from "@/hooks/useExpenses";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { useSubscriptions } from "@/hooks/useSubscriptions";
import { appDialog } from "@/lib/appDialog";
import { haptic } from "@/lib/haptics";
import { useSettings } from "@/providers/SettingsProvider";
import { subscriptionFrequency } from "@/shared/types/subscription";
import { getAccountDisplayName } from "@/shared/utils/accountIdentity";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import { currentMonthKey, shiftMonthKey } from "@/shared/utils/dates";
import { monthLabel } from "@/shared/utils/monthLabel";
import {
  AUTO_POST_LABELS,
  autoPostState,
  recurringHistory,
  upcomingPaymentDates,
} from "@/shared/utils/recurringDetail";
import { getNextRenewalDate, isSubscriptionOverdue } from "@/shared/utils/subscriptionProcessor";
import { transactionHref } from "@/shared/utils/transactionRef";
import { useTheme } from "@/theme/ThemeProvider";

/** Months of posted charges the history loads (bounded month reads). */
const HISTORY_MONTHS = 6;

const TYPE_LABELS = { subscription: "Subscription", emi: "EMI", transfer: "Recurring transfer" } as const;

/**
 * SPENDLY-582 — one recurring item. The definition (schedule, amount,
 * account) comes from the existing `subscriptions` data; upcoming dates are
 * projections from the app's own next-renewal rule and are never shown as
 * spent; history is only ledger rows the auto-poster stamped with this item's
 * id. Edit, pause/resume and delete are the existing `useSubscriptions` and
 * `EditSubscriptionModal` flows.
 */
/**
 * Expo Router already decodes route params; decoding again throws a URIError on
 * a malformed sequence (`/recurring/%E0%A4`) and would crash the screen during
 * render. Fall back to the raw value so the screen says "not found" instead.
 */
function safeDecodeParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default function RecurringDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { settings } = useSettings();
  const currency = useDisplayCurrency();
  const money = useGhostMoney(currency);
  const { subscriptions, loading, toggleActive, deleteSubscription } = useSubscriptions();
  const { accounts } = useAccounts();
  const { transfers } = useAccountTransfers();
  const { expenses, loadMonth, monthsLoaded, isFromCache } = useExpenses();
  const freshness = useJournalFreshness();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const subId = typeof id === "string" ? safeDecodeParam(id) : "";
  const sub = subscriptions.find((s) => s.id === subId) ?? null;
  const thisMonth = currentMonthKey(settings.timezone);

  // History needs the last few months' rows in the store: one bounded read
  // per month, skipped when already loaded. Transfers are already loaded.
  const historyMonths = useMemo(
    () => Array.from({ length: HISTORY_MONTHS }, (_, i) => shiftMonthKey(thisMonth, -i)),
    [thisMonth]
  );
  useEffect(() => {
    if (!sub || sub.type === "transfer") return;
    for (const m of historyMonths) void loadMonth(m);
  }, [sub, historyMonths, loadMonth]);
  const historyComplete = !sub || sub.type === "transfer" || historyMonths.every((m) => monthsLoaded.has(m));

  const history = useMemo(() => (sub ? recurringHistory(sub, expenses, transfers) : []), [sub, expenses, transfers]);
  const upcoming = useMemo(() => (sub ? upcomingPaymentDates(sub, new Date(), 5) : []), [sub]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/recurring" as Href));
  const date = (d: string) => formatDisplayDate(d, settings?.dateFormat);

  const header = (
    <View style={styles.header}>
      <Pressable
        onPress={goBack}
        hitSlop={8}
        style={({ pressed }) => [styles.back, { backgroundColor: surfaces.control, borderColor: theme.colors.border }, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <ArrowLeft size={20} color={theme.colors.foreground} strokeWidth={2.2} />
      </Pressable>
    </View>
  );

  if (loading && !sub) {
    return (
      <PageShell contentContainerStyle={styles.content}>
        {header}
        <DashboardSkeleton variant="hero" />
        <DashboardSkeleton variant="section" rows={4} />
      </PageShell>
    );
  }
  if (!sub) {
    return (
      <PageShell contentContainerStyle={styles.content}>
        {header}
        <EmptyState
          illustration="subscriptions"
          title="Recurring item not found"
          description="It may have been deleted."
          primaryAction={{ label: "See recurring expenses", onPress: () => router.replace("/recurring" as Href) }}
        />
      </PageShell>
    );
  }

  const state = autoPostState(sub);
  const overdue = isSubscriptionOverdue(sub);
  const statusLabel = sub.isCompleted ? "Completed" : !sub.isActive ? "Paused" : overdue ? "Overdue" : "Active";
  const statusColor = sub.isCompleted
    ? theme.colors.mutedForeground
    : !sub.isActive
      ? theme.colors.warning
      : overdue
        ? theme.colors.destructive
        : theme.colors.success;
  const next = sub.isActive && !sub.isCompleted ? getNextRenewalDate(sub) : null;
  const accountName = (accountId?: string) => {
    if (!accountId) return null;
    const account = accounts.find((a) => a.id === accountId);
    return account ? getAccountDisplayName(account) : "Deleted account";
  };
  const cadence =
    subscriptionFrequency(sub) === "every_n_days"
      ? sub.intervalDays === 1
        ? "Every day"
        : `Every ${sub.intervalDays ?? "?"} days`
      : `Monthly · day ${sub.dayOfMonth}`;
  const endLabel = sub.endMonth && sub.endYear ? monthLabel(`${sub.endYear}-${String(sub.endMonth).padStart(2, "0")}`, "long") : "No end date";

  const confirmDelete = () => {
    appDialog.show({
      title: `Delete ${sub.name}?`,
      message: "This removes the schedule, so nothing more will post. Charges already recorded stay in your transactions.",
      buttons: [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            setBusy(true);
            void deleteSubscription(sub.id!).then((ok) => {
              setBusy(false);
              if (ok) goBack();
            });
          },
        },
      ],
    });
  };
  const togglePause = () => {
    void haptic.selection();
    setBusy(true);
    void Promise.resolve(toggleActive(sub.id!, sub.isActive)).finally(() => setBusy(false));
  };

  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular };
  const strong = { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold };

  return (
    <PageShell contentContainerStyle={styles.content}>
      {header}

      <Card variant="outlined" elevation={0} radius={22} style={styles.edge} contentStyle={styles.hero}>
        <View style={styles.heroTop}>
          {sub.type === "transfer" ? (
            <View style={[styles.transferIcon, { backgroundColor: withAlpha(theme.colors.info, surfaces.isDark ? 0.18 : 0.1) }]}>
              <ArrowLeftRight size={24} color={theme.colors.info} />
            </View>
          ) : (
            <CategoryIcon category={sub.category} color={theme.colors.primary} size={52} />
          )}
          <View style={styles.grow}>
            <Text style={[styles.title, { color: theme.colors.foreground, fontFamily: theme.fontFamily.bold }]} numberOfLines={2}>
              {sub.name}
            </Text>
            <Text style={[styles.meta, muted]} numberOfLines={1}>{`${sub.category} · ${TYPE_LABELS[sub.type] ?? "Recurring"}`}</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: surfaces.wash(statusColor) }]}>
            <Text style={[styles.pillText, { color: statusColor, fontFamily: theme.fontFamily.semibold }]}>{statusLabel}</Text>
          </View>
        </View>
        <View style={styles.amountRow}>
          <FinancialAmount value={sub.amount} currency={currency} size="hero" weight="bold" fit />
          <Text style={[styles.meta, muted]}>{cadence}</Text>
        </View>
        <View style={[styles.split, { borderTopColor: theme.colors.border }]}>
          <View style={styles.grow}>
            <Text style={[styles.label, muted]}>Next payment</Text>
            <Text style={[styles.value, strong]}>{next ? date(next.dateStr) : "—"}</Text>
            {next ? <Text style={[styles.meta, muted]}>{next.daysRemaining === 0 ? "Due today" : `in ${next.daysRemaining} days`}</Text> : null}
          </View>
          <View style={[styles.grow, styles.splitRight, { borderLeftColor: theme.colors.border }]}>
            <Text style={[styles.label, muted]}>Last posted</Text>
            <Text style={[styles.value, strong]}>{history[0] ? date(history[0].date) : "—"}</Text>
            {history[0] ? <Text style={[styles.meta, muted]}>{money(history[0].amount)}</Text> : null}
          </View>
        </View>
      </Card>

      <View style={styles.actions}>
        <ActionButton icon={<Pencil size={18} color={theme.colors.primary} />} label="Edit" color={theme.colors.primary} onPress={() => setEditing(true)} disabled={busy} />
        {!sub.isCompleted ? (
          <ActionButton
            icon={sub.isActive ? <Pause size={18} color={theme.colors.warning} /> : <Play size={18} color={theme.colors.success} />}
            label={sub.isActive ? "Pause" : "Resume"}
            color={sub.isActive ? theme.colors.warning : theme.colors.success}
            onPress={togglePause}
            disabled={busy}
          />
        ) : null}
        <ActionButton icon={<Trash2 size={18} color={theme.colors.destructive} />} label="Delete" color={theme.colors.destructive} onPress={confirmDelete} disabled={busy} />
      </View>

      {isFromCache ? <DataNote offline>You're offline — showing what's saved on this device.</DataNote> : null}
      <ReadModelFreshnessBadge freshness={freshness} />

      <SurfaceCard title="Schedule">
        <InfoRow label="Frequency" value={cadence} />
        <InfoRow label="Starts" value={sub.startMonth ? monthLabel(sub.startMonth, "long") : "Already running"} />
        <InfoRow label="Ends" value={endLabel} />
        <View style={styles.upcoming}>
          <Text style={[styles.label, muted]}>{upcoming.length > 0 ? `Next ${upcoming.length} payments` : "Upcoming payments"}</Text>
          {upcoming.length > 0 ? (
            <View style={styles.chips}>
              {upcoming.map((d) => (
                <View key={d} style={[styles.dateChip, { backgroundColor: surfaces.control }]}>
                  <Text style={[styles.dateChipText, strong]}>{date(d)}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={[styles.meta, muted]}>{sub.isCompleted ? "No more payments." : "None while paused."}</Text>
          )}
          <Text style={[styles.meta, muted]}>Scheduled dates are not spending until they post.</Text>
        </View>
      </SurfaceCard>

      <SurfaceCard title="Payment details">
        <InfoRow
          label={sub.type === "transfer" ? "From account" : "Account"}
          value={accountName(sub.accountId) ?? "Not set"}
          onPress={sub.accountId && accounts.some((a) => a.id === sub.accountId) ? () => router.push(`/accounts/${sub.accountId}` as Href) : undefined}
        />
        {sub.type === "transfer" ? (
          <InfoRow
            label="To account"
            value={accountName(sub.toAccountId) ?? "Not set"}
            onPress={sub.toAccountId && accounts.some((a) => a.id === sub.toAccountId) ? () => router.push(`/accounts/${sub.toAccountId}` as Href) : undefined}
          />
        ) : null}
        <InfoRow label="Posting" value={AUTO_POST_LABELS[state]} tone={state === "needsAccount" ? theme.colors.destructive : undefined} />
      </SurfaceCard>

      <SurfaceCard title="History" meta={sub.type === "transfer" ? "Posted transfers" : `Last ${HISTORY_MONTHS} months`}>
        {!historyComplete ? <DataNote>Still loading older months — the history may be incomplete.</DataNote> : null}
        {history.length === 0 ? (
          <Text style={[styles.meta, muted]}>Nothing has posted from this schedule yet.</Text>
        ) : (
          history.slice(0, 12).map((p, i) => (
            <Pressable
              key={p.id}
              onPress={() => router.push(transactionHref({ kind: p.kind, id: p.id }, p.accountId) as Href)}
              style={({ pressed }) => [
                styles.historyRow,
                i < Math.min(history.length, 12) - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Posted ${date(p.date)}, ${money(p.amount)}. Open transaction`}
            >
              <View style={styles.grow}>
                <Text style={[styles.value, strong]}>{date(p.date)}</Text>
                <Text style={[styles.meta, muted]}>{accountName(p.accountId) ?? "No account"}</Text>
              </View>
              <FinancialAmount value={p.amount} currency={currency} size="sm" weight="semibold" />
              <View style={[styles.pill, { backgroundColor: surfaces.wash(theme.colors.success) }]}>
                <Text style={[styles.pillText, { color: theme.colors.success, fontFamily: theme.fontFamily.semibold }]}>Posted</Text>
              </View>
            </Pressable>
          ))
        )}
      </SurfaceCard>

      {editing ? <EditSubscriptionModal visible subscription={sub} onClose={() => setEditing(false)} /> : null}
    </PageShell>
  );
}

function ActionButton({
  icon,
  label,
  color,
  onPress,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  color: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.action,
        { backgroundColor: withAlpha(color, surfaces.isDark ? 0.14 : 0.08), borderColor: withAlpha(color, surfaces.isDark ? 0.3 : 0.18) },
        (pressed || disabled) && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
    >
      {icon}
      <Text style={[styles.actionLabel, { color, fontFamily: theme.fontFamily.semibold }]}>{label}</Text>
    </Pressable>
  );
}

function InfoRow({ label, value, onPress, tone }: { label: string; value: string; onPress?: () => void; tone?: string }) {
  const { theme } = useTheme();
  const body = (
    <>
      <Text style={[styles.infoLabel, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: tone ?? theme.colors.foreground, fontFamily: theme.fontFamily.medium }]} numberOfLines={2}>
        {value}
      </Text>
      {onPress ? <ChevronRight size={16} color={theme.colors.mutedForeground} /> : null}
    </>
  );
  if (!onPress) return <View style={styles.infoRow}>{body}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.infoRow, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14 },
  pressed: { opacity: 0.7 },
  edge: { borderWidth: StyleSheet.hairlineWidth },
  header: { flexDirection: "row", alignItems: "center", minHeight: 44 },
  back: { width: 42, height: 42, borderRadius: 21, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
  hero: { padding: 4, gap: 14 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  transferIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  grow: { flexGrow: 1, flexShrink: 1, flexBasis: "auto", gap: 2 },
  title: { fontSize: 20, lineHeight: 26 },
  meta: { fontSize: 12.5, lineHeight: 17 },
  pill: { paddingHorizontal: 9, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  pillText: { fontSize: 12 },
  amountRow: { gap: 2 },
  split: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  splitRight: { borderLeftWidth: StyleSheet.hairlineWidth, paddingLeft: 12 },
  label: { fontSize: 12.5 },
  value: { fontSize: 15 },
  actions: { flexDirection: "row", gap: 10 },
  action: { flex: 1, minHeight: 64, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center", gap: 4 },
  actionLabel: { fontSize: 13 },
  upcoming: { gap: 8, paddingTop: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  dateChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  dateChipText: { fontSize: 12.5, fontVariant: ["tabular-nums"] },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 },
  infoLabel: { width: 110, fontSize: 13 },
  infoValue: { flexGrow: 1, flexShrink: 1, flexBasis: "auto", fontSize: 14 },
  historyRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
});
