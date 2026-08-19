import { useState } from "react";
import { Text, View } from "react-native";

import {
  ChipRow,
  FieldLabel,
  RowSwitch,
  SettingsPanel,
} from "@/components/settings/SettingsControls";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useBiometrics } from "@/hooks/useBiometrics";
import { pinMatches } from "@/lib/pinSecurity";
import { toast } from "@/lib/toast";
import { useSettings } from "@/providers/SettingsProvider";
import { useTheme } from "@/theme/ThemeProvider";

const INACTIVITY_OPTIONS = [
  { value: "15", label: "15s" },
  { value: "30", label: "30s" },
  { value: "60", label: "1m" },
  { value: "300", label: "5m" },
  { value: "600", label: "10m" },
];

export function PrivacySection() {
  const { theme } = useTheme();
  const {
    settings,
    setPrivacyPin,
    setFakePin,
    setLockOnInactivity,
    setInactivityTimeout,
    setLockOnAppSwitch,
  } = useSettings();
  const {
    isSupported: biometricsSupported,
    isRegistered: biometricsRegistered,
    register: registerBiometrics,
    unregister: unregisterBiometrics,
  } = useBiometrics();

  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [newFakePin, setNewFakePin] = useState("");
  const [confirmFakePin, setConfirmFakePin] = useState("");

  const onEnablePin = () => {
    if (!/^\d{4}$/.test(newPin)) {
      toast.error("PIN must be exactly 4 digits");
      return;
    }
    if (newPin !== confirmPin) {
      toast.error("PIN confirmation does not match");
      return;
    }
    setPrivacyPin(newPin);
    setNewPin("");
    setConfirmPin("");
    toast.success("Privacy PIN enabled");
  };

  const onRemovePin = () => {
    setPrivacyPin("");
    setFakePin("");
    void unregisterBiometrics();
    toast.success("Privacy PIN removed");
  };

  const onEnableFakePin = async () => {
    if (!settings.privacyPin) {
      toast.error("Set a privacy PIN first");
      return;
    }
    if (!/^\d{4}$/.test(newFakePin)) {
      toast.error("Duress PIN must be exactly 4 digits");
      return;
    }
    if (newFakePin !== confirmFakePin) {
      toast.error("Duress PIN confirmation does not match");
      return;
    }
    if (await pinMatches(newFakePin, settings.privacyPin)) {
      toast.error("Duress PIN must differ from your real PIN");
      return;
    }
    setFakePin(newFakePin);
    setNewFakePin("");
    setConfirmFakePin("");
    toast.success("Duress PIN enabled");
  };

  const onToggleBiometrics = async () => {
    if (biometricsRegistered) {
      await unregisterBiometrics();
      toast.success("Biometrics disabled");
      return;
    }
    const ok = await registerBiometrics();
    if (ok) toast.success("Biometrics enabled");
    else toast.error("Biometric setup failed or was cancelled");
  };

  return (
    <SettingsPanel title="Privacy" subtitle="PIN, duress, lock & biometrics">
      {settings.privacyPin ? (
        <>
          <Text style={{ color: theme.colors.success, fontSize: theme.typography.sm }}>
            Privacy PIN is enabled
          </Text>
          <Button variant="destructive" onPress={onRemovePin}>
            Remove PIN
          </Button>

          <RowSwitch
            label="Lock on inactivity"
            value={settings.lockOnInactivity}
            onValueChange={setLockOnInactivity}
          />
          {settings.lockOnInactivity ? (
            <>
              <FieldLabel label="Inactivity timeout" />
              <ChipRow
                options={INACTIVITY_OPTIONS}
                selected={String(settings.inactivityTimeout || 60)}
                onSelect={(v) => setInactivityTimeout(Number(v))}
              />
            </>
          ) : null}

          <RowSwitch
            label="Lock when app switches away"
            value={settings.lockOnAppSwitch}
            onValueChange={setLockOnAppSwitch}
          />

          {biometricsSupported ? (
            <Button variant="outline" onPress={() => void onToggleBiometrics()}>
              {biometricsRegistered ? "Disable biometrics" : "Enable biometrics"}
            </Button>
          ) : (
            <Text
              style={{
                color: theme.colors.mutedForeground,
                fontSize: theme.typography.xs,
              }}
            >
              Biometrics unavailable on this device.
            </Text>
          )}

          <FieldLabel label="Duress (fake) PIN" />
          <Text
            style={{
              color: theme.colors.mutedForeground,
              fontSize: theme.typography.xs,
            }}
          >
            Opens an isolated empty vault ({`{uid}_duress`}). Must differ from your
            real PIN.
          </Text>
          {settings.fakePin ? (
            <Button
              variant="outline"
              onPress={() => {
                setFakePin("");
                toast.success("Duress PIN removed");
              }}
            >
              Remove duress PIN
            </Button>
          ) : (
            <>
              <Input
                label="New duress PIN"
                value={newFakePin}
                onChangeText={(text) =>
                  setNewFakePin(text.replace(/\D/g, "").slice(0, 4))
                }
                keyboardType="number-pad"
                secureTextEntry
                maxLength={4}
              />
              <Input
                label="Confirm duress PIN"
                value={confirmFakePin}
                onChangeText={(text) =>
                  setConfirmFakePin(text.replace(/\D/g, "").slice(0, 4))
                }
                keyboardType="number-pad"
                secureTextEntry
                maxLength={4}
              />
              <Button onPress={() => void onEnableFakePin()}>Enable duress PIN</Button>
            </>
          )}
        </>
      ) : (
        <>
          <Text
            style={{
              color: theme.colors.mutedForeground,
              fontSize: theme.typography.sm,
            }}
          >
            Set a 4-digit PIN to lock the app after sign-in.
          </Text>
          <Input
            label="New PIN"
            value={newPin}
            onChangeText={(text) => setNewPin(text.replace(/\D/g, "").slice(0, 4))}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
          />
          <Input
            label="Confirm PIN"
            value={confirmPin}
            onChangeText={(text) =>
              setConfirmPin(text.replace(/\D/g, "").slice(0, 4))
            }
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
          />
          <Button onPress={onEnablePin}>Enable privacy PIN</Button>
        </>
      )}
    </SettingsPanel>
  );
}
