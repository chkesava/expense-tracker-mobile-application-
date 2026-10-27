import { StyleSheet, Text, View } from "react-native";
import { CheckCircle2, Circle, Flag } from "lucide-react-native";

import { Section } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/Button";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import type { FinancialGoal } from "@/shared/types/expense";
import { milestoneStatus } from "@/shared/utils/goalAchievements";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces } from "@/theme/surfaces";

/**
 * A goal's milestones (SPENDLY-610): which are reached now (derived from the
 * saved amount, so it follows reductions) and how far the next one is.
 * Past achievements live in the history.
 */
export function GoalMilestonesSection({
  goal,
  currency,
  canEdit,
  onEdit,
}: {
  goal: FinancialGoal;
  currency: string;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const money = useGhostMoney(currency);
  const s = milestoneStatus(goal);
  const meta = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };

  return (
    <Section
      title="Milestones"
      subtitle={`${s.reachedCount} of ${s.rows.length} reached${s.custom ? "" : " · default"}`}
      icon={<Flag size={16} color={theme.colors.success} />}
      iconTint={surfaces.wash(theme.colors.success)}
      action={
        canEdit ? (
          <Button variant="ghost" size="sm" onPress={onEdit} accessibilityLabel="Edit milestones">
            Edit
          </Button>
        ) : undefined
      }
    >
      <View style={{ gap: theme.space.xs }}>
        {s.rows.map((m) => (
          <View
            key={m.id}
            style={styles.row}
            accessible
            accessibilityLabel={`${m.label || `${m.percentOfTarget}%`}, ${money(m.amount)}, ${m.reached ? "reached" : "not reached yet"}`}
          >
            {m.reached ? <CheckCircle2 size={18} color={theme.colors.success} /> : <Circle size={18} color={theme.colors.mutedForeground} />}
            <Text style={[styles.label, { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium, fontSize: theme.typography.sm }]}>
              {m.label || `${m.percentOfTarget}%`}
            </Text>
            <Text style={{ color: m.reached ? theme.colors.success : theme.colors.mutedForeground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }}>
              {money(m.amount)}
            </Text>
          </View>
        ))}
        {s.next ? <Text style={meta}>{money(s.toNext)} to the next milestone</Text> : <Text style={meta}>Every milestone reached.</Text>}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 32 },
  label: { flex: 1 },
});
