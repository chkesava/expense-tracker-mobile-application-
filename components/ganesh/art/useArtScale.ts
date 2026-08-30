import { useWindowDimensions } from "react-native";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Decoration sizes that stay readable on a phone and do not balloon on tablet.
 */
export function useArtScale() {
  const { width } = useWindowDimensions();

  return {
    width,
    bell: clamp(width * 0.1, 30, 50),
    garlandHeight: clamp(width * 0.08, 24, 38),
    temple: clamp(width * 0.4, 120, 188),
    ganesha: clamp(width * 0.22, 76, 100),
    diya: clamp(width * 0.15, 52, 68),
    actionIcon: clamp(width * 0.11, 40, 48),
    mandala: clamp(width * 0.52, 168, 240),
  };
}
