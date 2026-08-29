import { StyleSheet, Text, View } from "react-native";
import { HandCoins, HeartHandshake, ShoppingBag } from "lucide-react-native";

import { Money, Section, SectionAction, StatTile, useGaneshTokens } from "@/components/ganesh/ui";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Three operational readings. Home matches the festival mock: available is
 * God-Fund green, received is saffron, spent is maroon. The numbers stay live.
 */
export function PandalOverview({
  available,
  received,
  spent,
  collectionCount,
  expenseCount,
  onDetails,
}: {
  available: number;
  received: number;
  spent: number;
  collectionCount: number;
  expenseCount: number;
  onDetails: () => void;
}) {
  const { theme } = useTheme();
  const g = useGaneshTokens();

  return (
    <Section title="Pandal Overview" action={<SectionAction label="View Details" onPress={onDetails} />}>
      <View style={styles.row}>
        <StatTile
          label="Available"
          meta={
            <Text style={[styles.meta, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
              Funds available
            </Text>
          }
        >
          <View style={[styles.glyph, { backgroundColor: g.wash(g.godFund) }]}>
            <HeartHandshake size={14} color={g.godFund} strokeWidth={2.2} />
          </View>
          <Money value={available} size="primary" tone="positive" numberOfLines={1} adjustsFontSizeToFit />
        </StatTile>
        <StatTile
          label="Received"
          meta={
            <Text style={[styles.meta, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
              {collectionCount} Collection{collectionCount === 1 ? "" : "s"}
            </Text>
          }
        >
          <View style={[styles.glyph, { backgroundColor: g.wash(g.saffron) }]}>
            <HandCoins size={14} color={g.saffron} strokeWidth={2.2} />
          </View>
          <Money value={received} size="primary" tone="accent" numberOfLines={1} adjustsFontSizeToFit />
        </StatTile>
        <StatTile
          label="Spent"
          meta={
            <Text style={[styles.meta, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
              {expenseCount} Expense{expenseCount === 1 ? "" : "s"}
            </Text>
          }
        >
          <View style={[styles.glyph, { backgroundColor: g.wash(g.maroon) }]}>
            <ShoppingBag size={14} color={g.maroon} strokeWidth={2.2} />
          </View>
          <Money value={spent} size="primary" tone="negative" numberOfLines={1} adjustsFontSizeToFit />
        </StatTile>
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 10,
  },
  glyph: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  meta: {
    fontSize: 11.5,
    lineHeight: 15,
  },
});
