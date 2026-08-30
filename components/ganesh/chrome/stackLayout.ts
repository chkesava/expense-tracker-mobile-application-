import { StyleSheet } from "react-native";

/** Full-bleed maroon hero + padded cream body — same as the tab screens. */
export const ganeshStackLayout = StyleSheet.create({
  bleed: {
    paddingHorizontal: 0,
    paddingTop: 0,
    gap: 0,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
  },
});
