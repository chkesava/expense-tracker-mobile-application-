import { useState } from "react";
import { Text, View } from "react-native";
import { Lock } from "lucide-react-native";

import { Section } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/Button";
import { useDeviceAuth } from "@/hooks/useDeviceAuth";
import { goalLockSession } from "@/lib/goalLockSession";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces } from "@/theme/surfaces";

/**
 * Shown instead of a locked goal (SPENDLY-614, FRD FR-14). Unlocking uses the
 * device's own screen lock (biometrics or passcode). It fails closed for this
 * goal only: a failed or cancelled check, or a device with no screen lock,
 * keeps this goal hidden — the rest of the app is never locked.
 */
export function GoalLockPanel({ goalId, goalName }: { goalId: string; goalName: string }) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { available, confirm } = useDeviceAuth();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const body = { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.sm };

  const unlock = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await confirm(`Unlock ${goalName}`);
      setFailed(!ok);
      if (ok) goalLockSession.unlock(goalId);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="This goal is locked" icon={<Lock size={16} color={theme.colors.primary} />} iconTint={surfaces.wash(theme.colors.primary)}>
      <View style={{ gap: theme.space.sm }} accessibilityLiveRegion="polite">
        <Text style={body}>Its amounts and history are hidden on this device until you unlock it.</Text>
        {available ? (
          <Button variant="primary" onPress={() => void unlock()} loading={busy} disabled={busy} accessibilityLabel={`Unlock ${goalName} with your device lock`}>
            Unlock
          </Button>
        ) : (
          <Text style={[body, { color: theme.colors.mutedForeground }]}>
            Unlocking needs a device screen lock (fingerprint, face or passcode), which isn't available here. Open this goal on a phone with a screen lock.
          </Text>
        )}
        {failed ? <Text style={{ color: theme.colors.destructive, fontSize: theme.typography.xs }}>Not unlocked. The goal stays hidden; everything else is available.</Text> : null}
      </View>
    </Section>
  );
}
