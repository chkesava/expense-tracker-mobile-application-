import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { MarkBillPaidModal } from "@/components/creditCardBills/MarkBillPaidModal";
import { PayCreditBillModal } from "@/components/accounts/PayCreditBillModal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useCreditCardBills } from "@/hooks/useCreditCardBills";
import { toast } from "@/lib/toast";
import { formatCardLabel } from "@/services/creditCardBills/billNotificationCopy";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { haptic } from "@/lib/haptics";

export default function CreditCardBillDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { bills, snoozeBillReminder } = useCreditCardBills();
  const { accounts } = useAccounts();
  const { accountTypes } = useAccountTypes();
  const [payOpen, setPayOpen] = useState(false);
  const [markPaidOpen, setMarkPaidOpen] = useState(false);

  const bill = useMemo(() => bills.find((b) => b.id === id), [bills, id]);
  const account = useMemo(
    () => accounts.find((a) => a.id === bill?.accountId),
    [accounts, bill]
  );

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

      {!bill ? (
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
              <AmountRow label="Amount paid" value={bill.amountPaid} />
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
