import { Image, StyleSheet, View } from "react-native";

import { useArtScale } from "./useArtScale";

const GARLAND = require("@/assets/branding/ganesh/marigold-garland.png");
const BELL = require("@/assets/branding/ganesh/temple-bell.png");

/**
 * Marigold toran plus a pair of temple bells. Used on maroon festival heroes
 * only — never as a full-sheet background.
 */
export function FestivalGarlandBells() {
  const { bell, garlandHeight } = useArtScale();

  return (
    <View pointerEvents="none" style={styles.layer}>
      <Image source={GARLAND} resizeMode="cover" style={[styles.garland, { height: garlandHeight }]} />
      <Image source={BELL} resizeMode="contain" style={[styles.bell, styles.bellLeft, { width: bell, height: bell * 1.45 }]} />
      <Image
        source={BELL}
        resizeMode="contain"
        style={[styles.bell, styles.bellRight, { width: bell, height: bell * 1.45 }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFill,
  },
  garland: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    width: "100%",
  },
  bell: {
    position: "absolute",
    top: 2,
  },
  bellLeft: {
    left: 2,
  },
  bellRight: {
    right: 2,
    transform: [{ scaleX: -1 }],
  },
});
