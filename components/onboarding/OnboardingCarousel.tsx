import React, { useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import {
  BarChart3,
  ChevronRight,
  Lock,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react-native";

import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export const FIRST_LAUNCH_KEY = "@vault_has_launched_before";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface OnboardingSlide {
  id: string;
  badge: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
  accentColor: string;
  glowColor: string;
}

const ONBOARDING_SLIDES: OnboardingSlide[] = [
  {
    id: "tracking",
    badge: "SMART LEDGER",
    title: "Track Every Rupee with Zero Friction",
    description:
      "Automated multi-account tracking, intelligent spending categories, and instant receipt scans.",
    icon: Wallet,
    accentColor: "#6366F1",
    glowColor: "rgba(99, 102, 241, 0.25)",
  },
  {
    id: "vaults",
    badge: "SHARED SPACES",
    title: "Budget Together, Split Seamlessly",
    description:
      "Create shared family vaults, track group trip expenses, and settle balances in one tap.",
    icon: Users,
    accentColor: "#10B981",
    glowColor: "rgba(16, 185, 129, 0.25)",
  },
  {
    id: "insights",
    badge: "PROACTIVE INTELLIGENCE",
    title: "Forecasts & Smart Alerts",
    description:
      "Real-time burn rates, upcoming subscription renewals, and category budget warnings.",
    icon: Sparkles,
    accentColor: "#EC4899",
    glowColor: "rgba(236, 72, 153, 0.25)",
  },
  {
    id: "security",
    badge: "BANK-GRADE PRIVACY",
    title: "Your Data, Fully Protected",
    description:
      "Biometric authentication, stealth ghost mode, and encrypted offline storage.",
    icon: ShieldCheck,
    accentColor: "#F59E0B",
    glowColor: "rgba(245, 158, 11, 0.25)",
  },
];

export function OnboardingCarousel() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const slideIndex = Math.round(
      event.nativeEvent.contentOffset.x / SCREEN_WIDTH
    );
    if (slideIndex !== activeIndex && slideIndex >= 0 && slideIndex < ONBOARDING_SLIDES.length) {
      setActiveIndex(slideIndex);
      Haptics.selectionAsync().catch(() => undefined);
    }
  };

  const handleComplete = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    await AsyncStorage.setItem(FIRST_LAUNCH_KEY, "true").catch(() => undefined);
    router.replace("/(auth)/login" as any);
  };

  const handleNext = () => {
    if (activeIndex < ONBOARDING_SLIDES.length - 1) {
      Haptics.selectionAsync().catch(() => undefined);
      flatListRef.current?.scrollToIndex({
        index: activeIndex + 1,
        animated: true,
      });
    } else {
      handleComplete();
    }
  };

  const currentSlide = ONBOARDING_SLIDES[activeIndex] || ONBOARDING_SLIDES[0];

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isDark ? "#0A0D18" : "#F8FAFC",
          paddingTop: insets.top + 8,
          paddingBottom: Math.max(insets.bottom, 16),
        },
      ]}
    >
      {/* Top Header Row (Brand + Skip Button) */}
      <View style={styles.topHeader}>
        <View style={styles.brandRow}>
          <View
            style={[
              styles.brandDot,
              { backgroundColor: currentSlide.accentColor },
            ]}
          />
          <Text
            style={[
              styles.brandText,
              { color: isDark ? "#FFFFFF" : "#0F172A" },
            ]}
          >
            VAULT
          </Text>
        </View>

        <Pressable
          onPress={handleComplete}
          style={({ pressed }) => [
            styles.skipButton,
            {
              backgroundColor: isDark
                ? "rgba(255,255,255,0.06)"
                : "rgba(0,0,0,0.04)",
            },
            pressed && { opacity: 0.7 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Skip onboarding"
        >
          <Text
            style={[
              styles.skipText,
              { color: isDark ? "#94A3B8" : "#64748B" },
            ]}
          >
            Skip
          </Text>
        </Pressable>
      </View>

      {/* Slide Carousel */}
      <FlatList
        ref={flatListRef}
        data={ONBOARDING_SLIDES}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        renderItem={({ item }) => {
          const Icon = item.icon;
          return (
            <View style={styles.slide}>
              {/* Visual Card Hero */}
              <View style={styles.heroContainer}>
                {/* Glow ring */}
                <View
                  style={[
                    styles.heroGlow,
                    { backgroundColor: item.glowColor },
                  ]}
                />

                <View
                  style={[
                    styles.iconCircle,
                    {
                      backgroundColor: isDark
                        ? "rgba(15, 23, 42, 0.85)"
                        : "#FFFFFF",
                      borderColor: item.accentColor,
                      shadowColor: item.accentColor,
                    },
                  ]}
                >
                  <Icon size={44} color={item.accentColor} strokeWidth={2.2} />
                </View>
              </View>

              {/* Text Info */}
              <View style={styles.textContent}>
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor: isDark
                        ? "rgba(255,255,255,0.06)"
                        : "rgba(0,0,0,0.04)",
                      borderColor: item.accentColor + "40",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      { color: item.accentColor },
                    ]}
                  >
                    {item.badge}
                  </Text>
                </View>

                <Text
                  style={[
                    styles.title,
                    { color: isDark ? "#FFFFFF" : "#0F172A" },
                  ]}
                >
                  {item.title}
                </Text>

                <Text
                  style={[
                    styles.description,
                    { color: isDark ? "#94A3B8" : "#64748B" },
                  ]}
                >
                  {item.description}
                </Text>
              </View>
            </View>
          );
        }}
      />

      {/* Bottom Controls */}
      <View style={styles.bottomControls}>
        {/* Pagination Pill Dots */}
        <View style={styles.paginationRow}>
          {ONBOARDING_SLIDES.map((slide, index) => {
            const isActive = index === activeIndex;
            return (
              <View
                key={slide.id}
                style={[
                  styles.dot,
                  isActive
                    ? [
                        styles.dotActive,
                        { backgroundColor: currentSlide.accentColor },
                      ]
                    : {
                        backgroundColor: isDark
                          ? "rgba(255,255,255,0.15)"
                          : "rgba(0,0,0,0.12)",
                      },
                ]}
              />
            );
          })}
        </View>

        {/* Action Button */}
        <Pressable
          onPress={handleNext}
          style={({ pressed }) => [
            styles.actionButton,
            {
              backgroundColor: currentSlide.accentColor,
              shadowColor: currentSlide.accentColor,
            },
            pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] },
          ]}
          accessibilityRole="button"
          accessibilityLabel={
            activeIndex === ONBOARDING_SLIDES.length - 1
              ? "Get Started"
              : "Continue"
          }
        >
          <Text style={styles.actionButtonText}>
            {activeIndex === ONBOARDING_SLIDES.length - 1
              ? "Get Started"
              : "Continue"}
          </Text>
          <ChevronRight size={18} color="#FFFFFF" strokeWidth={2.6} />
        </Pressable>

        {/* Already have an account link */}
        <Pressable
          onPress={handleComplete}
          style={styles.signInLink}
          accessibilityRole="button"
        >
          <Text
            style={[
              styles.signInText,
              { color: isDark ? "#94A3B8" : "#64748B" },
            ]}
          >
            Already have an account?{" "}
            <Text
              style={[
                styles.signInHighlight,
                { color: currentSlide.accentColor },
              ]}
            >
              Sign In
            </Text>
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export default OnboardingCarousel;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "space-between",
  },
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  brandDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  brandText: {
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 2,
  },
  skipButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
  },
  skipText: {
    fontSize: 13,
    fontWeight: "700",
  },
  slide: {
    width: SCREEN_WIDTH,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  heroContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 40,
    marginTop: 20,
  },
  heroGlow: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
  },
  iconCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
  },
  textContent: {
    alignItems: "center",
    gap: 12,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 26,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  description: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 12,
  },
  bottomControls: {
    paddingHorizontal: 24,
    gap: 16,
    alignItems: "center",
  },
  paginationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 24,
    borderRadius: 6,
  },
  actionButton: {
    width: "100%",
    height: 52,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    elevation: 6,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  actionButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  signInLink: {
    paddingVertical: 6,
  },
  signInText: {
    fontSize: 13,
    fontWeight: "600",
  },
  signInHighlight: {
    fontWeight: "800",
  },
});
