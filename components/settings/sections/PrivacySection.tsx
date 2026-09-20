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
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { usePrivacyPin } from "@/providers/PrivacyPinProvider";
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
    setLockOnInactivity,
    setInactivityTimeout,
    setLockOnAppSwitch,
    setGhostMode,
  } = useSettings();
  const {
    isSupported: biometricsSupported,
    isRegistered: biometricsRegistered,
    register: registerBiometrics,
    unregister: unregisterBiometrics,
  } = useBiometrics();

  // SPENDLY-22: the PIN is device-local now, and under duress this whole
  // section renders as a never-configured account — see `isDuress` below.
  const { isDuress } = useAuth();
  const {
    hasRealPin,
    hasDuressPin,
    migratedThisLaunch,
    setRealPin,
    setDuressPin,
    removeAllPins,
    removeDuressPin,
    verifyPin,
  } = usePrivacyPin();

  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [newFakePin, setNewFakePin] = useState("");
  const [confirmFakePin, setConfirmFakePin] = useState("");

  const onEnablePin = async () => {
    if (!/^\d{4}$/.test(newPin)) {
      toast.error("PIN must be exactly 4 digits");
      return;
    }
    if (newPin !== confirmPin) {
      toast.error("PIN confirmation does not match");
      return;
    }
    setNewPin("");
    setConfirmPin("");
    // Under duress the form answers exactly as it would for a real user and
    // writes nothing. A coercer setting a PIN must not overwrite the victim's.
    if (isDuress) {
      toast.success("Privacy PIN enabled");
      return;
    }
    await setRealPin(newPin);
    toast.success("Privacy PIN enabled");
  };

  const onRemovePin = async () => {
    // Unreachable from the duress rendering, which never shows this control.
    // Guarded anyway: this one deletes the victim's real lock.
    if (isDuress) return;
    await removeAllPins();
    void unregisterBiometrics();
    toast.success("Privacy PIN removed");
  };

  const onEnableFakePin = async () => {
    if (isDuress) return;
    if (!hasRealPin) {
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
    if ((await verifyPin(newFakePin)) === "real") {
      toast.error("Duress PIN must differ from your real PIN");
      return;
    }
    await setDuressPin(newFakePin);
    setNewFakePin("");
    setConfirmFakePin("");
    toast.success("Duress PIN enabled");
  };

  const onToggleBiometrics = async () => {
    // Touches the real device key, so it stays out of reach under duress.
    if (isDuress) return;
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
    <View style={{ gap: 16 }}>
      <SettingsPanel title="Ghost mode" subtitle="Hide every amount on screen">
        <RowSwitch
          label="Ghost mode"
          value={settings.ghostMode}
          onValueChange={setGhostMode}
        />
        <Text
          style={{
            color: theme.colors.mutedForeground,
            fontSize: theme.typography.xs,
          }}
        >
          Replaces balances and totals with •••••• so you can use the app in
          public. Also toggleable from the side drawer.
        </Text>
      </SettingsPanel>

      <SettingsPanel title="Privacy" subtitle="PIN, duress, lock & biometrics">
      <Text
        style={{
          color: theme.colors.mutedForeground,
          fontSize: theme.typography.xs,
          lineHeight: 18,
        }}
      >
        The PIN hides the app from someone holding your phone. It does not
        encrypt your data — anything already downloaded stays on this device.
        Your PIN is stored on this device only and never leaves it.
      </Text>
      {/* SPENDLY-22: shown for one launch after the PIN moved off Firestore,
          because it stops syncing and the user has to know that. */}
      {migratedThisLaunch && !isDuress ? (
        <Text
          style={{
            color: theme.colors.primary,
            fontSize: theme.typography.xs,
            fontWeight: "700",
            lineHeight: 18,
          }}
        >
          Your PIN is now stored on this device only. Set it again on your other
          devices.
        </Text>
      ) : null}
      {/* SPENDLY-22: under duress this renders as a never-configured account.
          Hiding the section outright would be its own tell — a missing row in
          the Settings hub is how a coercer learns duress mode exists. */}
      {hasRealPin && !isDuress ? (
        <>
          <Text style={{ color: theme.colors.success, fontSize: theme.typography.sm }}>
            Privacy PIN is enabled
          </Text>
          <Button variant="destructive" onPress={() => void onRemovePin()}>
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
          {hasDuressPin ? (
            <Button
              variant="outline"
              onPress={() => {
                void removeDuressPin();
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
          <Button onPress={() => void onEnablePin()}>Enable privacy PIN</Button>
        </>
      )}
      </SettingsPanel>
    </View>
  );
}
