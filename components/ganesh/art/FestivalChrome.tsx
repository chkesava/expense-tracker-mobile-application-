import { Image, StyleSheet, View } from "react-native";

import { useArtScale } from "./useArtScale";

const GARLAND = require("@/assets/branding/ganesh/marigold-garland.png");
const BELL = require("@/assets/branding/ganesh/temple-bell.png");

/**
 * A short marigold toran and a pair of small bells. Used on maroon festival
 * heroes only — never as a full-sheet background.
 */
export function FestivalGarlandBells() {
  const { bell, garlandHeight } = useArtScale();

  return (
    <View pointerEvents="none" style={styles.layer}>
      <Image
        source={GARLAND}
        resizeMode="cover"
        style={[styles.garland, { height: garlandHeight, opacity: 0.78 }]}
      />
      <Image
        source={BELL}
        resizeMode="contain"
        style={[styles.bell, styles.bellLeft, { width: bell, height: bell * 1.4, opacity: 0.7 }]}
      />
      <Image
        source={BELL}
        resizeMode="contain"
        style={[styles.bell, styles.bellRight, { width: bell, height: bell * 1.4, opacity: 0.7 }]}
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
    backgroundColor: "transparent",
  },
  bell: {
    position: "absolute",
    top: 0,
    backgroundColor: "transparent",
  },
  bellLeft: {
    left: 6,
  },
  bellRight: {
    right: 6,
    transform: [{ scaleX: -1 }],
  },
});
