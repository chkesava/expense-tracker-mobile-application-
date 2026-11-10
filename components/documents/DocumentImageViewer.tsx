import { useState, useCallback } from "react";
import {
  ActivityIndicator,
  LayoutChangeEvent,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { ZoomIn, ZoomOut, RefreshCw } from "lucide-react-native";

import { Button } from "@/components/ui/Button";

interface DocumentImageViewerProps {
  uri: string;
  name?: string;
  onLoadingChange?: (loading: boolean) => void;
}

export function DocumentImageViewer({
  uri,
  name,
  onLoadingChange,
}: DocumentImageViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const resetZoom = useCallback(() => {
    scale.value = withTiming(1, { duration: 200 });
    savedScale.value = 1;
    translateX.value = withTiming(0, { duration: 200 });
    translateY.value = withTiming(0, { duration: 200 });
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [scale, savedScale, translateX, translateY, savedTranslateX, savedTranslateY]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setContainerSize({ width, height });
  };

  // Pinch to zoom
  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(0.8, Math.min(savedScale.value * e.scale, 6));
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withSpring(1);
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else if (scale.value > 5) {
        scale.value = withSpring(5);
        savedScale.value = 5;
      } else {
        savedScale.value = scale.value;
      }
    });

  // Pan when zoomed in
  const panGesture = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((e) => {
      if (scale.value > 1.05) {
        const maxDx = (containerSize.width * (scale.value - 1)) / 2 + 50;
        const maxDy = (containerSize.height * (scale.value - 1)) / 2 + 50;
        const nextX = savedTranslateX.value + e.translationX;
        const nextY = savedTranslateY.value + e.translationY;
        translateX.value = Math.max(-maxDx, Math.min(maxDx, nextX));
        translateY.value = Math.max(-maxDy, Math.min(maxDy, nextY));
      }
    })
    .onEnd(() => {
      if (scale.value <= 1.05) {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        const maxDx = (containerSize.width * (scale.value - 1)) / 2;
        const maxDy = (containerSize.height * (scale.value - 1)) / 2;
        if (Math.abs(translateX.value) > maxDx) {
          translateX.value = withSpring(Math.sign(translateX.value) * maxDx);
        }
        if (Math.abs(translateY.value) > maxDy) {
          translateY.value = withSpring(Math.sign(translateY.value) * maxDy);
        }
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
      }
    });

  // Double tap to toggle zoom between 1x and 2.5x
  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1.2) {
        scale.value = withTiming(1, { duration: 250 });
        translateX.value = withTiming(0, { duration: 250 });
        translateY.value = withTiming(0, { duration: 250 });
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withTiming(2.5, { duration: 250 });
        savedScale.value = 2.5;
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const composedGestures = Gesture.Simultaneous(
    doubleTapGesture,
    Gesture.Simultaneous(pinchGesture, panGesture)
  );

  return (
    <View style={styles.container} onLayout={onLayout}>
      <GestureDetector gesture={composedGestures}>
        <Animated.View style={[styles.imageWrapper, animatedStyle]}>
          <Image
            source={{ uri }}
            style={styles.image}
            contentFit="contain"
            accessibilityLabel={name || "Uploaded document photo"}
            accessible
            onLoadStart={() => {
              setLoading(true);
              onLoadingChange?.(true);
            }}
            onLoad={() => {
              setLoading(false);
              onLoadingChange?.(false);
            }}
            onError={() => {
              setLoading(false);
              setError(true);
              onLoadingChange?.(false);
            }}
          />
        </Animated.View>
      </GestureDetector>

      {loading && !error && (
        <View style={styles.centerOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.loadingText}>Loading image…</Text>
        </View>
      )}

      {error && (
        <View style={styles.centerOverlay}>
          <Text style={styles.errorText}>Could not display this image.</Text>
        </View>
      )}

      {/* Desktop / Web zoom controls */}
      {Platform.OS === "web" && !loading && !error && (
        <View style={styles.webControls}>
          <Button
            size="sm"
            variant="ghost"
            style={styles.webControlBtn}
            onPress={() => {
              scale.value = withTiming(Math.min(5, scale.value * 1.3), { duration: 200 });
              savedScale.value = Math.min(5, scale.value * 1.3);
            }}
            accessibilityLabel="Zoom in"
          >
            <ZoomIn size={18} color="#ffffff" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            style={styles.webControlBtn}
            onPress={() => {
              const next = Math.max(1, scale.value / 1.3);
              scale.value = withTiming(next, { duration: 200 });
              savedScale.value = next;
              if (next <= 1) {
                translateX.value = withTiming(0, { duration: 200 });
                translateY.value = withTiming(0, { duration: 200 });
                savedTranslateX.value = 0;
                savedTranslateY.value = 0;
              }
            }}
            accessibilityLabel="Zoom out"
          >
            <ZoomOut size={18} color="#ffffff" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            style={styles.webControlBtn}
            onPress={resetZoom}
            accessibilityLabel="Reset zoom"
          >
            <RefreshCw size={18} color="#ffffff" />
          </Button>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: "100%",
  },
  imageWrapper: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  centerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    gap: 12,
  },
  loadingText: {
    color: "#ffffff",
    fontSize: 14,
  },
  errorText: {
    color: "#f87171",
    fontSize: 14,
  },
  webControls: {
    position: "absolute",
    bottom: 24,
    flexDirection: "row",
    gap: 8,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
  },
  webControlBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 16,
  },
});
