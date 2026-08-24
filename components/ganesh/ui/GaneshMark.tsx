import { StyleSheet, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { useTheme } from "@/theme/ThemeProvider";

import { useGaneshTokens } from "./tokens";

/**
 * The Ganesh Seva mark.
 *
 * A pandal arch over a lotus base — geometric, single-weight, one colour. It is
 * the app's only piece of festival imagery, and it appears in exactly two
 * places: the login screen and the setup flow. Everywhere else the identity is
 * carried by the saffron accent alone.
 */
export function GaneshMark({ size = 88 }: { size?: number }) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const tile = size;

  return (
    <View style={[styles.wrap, { width: size * 1.5, height: size * 1.5 }]}>
      <View
        style={[
          styles.ring,
          {
            borderColor: theme.colors.border,
            width: size * 1.5,
            height: size * 1.5,
            borderRadius: size * 0.75,
          },
        ]}
      />
      <View
        style={[
          styles.ring,
          {
            borderColor: theme.colors.border,
            width: size * 1.24,
            height: size * 1.24,
            borderRadius: size * 0.62,
          },
        ]}
      />

      <View
        style={[
          styles.tile,
          {
            width: tile,
            height: tile,
            borderRadius: tile * 0.3,
            backgroundColor: g.wash(g.saffron),
          },
        ]}
      >
        <Svg width={tile * 0.58} height={tile * 0.58} viewBox="0 0 48 48" fill="none">
          {/* Pandal arch */}
          <Path
            d="M10 40V26c0-7.732 6.268-14 14-14s14 6.268 14 14v14"
            stroke={g.saffron}
            strokeWidth={3}
            strokeLinecap="round"
          />
          {/* Lotus base */}
          <Path
            d="M6 40h36M14 40c0-4 4.477-7 10-7s10 3 10 7"
            stroke={g.saffron}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Tilak */}
          <Circle cx={24} cy={22} r={3} fill={g.saffron} />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    borderWidth: StyleSheet.hairlineWidth,
  },
  tile: {
    alignItems: "center",
    justifyContent: "center",
    borderCurve: "continuous",
  },
});
