import { StyleSheet, Text, View } from "react-native";
import { Info } from "lucide-react-native";

import { GaneshArt } from "@/components/ganesh/art/GaneshArt";
import { useGaneshTokens } from "@/components/ganesh/ui";
import { GANESH_RADIUS } from "@/components/ganesh/ui/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Quiet reminder about roles vs festival targets. Copy is built from the
 * live festival name — never a hardcoded example.
 */
export function PandalInfoNotice({ festivalName }: { festivalName?: string }) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const copy = festivalName
    ? `Roles apply to the whole Pandal. Contribution targets are set per festival — currently ${festivalName}.`
    : "Roles apply to the whole Pandal.";

  return (
    <View
      style={[styles.banner, { backgroundColor: g.wash(g.saffron), borderColor: g.wash(g.saffron) }]}
      accessibilityRole="text"
      accessibilityLabel={copy}
    >
      <View style={[styles.glyph, { backgroundColor: g.wash(g.maroon) }]}>
        <Info size={14} color={g.maroon} strokeWidth={2.4} />
      </View>
      <Text style={[styles.copy, { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular }]}>
        {copy}
      </Text>
      <GaneshArt name="diya" width={36} height={36} />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: GANESH_RADIUS.section,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
  },
  glyph: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: {
    flex: 1,
    minWidth: 0,
    fontSize: 12.5,
    lineHeight: 17,
  },
});
