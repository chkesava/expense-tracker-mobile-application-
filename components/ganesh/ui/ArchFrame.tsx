import { StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";

import { withAlpha } from "./surfaces";
import { useGaneshTokens } from "./tokens";

/**
 * A mandap arch drawn along the top edge of a hero surface.
 *
 * This is the app's structural festival reference: a scalloped temple arch in
 * gold, at low opacity, sitting behind the hero's content. It is intentionally
 * quiet — the brief is a modern operating platform, not a festival poster.
 *
 * **Use on hero surfaces only** — the pandal hero and the fund hero. Never on a
 * list card, a section, or a row; repeated arches turn the app into decoration.
 *
 * Renders nothing interactive and is `pointerEvents="none"`, so it can be
 * layered over any surface without affecting touch targets.
 */
export function ArchFrame({
  height = 74,
  /** 0–1 multiplier on the built-in low opacity, for finer control per surface. */
  intensity = 1,
}: {
  height?: number;
  intensity?: number;
}) {
  const g = useGaneshTokens();

  const strong = withAlpha(g.gold, (g.isDark ? 0.34 : 0.28) * intensity);
  const faint = withAlpha(g.gold, 0);

  return (
    <View pointerEvents="none" style={[styles.wrap, { height }]}>
      <Svg width="100%" height="100%" viewBox="0 0 320 74" preserveAspectRatio="none" fill="none">
        <Defs>
          <LinearGradient id="ganeshArchFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={strong} />
            <Stop offset="1" stopColor={faint} />
          </LinearGradient>
        </Defs>

        {/* Central ogee arch with two shoulder arches — a mandap silhouette. */}
        <Path
          d="M0 72 L0 44 Q28 44 40 26 Q52 8 76 8 Q100 8 112 26 Q124 44 160 44 Q196 44 208 26 Q220 8 244 8 Q268 8 280 26 Q292 44 320 44 L320 72"
          stroke="url(#ganeshArchFade)"
          strokeWidth={1.25}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Inner echo, half weight — gives the arch depth without a second colour. */}
        <Path
          d="M0 72 L0 56 Q34 56 46 40 Q58 24 76 24 Q94 24 106 40 Q118 56 160 56 Q202 56 214 40 Q226 24 244 24 Q262 24 274 40 Q286 56 320 56 L320 72"
          stroke={withAlpha(g.gold, (g.isDark ? 0.18 : 0.14) * intensity)}
          strokeWidth={1}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    overflow: "hidden",
  },
});
