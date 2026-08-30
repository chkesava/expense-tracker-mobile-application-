import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Image,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { ProductSplashOverlayProps } from "@/components/splash/types";

import {
  BellsLayer,
  DiyaLayer,
  LightRaysLayer,
  MandalaLayer,
  Petal,
  ToranLayer,
} from "./GaneshSplashLayers";
import {
  GANESH_SPLASH,
  GANESH_SPLASH_FADE_MS,
  GANESH_SPLASH_MAROON,
  GANESH_SPLASH_MIN_MS,
  GANESH_SPLASH_REDUCED_MIN_MS,
} from "./ganeshSplashTheme";

const EMBLEM = require("../../../assets/branding/ganesh-splash/ganesh-emblem.webp");

const TITLE_FONT = Platform.select({
  ios: "Georgia",
  android: "serif",
  default: "Georgia",
});

const PETALS = [
  { left: "16%", color: GANESH_SPLASH.petal },
  { left: "28%", color: GANESH_SPLASH.goldSoft },
  { left: "48%", color: GANESH_SPLASH.saffron },
  { left: "62%", color: GANESH_SPLASH.petal },
  { left: "78%", color: GANESH_SPLASH.goldSoft },
] as const;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (!cancelled) setReduced(value);
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  return reduced;
}

export function ProductSplashOverlay({
  onAnimationComplete,
  isReady = false,
  onFirstFrame,
}: ProductSplashOverlayProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reducedMotion = usePrefersReducedMotion();
  const startedAt = useRef(Date.now());
  const reportedFrame = useRef(false);
  const exiting = useRef(false);

  const shortSide = Math.min(width, height);
  const emblemSize = Math.max(160, Math.min(280, shortSide * 0.46));
  const mandalaSize = Math.min(width * 0.92, height * 0.62, 420);

  const containerOpacity = useSharedValue(1);
  const mandalaOpacity = useSharedValue(0);
  const glowOpacity = useSharedValue(0);
  const emblemOpacity = useSharedValue(0);
  const emblemScale = useSharedValue(0.94);
  const decorOpacity = useSharedValue(0);
  const bellRotate = useSharedValue(0);
  const titleOpacity = useSharedValue(0);
  const taglineOpacity = useSharedValue(0);
  const loaderOpacity = useSharedValue(0);
  const diyaGlow = useSharedValue(0.35);
  const petalY = useSharedValue(0);
  const petalFade = useSharedValue(0);
  const mandalaRotate = useSharedValue(0);

  const finish = () => {
    if (exiting.current) return;
    exiting.current = true;
    containerOpacity.set(
      withTiming(0, { duration: GANESH_SPLASH_FADE_MS, easing: Easing.out(Easing.cubic) }, (done) => {
        if (done) runOnJS(onAnimationComplete)();
      })
    );
  };

  useEffect(() => {
    if (reducedMotion) {
      mandalaOpacity.set(1);
      glowOpacity.set(0.45);
      emblemOpacity.set(1);
      emblemScale.set(1);
      decorOpacity.set(1);
      titleOpacity.set(1);
      taglineOpacity.set(1);
      loaderOpacity.set(1);
      diyaGlow.set(0.55);
      petalFade.set(0);
      return;
    }

    const ease = Easing.out(Easing.cubic);
    glowOpacity.set(withTiming(0.5, { duration: 420, easing: ease }));
    mandalaOpacity.set(withTiming(1, { duration: 560, easing: ease }));
    mandalaRotate.set(withRepeat(withTiming(360, { duration: 80_000, easing: Easing.linear }), -1, false));

    emblemOpacity.set(withDelay(160, withTiming(1, { duration: 520, easing: ease })));
    emblemScale.set(withDelay(160, withTiming(1, { duration: 640, easing: ease })));

    decorOpacity.set(withDelay(280, withTiming(1, { duration: 480, easing: ease })));
    bellRotate.set(
      withDelay(
        400,
        withRepeat(withTiming(2.4, { duration: 2200, easing: Easing.inOut(Easing.sin) }), -1, true)
      )
    );

    titleOpacity.set(withDelay(380, withTiming(1, { duration: 420, easing: ease })));
    taglineOpacity.set(withDelay(500, withTiming(1, { duration: 420, easing: ease })));
    loaderOpacity.set(withDelay(520, withTiming(1, { duration: 280, easing: ease })));

    diyaGlow.set(withRepeat(withTiming(0.85, { duration: 1400, easing: Easing.inOut(Easing.sin) }), -1, true));
    petalFade.set(withDelay(360, withTiming(0.7, { duration: 500, easing: ease })));
    petalY.set(withRepeat(withTiming(18, { duration: 4200, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [
    reducedMotion,
    mandalaOpacity,
    glowOpacity,
    emblemOpacity,
    emblemScale,
    decorOpacity,
    bellRotate,
    titleOpacity,
    taglineOpacity,
    loaderOpacity,
    diyaGlow,
    petalFade,
    petalY,
    mandalaRotate,
  ]);

  useEffect(() => {
    if (!isReady) return;
    loaderOpacity.set(withTiming(0, { duration: 180 }));
    const minMs = reducedMotion ? GANESH_SPLASH_REDUCED_MIN_MS : GANESH_SPLASH_MIN_MS;
    const wait = Math.max(0, minMs - (Date.now() - startedAt.current));
    const timer = setTimeout(finish, wait);
    return () => clearTimeout(timer);
    // finish closes over the latest onAnimationComplete via runOnJS
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, reducedMotion, loaderOpacity]);

  const onLayout = () => {
    if (reportedFrame.current) return;
    reportedFrame.current = true;
    onFirstFrame?.();
  };

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.get(),
  }));
  const mandalaStyle = useAnimatedStyle(() => ({
    opacity: mandalaOpacity.get(),
    transform: [{ rotate: `${mandalaRotate.get()}deg` }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.get(),
  }));
  const emblemStyle = useAnimatedStyle(() => ({
    opacity: emblemOpacity.get(),
    transform: [{ scale: emblemScale.get() }],
  }));
  const decorStyle = useAnimatedStyle(() => ({
    opacity: decorOpacity.get(),
  }));
  const bellsStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${bellRotate.get()}deg` }],
  }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.get(),
  }));
  const taglineStyle = useAnimatedStyle(() => ({
    opacity: taglineOpacity.get(),
  }));
  const loaderStyle = useAnimatedStyle(() => ({
    opacity: loaderOpacity.get(),
  }));
  const diyaStyle = useAnimatedStyle(() => ({
    opacity: diyaGlow.get(),
  }));
  const petalStyle = useAnimatedStyle(() => ({
    opacity: petalFade.get(),
    transform: [{ translateY: petalY.get() }],
  }));

  return (
    <Animated.View
      style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }, containerStyle]}
      onLayout={onLayout}
    >
      <View style={styles.bg} />

      <Animated.View style={[styles.glow, { width: emblemSize * 1.55, height: emblemSize * 1.55 }, glowStyle]} />

      <Animated.View style={[styles.mandala, mandalaStyle]} pointerEvents="none">
        <MandalaLayer size={mandalaSize} />
      </Animated.View>

      <Animated.View style={[styles.rays, mandalaStyle]} pointerEvents="none">
        <LightRaysLayer size={mandalaSize * 0.72} />
      </Animated.View>

      <Animated.View style={[styles.toran, { top: insets.top + 8 }, decorStyle]} pointerEvents="none">
        <ToranLayer width={Math.min(width - 24, 420)} />
      </Animated.View>

      <Animated.View
        style={[styles.bells, { top: insets.top + 28, width: Math.min(width - 12, 400) }, decorStyle, bellsStyle]}
        pointerEvents="none"
      >
        <BellsLayer width={Math.min(width - 12, 400)} />
      </Animated.View>

      {reducedMotion ? null : (
        <Animated.View style={[styles.petals, petalStyle]} pointerEvents="none">
          {PETALS.map((petal) => (
            <View key={petal.left} style={[styles.petalSlot, { left: petal.left as `${number}%` }]}>
              <Petal color={petal.color} />
            </View>
          ))}
        </Animated.View>
      )}

      <View style={styles.center}>
        <Animated.View style={emblemStyle}>
          <Image source={EMBLEM} style={{ width: emblemSize, height: emblemSize }} resizeMode="contain" />
        </Animated.View>

        <Animated.Text style={[styles.title, titleStyle]}>Ganesh Seva</Animated.Text>
        <Animated.Text style={[styles.tagline, taglineStyle]}>Seva. Sangathan. Samruddhi.</Animated.Text>

        <Animated.View style={[styles.loader, loaderStyle]}>
          <View style={styles.dot} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </Animated.View>
      </View>

      <Animated.View style={[styles.diya, { bottom: Math.max(insets.bottom, 16) + 8 }, diyaStyle]}>
        <DiyaLayer size={48} />
      </Animated.View>
    </Animated.View>
  );
}

export { ProductSplashOverlay as GaneshSplashOverlay };

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 99999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GANESH_SPLASH_MAROON,
  },
  bg: {
    ...StyleSheet.absoluteFill,
    backgroundColor: GANESH_SPLASH_MAROON,
  },
  glow: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: GANESH_SPLASH.goldSoft,
  },
  mandala: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  rays: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  toran: {
    position: "absolute",
    alignSelf: "center",
  },
  bells: {
    position: "absolute",
  },
  petals: {
    ...StyleSheet.absoluteFill,
  },
  petalSlot: {
    position: "absolute",
    top: "22%",
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
    maxWidth: 420,
    width: "100%",
  },
  title: {
    fontFamily: TITLE_FONT,
    fontSize: 34,
    fontWeight: "600",
    color: GANESH_SPLASH.ivory,
    letterSpacing: 0.4,
    textAlign: "center",
  },
  tagline: {
    fontSize: 13,
    letterSpacing: 1.4,
    color: GANESH_SPLASH.gold,
    textAlign: "center",
    textTransform: "none",
  },
  loader: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    height: 10,
    alignItems: "center",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: GANESH_SPLASH.gold,
  },
  diya: {
    position: "absolute",
    alignSelf: "center",
  },
});
