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

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  tabs?: PageHeaderTab[];
  rightElement?: ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  icon,
  activeTab,
  onTabChange,
  tabs,
  rightElement,
}: PageHeaderProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const handleTabPress = (tabId: string) => {
    if (tabId === activeTab) return;
    Haptics.selectionAsync().catch(() => undefined);
    onTabChange?.(tabId);
  };

  return (
    <View style={styles.container}>
      {/* Title & Icon Row */}
      <View style={styles.titleRow}>
        <View style={styles.titleLeft}>
          {icon ? (
            <View
              style={[
                styles.iconContainer,
                {
                  backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                  borderColor: theme.colors.border,
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
                { color: theme.colors.foreground, fontSize: theme.typography.xxl },
              ]}
              numberOfLines={1}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text
                style={[
                  styles.subtitleText,
                  { color: theme.colors.mutedForeground, fontSize: theme.typography.xs },
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

      {/* Tabs Bar */}
      {tabs && tabs.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[
            styles.tabsContainer,
            {
              backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
              borderColor: theme.colors.border,
            },
          ]}
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
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
    gap: 12,
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
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  titleTextContainer: {
    flex: 1,
    minWidth: 0,
  },
  titleText: {
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  subtitleText: {
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
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
    borderWidth: 1,
    gap: 4,
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
    letterSpacing: 0.2,
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
