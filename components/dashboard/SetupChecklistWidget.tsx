import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Check, ChevronRight, Sparkles, Wand2 } from "lucide-react-native";

import { DashboardEntrance } from "@/components/dashboard/DashboardEntrance";
import { Pill, Section } from "@/components/dashboard/primitives";
import { ProgressIndicator } from "@/components/dashboard/ProgressIndicator";
import { Button } from "@/components/ui/Button";
import {
  useSetupProgress,
  type SetupStep,
} from "@/providers/SetupProgressProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces, withAlpha } from "@/theme/surfaces";
import { haptic } from "@/lib/haptics";

/**
 * Getting Started checklist (SPENDLY-533): a completion summary with one
 * progress bar, the wizard shortcut, then one row per step with a done / to-do
 * mark. Steps, completion and actions all come from `useSetupProgress`.
 */
export const SetupChecklistWidget = React.memo(function SetupChecklistWidget() {
  const {
    steps,
    completedCount,
    totalCount,
    progress,
    isOnboarding,
    dismissOnboarding,
    launchSetupWizard,
  } = useSetupProgress();
  const { theme } = useTheme();
  const surfaces = useSurfaces();

  if (!isOnboarding) {
    return null;
  }

  const handleDismiss = () => {
    haptic.light().catch(() => undefined);
    dismissOnboarding();
  };

  const handleStartWizard = () => {
    haptic.selection().catch(() => undefined);
    // Find the first uncompleted step or start from step 0
    const firstPendingIdx = steps.findIndex((s) => !s.completed);
    launchSetupWizard(firstPendingIdx >= 0 ? Math.min(firstPendingIdx, 4) : 0);
  };

  const remaining = Math.max(0, totalCount - completedCount);
  const pct = Math.round((progress || 0) * 100);

  return (
    // The shared card entrance (no layout animation; reduced motion respected).
    <DashboardEntrance style={styles.wrap}>
      <Section
        title="Getting Started"
        icon={<Sparkles size={16} color={theme.colors.primary} />}
        iconTint={surfaces.wash(theme.colors.primary)}
        badge={<Pill label={`${completedCount} / ${totalCount} Completed`} />}
      >
        <ProgressIndicator
          pct={pct}
          status={remaining === 0 ? "good" : "neutral"}
          statusLabel={
            remaining === 0
              ? "All steps done"
              : `${remaining} step${remaining === 1 ? "" : "s"} to go`
          }
          trailing={`${pct}%`}
          accessibilityLabel={`Setup ${completedCount} of ${totalCount} steps completed`}
          style={styles.progress}
        />

        {/* Setup Wizard Quick CTA */}
        {completedCount < totalCount && (
          <Button
            onPress={handleStartWizard}
            haptic={false}
            style={styles.wizardCta}
            accessibilityLabel="Launch Setup Wizard"
          >
            <Wand2 size={16} color={theme.colors.primaryForeground} />
            <Text
              style={[
                styles.wizardCtaText,
                {
                  color: theme.colors.primaryForeground,
                  fontFamily: theme.fontFamily.semibold,
                },
              ]}
            >
              Launch Setup Wizard
            </Text>
          </Button>
        )}

        <View style={styles.list}>
          {steps.map((step: SetupStep, index: number) => (
            <StepRow
              key={step.id}
              label={step.label}
              completed={step.completed}
              onPress={step.completed ? undefined : step.onNavigate}
              divider={index < steps.length - 1}
            />
          ))}
        </View>

        {/* Dismiss Action */}
        <Button
          variant="ghost"
          size="sm"
          haptic={false}
          onPress={handleDismiss}
          style={styles.dismissButton}
          accessibilityLabel="Dismiss Getting Started Checklist"
        >
          <Text
            style={[
              styles.dismissText,
              { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.semibold },
            ]}
          >
            Dismiss Checklist
          </Text>
        </Button>
      </Section>
    </DashboardEntrance>
  );
});

/** One step: a done / to-do mark, the label, and a chevron when it can be opened. */
function StepRow({
  label,
  completed,
  onPress,
  divider,
}: {
  label: string;
  completed: boolean;
  onPress?: () => void;
  divider: boolean;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();

  const handlePress = () => {
    if (onPress) {
      haptic.selection().catch(() => undefined);
      onPress();
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={!onPress || completed}
      android_ripple={{ color: withAlpha(theme.colors.primary, 0.1), borderless: false }}
      style={({ pressed }) => [
        styles.stepRow,
        divider && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: surfaces.divider },
        pressed && !completed && { opacity: 0.8 },
      ]}
      accessibilityRole={onPress && !completed ? "button" : undefined}
      accessibilityState={{ checked: completed, disabled: !onPress || completed }}
      accessibilityLabel={`${label}, ${completed ? "done" : "to do"}`}
    >
      <View
        style={[
          styles.mark,
          completed
            ? { backgroundColor: theme.colors.success, borderColor: theme.colors.success }
            : { borderColor: withAlpha(theme.colors.mutedForeground, 0.45) },
        ]}
      >
        {completed ? (
          <Check size={13} color={theme.colors.successForeground} strokeWidth={3} />
        ) : null}
      </View>
      <Text
        style={[
          styles.stepLabel,
          {
            color: completed ? theme.colors.mutedForeground : theme.colors.foreground,
            fontFamily: completed ? theme.fontFamily.regular : theme.fontFamily.medium,
          },
          completed && styles.stepLabelDone,
        ]}
        numberOfLines={2}
      >
        {label}
      </Text>
      {!completed && onPress ? (
        <ChevronRight size={16} color={theme.colors.mutedForeground} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 16,
  },
  progress: {
    marginBottom: 14,
  },
  wizardCta: {
    marginBottom: 8,
  },
  wizardCtaText: {
    fontSize: 14,
  },
  list: {
    marginBottom: 8,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 48,
    paddingVertical: 8,
    paddingHorizontal: 2,
  },
  mark: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  stepLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 19,
  },
  stepLabelDone: {
    textDecorationLine: "line-through",
    opacity: 0.7,
  },
  dismissButton: {
    alignSelf: "center",
  },
  dismissText: {
    fontSize: 13,
  },
});
