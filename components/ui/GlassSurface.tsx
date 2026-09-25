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
import { LinearGradient } from "expo-linear-gradient";

import {
  SMOKE_BLUR_INTENSITY,
  SMOKE_TINT_ALPHA,
  SMOKE_TINT_ALPHA_NO_BLUR,
  SMOKE_TINT_RGB,
} from "@/components/ui/glassTokens";

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
  /**
   * `adaptive` (default): tinted with the theme card colour.
   * `smoke`: glossy dark glass in every theme, with a gradient rim and a top
   * sheen. Put white content on it (SPENDLY-154 nav capsule).
   */
  tone?: "adaptive" | "smoke";
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
};

export function GlassSurface({
  children,
  radius = 999,
  intensity = 40,
  blur = true,
  tone = "adaptive",
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

  const smoke = tone === "smoke";
  const [r, g, b] = SMOKE_TINT_RGB;
  // With blur the overlay only tints; without it the surface must carry the
  // contrast on its own, so it goes near-opaque.
  const overlay = smoke
    ? `rgba(${r}, ${g}, ${b}, ${
        canBlur ? (isDark ? SMOKE_TINT_ALPHA.dark : SMOKE_TINT_ALPHA.light) : SMOKE_TINT_ALPHA_NO_BLUR
      })`
    : tint(theme.colors.card, canBlur ? (isDark ? 0.6 : 0.72) : 0.96);
  const highlight = isDark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.65)";
  const hairline = theme.colors.outlineVariant ?? theme.colors.border;

  const layers = (
    <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: "hidden" }]}>
      {canBlur ? (
        <BlurView
          intensity={smoke ? SMOKE_BLUR_INTENSITY : intensity}
          tint={smoke || isDark ? "dark" : "light"}
          blurMethod="dimezisBlurViewSdk31Plus"
          blurTarget={blurTarget ?? undefined}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: overlay }]} />
      {smoke ? (
        // Faint reflection across the top half, like light on glass.
        <LinearGradient
          pointerEvents="none"
          colors={["rgba(255,255,255,0.06)", "rgba(255,255,255,0.02)", "rgba(255,255,255,0)"]}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        // Top-edge highlight that sells the glass.
        <View style={[styles.highlight, { backgroundColor: highlight }]} />
      )}
    </View>
  );

  if (smoke) {
    // The rim is a gradient ring: an outer gradient with the glass inset 1px,
    // a quiet edge that is brightest along the top, where light catches it.
    return (
      <View testID={testID} style={[styles.smokeShell, { borderRadius: radius }, style]}>
        <LinearGradient
          pointerEvents="none"
          colors={["rgba(255,255,255,0.16)", "rgba(255,255,255,0.10)", "rgba(255,255,255,0.08)"]}
          locations={[0, 0.4, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
        />
        <View style={[styles.smokeInner, { borderRadius: radius - 1 }]}>
          {layers}
          <View style={contentStyle}>{children}</View>
        </View>
      </View>
    );
  }

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
      {layers}
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
  smokeShell: {
    padding: 1,
    borderCurve: "continuous",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.38,
    shadowRadius: 24,
    // Android draws this from the rounded outline; shadowColor tints it on API 28+.
    elevation: 12,
  },
  smokeInner: {
    flex: 1,
    overflow: "hidden",
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
