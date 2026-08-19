import { StyleSheet, Text, View } from "react-native";

import { BillingCycleCard } from "@/components/accounts/BillingCycleCard";
import type { CreditBillStatus } from "@/shared/utils/accountBalance";
import { useTheme } from "@/theme/ThemeProvider";

export type PastBillingCycleItem = {
  id: string;
  rangeLabel: string;
  billedAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentDate?: string;
  status: CreditBillStatus;
  overdue: boolean;
  billId?: string;
};

export function PastBillingCycles({
  cycles,
  currency,
  onOpenCycle,
}: {
  cycles: PastBillingCycleItem[];
  currency: string;
  onOpenCycle: (billId: string) => void;
}) {
  const { theme } = useTheme();

  return (
    <View style={styles.section}>
      <Text
        style={[styles.heading, { color: theme.colors.mutedForeground }]}
        accessibilityRole="header"
      >
        PAST BILLING CYCLES
      </Text>
      {cycles.length === 0 ? (
        <View
          style={[
            styles.empty,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[styles.emptyTitle, { color: theme.colors.foreground }]}>
            No past billing cycles yet
          </Text>
          <Text style={[styles.emptyBody, { color: theme.colors.mutedForeground }]}>
            Completed cycles appear here after this card has billed activity.
          </Text>
        </View>
      ) : (
        cycles.map((cycle) => {
          const billId = cycle.billId;
          return (
            <BillingCycleCard
              key={cycle.id}
              rangeLabel={cycle.rangeLabel}
              billedAmount={cycle.billedAmount}
              paidAmount={cycle.paidAmount}
              remainingAmount={cycle.remainingAmount}
              paymentDate={cycle.paymentDate}
              currency={currency}
              status={cycle.status}
              overdue={cycle.overdue}
              onPress={billId ? () => onOpenCycle(billId) : undefined}
            />
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 10,
  },
  heading: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  empty: {
    borderRadius: 18,
    borderCurve: "continuous",
    borderWidth: 1,
    padding: 18,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  emptyBody: {
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 18,
  },
});
