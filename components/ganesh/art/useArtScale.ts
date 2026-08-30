import { useWindowDimensions } from "react-native";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Decoration sizes that stay readable on a phone and do not balloon on tablet.
 * Kept small on purpose — chrome supports the title, it does not compete with it.
 */
export function useArtScale() {
  const { width } = useWindowDimensions();

  return {
    width,
    bell: clamp(width * 0.055, 18, 26),
    garlandHeight: clamp(width * 0.042, 16, 22),
    temple: clamp(width * 0.26, 84, 120),
    ganesha: clamp(width * 0.2, 72, 92),
    diya: clamp(width * 0.12, 40, 56),
    actionIcon: clamp(width * 0.09, 32, 40),
    mandala: clamp(width * 0.4, 132, 184),
  };
}
