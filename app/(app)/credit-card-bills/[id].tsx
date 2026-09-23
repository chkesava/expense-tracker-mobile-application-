import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { MarkBillPaidModal } from "@/components/creditCardBills/MarkBillPaidModal";
import { PayCreditBillModal } from "@/components/accounts/PayCreditBillModal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccountPayments } from "@/hooks/useAccountPayments";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useCreditCardBills } from "@/hooks/useCreditCardBills";
import { useExpenses } from "@/hooks/useExpenses";
import { shareCreditCardCycleExport } from "@/services/creditCardBills/creditCardStatementExportShare";
import { appDialog } from "@/lib/appDialog";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { formatAmount } from "@/shared/utils/formatCurrency";
import { useSettings } from "@/providers/SettingsProvider";
import { formatCardLabel } from "@/services/creditCardBills/billNotificationCopy";
import { isCashbackPayment } from "@/shared/types/expense";
import { roundMoney } from "@/shared/utils/money";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { haptic } from "@/lib/haptics";

export default function CreditCardBillDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const {
    bills,
    loading: billsLoading,
    snoozeBillReminder,
    previewBillRecalculation,
    recalculateBill,
  } = useCreditCardBills();
  const { accounts } = useAccounts();
  const { accountTypes } = useAccountTypes();
  const { payments } = useAccountPayments();
  const { expenses } = useExpenses();
  const { settings } = useSettings();
  const [payOpen, setPayOpen] = useState(false);
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [exporting, setExporting] = useState(false);

  const bill = useMemo(() => bills.find((b) => b.id === id), [bills, id]);
  const account = useMemo(
    () => accounts.find((a) => a.id === bill?.accountId),
    [accounts, bill]
  );

  /**
   * How much of this statement's settlement was cashback. A bill cleared by a
   * provider credit is not a bill the user paid, and "Amount paid" on its own
   * would say it was.
   */
  const cashbackApplied = useMemo(() => {
    if (!bill) return 0;
    const linked = new Set((bill.paymentIds || []).filter(Boolean));
    if (linked.size === 0) return 0;
    return roundMoney(
      Math.min(
        bill.amountPaid || 0,
        payments
          .filter(
            (payment) =>
              linked.has(payment.id) &&
              isCashbackPayment(payment) &&
              !payment.voidedAt
          )
          .reduce((sum, payment) => sum + payment.amount, 0)
      )
    );
  }, [bill, payments]);

  /**
   * SPENDLY-99: null unless this is a settled auto statement whose cycle now
   * sums to something else. Pure — the preview never writes, and it returns
   * null while the expense ledger is still the staged first-paint page, so a
   * truncated read can never be offered as a "correction" (SPENDLY-97).
   */
  const recalculation = useMemo(
    () => (bill ? previewBillRecalculation(bill.id) : null),
    [bill, previewBillRecalculation]
  );

  const exportCycle = () => {
    if (!bill || !account) return;
    const periodStart = bill.billingPeriodStart || bill.statementDate;
    const periodEnd = bill.billingPeriodEnd || bill.statementDate;
    setExporting(true);
    void shareCreditCardCycleExport({
      account,
      periodStart,
      periodEnd,
      statementDate: bill.statementDate,
      billId: bill.id,
      expenses,
      payments,
      currency: bill.currency || settings.currency || "INR",
    })
      .then((result) => {
        toast.success(`Exported ${result.rowCount} rows`);
      })
      .catch((error) => {
        logError("creditCardBill.exportCycle", error);
        toast.error(
          friendlyErrorMessage(error, "Couldn't export this statement.")
        );
      })
      .finally(() => setExporting(false));
  };

  const confirmRecalculate = () => {
    if (!bill || !recalculation) return;
    const owesMore = recalculation.delta > 0;
    const currency = bill.currency || settings.currency || "INR";
    appDialog.show({
      title: "Recalculate this statement?",
      message:
        `Recorded ${formatAmount(recalculation.storedAmount, currency)}\n` +
        `Recalculated ${formatAmount(recalculation.recomputedAmount, currency)}\n\n` +
        (owesMore
          ? "The corrected amount is higher than what was paid, so this bill " +
            "will no longer show as settled and may remind you again."
          : "The corrected amount is covered by what was already paid, so " +
            "this bill stays settled."),
      buttons: [
        { text: "Cancel", style: "cancel" },
        {
          text: "Recalculate",
          onPress: () => {
            setRecalculating(true);
            void recalculateBill(bill.id)
              .then((ok) => {
                toast[ok ? "success" : "error"](
                  ok ? "Statement recalculated" : "Could not recalculate"
                );
              })
              .catch((err) => {
                logError("creditCardBills.recalculate", err);
                toast.error(friendlyErrorMessage(err));
              })
              .finally(() => setRecalculating(false));
          },
        },
      ],
    });
  };

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
        <Pressable
          onPress={() => {
            haptic.selection().catch(() => undefined);
            router.back();
          }}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: isDark
              ? "rgba(255,255,255,0.06)"
              : "rgba(0,0,0,0.04)",
          }}
        >
          <ArrowLeft size={20} color={theme.colors.foreground} />
        </Pressable>
        <Text
          style={{
            color: theme.colors.foreground,
            fontWeight: "700",
            fontSize: theme.typography.lg,
            flex: 1,
          }}
          numberOfLines={1}
        >
          {account ? formatCardLabel(account) : "Credit Card Bill"}
        </Text>
      </View>

      {billsLoading && !bill ? (
        <View style={{ padding: 32, alignItems: "center" }}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : !bill ? (
        <View style={{ padding: 16, gap: 12 }}>
          <Text style={{ color: theme.colors.mutedForeground }}>
            Bill not found.
          </Text>
          <Button onPress={() => router.back()}>Go back</Button>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            gap: 16,
            padding: 16,
            paddingBottom: insets.bottom + 40,
          }}
        >
          <Card>
            <View style={{ gap: 10 }}>
              <Row label="Card" value={account?.name || bill.accountId} />
              <Row
                label="Status"
                value={bill.status.replaceAll("_", " ")}
                valueColor={theme.colors.primary}
              />
              <AmountRow label="Statement" value={bill.statementAmount} />
              <AmountRow label="Minimum due" value={bill.minimumDueAmount} />
              <AmountRow
                label={cashbackApplied > 0 ? "Amount settled" : "Amount paid"}
                value={bill.amountPaid}
              />
              {cashbackApplied > 0 ? (
                <AmountRow label="of which cashback" value={cashbackApplied} />
              ) : null}
              <AmountRow label="Remaining" value={bill.remainingAmount} />
              <Row label="Statement date" value={bill.statementDate} />
              {bill.billingPeriodStart && bill.billingPeriodEnd ? (
                <Row
                  label="Billing period"
                  value={`${bill.billingPeriodStart} → ${bill.billingPeriodEnd}`}
                />
              ) : null}
              <Row label="Due date" value={bill.dueDate} />
              {bill.paymentDate ? (
                <Row label="Payment date" value={bill.paymentDate} />
              ) : null}
              {bill.note ? <Row label="Note" value={bill.note} /> : null}
            </View>
          </Card>

          <Button
            variant="outline"
            size="lg"
            disabled={exporting || !account}
            onPress={() => exportCycle()}
          >
            {exporting ? "Exporting…" : "Export statement CSV"}
          </Button>

          {bill.status !== "PAID" && bill.status !== "CANCELLED" ? (
            <View style={{ gap: 10 }}>
              <Button size="lg" onPress={() => setPayOpen(true)}>
                Pay Bill
              </Button>
              <Button
                variant="outline"
                size="lg"
                onPress={() => setMarkPaidOpen(true)}
              >
                Mark as Paid
              </Button>
              <Button
                variant="ghost"
                onPress={async () => {
                  const ok = await snoozeBillReminder(bill.id, 1);
                  toast.success(
                    ok ? "Reminded later — snoozed 1 day" : "Could not snooze"
                  );
                }}
              >
                Remind Me Later
              </Button>
            </View>
          ) : null}

          {recalculation ? (
            <Card>
              <View style={{ gap: 10 }}>
                <Text
                  style={{
                    color: theme.colors.foreground,
                    fontWeight: "700",
                    fontSize: theme.typography.md,
                  }}
                >
                  This statement looks out of date
                </Text>
                <Text
                  style={{
                    color: theme.colors.mutedForeground,
                    fontSize: theme.typography.sm,
                  }}
                >
                  Spend for this cycle now adds up to a different total. Settled
                  statements are never corrected automatically, so this is only
                  applied if you confirm it.
                </Text>
                <AmountRow label="Recorded" value={recalculation.storedAmount} />
                <AmountRow
                  label="Recalculated"
                  value={recalculation.recomputedAmount}
                />
                <Button
                  variant="outline"
                  size="lg"
                  disabled={recalculating}
                  onPress={() => confirmRecalculate()}
                >
                  {recalculating ? "Recalculating…" : "Recalculate statement"}
                </Button>
              </View>
            </Card>
          ) : null}
        </ScrollView>
      )}

      {bill ? (
        <>
          <PayCreditBillModal
            isOpen={payOpen}
            onClose={() => setPayOpen(false)}
            defaultCreditCardId={bill.accountId}
            accounts={accounts}
            accountTypes={accountTypes}
            defaultAmount={bill.remainingAmount}
            applyToBillId={bill.id}
          />
          <MarkBillPaidModal
            isOpen={markPaidOpen}
            onClose={() => setMarkPaidOpen(false)}
            bill={bill}
          />
        </>
      ) : null}
    </View>
  );
}

function Row({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <Text style={{ color: theme.colors.mutedForeground }}>{label}</Text>
      <Text
        style={{
          color: valueColor || theme.colors.foreground,
          fontWeight: "600",
          flexShrink: 1,
          textAlign: "right",
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function AmountRow({ label, value }: { label: string; value: number }) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
      }}
    >
      <Text style={{ color: theme.colors.mutedForeground }}>{label}</Text>
      <Amount value={value} />
    </View>
  );
}
