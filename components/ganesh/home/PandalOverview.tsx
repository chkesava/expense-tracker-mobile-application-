import { StyleSheet, Text, View } from "react-native";

import { CollectionIcon, ExpenseIcon, OpeningFundIcon } from "@/components/ganesh/art/icons";
import { Money, Section, SectionAction, StatTile } from "@/components/ganesh/ui";
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
          <OpeningFundIcon size={32} />
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
          <CollectionIcon size={32} />
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
          <ExpenseIcon size={32} />
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
  meta: {
    fontSize: 11.5,
    lineHeight: 15,
  },
});
