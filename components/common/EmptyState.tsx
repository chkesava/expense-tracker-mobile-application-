import React, { type ReactNode } from "react";
import { View, Text, StyleSheet, StyleProp, ViewStyle, Pressable } from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { Lightbulb, Sparkles } from "lucide-react-native";

import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { Button } from "@/components/ui/Button";
import {
  EmptyStateIllustration,
  type EmptyIllustrationType,
} from "./EmptyStateIllustration";
import { haptic } from "@/lib/haptics";

export type EmptyActionConfig = {
  label: string;
  icon?: ReactNode;
  onPress: () => void;
  loading?: boolean;
};

export type EmptyStateProps = {
  illustration?: EmptyIllustrationType;
  icon?: ReactNode;
  emoji?: string;
  title: string;
  description?: string;
  primaryAction?: EmptyActionConfig | ReactNode;
  secondaryAction?: EmptyActionConfig | ReactNode;
  action?: ReactNode; // Legacy support
  tip?: string;
  tips?: string[];
  compact?: boolean;
  animated?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function EmptyState({
  illustration,
  icon,
  emoji,
  title,
  description,
  primaryAction,
  secondaryAction,
  action,
  tip,
  tips,
  compact = false,
  animated = true,
  style,
}: EmptyStateProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const Container = animated ? Animated.View : View;
  const containerProps = animated ? { entering: FadeInDown.duration(400) } : {};

  // Resolve actions
  const finalPrimary = primaryAction || action;
  const activeTips = tips || (tip ? [tip] : []);

  // Helper to render action item (either config or ReactNode)
  const renderAction = (
    act: EmptyActionConfig | ReactNode,
    variant: "primary" | "outline" | "ghost" | "tonal" = "primary"
  ) => {
    if (!act) return null;
    if (React.isValidElement(act)) return act;

    const config = act as EmptyActionConfig;
    return (
      <Button
        variant={variant}
        size={compact ? "sm" : "md"}
        loading={config.loading}
        onPress={() => {
          haptic.selection().catch(() => undefined);
          config.onPress();
        }}
        style={compact ? styles.compactBtn : styles.actionBtn}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {config.icon}
          <Text
            style={[
              styles.btnText,
              {
                color:
                  variant === "primary"
                    ? "#FFFFFF"
                    : theme.colors.primary,
                fontWeight: "700",
                fontSize: compact ? 13 : 15,
              },
            ]}
          >
            {config.label}
          </Text>
        </View>
      </Button>
    );
  };

  return (
    <Container
      style={[
        styles.wrap,
        compact ? styles.compactWrap : styles.standardWrap,
        style,
      ]}
      accessibilityRole="summary"
      {...(containerProps as any)}
    >
      {/* Visual Illustration / Icon */}
      {illustration ? (
        <View style={compact ? styles.compactVisual : styles.standardVisual}>
          <EmptyStateIllustration
            type={illustration}
            size={compact ? "compact" : "normal"}
          />
        </View>
      ) : emoji ? (
        <Text style={[styles.emojiText, compact && { fontSize: 32 }]}>
          {emoji}
        </Text>
      ) : icon ? (
        <View style={compact ? styles.compactIcon : styles.standardIcon}>
          {icon}
        </View>
      ) : (
        <View style={compact ? styles.compactVisual : styles.standardVisual}>
          <EmptyStateIllustration
            type="general"
            size={compact ? "compact" : "normal"}
          />
        </View>
      )}

      {/* Friendly Heading */}
      <Text
        style={[
          styles.title,
          {
            color: theme.colors.foreground,
            fontSize: compact ? 15 : 18,
            marginTop: compact ? 4 : 8,
          },
        ]}
      >
        {title}
      </Text>

      {/* Friendly Description / Subtitle */}
      {description ? (
        <Text
          style={[
            styles.description,
            {
              color: theme.colors.mutedForeground,
              fontSize: compact ? 12 : 14,
              lineHeight: compact ? 17 : 21,
            },
          ]}
        >
          {description}
        </Text>
      ) : null}

      {/* Action Buttons */}
      {(finalPrimary || secondaryAction) && (
        <View
          style={[
            styles.actionsContainer,
            compact ? styles.compactActions : styles.standardActions,
          ]}
        >
          {finalPrimary && (
            <View style={styles.actionSlot}>
              {renderAction(finalPrimary, "primary")}
            </View>
          )}

          {secondaryAction && (
            <View style={styles.actionSlot}>
              {renderAction(secondaryAction, "outline")}
            </View>
          )}
        </View>
      )}

      {/* Pro Financial Tips Box */}
      {activeTips.length > 0 && (
        <Animated.View
          entering={animated ? FadeInUp.delay(150).duration(400) : undefined}
          style={[
            styles.tipCard,
            compact ? styles.compactTipCard : styles.standardTipCard,
            {
              backgroundColor: isDark
                ? "rgba(255, 255, 255, 0.04)"
                : "rgba(0, 0, 0, 0.03)",
              borderColor: isDark
                ? "rgba(255, 255, 255, 0.08)"
                : "rgba(0, 0, 0, 0.06)",
            },
          ]}
        >
          <View style={styles.tipHeaderRow}>
            <Lightbulb size={compact ? 13 : 15} color="#F59E0B" />
            <Text
              style={[
                styles.tipTitle,
                {
                  color: isDark ? "#FDE68A" : "#B45309",
                  fontSize: compact ? 11 : 12,
                },
              ]}
            >
              Pro Tip
            </Text>
          </View>
          {activeTips.map((t, idx) => (
            <Text
              key={idx}
              style={[
                styles.tipText,
                {
                  color: theme.colors.mutedForeground,
                  fontSize: compact ? 11 : 13,
                  lineHeight: compact ? 16 : 18,
                },
              ]}
            >
              {t}
            </Text>
          ))}
        </Animated.View>
      )}
    </Container>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  standardWrap: {
    paddingVertical: 24,
    paddingHorizontal: 20,
    gap: 10,
  },
  compactWrap: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    gap: 6,
  },
  standardVisual: {
    marginBottom: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  compactVisual: {
    marginBottom: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  standardIcon: {
    marginBottom: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  compactIcon: {
    marginBottom: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  emojiText: {
    fontSize: 48,
    textAlign: "center",
    marginBottom: 8,
  },
  title: {
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: -0.2,
  },
  description: {
    textAlign: "center",
    maxWidth: 320,
  },
  actionsContainer: {
    width: "100%",
    maxWidth: 320,
    alignItems: "center",
  },
  standardActions: {
    marginTop: 14,
    gap: 10,
  },
  compactActions: {
    marginTop: 8,
    gap: 6,
    flexDirection: "row",
    justifyContent: "center",
  },
  actionSlot: {
    width: "100%",
  },
  actionBtn: {
    minHeight: 48,
    borderRadius: 14,
  },
  compactBtn: {
    minHeight: 38,
    borderRadius: 10,
    paddingHorizontal: 14,
  },
  btnText: {
    fontWeight: "700",
  },
  tipCard: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
  },
  standardTipCard: {
    marginTop: 14,
    padding: 12,
  },
  compactTipCard: {
    marginTop: 8,
    padding: 8,
  },
  tipHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tipTitle: {
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tipText: {
    fontWeight: "500",
  },
});
