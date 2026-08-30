import { StyleSheet, View } from "react-native";

import { useGaneshTokens, withAlpha } from "@/components/ganesh/ui";

/** Gold hairline — the same rule `Section` uses. Not a decorative PNG. */
export function PeopleGoldDivider({ maxWidth = 200 }: { maxWidth?: number }) {
  const g = useGaneshTokens();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[styles.rule, { maxWidth, backgroundColor: withAlpha(g.gold, 0.45) }]}
    />
  );
}

const styles = StyleSheet.create({
  rule: {
    alignSelf: "center",
    width: "100%",
    height: 1,
    borderRadius: 1,
    marginVertical: 8,
  },
});
