import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight, Landmark } from "lucide-react-native";

import { Money } from "@/components/ganesh/ui/Money";
import { FundHero } from "@/components/ganesh/ui/FundHero";
import { MetaLabel, useSurfaces, GANESH_RADIUS } from "@/components/ganesh/ui";
import { useGaneshTokens } from "@/components/ganesh/ui/tokens";
import { Button } from "@/components/ui/Button";
import { haptic } from "@/lib/haptics";
import type { PermanentFundSummary } from "@/shared/types/ganesh";
import { useTheme } from "@/theme/ThemeProvider";

export type PermanentFundCardProps = {
  fund: PermanentFundSummary;
  onPress?: () => void;
  onAddPress?: () => void;
  /**
   * `row` is the compact treatment used where the God Fund already owns the
   * hero slot. `hero` is for the Permanent Fund's own screen.
   */
  variant?: "row" | "hero";
};

/**
 * The Permanent Pandal Fund.
 *
 * It carries its own identity — a maroon accent, "Permanent" wording on every
 * surface — but it is deliberately *not* a second hero on screens that already
 * show the festival fund. Mixing the two without a clear label is the one thing
 * this screen must never do.
 */
export function PermanentFundCard({
  fund,
  onPress,
  onAddPress,
  variant = "row",
}: PermanentFundCardProps) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const surfaces = useSurfaces();
  const empty = fund.total === 0;

  if (variant === "hero") {
    return (
      <FundHero
        kind="permanent"
        title="Permanent Pandal Fund"
        subtitle="Carries across festivals"
        icon={<Landmark size={16} color={g.maroon} strokeWidth={2.2} />}
        eyebrow="Total"
        amount={fund.total}
        breakdown={
          empty
            ? undefined
            : [
                { label: "Cash", value: fund.cash },
                { label: "UPI", value: fund.upi },
                { label: "Bank", value: fund.bank },
                { label: "Other", value: fund.other },
              ]
        }
        emptyHint={
          empty
            ? "No Permanent Fund recorded yet. Add the Pandal's existing money once setup is done."
            : undefined
        }
        footer={
          onAddPress && empty ? (
            <Button variant="outline" onPress={onAddPress}>
              Add Permanent Fund
            </Button>
          ) : null
        }
      />
    );
  }

  return (
    <Pressable
      disabled={!onPress}
      onPress={
        onPress
          ? () => {
              void haptic.selection();
              onPress();
            }
          : undefined
      }
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`Permanent Pandal Fund, ${fund.total}`}
      android_ripple={
        onPress
          ? {
              color: surfaces.isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.05)",
              borderless: false,
            }
          : undefined
      }
      style={({ pressed }: { pressed?: boolean }) => [
        styles.row,
        { backgroundColor: theme.colors.card, borderColor: g.divider },
        pressed && { opacity: 0.9 },
      ]}
    >
      <View style={[styles.glyph, { backgroundColor: g.wash(g.maroon) }]}>
        <Landmark size={18} color={g.maroon} strokeWidth={2.2} />
      </View>

      <View style={styles.copy}>
        <MetaLabel>Permanent Pandal Fund</MetaLabel>
        <Money value={fund.total} size="title" />
        {empty ? (
          <Text
            numberOfLines={2}
            style={[styles.hint, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
          >
            Not recorded yet — this money carries across festivals.
          </Text>
        ) : (
          <Text
            numberOfLines={1}
            style={[styles.hint, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
          >
            Separate from this festival's God Fund
          </Text>
        )}
      </View>

      {onAddPress && empty ? (
        <Button size="sm" variant="outline" onPress={onAddPress}>
          Add
        </Button>
      ) : onPress ? (
        <ChevronRight size={16} color={theme.colors.mutedForeground} strokeWidth={2} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: GANESH_RADIUS.section,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  glyph: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  hint: {
    fontSize: 11.5,
    lineHeight: 16,
  },
});
