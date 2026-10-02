import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight, Scale } from "lucide-react-native";

import { DecisionStatusBadge } from "@/components/decisions/DecisionStatusBadge";
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
  const chosen = decision.alternatives.find((a) => a.id === decision.selectedAlternativeId)?.title;
  const when = decision.decidedAtMs ? `Decided ${new Date(decision.decidedAtMs).toISOString().slice(0, 10)}` : `Started ${new Date(decision.createdAtMs).toISOString().slice(0, 10)}`;
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
      <View style={[styles.icon, { backgroundColor: surfaces.tile, borderRadius: theme.radius.md }]}>
        <Scale size={18} color={theme.colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={2} style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }}>
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
  icon: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
});
