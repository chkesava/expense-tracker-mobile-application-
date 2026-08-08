import React from "react";
import { View, StyleSheet } from "react-native";
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  RadialGradient,
  Stop,
  Circle as SvgCircle,
} from "react-native-svg";
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import {
  Receipt,
  Coins,
  Sparkles,
  Landmark,
  ShieldCheck,
  CreditCard,
  Target,
  BarChart3,
  TrendingUp,
  Users,
  Repeat,
  Plane,
  HandCoins,
  Sprout,
  FolderLock,
  Search,
  Wallet,
  CheckCircle2,
  Lock,
} from "lucide-react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export type EmptyIllustrationType =
  | "expenses"
  | "income"
  | "accounts"
  | "cards"
  | "budgets"
  | "analytics"
  | "splits"
  | "subscriptions"
  | "trips"
  | "collect"
  | "investments"
  | "vaults"
  | "search"
  | "general";

export interface EmptyStateIllustrationProps {
  type?: EmptyIllustrationType;
  size?: "normal" | "compact";
  customNode?: React.ReactNode;
}

export function EmptyStateIllustration({
  type = "general",
  size = "normal",
  customNode,
}: EmptyStateIllustrationProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const isCompact = size === "compact";
  const dim = isCompact ? 88 : 140;
  const iconSize = isCompact ? 28 : 42;
  const secondaryIconSize = isCompact ? 14 : 20;

  // Gentle floating animation for the secondary accent badge
  const floatOffset = useSharedValue(0);

  React.useEffect(() => {
    floatOffset.value = withRepeat(
      withSequence(
        withTiming(-4, { duration: 1600 }),
        withTiming(2, { duration: 1600 })
      ),
      -1,
      true
    );
  }, [floatOffset]);

  const floatingStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatOffset.value }],
  }));

  if (customNode) {
    return <View style={styles.customWrap}>{customNode}</View>;
  }

  // Domain-specific color palettes and icon pairings
  const config = getIllustrationConfig(type, theme.colors.primary);

  return (
    <Animated.View
      entering={FadeIn.duration(400)}
      style={[
        styles.container,
        {
          width: dim,
          height: dim,
        },
      ]}
      accessibilityRole="image"
    >
      {/* Luminous Background Glow using SVG */}
      <Svg width={dim} height={dim} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient
            id={`glowGrad_${type}`}
            cx="50%"
            cy="50%"
            rx="50%"
            ry="50%"
            fx="50%"
            fy="50%"
          >
            <Stop
              offset="0%"
              stopColor={config.accentColor}
              stopOpacity={isDark ? "0.22" : "0.14"}
            />
            <Stop
              offset="70%"
              stopColor={config.accentColor}
              stopOpacity={isDark ? "0.06" : "0.03"}
            />
            <Stop offset="100%" stopColor={config.accentColor} stopOpacity="0" />
          </RadialGradient>
          <SvgLinearGradient id={`badgeGrad_${type}`} x1="0" y1="0" x2="1" y2="1">
            <Stop
              offset="0%"
              stopColor={config.accentColor}
              stopOpacity={isDark ? "0.28" : "0.18"}
            />
            <Stop
              offset="100%"
              stopColor={config.accentColor}
              stopOpacity={isDark ? "0.12" : "0.06"}
            />
          </SvgLinearGradient>
        </Defs>

        {/* Ambient Glow Disk */}
        <SvgCircle cx={dim / 2} cy={dim / 2} r={dim / 2} fill={`url(#glowGrad_${type})`} />

        {/* Inner Subtle Radial Ring */}
        <SvgCircle
          cx={dim / 2}
          cy={dim / 2}
          r={dim * 0.38}
          stroke={config.accentColor}
          strokeOpacity={isDark ? "0.2" : "0.15"}
          strokeWidth={1.5}
          strokeDasharray="4 4"
          fill={`url(#badgeGrad_${type})`}
        />
      </Svg>

      {/* Main Core Center Circle */}
      <View
        style={[
          styles.mainBadge,
          {
            width: isCompact ? 52 : 78,
            height: isCompact ? 52 : 78,
            borderRadius: isCompact ? 26 : 39,
            backgroundColor: isDark
              ? "rgba(255, 255, 255, 0.07)"
              : "rgba(255, 255, 255, 0.95)",
            borderColor: config.accentColor + (isDark ? "50" : "30"),
            borderWidth: 1.5,
            shadowColor: config.accentColor,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: isDark ? 0.3 : 0.15,
            shadowRadius: 12,
            elevation: 4,
          },
        ]}
      >
        {config.renderMainIcon(iconSize, config.accentColor)}
      </View>

      {/* Floating Secondary Accent Badge */}
      <Animated.View
        style={[
          styles.floatingBadge,
          floatingStyle,
          {
            bottom: isCompact ? 4 : 8,
            right: isCompact ? 4 : 10,
            width: isCompact ? 26 : 36,
            height: isCompact ? 26 : 36,
            borderRadius: isCompact ? 13 : 18,
            backgroundColor: config.accentColor,
            borderColor: isDark ? "#1E293B" : "#FFFFFF",
            borderWidth: 2,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.2,
            shadowRadius: 5,
            elevation: 3,
          },
        ]}
      >
        {config.renderSecondaryIcon(secondaryIconSize, "#FFFFFF")}
      </Animated.View>
    </Animated.View>
  );
}

function getIllustrationConfig(
  type: EmptyIllustrationType,
  primaryColor: string
) {
  switch (type) {
    case "expenses":
      return {
        accentColor: primaryColor,
        renderMainIcon: (sz: number, clr: string) => (
          <Receipt size={sz} color={clr} strokeWidth={1.8} />
        ),
        renderSecondaryIcon: (sz: number, clr: string) => (
          <Coins size={sz} color={clr} />
        ),
      };
    case "income":
      return {
        accentColor: "#10B981", // Emerald green
        renderMainIcon: (sz: number, clr: string) => (
          <TrendingUp size={sz} color={clr} strokeWidth={2} />
        ),
        renderSecondaryIcon: (sz: number, clr: string) => (
          <Wallet size={sz} color={clr} />
        ),
      };
    case "accounts":
      return {
        accentColor: "#6366F1", // Indigo
        renderMainIcon: (sz: number, clr: string) => (
          <Landmark size={sz} color={clr} strokeWidth={1.8} />
        ),
        renderSecondaryIcon: (sz: number, clr: string) => (
          <ShieldCheck size={sz} color={clr} />
        ),
      };
    case "cards":
      return {
        accentColor: "#8B5CF6", // Purple
        renderMainIcon: (sz: number, clr: string) => (
          <CreditCard size={sz} color={clr} strokeWidth={1.8} />
        ),
        renderSecondaryIcon: (sz: number, clr: string) => (
          <Lock size={sz} color={clr} />
        ),
      };
    case "budgets":
      return {
        accentColor: "#F59E0B", // Amber
        renderMainIcon: (sz: number, clr: string) => (
          <Target size={sz} color={clr} strokeWidth={1.8} />
        ),
        renderSecondaryIcon: (sz: number, clr: string) => (
          <CheckCircle2 size={sz} color={clr} />
        ),
      };
    case "analytics":
      return {
        accentColor: "#3B82F6", // Blue
        renderMainIcon: (sz: number, clr: string) => (
          <BarChart3 size={sz} color={clr} strokeWidth={1.8} />
        ),
        renderSecondaryIcon: (sz: number, clr: string) => (
          <Sparkles size={sz} color={clr} />
        ),
      };
    case "splits":
      return {
        accentColor: "#EC4899", // Pink
        renderMainIcon: (sz: number, clr: string) => (
          <Users size={sz} color={clr} strokeWidth={1.8} />
        ),
        renderSecondaryIcon: (sz: number, clr: string) => (
          <Receipt size={sz} color={clr} />
        ),
      };
    case "subscriptions":
      return {
        accentColor: "#06B6D4", // Cyan
        renderMainIcon: (sz: number, clr: string) => (
          <Repeat size={sz} color={clr} strokeWidth={1.8} />
        ),
        renderSecondaryIcon: (sz: number, clr: string) => (
          <Sparkles size={sz} color={clr} />
        ),
      };
    case "trips":
      return {
        accentColor: "#F97316", // Orange
        renderMainIcon: (sz: number, clr: string) => (
          <Plane size={sz} color={clr} strokeWidth={1.8} />
        ),
        renderSecondaryIcon: (sz: number, clr: string) => (
          <Sparkles size={sz} color={clr} />
        ),
      };
    case "collect":
      return {
        accentColor: "#14B8A6", // Teal
        renderMainIcon: (sz: number, clr: string) => (
          <HandCoins size={sz} color={clr} strokeWidth={1.8} />
        ),
        renderSecondaryIcon: (sz: number, clr: string) => (
          <CheckCircle2 size={sz} color={clr} />
        ),
      };
    case "investments":
      return {
        accentColor: "#22C55E", // Green
        renderMainIcon: (sz: number, clr: string) => (
          <Sprout size={sz} color={clr} strokeWidth={1.8} />
        ),
        renderSecondaryIcon: (sz: number, clr: string) => (
          <TrendingUp size={sz} color={clr} />
        ),
      };
    case "vaults":
      return {
        accentColor: "#A855F7", // Purple
        renderMainIcon: (sz: number, clr: string) => (
          <FolderLock size={sz} color={clr} strokeWidth={1.8} />
        ),
        renderSecondaryIcon: (sz: number, clr: string) => (
          <Users size={sz} color={clr} />
        ),
      };
    case "search":
      return {
        accentColor: primaryColor,
        renderMainIcon: (sz: number, clr: string) => (
          <Search size={sz} color={clr} strokeWidth={1.8} />
        ),
        renderSecondaryIcon: (sz: number, clr: string) => (
          <Sparkles size={sz} color={clr} />
        ),
      };
    case "general":
    default:
      return {
        accentColor: primaryColor,
        renderMainIcon: (sz: number, clr: string) => (
          <Sparkles size={sz} color={clr} strokeWidth={1.8} />
        ),
        renderSecondaryIcon: (sz: number, clr: string) => (
          <Coins size={sz} color={clr} />
        ),
      };
  }
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  customWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  mainBadge: {
    alignItems: "center",
    justifyContent: "center",
  },
  floatingBadge: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
});
