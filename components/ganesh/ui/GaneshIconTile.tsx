import { type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { withAlpha } from "./surfaces";
import { useGaneshTokens } from "./tokens";

export type GaneshIconTileProps = {
  children: ReactNode;
  size?: number;
  /** Maroon heroes — translucent ivory niche instead of a solid white square. */
  onDark?: boolean;
  /** Wash colour on light surfaces. Defaults to saffron. */
  tint?: string;
};

/**
 * The only icon container in Ganesh Seva.
 *
 * Lucide (or a transparent PNG) sits in a tinted squircle. The tile is drawn
 * in code so generated assets cannot smuggle in a cream sticker background.
 */
export function GaneshIconTile({
  children,
  size = 44,
  onDark = false,
  tint,
}: GaneshIconTileProps) {
  const g = useGaneshTokens();
  const backgroundColor = onDark ? withAlpha("#FFF8F1", 0.16) : g.wash(tint ?? g.saffron);

  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.32),
          backgroundColor,
        },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
});
