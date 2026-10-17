import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight, Scale } from "lucide-react-native";

import { RowGlyph } from "@/components/dashboard/primitives";
import { DecisionStatusBadge } from "@/components/decisions/DecisionStatusBadge";
import { useDecisionFormat } from "@/components/decisions/useDecisionFormat";
import type { MoneyDecision } from "@/shared/types/decision";
import { outcomeStatus } from "@/shared/utils/decisionHistory";
import { decisionCategoryLabel } from "@/shared/utils/decisionModel";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

/** One decision in the list (SPENDLY-363). A row, not a card. */
export const DecisionRow = memo(function DecisionRow({
  decision,
  onPress,
}: {
  decision: MoneyDecision;
  onPress: (decision: MoneyDecision) => void;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  // SPENDLY-547: dates in the user's format (were UTC ISO slices).
  const { date } = useDecisionFormat();
  const chosen = decision.alternatives.find((a) => a.id === decision.selectedAlternativeId)?.title;
  const when = decision.decidedAtMs ? `Decided ${date(decision.decidedAtMs)}` : `Started ${date(decision.createdAtMs)}`;
  const outcome = outcomeStatus(decision);
  const meta = [
    decisionCategoryLabel(decision.category),
    chosen ? `Chose: ${chosen}` : null,
    when,
    outcome === "recorded" ? "Outcome recorded" : outcome === "awaiting" ? "Awaiting outcome" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Pressable
      onPress={() => onPress(decision)}
      accessibilityRole="button"
      accessibilityLabel={`${decision.title}. ${meta}`}
      accessibilityHint={decision.status === "draft" ? "Opens the draft to continue" : "Opens the decision"}
      style={({ pressed }) => [
        styles.row,
        { paddingHorizontal: theme.space.lg, paddingVertical: theme.space.md, gap: theme.space.md, borderBottomColor: surfaces.divider, backgroundColor: pressed ? surfaces.tile : "transparent" },
      ]}
    >
      <RowGlyph tint={decision.status === "archived" ? undefined : surfaces.wash(theme.colors.primary)}>
        <Scale size={18} color={decision.status === "archived" ? theme.colors.mutedForeground : theme.colors.primary} />
      </RowGlyph>
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text numberOfLines={2} style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.medium, fontSize: theme.typography.sm }}>
          {decision.title}
        </Text>
        <Text numberOfLines={2} style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>
          {meta}
        </Text>
        <DecisionStatusBadge status={decision.status} />
      </View>
      <ChevronRight size={16} color={theme.colors.mutedForeground} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", minHeight: 64, borderBottomWidth: StyleSheet.hairlineWidth },
});
