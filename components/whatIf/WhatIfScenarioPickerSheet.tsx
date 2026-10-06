import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FlaskConical } from "lucide-react-native";

import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { Modal } from "@/components/common/Modal";
import { useWhatIfScenarios } from "@/hooks/useWhatIfScenarios";
import type { WhatIfScenario } from "@/shared/utils/whatIfScenarios";
import { useTheme } from "@/theme/ThemeProvider";

export interface WhatIfScenarioPickerSheetProps {
  isOpen: boolean;
  onClose: () => void;
  selectedId: string | null;
  onSelect: (scenario: WhatIfScenario | null) => void;
}

function InnerPicker({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (scenario: WhatIfScenario | null) => void;
}) {
  const { theme } = useTheme();
  const { scenarios, loading, error, retry } = useWhatIfScenarios();

  if (error) return <ErrorState title="Couldn't load scenarios" description={error.message} onRetry={retry} />;
  if (loading) return <LoadingState variant="list" count={3} />;

  if (scenarios.length === 0) {
    return (
      <View style={{ padding: theme.space.md }}>
        <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }}>
          You don't have any saved What-If scenarios yet. Create one in the What-If Simulator to test it here.
        </Text>
      </View>
    );
  }

  const text = { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.sm };
  const card = {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    gap: theme.space.xs,
    backgroundColor: theme.colors.card,
  };

  return (
    <View style={{ gap: theme.space.sm, paddingBottom: theme.space.xl }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: selectedId === null }}
        onPress={() => onSelect(null)}
        style={[card, selectedId === null && { borderColor: theme.colors.primary, borderWidth: 2 }]}
      >
        <Text style={[text, { fontFamily: theme.fontFamily.semibold }]}>None (Current Goals)</Text>
        <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>
          Plan with your actual budget
        </Text>
      </Pressable>

      {scenarios.map((s) => (
        <Pressable
          key={s.id}
          accessibilityRole="button"
          accessibilityState={{ selected: selectedId === s.id }}
          onPress={() => onSelect(s)}
          style={[card, selectedId === s.id && { borderColor: theme.colors.primary, borderWidth: 2 }]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space.sm }}>
            <FlaskConical size={16} color={selectedId === s.id ? theme.colors.primary : theme.colors.mutedForeground} />
            <Text style={[text, { fontFamily: theme.fontFamily.semibold, flex: 1 }]}>{s.name}</Text>
          </View>
          <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>
            {s.adjustments.length} adjustment(s)
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * Picker for What-If Scenarios.
 * Firebase efficiency (SPENDLY-406): Returns null when closed to avoid
 * mounting the useWhatIfScenarios listener until the user actually asks
 * to select a scenario.
 */
export function WhatIfScenarioPickerSheet(props: WhatIfScenarioPickerSheetProps) {
  if (!props.isOpen) return null;

  return (
    <Modal isOpen={true} onClose={props.onClose} title="Test a scenario" density="compact">
      <InnerPicker selectedId={props.selectedId} onSelect={props.onSelect} />
    </Modal>
  );
}
