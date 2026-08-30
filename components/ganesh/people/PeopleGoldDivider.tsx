import { Image, StyleSheet } from "react-native";

import { PEOPLE_ART } from "./peopleArt";

export function PeopleGoldDivider({ maxWidth = 200 }: { maxWidth?: number }) {
  return (
    <Image
      source={PEOPLE_ART.goldDivider}
      resizeMode="contain"
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[styles.divider, { width: maxWidth }]}
    />
  );
}

const styles = StyleSheet.create({
  divider: {
    alignSelf: "center",
    height: 22,
    marginVertical: 6,
  },
});
