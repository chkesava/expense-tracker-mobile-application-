import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Eye, EyeOff, IdCard, Pencil } from "lucide-react-native";

import { Card } from "@/components/ui/Card";
import { haptic } from "@/lib/haptics";
import type { EpfProfile } from "@/shared/features/epf/types";
import { formatUan, maskUan } from "@/shared/features/epf/utils";
import { useTheme } from "@/theme/ThemeProvider";

type Props = {
  profile: EpfProfile;
  onEdit: () => void;
};

export function EpfProfileCard({ profile, onEdit }: Props) {
  const { theme } = useTheme();
  // Reveal state is local and resets whenever the tab unmounts. It is never
  // persisted and never leaves the device.
  const [revealed, setRevealed] = useState(false);

  const toggleReveal = () => {
    haptic.selection();
    setRevealed((value) => !value);
  };

  return (
    <Card>
      <View style={styles.header}>
        <View style={[styles.iconBadge, { backgroundColor: theme.colors.primary + "1A" }]}>
          <IdCard size={theme.iconSize.md} color={theme.colors.primary} />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
            Universal Account Number
          </Text>
          <Text style={[styles.name, { color: theme.colors.foreground }]} numberOfLines={1}>
            {profile.employeeName}
          </Text>
        </View>
        <Pressable
          onPress={onEdit}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Edit EPF profile"
        >
          <Pencil size={theme.iconSize.sm} color={theme.colors.mutedForeground} />
        </Pressable>
      </View>

      <Pressable
        onPress={toggleReveal}
        style={[styles.uanRow, { backgroundColor: theme.colors.muted, borderRadius: theme.radius.md }]}
        accessibilityRole="button"
        accessibilityLabel={revealed ? "Hide UAN" : "Reveal UAN"}
      >
        <Text style={[styles.uan, { color: theme.colors.foreground }]}>
          {revealed ? formatUan(profile.uan) : maskUan(profile.uan)}
        </Text>
        {revealed ? (
          <EyeOff size={theme.iconSize.sm} color={theme.colors.mutedForeground} />
        ) : (
          <Eye size={theme.iconSize.sm} color={theme.colors.mutedForeground} />
        )}
      </Pressable>

      {profile.notes ? (
        <Text style={[styles.notes, { color: theme.colors.mutedForeground }]}>{profile.notes}</Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  name: {
    fontSize: 16,
    fontWeight: "600",
  },
  uanRow: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  uan: {
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: 1.5,
    fontVariant: ["tabular-nums"],
  },
  notes: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 18,
  },
});
