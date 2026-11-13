import { memo } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, Rect, Stop } from "react-native-svg";

import { useDayPeriod } from "@/hooks/useDayPeriod";
import { NET_WORTH_SCENE_STAR_POSITIONS, netWorthSceneAlphas, resolveNetWorthScene } from "@/theme/netWorthScene";
import { useSurfaces, withAlpha } from "@/theme/surfaces";

/**
 * A decorative mountain-ridgeline scene for the Net Worth card (the
 * "Mountain Sunrise" reference), one of four time-of-day variants
 * (`theme/netWorthScene.ts`), mirroring the dashboard hero's four scenes.
 * Drawn as an inline SVG rather than a bundled photo so it never carries an
 * image-asset dependency and tints automatically with every theme palette:
 * vivid on a light palette (dark text reads fine over a pale sky, as in the
 * reference), faint on a dark one (ridges tint toward the scene's own hue at
 * low alpha), leaning on the card's own stronger wash there instead.
 *
 * Purely decorative — hidden from assistive tech, never intercepts touches,
 * and always sits behind the card's own content.
 */
export const NetWorthCardBackdrop = memo(function NetWorthCardBackdrop({
  height = 160,
}: {
  height?: number;
}) {
  const surfaces = useSurfaces();
  const period = useDayPeriod();
  const scene = resolveNetWorthScene(surfaces.isDark, period);
  const { skyAlpha, glowAlpha, bodyAlpha, starAlpha, ridgeFarAlpha, ridgeNearAlpha } = netWorthSceneAlphas(
    surfaces.isDark,
    period
  );

  return (
    <View
      style={[styles.container, { height }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width="100%" height="100%" viewBox="0 0 400 160" preserveAspectRatio="xMidYMax slice">
        <Defs>
          <SvgGradient id="skyFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={scene.sky} stopOpacity={skyAlpha} />
            <Stop offset="1" stopColor={scene.sky} stopOpacity={0} />
          </SvgGradient>
          <SvgGradient id="sceneGlow" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={scene.glow} stopOpacity={glowAlpha} />
            <Stop offset="1" stopColor={scene.glow} stopOpacity={0} />
          </SvgGradient>
        </Defs>

        <Rect x="0" y="0" width="400" height="160" fill="url(#skyFade)" />

        {scene.stars
          ? NET_WORTH_SCENE_STAR_POSITIONS.map((star, i) => (
              <Circle key={i} cx={star.cx} cy={star.cy} r={star.r} fill={withAlpha("#FFFFFF", starAlpha)} />
            ))
          : null}

        <Circle cx={scene.cx} cy={scene.cy} r={scene.r * 3.2} fill="url(#sceneGlow)" />
        <Circle cx={scene.cx} cy={scene.cy} r={scene.r} fill={withAlpha(scene.body, bodyAlpha)} />

        {/* Far ridge — smooth rolling hills, not sharp peaks. */}
        <Path
          d="M0,118 C45,96 80,100 115,112 C155,126 175,84 215,96 C255,108 275,102 315,84 C350,68 380,100 400,104 L400,160 L0,160 Z"
          fill={withAlpha(scene.ridgeFar, ridgeFarAlpha)}
        />
        {/* Near ridge */}
        <Path
          d="M0,146 C55,118 90,132 130,106 C170,80 195,130 235,116 C275,102 305,140 345,118 C368,104 388,122 400,118 L400,160 L0,160 Z"
          fill={withAlpha(scene.ridgeNear, ridgeNearAlpha)}
        />
      </Svg>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "hidden",
  },
});
