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
  PixelRatio,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { BlurTargetView, BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";

import {
  SMOKE_GLOSS_ALPHA,
  SMOKE_GLOSS_END,
  SMOKE_IOS_INTENSITY,
  SMOKE_TINT_ALPHA,
  SMOKE_TINT_ALPHA_NO_BLUR,
  SMOKE_TINT_RGB,
  smokeAndroidBlur,
} from "@/components/ui/glassTokens";

import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

/*
 * SPENDLY-161: the one glass primitive for floating chrome (bottom nav
 * capsule, action dock, future floating controls).
 *
 * Android blur (expo-blur's Dimezis method) needs to know which view to blur:
 * content has to be wrapped in a BlurTargetView and the BlurView given its
 * ref. `GlassBlurScope` owns that ref and publishes it through context;
 * `GlassBlurTarget` attaches it to the Spendly screen stack. The scope has to
 * wrap the chrome as well as the target: the nav and the dock render *beside*
 * the stack, not inside it, and a GlassSurface that can't see the ref silently
 * drops to tint-only (SPENDLY-170 found the nav had never blurred on Android
 * for exactly that reason). A GlassSurface must never sit inside the target it
 * blurs.
 */

const BlurTargetContext = createContext<RefObject<View | null> | null>(null);

/** Wrap the blur target *and* every GlassSurface that should blur it. */
export function GlassBlurScope({ children }: { children: ReactNode }) {
  const ref = useRef<View | null>(null);
  return <BlurTargetContext.Provider value={ref}>{children}</BlurTargetContext.Provider>;
}

export function GlassBlurTarget({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const scopeRef = useContext(BlurTargetContext);
  const ownRef = useRef<View | null>(null);
  const ref = scopeRef ?? ownRef;
  const target = (
    <BlurTargetView ref={ref} style={[styles.fill, style]} collapsable={false}>
      {children}
    </BlurTargetView>
  );
  // Without a surrounding scope, publish the ref to the target's own subtree.
  return scopeRef ? (
    target
  ) : (
    <BlurTargetContext.Provider value={ownRef}>{target}</BlurTargetContext.Provider>
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

  // Smoke on Android: radius and tint are both driven by intensity, so
  // glassTokens solves for the pair; iOS gets its native dark material.
  const blurProps = smoke
    ? Platform.OS === "android"
      ? smokeAndroidBlur(PixelRatio.get())
      : { intensity: SMOKE_IOS_INTENSITY }
    : { intensity };

  // Clamp: a pill left at the 999 default still gets a line on the glass.
  const specularInset = Math.min(radius, 40) * 0.6;

  const layers = (
    <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: "hidden" }]}>
      {canBlur ? (
        <BlurView
          {...blurProps}
          tint={smoke || isDark ? "dark" : "light"}
          blurMethod="dimezisBlurViewSdk31Plus"
          blurTarget={blurTarget ?? undefined}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: overlay }]} />
      {smoke ? (
        <>
          {/* Glossy sheen over the top of the glass: bright at the edge and
              falling off by mid-height, so the surface reads as curved glass. */}
          <LinearGradient
            pointerEvents="none"
            colors={[
              `rgba(200,210,255,${SMOKE_GLOSS_ALPHA})`,
              `rgba(200,210,255,${SMOKE_GLOSS_ALPHA * 0.35})`,
              "rgba(200,210,255,0)",
            ]}
            locations={[0, SMOKE_GLOSS_END * 0.6, SMOKE_GLOSS_END]}
            style={StyleSheet.absoluteFill}
          />
          {/* Light catching the top edge: a thin cool line, brightest mid-width.
              Inset from the corner curve, so it needs a real radius; the 999
              pill default would push it off the glass. */}
          <LinearGradient
            pointerEvents="none"
            colors={["rgba(210,220,255,0)", "rgba(230,236,255,0.55)", "rgba(210,220,255,0)"]}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.specularLine, { left: specularInset, right: specularInset }]}
          />
          {/* Soft reflection along the bottom edge, where glass catches light
              bounced from below. */}
          <LinearGradient
            pointerEvents="none"
            colors={["rgba(200,210,255,0)", "rgba(200,210,255,0.07)"]}
            locations={[0.72, 1]}
            style={StyleSheet.absoluteFill}
          />
        </>
      ) : (
        // Top-edge highlight that sells the glass.
        <View style={[styles.highlight, { backgroundColor: highlight }]} />
      )}
    </View>
  );

  if (smoke) {
    // Everything drawn here stays outside or on the edge of the glass: the
    // blue glow and drop shadow are outset-only box shadows, and the rim is a
    // 1px cool border, brightest along the top and left like light catching a
    // glass edge. Nothing translucent sits *under* the glass to grey it.
    return (
      <View
        testID={testID}
        style={[
          styles.smokeShell,
          { borderRadius: radius, boxShadow: SMOKE_SHADOW },
          style,
        ]}
      >
        <View style={[styles.smokeInner, { borderRadius: radius }]}>
          {layers}
          <View pointerEvents="none" style={[styles.smokeRim, { borderRadius: radius }]} />
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

/**
 * A restrained blue atmospheric glow plus a soft drop, both outset-only and
 * static, so nothing translucent sits under the glass and nothing animates.
 */
const SMOKE_SHADOW = "0px 0px 28px 8px rgba(70, 90, 220, 0.18), 0px 8px 24px rgba(0, 0, 0, 0.35)";

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  shell: {
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: "continuous",
  },
  smokeShell: {
    borderCurve: "continuous",
  },
  smokeRim: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderWidth: 1,
    borderCurve: "continuous",
    // A subtle cool edge, brightest along the top, not a white outline.
    borderColor: "rgba(170, 185, 255, 0.14)",
    borderTopColor: "rgba(220, 228, 255, 0.34)",
    borderLeftColor: "rgba(190, 205, 255, 0.22)",
  },
  specularLine: {
    position: "absolute",
    top: 1.5,
    height: 1,
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
