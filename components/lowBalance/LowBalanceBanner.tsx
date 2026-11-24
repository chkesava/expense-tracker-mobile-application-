/**
 * SPENDLY-798 (epic SPENDLY-793): "Short by ₹X on {account} before {date}"
 * shown on a recurring item, a card or a paying account. It shows the
 * server's stored figures only, and amounts follow ghost mode.
 * An untrusted balance says so instead of showing a figure.
 */

import { StyleSheet, Text, View } from "react-native";
import { AlertTriangle, HelpCircle } from "lucide-react-native";

import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import {
  lowBalanceDueLabel,
  lowBalanceItemLabel,
  type LowBalanceShort,
  type LowBalanceUnverified,
} from "@/shared/utils/lowBalanceDisplay";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces } from "@/theme/surfaces";

export function LowBalanceBanner({
  short,
  unverified = [],
  today,
  showItemName = false,
  compact = false,
}: {
  short: readonly LowBalanceShort[];
  unverified?: readonly LowBalanceUnverified[];
  today: string;
  /** On an account's screen, name each debit; on the item's own screen it's implied. */
  showItemName?: boolean;
  /** One line, for a list row. */
  compact?: boolean;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const money = useGhostMoney(useDisplayCurrency());
  if (!short.length && !unverified.length) return null;

  const lines = [
    ...short.map((i) => ({
      key: `s:${i.kind}:${i.refId}:${i.billId ?? ""}:${i.dueDate}`,
      tone: theme.colors.warning,
      Icon: AlertTriangle,
      title: `Short by ${money(i.shortBy)} on ${i.accountName}`,
      body: `${showItemName ? `${lowBalanceItemLabel(i)} (${money(i.amount)})` : money(i.amount)} is due ${lowBalanceDueLabel(i.dueDate, today)}. Add money before it's debited.`,
    })),
    ...unverified.map((i) => ({
      key: `u:${i.kind}:${i.refId}:${i.billId ?? ""}:${i.dueDate}`,
      tone: theme.colors.mutedForeground,
      Icon: HelpCircle,
      title: `Can't check ${i.accountName}`,
      body: `Its balance needs reconciliation, so the ${lowBalanceItemLabel(i)} debit due ${lowBalanceDueLabel(i.dueDate, today)} wasn't checked.`,
    })),
  ];

  return (
    <View style={{ gap: 8 }}>
      {lines.map(({ key, tone, Icon, title, body }) => (
        <View
          key={key}
          style={[styles.banner, compact && styles.compact, { backgroundColor: surfaces.wash(tone) }]}
          accessibilityRole="alert"
          accessibilityLabel={`${title}. ${body}`}
        >
          <Icon size={compact ? 14 : 17} color={tone} strokeWidth={2.3} />
          <View style={styles.textCol}>
            <Text style={[styles.title, { color: tone, fontFamily: theme.fontFamily.semibold }]} numberOfLines={compact ? 1 : undefined}>
              {title}
            </Text>
            {compact ? null : <Text style={[styles.body, { color: theme.colors.foreground }]}>{body}</Text>}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderCurve: "continuous",
  },
  compact: {
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  textCol: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 13.5 },
  body: { fontSize: 12.5, lineHeight: 17 },
});
