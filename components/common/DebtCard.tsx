import { memo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { HandCoins, MoreVertical } from "lucide-react-native";

import { FinancialAmount, type AmountSign, type AmountTone } from "@/components/dashboard/FinancialAmount";
import { ProgressIndicator, type ProgressStatus } from "@/components/dashboard/ProgressIndicator";
import { MetaLabel, Pill, type Tone } from "@/components/dashboard/primitives";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces, withAlpha } from "@/theme/surfaces";

export type DebtFigure = {
  label: string;
  value: number;
  tone?: AmountTone;
  sign?: AmountSign;
};

/**
 * SPENDLY-536 — one card for a borrowing or money lent: who, how much, status
 * as a word, a settled bar, the key figures, the due date, and the repayment
 * action. The body is one pressable; the action and the overflow menu are its
 * siblings in a footer, never pressables inside it (that nesting logged
 * "button inside button" on web and made the presses compete on native).
 */
export const DebtCard = memo(function DebtCard({
  icon,
  tint,
  title,
  meta,
  headline,
  status,
  progress,
  figures,
  due,
  currency,
  onPress,
  accessibilityLabel,
  action,
  menu,
}: {
  icon: ReactNode;
  /** Semantic theme colour for the avatar tile. */
  tint: string;
  title: string;
  meta: string;
  /** Optional large amount above the title (the borrowed principal). */
  headline?: number;
  status: { word: string; tone: Tone };
  progress: { pct: number; label: string };
  figures: DebtFigure[];
  /** Already-formatted due line, e.g. "Due 20 Oct 2026". */
  due?: { text: string; overdue: boolean } | null;
  currency?: string;
  onPress: () => void;
  accessibilityLabel: string;
  action?: { label: string; accessibilityLabel: string; onPress: () => void } | null;
  menu?: { accessibilityLabel: string; onPress: () => void } | null;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const progressStatus: ProgressStatus =
    status.tone === "negative" ? "over" : status.tone === "warning" ? "watch" : "good";

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.card, borderColor: theme.colors.outlineVariant },
      ]}
    >
      <Pressable
        onPress={() => {
          void haptic.selection();
          onPress();
        }}
        android_ripple={{ color: surfaces.track, borderless: false }}
        style={({ pressed }) => [styles.body, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <View style={styles.topRow}>
          <View
            style={[
              styles.avatar,
              { backgroundColor: surfaces.wash(tint), borderColor: withAlpha(tint, 0.24) },
            ]}
          >
            {icon}
          </View>
          <View style={styles.identity}>
            {headline !== undefined ? (
              <FinancialAmount value={headline} currency={currency ?? ""} size="lg" weight="bold" />
            ) : null}
            <Text
              style={[
                headline !== undefined ? styles.subTitle : styles.title,
                { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold },
              ]}
              numberOfLines={1}
            >
              {title}
            </Text>
            <Text
              style={[styles.meta, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
              numberOfLines={1}
            >
              {meta}
            </Text>
          </View>
          <Pill label={status.word} tone={status.tone} />
        </View>

        <ProgressIndicator
          pct={progress.pct}
          status={progressStatus}
          statusLabel={progress.label}
          height={6}
          accessibilityLabel={progress.label}
        />

        <View style={[styles.figures, { backgroundColor: surfaces.tile }]}>
          {figures.map((figure) => (
            <View key={figure.label} style={styles.figure}>
              <MetaLabel>{figure.label}</MetaLabel>
              <FinancialAmount
                value={figure.value}
                currency={currency ?? ""}
                size="sm"
                weight="semibold"
                tone={figure.tone}
                sign={figure.sign}
              />
            </View>
          ))}
        </View>

        {due ? (
          <Text
            style={[
              styles.due,
              {
                color: due.overdue ? theme.colors.destructive : theme.colors.mutedForeground,
                fontFamily: theme.fontFamily.medium,
              },
            ]}
          >
            {due.text}
          </Text>
        ) : null}
      </Pressable>

      {action || menu ? (
        <View style={[styles.footer, { borderTopColor: surfaces.divider }]}>
          {action ? (
            <Pressable
              onPress={() => {
                void haptic.selection();
                action.onPress();
              }}
              hitSlop={6}
              style={({ pressed }) => [
                styles.actionBtn,
                {
                  backgroundColor: surfaces.wash(theme.colors.primary),
                  borderColor: withAlpha(theme.colors.primary, 0.35),
                },
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={action.accessibilityLabel}
            >
              <HandCoins size={14} color={theme.colors.primary} strokeWidth={2.3} />
              <Text style={[styles.actionLabel, { color: theme.colors.primary, fontFamily: theme.fontFamily.semibold }]}>
                {action.label}
              </Text>
            </Pressable>
          ) : (
            <View style={styles.flex} />
          )}
          {menu ? (
            <Pressable
              onPress={() => {
                void haptic.selection();
                menu.onPress();
              }}
              hitSlop={6}
              style={({ pressed }) => [styles.menuBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={menu.accessibilityLabel}
            >
              <MoreVertical size={18} color={theme.colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  body: {
    padding: 16,
    gap: 12,
  },
  pressed: {
    opacity: 0.88,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  identity: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: 15,
    letterSpacing: -0.2,
  },
  subTitle: {
    fontSize: 13.5,
  },
  meta: {
    fontSize: 12,
  },
  figures: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderCurve: "continuous",
  },
  figure: {
    flexGrow: 1,
    minWidth: 80,
    gap: 2,
  },
  due: {
    fontSize: 12,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  flex: {
    flex: 1,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionLabel: {
    fontSize: 13,
  },
  menuBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
