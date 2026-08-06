import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Sparkles, Trophy, X } from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useCelebration } from "@/providers/CelebrationProvider";
import { useTheme } from "@/theme/ThemeProvider";

export function CelebrationOverlay() {
  const { currentCelebration, dismissCelebration } = useCelebration();
  const { theme } = useTheme();

  if (!currentCelebration) return null;

  return (
    <Modal
      visible={!!currentCelebration}
      transparent
      animationType="fade"
      onRequestClose={dismissCelebration}
    >
      <View style={styles.backdrop}>
        <Card
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.primary,
            },
          ]}
        >
          {/* Header icon / Emoji */}
          <View style={styles.badgeWrapper}>
            <View
              style={[
                styles.iconGlow,
                { backgroundColor: "rgba(234, 179, 8, 0.2)" },
              ]}
            >
              <Text style={styles.emoji}>
                {currentCelebration.badgeEmoji || "🎉"}
              </Text>
            </View>
          </View>

          {/* Titles */}
          <Text
            style={[styles.title, { color: theme.colors.foreground }]}
            numberOfLines={2}
          >
            {currentCelebration.title}
          </Text>

          {currentCelebration.subtitle && (
            <Text
              style={[
                styles.subtitle,
                { color: theme.colors.mutedForeground },
              ]}
            >
              {currentCelebration.subtitle}
            </Text>
          )}

          {/* Points Pill */}
          {currentCelebration.pointsEarned ? (
            <View style={styles.pointsPill}>
              <Sparkles size={14} color="#EAB308" />
              <Text style={styles.pointsText}>
                +{currentCelebration.pointsEarned} XP Earned!
              </Text>
            </View>
          ) : null}

          {/* Action button */}
          <Button
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
              dismissCelebration();
            }}
            style={styles.btn}
          >
            <Trophy size={16} color="#FFFFFF" />
            <Text style={{ marginLeft: 8, fontWeight: "800", color: "#FFFFFF" }}>
              Awesome!
            </Text>
          </Button>
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    padding: 24,
    borderRadius: 24,
    borderWidth: 1.5,
    alignItems: "center",
    gap: 12,
  },
  badgeWrapper: {
    marginBottom: 4,
  },
  iconGlow: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  emoji: {
    fontSize: 36,
  },
  title: {
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  pointsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(234, 179, 8, 0.15)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 4,
  },
  pointsText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#EAB308",
  },
  btn: {
    width: "100%",
    marginTop: 8,
  },
});
