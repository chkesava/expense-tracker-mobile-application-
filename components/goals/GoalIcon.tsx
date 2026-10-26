import { StyleSheet, View } from "react-native";
import {
  Briefcase,
  Car,
  Gift,
  GraduationCap,
  Heart,
  House,
  Laptop,
  PiggyBank,
  Plane,
  Shield,
  Smartphone,
  Target,
  type LucideIcon,
} from "lucide-react-native";

import type { GoalIconKey } from "@/shared/types/goal";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces } from "@/theme/surfaces";

/** SPENDLY-608 — predefined goal icons (keys are persisted; see GOAL_ICON_KEYS). */
export const GOAL_ICONS: Record<GoalIconKey, { Icon: LucideIcon; label: string }> = {
  "piggy-bank": { Icon: PiggyBank, label: "Savings" },
  shield: { Icon: Shield, label: "Emergency fund" },
  plane: { Icon: Plane, label: "Travel" },
  home: { Icon: House, label: "Home" },
  car: { Icon: Car, label: "Vehicle" },
  smartphone: { Icon: Smartphone, label: "Phone" },
  laptop: { Icon: Laptop, label: "Computer" },
  "graduation-cap": { Icon: GraduationCap, label: "Education" },
  heart: { Icon: Heart, label: "Health" },
  gift: { Icon: Gift, label: "Gift" },
  briefcase: { Icon: Briefcase, label: "Business" },
  target: { Icon: Target, label: "Other" },
};

export function GoalIcon({ iconKey, size = 40, muted = false }: { iconKey?: GoalIconKey; size?: number; muted?: boolean }) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { Icon } = GOAL_ICONS[iconKey ?? "piggy-bank"] ?? GOAL_ICONS["piggy-bank"];
  const color = muted ? theme.colors.mutedForeground : theme.colors.success;
  return (
    <View
      style={[styles.glyph, { width: size, height: size, borderRadius: size / 2, backgroundColor: surfaces.wash(color) }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Icon size={Math.round(size * 0.48)} color={color} strokeWidth={2.2} />
    </View>
  );
}

const styles = StyleSheet.create({
  glyph: { alignItems: "center", justifyContent: "center" },
});
