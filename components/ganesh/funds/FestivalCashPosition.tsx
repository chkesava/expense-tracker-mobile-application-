import { Platform, StyleSheet, Text, View } from "react-native";
import { CollectionIcon, ExpenseIcon, OpeningFundIcon } from "@/components/ganesh/art/icons";
import { LotusDivider } from "@/components/ganesh/art/LotusDivider";
import { Money, ProgressTrack, useGaneshTokens } from "@/components/ganesh/ui";
import { GANESH_RADIUS } from "@/components/ganesh/ui/surfaces";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { useTheme } from "@/theme/ThemeProvider";

const TITLE_FONT = Platform.select({
  ios: "Georgia",
  android: "serif",
  web: 'Georgia, "Times New Roman", serif',
  default: undefined,
});

function spendCopy(received: number, spent: number, pct: number): string {
  if (!(received > 0)) return "Nothing received yet this festival";
  if (spent > received) return "Spent more than what the Pandal received";
  return `${Math.round(pct)}% of what the Pandal received has been spent`;
}

/**
 * Live cash position. Amounts come from `availableGodFund`, `totalCashIn`
 * and `festivalCashSpent` — this component only presents them.
 */
export function FestivalCashPosition({
  available,
  received,
  spent,
}: {
  available: number;
  received: number;
  spent: number;
}) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const ratio = received > 0 ? spent / received : 0;
  const spendPct = Number.isFinite(ratio) ? Math.max(0, ratio * 100) : 0;
  const barPct = Math.min(100, spendPct);

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: g.divider }]}>
      <View style={styles.heading}>
        <OpeningFundIcon size={30} />
        <View style={styles.headingCopy}>
          <Text style={[styles.title, { color: theme.colors.foreground, fontFamily: TITLE_FONT ?? theme.fontFamily.semibold }]}>
            This Festival
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
            Cash position
          </Text>
        </View>
      </View>
      <LotusDivider maxWidth={168} />

      <View style={styles.metrics}>
        <View style={styles.metric} accessibilityLabel={`Available ${formatInr(available)}`}>
          <OpeningFundIcon size={28} />
          <Text style={[styles.label, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium }]}>
            Available
          </Text>
          <Money value={available} size="primary" tone="positive" numberOfLines={1} adjustsFontSizeToFit />
        </View>
        <View style={styles.metric} accessibilityLabel={`Received ${formatInr(received)}`}>
          <CollectionIcon size={28} />
          <Text style={[styles.label, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium }]}>
            Received
          </Text>
          <Money value={received} size="primary" tone="accent" numberOfLines={1} adjustsFontSizeToFit />
        </View>
        <View style={styles.metric} accessibilityLabel={`Spent ${formatInr(spent)}`}>
          <ExpenseIcon size={28} />
          <Text style={[styles.label, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium }]}>
            Spent
          </Text>
          <Money value={spent} size="primary" tone="negative" numberOfLines={1} adjustsFontSizeToFit />
        </View>
      </View>

      <View style={styles.meter}>
        <ProgressTrack pct={barPct} color={g.godFund} />
        <Text
          style={[styles.meterCopy, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
        >
          {spendCopy(received, spent, spendPct)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: GANESH_RADIUS.section,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headingGlyph: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  headingCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  title: {
    fontSize: 16,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
  },
  metrics: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  metric: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  glyph: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 11.5,
  },
  meter: {
    marginTop: 12,
    gap: 6,
  },
  meterCopy: {
    fontSize: 12,
    lineHeight: 16,
  },
});
