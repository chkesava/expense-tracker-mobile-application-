import { Image, StyleSheet } from "react-native";

import { useArtScale } from "./useArtScale";

const DIVIDER = require("@/assets/branding/ganesh/lotus-divider.png");

export function LotusDivider() {
  const { width } = useArtScale();
  return (
    <Image
      source={DIVIDER}
      resizeMode="contain"
      style={[styles.divider, { width: Math.min(width - 48, 280), height: 18 }]}
    />
  );
}

const styles = StyleSheet.create({
  divider: {
    alignSelf: "center",
    marginVertical: 4,
  },
});
