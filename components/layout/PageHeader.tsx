import React, { type ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface PageHeaderTab {
  id: string;
  label: string;
  icon?: ReactNode;
  badge?: number | string;
}

export type PageHeaderTabVariant = "pill" | "underline";

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  tabs?: PageHeaderTab[];
  rightElement?: ReactNode;
  /** pill = raised segment control; underline = flat ledger-style tabs */
  tabVariant?: PageHeaderTabVariant;
}

export function PageHeader({
  title,
  subtitle,
  icon,
  activeTab,
  onTabChange,
  tabs,
  rightElement,
  tabVariant = "pill",
}: PageHeaderProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const isUnderline = tabVariant === "underline";
  const activeColor = theme.colors.success;

  const handleTabPress = (tabId: string) => {
    if (tabId === activeTab) return;
    Haptics.selectionAsync().catch(() => undefined);
    onTabChange?.(tabId);
  };

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <View style={styles.titleLeft}>
          {icon ? (
            <View
              style={[
                styles.iconContainer,
                {
                  backgroundColor: isDark
                    ? "rgba(52, 179, 122, 0.14)"
                    : "rgba(37, 150, 90, 0.1)",
                  borderColor: isDark
                    ? "rgba(52, 179, 122, 0.28)"
                    : "rgba(37, 150, 90, 0.18)",
                },
              ]}
            >
              {icon}
            </View>
          ) : null}

          <View style={styles.titleTextContainer}>
            <Text
              style={[
                styles.titleText,
                {
                  color: theme.colors.foreground,
                  fontFamily: theme.fontFamily.bold,
                },
              ]}
              numberOfLines={1}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text
                style={[
                  styles.subtitleText,
                  {
                    color: theme.colors.mutedForeground,
                    fontSize: theme.typography.xs,
                    fontFamily: theme.fontFamily.semibold,
                  },
                ]}
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>

        {rightElement ? <View style={styles.rightElement}>{rightElement}</View> : null}
      </View>

      {tabs && tabs.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={
            isUnderline
              ? styles.underlineTabsRow
              : [
                  styles.tabsContainer,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.04)"
                      : "rgba(0,0,0,0.03)",
                    borderColor: theme.colors.border,
                  },
                ]
          }
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            if (isUnderline) {
              return (
                <Pressable
                  key={tab.id}
                  onPress={() => handleTabPress(tab.id)}
                  android_ripple={{
                    color: isDark ? "rgba(52,179,122,0.16)" : "rgba(37,150,90,0.12)",
                    borderless: false,
                  }}
                  style={({ pressed }) => [
                    styles.underlineTab,
                    isActive && {
                      backgroundColor: isDark
                        ? "rgba(52, 179, 122, 0.16)"
                        : "rgba(37, 150, 90, 0.1)",
                    },
                    pressed && { opacity: 0.8 },
                  ]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                >
                  {tab.icon ? <View style={styles.tabIcon}>{tab.icon}</View> : null}
                  <Text
                    style={[
                      styles.tabLabel,
                      {
                        color: isActive ? activeColor : theme.colors.mutedForeground,
                        fontWeight: isActive ? "700" : "500",
                        fontSize: theme.typography.sm,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {tab.label}
                  </Text>
                  {tab.badge !== undefined ? (
                    <Text
                      style={{
                        color: isActive ? activeColor : theme.colors.mutedForeground,
                        fontSize: 12,
                        fontWeight: isActive ? "700" : "500",
                      }}
                    >
                      {tab.badge}
                    </Text>
                  ) : null}
                  {isActive ? (
                    <View
                      style={[styles.underlineIndicator, { backgroundColor: activeColor }]}
                    />
                  ) : (
                    <View style={styles.underlineIndicatorPlaceholder} />
                  )}
                </Pressable>
              );
            }

            return (
              <Pressable
                key={tab.id}
                onPress={() => handleTabPress(tab.id)}
                style={({ pressed }) => [
                  styles.tabItem,
                  isActive && [
                    styles.tabItemActive,
                    {
                      backgroundColor: theme.colors.card,
                      borderColor: theme.colors.border,
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: isDark ? 0.3 : 0.08,
                      shadowRadius: 4,
                      elevation: 2,
                    },
                  ],
                  pressed && { opacity: 0.8 },
                ]}
              >
                {tab.icon ? <View style={styles.tabIcon}>{tab.icon}</View> : null}
                <Text
                  style={[
                    styles.tabLabel,
                    {
                      color: isActive
                        ? theme.colors.foreground
                        : theme.colors.mutedForeground,
                      fontWeight: isActive ? "700" : "600",
                      fontSize: theme.typography.xs,
                    },
                  ]}
                >
                  {tab.label}
                </Text>
                {tab.badge !== undefined ? (
                  <View
                    style={[
                      styles.tabBadge,
                      {
                        backgroundColor: isActive
                          ? theme.colors.primary
                          : theme.colors.muted,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabBadgeText,
                        {
                          color: isActive
                            ? theme.colors.primaryForeground
                            : theme.colors.mutedForeground,
                        },
                      ]}
                    >
                      {tab.badge}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    gap: 14,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  titleTextContainer: {
    flex: 1,
    minWidth: 0,
  },
  titleText: {
    fontWeight: "800",
    letterSpacing: -0.5,
    fontSize: 24,
  },
  subtitleText: {
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1.4,
    marginTop: 2,
  },
  rightElement: {
    marginLeft: 8,
  },
  tabsContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 4,
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: 1,
    gap: 4,
  },
  underlineTabsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 4,
    paddingBottom: 2,
  },
  underlineTab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    minHeight: 44,
    borderRadius: 12,
    borderCurve: "continuous",
    gap: 6,
    position: "relative",
  },
  underlineIndicator: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 2,
    height: 3,
    borderRadius: 2,
  },
  underlineIndicatorPlaceholder: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 2,
    height: 2.5,
    opacity: 0,
  },
  tabItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 6,
  },
  tabItemActive: {
    borderWidth: 1,
  },
  tabIcon: {
    marginRight: 2,
  },
  tabLabel: {
    letterSpacing: 0.15,
  },
  tabBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 2,
  },
  tabBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
});
