import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { BlurTargetView, BlurView } from "expo-blur";

import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

/*
 * SPENDLY-161: the one glass primitive for floating chrome (bottom nav
 * capsule, action dock, future floating controls).
 *
 * Android blur (expo-blur's Dimezis method) needs to know which view to blur:
 * content has to be wrapped in a BlurTargetView and the BlurView given its
 * ref. `GlassBlurTarget` wraps the Spendly screen stack once and publishes
 * that ref through context, so any GlassSurface rendered *outside* the stack
 * (the nav, the dock) blurs what scrolls beneath it. A GlassSurface must never
 * sit inside the target it blurs.
 */

const BlurTargetContext = createContext<RefObject<View | null> | null>(null);

export function GlassBlurTarget({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const ref = useRef<View | null>(null);
  return (
    <BlurTargetContext.Provider value={ref}>
      <BlurTargetView ref={ref} style={[styles.fill, style]} collapsable={false}>
        {children}
      </BlurTargetView>
    </BlurTargetContext.Provider>
  );
}

/** iOS "Reduce Transparency" — honour it by dropping the blur. */
function useReduceTransparency(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    let alive = true;
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((value) => alive && setReduce(value))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener("reduceTransparencyChanged", setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

/** #RRGGBB -> rgba(). Anything else is returned unchanged. */
function tint(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export type GlassSurfaceProps = {
  children?: ReactNode;
  /** Corner radius; defaults to a full pill. */
  radius?: number;
  /** Blur strength, 1–100. */
  intensity?: number;
  /** Set false to force the opaque fallback (e.g. a busy background). */
  blur?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
};

export function GlassSurface({
  children,
  radius = 999,
  intensity = 40,
  blur = true,
  style,
  contentStyle,
  testID,
}: GlassSurfaceProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const blurTarget = useContext(BlurTargetContext);
  const reduceTransparency = useReduceTransparency();

  // Web has no native blur path worth the cost here; Android needs a target.
  const canBlur =
    blur &&
    !reduceTransparency &&
    Platform.OS !== "web" &&
    (Platform.OS !== "android" || blurTarget !== null);

  // With blur the overlay only tints; without it the surface must carry the
  // contrast on its own, so it goes near-opaque.
  const overlay = tint(theme.colors.card, canBlur ? (isDark ? 0.6 : 0.72) : 0.96);
  const highlight = isDark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.65)";
  const hairline = theme.colors.outlineVariant ?? theme.colors.border;

  return (
    <View
      testID={testID}
      style={[
        styles.shell,
        theme.elevation[3],
        { borderRadius: radius, borderColor: hairline },
        style,
      ]}
    >
      <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: "hidden" }]}>
        {canBlur ? (
          <BlurView
            intensity={intensity}
            tint={isDark ? "dark" : "light"}
            blurMethod="dimezisBlurViewSdk31Plus"
            blurTarget={blurTarget ?? undefined}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: overlay }]} />
        {/* Top-edge highlight that sells the glass. */}
        <View style={[styles.highlight, { backgroundColor: highlight }]} />
      </View>
      <View style={contentStyle}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  shell: {
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: "continuous",
  },
  highlight: {
    position: "absolute",
    top: 0,
    left: 16,
    right: 16,
    height: StyleSheet.hairlineWidth,
  },
});
