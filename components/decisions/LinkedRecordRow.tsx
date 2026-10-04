import { Pressable, StyleSheet, Text, View } from "react-native";
import { AlertCircle, ChevronRight, Link2, X } from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import type { ResolvedDecisionLink } from "@/shared/utils/decisionLinks";
import { LINK_NATURE_LABELS } from "@/shared/utils/decisionLinks";
import { formatAmount } from "@/shared/utils/formatCurrency";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * One linked record on a decision (SPENDLY-366): what it is now, read-only,
 * with an honest state when it's missing, deleted or unreadable. Amounts are
 * shown for reference and say so — they are never part of the decision.
 */
export function LinkedRecordRow({
  resolved,
  currency,
  onOpen,
  onRemove,
}: {
  resolved: ResolvedDecisionLink;
  currency: string;
  onOpen?: (href: string) => void;
  onRemove?: () => void;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { link, state, title, stateText, nature, currentAmount, changedSinceLinked, href } = resolved;
  const linkedOn = new Date(link.capturedAtMs).toISOString().slice(0, 10);
  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };
  const canOpen = state === "ok" && href && onOpen;

  return (
    <View style={[styles.row, { gap: theme.space.sm, borderBottomColor: surfaces.divider }]}>
      <Pressable
        onPress={canOpen ? () => onOpen!(href!) : undefined}
        disabled={!canOpen}
        accessibilityRole={canOpen ? "button" : "text"}
        accessibilityLabel={`${title}. ${nature ? LINK_NATURE_LABELS[nature] : ""}. ${stateText ?? ""}`}
        style={({ pressed }) => [styles.main, { gap: theme.space.sm, opacity: pressed ? 0.7 : 1 }]}
      >
        {state === "ok" ? <Link2 size={16} color={theme.colors.primary} /> : <AlertCircle size={16} color={theme.colors.warning} />}
        <View style={{ flex: 1, gap: 2 }}>
          <Text numberOfLines={2} style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.medium, fontSize: theme.typography.sm }}>{title}</Text>
          {nature ? <Text style={muted}>{LINK_NATURE_LABELS[nature]}</Text> : null}
          {currentAmount !== undefined ? (
            <Text style={muted}>
              {formatAmount(currentAmount, currency)} now, for reference — not counted in this decision
              {changedSinceLinked && link.capturedAmount !== undefined ? ` (was ${formatAmount(link.capturedAmount, currency)} when linked)` : ""}
            </Text>
          ) : null}
          {stateText ? <Text style={[muted, { color: state === "loading" ? theme.colors.mutedForeground : theme.colors.warning }]}>{stateText}</Text> : null}
          <Text style={muted}>Linked {linkedOn}</Text>
        </View>
        {canOpen ? <ChevronRight size={16} color={theme.colors.mutedForeground} /> : null}
      </Pressable>
      {onRemove ? (
        <Button variant="ghost" size="icon" onPress={onRemove} accessibilityLabel={`Remove link to ${title}. The record itself is not deleted`}>
          <X size={16} color={theme.colors.mutedForeground} />
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  main: { flex: 1, flexDirection: "row", alignItems: "center", minHeight: 48 },
});
