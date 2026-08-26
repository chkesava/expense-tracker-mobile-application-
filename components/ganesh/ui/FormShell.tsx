import type { ReactNode } from "react";
import { Keyboard, Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { Button } from "@/components/ui/Button";
import { useTheme } from "@/theme/ThemeProvider";

import { GaneshHeader } from "./GaneshHeader";
import { useGaneshTokens } from "./tokens";

export type FormShellProps = {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  onBack?: () => void;
  children: ReactNode;
  submitLabel: string;
  onSubmit: () => void;
  submitting?: boolean;
  submitDisabled?: boolean;
  /** Secondary action rendered beside the primary one. */
  secondary?: { label: string; onPress: () => void };
  /** Shown directly above the docked footer — a StatusStrip, usually. */
  footerHint?: ReactNode;
};

/**
 * The shell every Ganesh write form uses.
 *
 * The primary action is docked rather than sitting at the end of the scroll, so
 * a long form (Add expense with an asset purchase runs well past one screen)
 * never hides its own Save button. Header metrics and field spacing come from
 * the shared kit, so all ten forms are structurally identical.
 */
export function FormShell({
  title,
  subtitle,
  icon,
  onBack,
  children,
  submitLabel,
  onSubmit,
  submitting = false,
  submitDisabled = false,
  secondary,
  footerHint,
}: FormShellProps) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const insets = useSafeAreaInsets();

  const footerPadding = Math.max(insets.bottom, 12);

  return (
    <View style={styles.fill}>
      <GaneshScreen
        safeTop
        contentContainerStyle={{ paddingBottom: 96 + footerPadding }}
      >
        <GaneshHeader title={title} subtitle={subtitle} icon={icon} onBack={onBack} />
        {children}
      </GaneshScreen>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: theme.colors.card,
            borderTopColor: g.divider,
            paddingBottom: footerPadding,
          },
        ]}
      >
        {footerHint ? <View style={styles.hint}>{footerHint}</View> : null}
        <View style={styles.actions}>
          {secondary ? (
            <Button variant="outline" style={styles.secondary} onPress={secondary.onPress}>
              {secondary.label}
            </Button>
          ) : null}
          <Button
            size="lg"
            style={styles.primary}
            loading={submitting}
            disabled={submitDisabled}
            onPress={() => {
              if (Platform.OS !== "web") Keyboard.dismiss();
              onSubmit();
            }}
          >
            {submitLabel}
          </Button>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  hint: {
    width: "100%",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  secondary: {
    flex: 1,
  },
  primary: {
    flex: 2,
  },
});
