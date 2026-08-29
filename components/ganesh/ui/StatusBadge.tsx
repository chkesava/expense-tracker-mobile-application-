import { StyleSheet, Text, View } from "react-native";

import { GANESH_RADIUS, toneColor, type Tone } from "@/components/ganesh/ui/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

import { useGaneshTokens } from "./tokens";

export type StatusKind =
  | "promised"
  | "received"
  | "cancelled"
  | "overdue"
  | "paid"
  | "partial"
  | "pending"
  | "godFund"
  | "personal"
  | "permanent"
  | "asset"
  | "sponsored"
  | "neutral";

const TONES: Record<StatusKind, Tone> = {
  promised: "warning",
  received: "positive",
  cancelled: "muted",
  overdue: "negative",
  paid: "positive",
  partial: "warning",
  pending: "warning",
  godFund: "positive",
  personal: "info",
  permanent: "accent",
  asset: "muted",
  sponsored: "info",
  neutral: "muted",
};

const LABELS: Record<StatusKind, string> = {
  promised: "Promised",
  received: "Received",
  cancelled: "Cancelled",
  overdue: "Overdue",
  paid: "Paid",
  partial: "Partial",
  pending: "Pending",
  godFund: "God Fund",
  personal: "Personal",
  permanent: "Permanent Fund",
  asset: "Asset",
  sponsored: "Sponsored",
  neutral: "—",
};

export function statusLabel(kind: StatusKind): string {
  return LABELS[kind];
}

export type StatusBadgeProps = {
  kind: StatusKind;
  /** Overrides the default label. The badge always carries text (a11y §35). */
  label?: string;
  size?: "sm" | "md";
};

/**
 * Washed status pill. Solid saturated fills made ordinary states — a pending
 * reimbursement, a promised idol — read as errors, so status is expressed as a
 * 10–16% tint plus coloured text, and always with a word.
 */
export function StatusBadge({ kind, label, size = "md" }: StatusBadgeProps) {
  const { theme } = useTheme();
  const g = useGaneshTokens();

  const tone = TONES[kind];
  const color =
    kind === "permanent"
      ? g.maroon
      : kind === "personal" || kind === "sponsored"
        ? g.personal
        : toneColor(theme.colors, tone);

  return (
    <View
      style={[
        styles.badge,
        size === "sm" ? styles.sm : styles.md,
        { backgroundColor: g.wash(color) },
      ]}
    >
      <Text
        numberOfLines={1}
        style={{
          color,
          fontSize: size === "sm" ? 10.5 : 11.5,
          letterSpacing: 0.2,
          fontFamily: theme.fontFamily.semibold,
        }}
      >
        {label ?? LABELS[kind]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: GANESH_RADIUS.pill,
    alignSelf: "flex-start",
    maxWidth: 180,
  },
  sm: {
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  md: {
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
});
