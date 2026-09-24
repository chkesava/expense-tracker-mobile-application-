import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, ChevronRight, Lock, Pencil, Trash2 } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { usePageListBottomPadding } from "@/components/layout/usePageListBottomPadding";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAccountActivities } from "@/hooks/useAccountActivities";
import { useAccountPayments } from "@/hooks/useAccountPayments";
import { useAccountTransfers } from "@/hooks/useAccountTransfers";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useExpenses } from "@/hooks/useExpenses";
import { useIncomes } from "@/hooks/useIncomes";
import { useLedgerEvents } from "@/hooks/useLedgerEvents";
import { useSpaces } from "@/hooks/useSpaces";
import { appDialog } from "@/lib/appDialog";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { writeSavedMessage } from "@/lib/firestoreWrite";
import { haptic } from "@/lib/haptics";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useModals } from "@/providers/ModalProvider";
import { useSettings } from "@/providers/SettingsProvider";
import {
  softDeleteExpense,
  softDeleteIncome,
} from "@/services/ledger/mutateLedgerTransaction";
import {
  activitySubtypeLabel,
  activityTitle,
  formatActivityDateLabel,
  formatClockLabel,
} from "@/shared/utils/activityDisplay";
import { currentMonthKey } from "@/shared/utils/dates";
import { currencySymbol, formatAmount } from "@/shared/utils/formatCurrency";
import { ledgerRowEditability } from "@/shared/utils/ledgerRow";
import {
  deletionImpactMessage,
  relatedLinkForTransaction,
} from "@/shared/utils/transactionDetails";
import {
  findActivityForRef,
  isJournalKind,
  parseTransactionRouteParams,
} from "@/shared/utils/transactionRef";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces } from "@/theme/surfaces";

function timestampLabel(value: unknown): string | null {
  if (!value) return null;
  let date: Date | null = null;
  if (
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    date = (value as { toDate: () => Date }).toDate();
  } else if (value instanceof Date) {
    date = value;
  } else if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    date = Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return date ? date.toLocaleString() : null;
}

export default function TransactionDetailsScreen() {
  const params = useLocalSearchParams<{ id: string; kind?: string; accountId?: string }>();
  const parsed = useMemo(() => parseTransactionRouteParams(params), [params]);
  const ref = parsed?.ref ?? null;

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listPaddingBottom = usePageListBottomPadding();
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { user } = useAuth();
  const { settings } = useSettings();
  const currency = useDisplayCurrency();
  const { setEditingExpense, setEditingIncome, setIsAddExpenseOpen } = useModals();

  const { expenses, loading: expensesLoading } = useExpenses();
  const { incomes, loading: incomesLoading } = useIncomes();
  const { payments } = useAccountPayments();
  const { transfers } = useAccountTransfers();
  const { spaces } = useSpaces();

  const journalKind = ref && isJournalKind(ref.kind) ? ref.kind : null;
  const expense = useMemo(
    () => (journalKind === "expense" ? expenses.find((e) => e.id === ref?.id) : undefined),
    [journalKind, expenses, ref?.id]
  );
  const income = useMemo(
    () => (journalKind === "income" ? incomes.find((i) => i.id === ref?.id) : undefined),
    [journalKind, incomes, ref?.id]
  );
  const journalRow = expense ?? income;

  const contextAccountId = parsed?.accountId ?? journalRow?.accountId ?? null;
  const {
    account,
    isCreditCard,
    accountNameById,
    activities,
    loading: activitiesLoading,
  } = useAccountActivities(contextAccountId);
  const activity = useMemo(
    () => (ref ? findActivityForRef(activities, ref) : undefined),
    [activities, ref]
  );

  const payment = useMemo(
    () => (ref?.kind === "payment" ? payments.find((p) => p.id === ref.id) : undefined),
    [payments, ref]
  );
  const transfer = useMemo(
    () => (ref?.kind === "transfer" ? transfers.find((t) => t.id === ref.id) : undefined),
    [transfers, ref]
  );

  const { events } = useLedgerEvents({ enabled: !!journalKind });
  const editEvents = useMemo(
    () =>
      journalKind
        ? events.filter(
            (e) => e.docId === ref?.id && e.kind === journalKind && e.action === "update"
          )
        : [],
    [events, journalKind, ref?.id]
  );

  const editability = useMemo(
    () =>
      journalRow
        ? ledgerRowEditability(journalRow as unknown as Record<string, unknown>, {
            activeMonth: settings.lockPastMonths
              ? currentMonthKey(settings.timezone)
              : null,
          })
        : null,
    [journalRow, settings.lockPastMonths, settings.timezone]
  );

  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);

  const loading =
    expensesLoading || incomesLoading || (!!contextAccountId && activitiesLoading);
  const found = journalKind ? !!journalRow : !!activity;

  const goBack = () => {
    haptic.selection().catch(() => undefined);
    if (router.canGoBack()) router.back();
    else router.replace("/ledger" as Href);
  };

  const openEdit = () => {
    if (!editability?.editable) return;
    haptic.selection().catch(() => undefined);
    if (expense) setEditingExpense(expense);
    else if (income) setEditingIncome(income);
    else return;
    setIsAddExpenseOpen(true);
  };

  const confirmDelete = () => {
    if (!journalKind || !journalRow?.id || !editability?.editable) return;
    const docId = journalRow.id;
    const kind = journalKind;
    const fmt = (value: number) => formatAmount(value, currency);
    const currentBalance = !isCreditCard
      ? activities.find((a) => typeof a.runningBalance === "number")?.runningBalance ?? null
      : null;
    appDialog.show({
      title: kind === "expense" ? "Delete this expense?" : "Delete this income?",
      message: deletionImpactMessage({
        kind,
        amount: journalRow.amount,
        amountLabel: fmt(journalRow.amount),
        accountName: account?.name ?? null,
        isCreditCard,
        currentBalance,
        formatAmount: fmt,
      }),
      buttons: [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void runDelete(kind, docId);
          },
        },
      ],
    });
  };

  const runDelete = async (kind: "expense" | "income", docId: string) => {
    const uid = user?.uid;
    if (!uid) {
      toast.error("Not authenticated");
      return;
    }
    if (deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    try {
      const options = {
        lockPastMonths: settings.lockPastMonths,
        timezone: settings.timezone,
      };
      const { outcome } =
        kind === "expense"
          ? await softDeleteExpense(uid, docId, options)
          : await softDeleteIncome(uid, docId, options);
      void haptic.delete();
      toast.success(
        writeSavedMessage(outcome, `${kind === "expense" ? "Expense" : "Income"} deleted`)
      );
      goBack();
    } catch (err) {
      logError("transactionDetails.delete", err);
      toast.error(friendlyErrorMessage(err, "Failed to delete transaction"));
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  };

  const title = journalRow
    ? journalRow.note?.trim() ||
      (expense ? expense.category : income?.source) ||
      "Transaction"
    : activity
      ? activityTitle(activity)
      : "Transaction";
  const typeLabel = expense
    ? "Expense"
    : income
      ? "Income"
      : activity
        ? activitySubtypeLabel(activity)
        : "";
  const amount = journalRow?.amount ?? activity?.amount ?? 0;
  const isCredit = income ? true : expense ? false : activity?.type === "credit";
  const date = journalRow?.date ?? activity?.date ?? "";
  const clock = formatClockLabel(journalRow?.time ?? activity?.time ?? "");

  const related = ref
    ? relatedLinkForTransaction({
        kind: ref.kind,
        contextAccountId,
        creditCardBillId: expense?.creditCardBillId ?? payment?.creditCardBillId ?? null,
        sides: payment ?? transfer ?? null,
      })
    : null;
  const spaceName = expense?.spaceId
    ? spaces.find((s) => s.id === expense.spaceId)?.name ?? null
    : null;
  const accountName = contextAccountId
    ? accountNameById[contextAccountId] ?? null
    : null;
  const createdLabel = timestampLabel(journalRow?.createdAt);
  const updatedLabel = timestampLabel(journalRow?.updatedAt);
  const amountColor = isCredit ? theme.colors.success : theme.colors.foreground;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View
        style={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 16,
          paddingBottom: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Button
          variant="tonal"
          size="icon"
          onPress={goBack}
          accessibilityLabel="Back"
        >
          <ArrowLeft size={20} color={theme.colors.onSecondaryContainer} />
        </Button>
        <View style={{ flex: 1 }}>
          <Text
            accessibilityRole="header"
            style={{
              color: theme.colors.foreground,
              fontWeight: "700",
              fontSize: theme.typography.lg,
            }}
            numberOfLines={1}
          >
            Transaction details
          </Text>
          {accountName ? (
            <Text
              style={{ color: theme.colors.mutedForeground, fontSize: theme.typography.xs }}
              numberOfLines={1}
            >
              {accountName}
            </Text>
          ) : null}
        </View>
        {editability?.editable ? (
          <Button
            variant="tonal"
            size="icon"
            onPress={openEdit}
            accessibilityLabel="Edit transaction"
          >
            <Pencil size={18} color={theme.colors.primary} />
          </Button>
        ) : null}
      </View>

      {!parsed ? (
        <StateMessage
          title="This link doesn't point to a transaction"
          body="It may be incomplete. Go back and open the transaction again."
          onBack={goBack}
        />
      ) : loading && !found ? (
        <View style={{ padding: 32, alignItems: "center" }}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : !found ? (
        <StateMessage
          title="Transaction not found"
          body="It may have been deleted or moved to another account."
          onBack={goBack}
        />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: 16, padding: 16, paddingBottom: listPaddingBottom }}
        >
          <Card>
            <View style={{ gap: 6, alignItems: "flex-start" }}>
              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 3,
                  borderRadius: 999,
                  backgroundColor: surfaces.control,
                }}
              >
                <Text style={{ color: theme.colors.mutedForeground, fontSize: 12, fontWeight: "700" }}>
                  {typeLabel}
                </Text>
              </View>
              <View
                accessible
                accessibilityLabel={`${isCredit ? "Credit" : "Debit"} ${formatAmount(amount, currency)}`}
              >
                <Amount
                  value={amount}
                  currency={currency}
                  prefix={`${isCredit ? "+" : "-"}${currencySymbol(currency)}`}
                  ghostable
                  style={{ fontSize: 32, fontWeight: "800", color: amountColor }}
                />
              </View>
              <Text
                style={{ color: theme.colors.foreground, fontSize: theme.typography.md, fontWeight: "600" }}
              >
                {title}
              </Text>
            </View>
          </Card>

          <Card>
            <View style={{ gap: 12 }}>
              {expense ? (
                <Row
                  label="Category"
                  value={
                    expense.subcategory
                      ? `${expense.category} › ${expense.subcategory}`
                      : expense.category
                  }
                />
              ) : null}
              {income ? <Row label="Source" value={income.source} /> : null}
              {accountName ? (
                <Row
                  label="Account"
                  value={accountName}
                  onPress={
                    parsed.accountId === contextAccountId
                      ? undefined
                      : () => router.push(`/accounts/${contextAccountId}` as Href)
                  }
                />
              ) : journalRow ? (
                <Row label="Account" value="Not assigned" />
              ) : null}
              {activity?.counterpartyName ? (
                <Row label="Counterparty" value={activity.counterpartyName} />
              ) : null}
              <Row
                label="Date"
                value={clock ? `${formatActivityDateLabel(date)} · ${clock}` : formatActivityDateLabel(date)}
              />
              {expense?.tags && expense.tags.length > 0 ? (
                <Row label="Tags" value={expense.tags.join(", ")} />
              ) : null}
              {spaceName ? <Row label="Space" value={spaceName} /> : null}
              {expense?.tripId ? <Row label="Trip" value="Linked to a trip" /> : null}
              {expense?.subscriptionId ? (
                <Row label="Created by" value="A subscription" />
              ) : null}
              {journalRow?.smsFingerprint ? (
                <Row label="Recorded from" value="Bank SMS" />
              ) : expense?.statementImportFingerprint ? (
                <Row label="Recorded from" value="Statement import" />
              ) : null}
              {payment?.voidedAt ? (
                <Row label="Status" value="Voided" valueColor={theme.colors.destructive} />
              ) : null}
              {typeof activity?.runningBalance === "number" && !isCreditCard ? (
                <View
                  style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}
                >
                  <Text style={{ color: theme.colors.mutedForeground }}>Balance after</Text>
                  <Amount value={activity.runningBalance} currency={currency} ghostable />
                </View>
              ) : null}
            </View>
          </Card>

          {journalRow ? (
            <Card>
              <View style={{ gap: 12 }}>
                {createdLabel ? <Row label="Created" value={createdLabel} /> : null}
                {updatedLabel ? <Row label="Last updated" value={updatedLabel} /> : null}
                {editEvents.length > 0 ? (
                  <Row
                    label="History"
                    value={`Edited ${editEvents.length} ${editEvents.length === 1 ? "time" : "times"}`}
                  />
                ) : null}
              </View>
            </Card>
          ) : null}

          {editability && !editability.editable ? (
            <Notice icon={<Lock size={16} color={theme.colors.mutedForeground} />}>
              {editability.reason}
            </Notice>
          ) : null}
          {!journalKind ? (
            <Notice icon={<Lock size={16} color={theme.colors.mutedForeground} />}>
              {`${typeLabel || "This transaction"} can't be edited here.${
                related ? " Open it where it's managed to make changes." : ""
              }`}
            </Notice>
          ) : null}

          <View style={{ gap: 10 }}>
            {editability?.editable ? (
              <Button size="lg" onPress={openEdit} accessibilityLabel="Edit transaction">
                Edit transaction
              </Button>
            ) : null}
            {related ? (
              <Button
                size="lg"
                variant="outline"
                onPress={() => router.push(related.href as Href)}
              >
                {related.label}
              </Button>
            ) : null}
            {editability?.editable ? (
              <Button
                size="lg"
                variant="ghost"
                disabled={deleting}
                onPress={confirmDelete}
                accessibilityLabel="Delete transaction"
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Trash2 size={16} color={theme.colors.destructive} />
                  <Text style={{ color: theme.colors.destructive, fontWeight: "700" }}>
                    {deleting ? "Deleting…" : "Delete transaction"}
                  </Text>
                </View>
              </Button>
            ) : null}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function Row({
  label,
  value,
  valueColor,
  onPress,
  accessibilityHint,
}: {
  label: string;
  value: string;
  valueColor?: string;
  onPress?: () => void;
  accessibilityHint?: string;
}) {
  const { theme } = useTheme();
  const content = (
    <>
      <Text style={{ color: theme.colors.mutedForeground }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 }}>
        <Text
          style={{
            color: valueColor || (onPress ? theme.colors.primary : theme.colors.foreground),
            fontWeight: "600",
            flexShrink: 1,
            textAlign: "right",
          }}
        >
          {value}
        </Text>
        {onPress ? <ChevronRight size={16} color={theme.colors.primary} /> : null}
      </View>
    </>
  );
  const rowStyle = {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    gap: 12,
    minHeight: onPress ? 44 : undefined,
  };
  if (!onPress) return <View style={rowStyle}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      accessibilityHint={accessibilityHint}
      style={rowStyle}
    >
      {content}
    </Pressable>
  );
}

function Notice({ icon, children }: { icon: ReactNode; children: string }) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 10,
        alignItems: "flex-start",
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      {icon}
      <Text style={{ color: theme.colors.mutedForeground, flex: 1, fontSize: theme.typography.sm }}>
        {children}
      </Text>
    </View>
  );
}

function StateMessage({
  title,
  body,
  onBack,
}: {
  title: string;
  body: string;
  onBack: () => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ padding: 16, gap: 12 }} accessibilityLiveRegion="polite">
      <Text style={{ color: theme.colors.foreground, fontWeight: "700", fontSize: theme.typography.md }}>
        {title}
      </Text>
      <Text style={{ color: theme.colors.mutedForeground }}>{body}</Text>
      <Button onPress={onBack}>Go back</Button>
    </View>
  );
}
