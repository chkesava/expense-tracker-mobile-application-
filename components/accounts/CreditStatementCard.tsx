import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { haptic } from "@/lib/haptics";
import type { CreditCardBill, CreditCardBillStatus } from "@/shared/types/creditCardBill";
import { useSettings } from "@/providers/SettingsProvider";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces } from "@/theme/surfaces";

type Colors = ReturnType<typeof useTheme>["theme"]["colors"];

function statementStatusColor(status: CreditCardBillStatus, colors: Colors): string {
  if (status === "PAID") return colors.success;
  if (status === "PARTIALLY_PAID") return colors.warning;
  if (status === "OVERDUE") return colors.destructive;
  return colors.warning;
}

export function CreditStatementCard({
  bill,
  currency,
  onAdd,
  onOpen,
  isLoading,
}: {
  bill: CreditCardBill | null;
  currency: string;
  onAdd: () => void;
  onOpen: () => void;
  isLoading?: boolean;
}) {
  const { theme } = useTheme();
  const { settings } = useSettings();
  const surfaces = useSurfaces();
  const statusColor = bill ? statementStatusColor(bill.status, theme.colors) : theme.colors.warning;

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
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.outlineVariant,
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

      {isLoading ? (
        <View style={styles.body}>
          <View style={styles.details}>
            <View style={styles.row}>
              <View style={{ height: 16, width: 80, backgroundColor: surfaces.track, borderRadius: 4 }} />
              <View style={{ height: 16, width: 60, backgroundColor: surfaces.track, borderRadius: 4 }} />
            </View>
            <View style={styles.row}>
              <View style={{ height: 16, width: 100, backgroundColor: surfaces.track, borderRadius: 4 }} />
              <View style={{ height: 16, width: 70, backgroundColor: surfaces.track, borderRadius: 4 }} />
            </View>
          </View>
        </View>
      ) : bill ? (
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
                Amount paid
              </Text>
              <Amount
                value={bill.amountPaid}
                currency={currency}
                ghostable
                style={[styles.value, { color: theme.colors.success }]}
              />
            </View>
            {bill.minimumDueAmount > 0 ? (
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
            ) : null}
            <View style={styles.row}>
              <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
                Due
              </Text>
              <Text style={[styles.value, { color: theme.colors.foreground }]}>
                {formatDisplayDate(bill.dueDate, settings.dateFormat)}
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
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={[styles.add, { color: theme.colors.warning }]}>No active statement</Text>
            <Text style={{ fontSize: 13, color: theme.colors.mutedForeground, marginTop: 4 }}>
              Statements will appear here when generated. Tap to add manually.
            </Text>
          </View>
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
