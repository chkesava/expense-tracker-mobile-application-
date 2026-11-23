import { Pressable, StyleSheet, Text, View } from "react-native";
import { Banknote } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces } from "@/theme/surfaces";
import {
  CASH_DENOMINATIONS,
  cashDenominationTotal,
} from "@/shared/utils/cashDenominations";
import type { Account } from "@/shared/types/expense";

/**
 * Read-only cash note breakdown for the account detail screen. Informational
 * only — the counted total is never the account's balance; see
 * `EditAccountModal`'s "Cash Denominations" section, which is where it's
 * edited.
 */
export function CashDenominationCard({
  denominations,
  currency,
  balance,
  onEdit,
}: {
  denominations: Account["cashDenominations"];
  currency: string;
  balance: number;
  onEdit: () => void;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();

  const counted = CASH_DENOMINATIONS.filter(
    (d) => (denominations?.[String(d) as keyof typeof denominations] ?? 0) > 0
  );
  const total = cashDenominationTotal(denominations);
  const mismatch = counted.length > 0 && total !== balance;

  if (counted.length === 0) {
    return (
      <View
        style={[
          styles.card,
          { backgroundColor: surfaces.tile, borderColor: theme.colors.border },
        ]}
      >
        <View style={styles.header}>
          <Banknote size={18} color={theme.colors.primary} />
          <Text style={[styles.title, { color: theme.colors.foreground }]}>
            Cash Denominations
          </Text>
        </View>
        <Text style={{ color: theme.colors.mutedForeground, fontSize: 13 }}>
          No note count recorded yet.
        </Text>
        <Pressable onPress={onEdit}>
          <Text style={{ color: theme.colors.primary, fontWeight: "700", fontSize: 13 }}>
            Add a count
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: surfaces.tile, borderColor: theme.colors.border },
      ]}
    >
      <View style={styles.header}>
        <Banknote size={18} color={theme.colors.primary} />
        <Text style={[styles.title, { color: theme.colors.foreground }]}>
          Cash Denominations
        </Text>
      </View>

      <View style={styles.grid}>
        {counted.map((d) => {
          const count = denominations?.[String(d) as keyof typeof denominations] ?? 0;
          return (
            <View
              key={d}
              style={[styles.tile, { borderColor: theme.colors.outlineVariant }]}
            >
              <Text style={[styles.tileLabel, { color: theme.colors.mutedForeground }]}>
                {`₹${d} × ${count}`}
              </Text>
              <Amount
                value={d * count}
                currency={currency}
                style={styles.tileValue}
              />
            </View>
          );
        })}
      </View>

      <View style={styles.footerRow}>
        <Text style={{ color: theme.colors.mutedForeground, fontSize: 13 }}>
          Counted total
        </Text>
        <Amount value={total} currency={currency} style={styles.totalValue} />
      </View>

      {mismatch ? (
        <Text style={{ color: theme.colors.destructive, fontSize: 12, fontWeight: "700" }}>
          {"Doesn't match the account balance."}
        </Text>
      ) : null}

      <Pressable onPress={onEdit}>
        <Text style={{ color: theme.colors.primary, fontWeight: "700", fontSize: 13 }}>
          Edit count
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderCurve: "continuous",
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tile: {
    flexGrow: 1,
    flexBasis: "30%",
    minWidth: 100,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
  },
  tileLabel: {
    fontSize: 11,
  },
  tileValue: {
    fontSize: 14,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  totalValue: {
    fontSize: 16,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
});
