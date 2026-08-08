/**
 * OfflineBanner — animated top banner showing network and sync state.
 *
 * Three states:
 *  - Offline  → red pill: "No Internet Connection" + pending count
 *  - Syncing  → amber pill with spinner: "Syncing N changes…"
 *  - Synced   → green pill: "Back Online — All Synced!" (auto-dismisses)
 */

import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WifiOff, RefreshCw, CheckCircle } from "lucide-react-native";

import { haptic } from "@/lib/haptics";
import { useGlobalPendingSyncCount } from "@/lib/syncStatusStore";
import { useNetwork } from "@/providers/NetworkProvider";
import { useTheme } from "@/theme/ThemeProvider";

type BannerState = "hidden" | "offline" | "syncing" | "synced";

const SPRING_CONFIG = { damping: 20, stiffness: 260, mass: 0.8 };
const SYNCED_DISMISS_DELAY = 2500;
const HIDDEN_Y = -80;

export function OfflineBanner() {
  const { isOnline, wasOffline, retryNow, clearWasOffline } = useNetwork();
  const pendingSyncCount = useGlobalPendingSyncCount();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const translateY = useSharedValue(HIDDEN_Y);
  const opacity = useSharedValue(0);

  const visibleState = useBannerState(
    isOnline,
    wasOffline,
    pendingSyncCount,
    clearWasOffline
  );

  useEffect(() => {
    if (visibleState === "hidden") {
      translateY.set(withTiming(HIDDEN_Y, { duration: 300 }));
      opacity.set(withTiming(0, { duration: 250 }));
    } else {
      translateY.set(withSpring(0, SPRING_CONFIG));
      opacity.set(withTiming(1, { duration: 200 }));
    }
  }, [visibleState, translateY, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.get() }],
    opacity: opacity.get(),
  }));

  const colors = getBannerColors(visibleState, theme);
  const label = getBannerLabel(visibleState, pendingSyncCount);
  const isInteractive = visibleState === "offline";

  return (
    <Animated.View
      style={[styles.wrapper, { top: insets.top + 8 }, animatedStyle]}
      pointerEvents={visibleState === "hidden" ? "none" : "box-none"}
    >
      <Pressable
        onPress={() => {
          if (!isInteractive) return;
          void haptic.selection();
          retryNow();
        }}
        style={[
          styles.pill,
          {
            backgroundColor: colors.background,
            borderColor: colors.border,
            shadowColor: colors.background,
          },
        ]}
        accessibilityRole="alert"
        accessibilityLabel={label || "Network status"}
        accessibilityElementsHidden={visibleState === "hidden"}
        importantForAccessibility={
          visibleState === "hidden" ? "no-hide-descendants" : "yes"
        }
      >
        <BannerIcon state={visibleState} color={colors.icon} />
        {label ? (
          <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
        ) : null}
        {visibleState === "offline" && pendingSyncCount > 0 ? (
          <View style={[styles.badge, { backgroundColor: colors.badgeBg }]}>
            <Text style={[styles.badgeText, { color: colors.badgeText }]}>
              {pendingSyncCount}
            </Text>
          </View>
        ) : null}
        {visibleState === "syncing" ? (
          <ActivityIndicator
            size="small"
            color={colors.icon}
            style={styles.spinner}
          />
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

function BannerIcon({ state, color }: { state: BannerState; color: string }) {
  if (state === "offline") return <WifiOff size={14} color={color} />;
  if (state === "synced") return <CheckCircle size={14} color={color} />;
  if (state === "syncing") return <RefreshCw size={14} color={color} />;
  return null;
}

function useBannerState(
  isOnline: boolean,
  wasOffline: boolean,
  pendingSyncCount: number,
  clearWasOffline: () => void
): BannerState {
  const [state, setState] = useState<BannerState>("hidden");
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }

    if (!isOnline) {
      setState("offline");
      return;
    }

    if (wasOffline) {
      if (pendingSyncCount > 0) {
        setState("syncing");
        return;
      }

      setState("synced");
      dismissTimerRef.current = setTimeout(() => {
        setState("hidden");
        clearWasOffline();
      }, SYNCED_DISMISS_DELAY);
      return () => {
        if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      };
    }

    setState("hidden");
  }, [isOnline, wasOffline, pendingSyncCount, clearWasOffline]);

  return state;
}

function getBannerColors(
  state: BannerState,
  theme: ReturnType<typeof useTheme>["theme"]
) {
  switch (state) {
    case "offline":
      return {
        background: "#1F1315",
        border: "#EF4444",
        text: "#FCA5A5",
        icon: "#EF4444",
        badgeBg: "#EF4444",
        badgeText: "#FFFFFF",
      };
    case "syncing":
      return {
        background: "#1C1A0F",
        border: "#F59E0B",
        text: "#FCD34D",
        icon: "#F59E0B",
        badgeBg: "#F59E0B",
        badgeText: "#1C1A0F",
      };
    case "synced":
      return {
        background: "#0F1F17",
        border: "#22C55E",
        text: "#86EFAC",
        icon: "#22C55E",
        badgeBg: "#22C55E",
        badgeText: "#0F1F17",
      };
    default:
      return {
        background: theme.colors.card,
        border: theme.colors.border,
        text: theme.colors.foreground,
        icon: theme.colors.foreground,
        badgeBg: theme.colors.muted,
        badgeText: theme.colors.mutedForeground,
      };
  }
}

function getBannerLabel(state: BannerState, pendingSyncCount: number): string {
  switch (state) {
    case "offline":
      return "No Internet Connection";
    case "syncing":
      return pendingSyncCount === 1
        ? "Syncing 1 change…"
        : `Syncing ${pendingSyncCount} changes…`;
    case "synced":
      return "Back Online — All Synced!";
    default:
      return "";
  }
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 9999,
    alignItems: "center",
    pointerEvents: "box-none",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderCurve: "continuous",
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderCurve: "continuous",
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  spinner: {
    marginLeft: 2,
  },
});
