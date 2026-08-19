import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";

import {
  ACCOUNT_GREEN,
  ACCOUNT_RED,
  CARD_ORANGE,
} from "@/components/accounts/accountScreenTheme";
import { Amount } from "@/components/common/Amount";
import { haptic } from "@/lib/haptics";
import type { CreditCardBill, CreditCardBillStatus } from "@/shared/types/creditCardBill";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

function statementStatusColor(status: CreditCardBillStatus): string {
  if (status === "PAID") return ACCOUNT_GREEN;
  if (status === "PARTIALLY_PAID") return CARD_ORANGE;
  if (status === "OVERDUE") return ACCOUNT_RED;
  return CARD_ORANGE;
}

export function CreditStatementCard({
  bill,
  currency,
  onAdd,
  onOpen,
}: {
  bill: CreditCardBill | null;
  currency: string;
  onAdd: () => void;
  onOpen: () => void;
}) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const statusColor = bill ? statementStatusColor(bill.status) : CARD_ORANGE;

  return (
    <Pressable
      onPress={() => {
        void haptic.selection();
        if (bill) onOpen();
        else onAdd();
      }}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: isDark ? "#10141C" : theme.colors.card,
          borderColor: isDark ? "rgba(148, 163, 184, 0.12)" : theme.colors.border,
        },
        pressed ? styles.pressed : null,
      ]}
      accessibilityRole="button"
      accessibilityLabel={
        bill ? "Open statement bill" : "Add statement bill for reminders"
      }
    >
      <Text style={[styles.kicker, { color: theme.colors.mutedForeground }]}>
        STATEMENT BILL
      </Text>

      {bill ? (
        <View style={styles.body}>
          <View style={styles.details}>
            <View style={styles.row}>
              <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
                Statement
              </Text>
              <Amount
                value={bill.statementAmount}
                currency={currency}
                ghostable
                style={styles.value}
              />
            </View>
            <View style={styles.row}>
              <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
                Minimum due
              </Text>
              <Amount
                value={bill.minimumDueAmount}
                currency={currency}
                ghostable
                style={styles.value}
              />
            </View>
            <View style={styles.row}>
              <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
                Due
              </Text>
              <Text style={[styles.value, { color: theme.colors.foreground }]}>
                {bill.dueDate}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
                Remaining
              </Text>
              <Amount
                value={bill.remainingAmount}
                currency={currency}
                ghostable
                style={styles.value}
              />
            </View>
            <Text
              style={[
                styles.status,
                { color: statusColor },
                bill.status === "OVERDUE" ? styles.overdue : null,
              ]}
            >
              {bill.status.replaceAll("_", " ")}
            </Text>
          </View>
          <ChevronRight size={18} color={theme.colors.mutedForeground} />
        </View>
      ) : (
        <View style={styles.addRow}>
          <Text style={styles.add}>+ Add statement bill for reminders</Text>
          <ChevronRight size={18} color={theme.colors.mutedForeground} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderCurve: "continuous",
    borderWidth: 1,
    padding: 16,
    gap: 10,
    minHeight: 72,
  },
  kicker: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minHeight: 28,
  },
  add: {
    flex: 1,
    color: CARD_ORANGE,
    fontSize: 14,
    fontWeight: "700",
  },
  body: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  details: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  label: {
    fontSize: 13,
  },
  value: {
    fontSize: 13,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  status: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    marginTop: 2,
  },
  overdue: {
    letterSpacing: 0.6,
  },
  pressed: {
    opacity: 0.86,
  },
});
