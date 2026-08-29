/**
 * Privacy lock gate — PIN / fake PIN (duress) / biometrics + inactivity / app-switch lock.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AppState,
  type AppStateStatus,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Delete, Fingerprint, Lock } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { haptic } from "@/lib/haptics";

import { useBiometrics } from "@/hooks/useBiometrics";
import { pinMatches } from "@/lib/pinSecurity";
import { privacySession } from "@/lib/privacySession";
import { useAuth } from "@/providers/AuthProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { useTheme } from "@/theme/ThemeProvider";

export function PrivacyLock({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const { logout } = useAuth();
  const { isRegistered, authenticate } = useBiometrics();

  const [isLocked, setIsLocked] = useState(() =>
    Boolean(settings.privacyPin && !privacySession.isUnlocked())
  );
  const [pinInput, setPinInput] = useState("");
  const [error, setError] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(() =>
    privacySession.getFailedAttempts()
  );
  const [lockoutTimeLeft, setLockoutTimeLeft] = useState(0);

  const isLockedRef = useRef(isLocked);
  const hasAttemptedAutoBiometric = useRef(false);
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isLockedRef.current = isLocked;
    if (!isLocked) hasAttemptedAutoBiometric.current = false;
  }, [isLocked]);

  useEffect(() => {
    if (settings.privacyPin && !privacySession.isUnlocked()) {
      setIsLocked(true);
    } else if (!settings.privacyPin) {
      setIsLocked(false);
    }
  }, [settings.privacyPin]);

  useEffect(() => {
    const until = privacySession.getLockoutUntil();
    if (!until) return;
    const remaining = Math.ceil((until - Date.now()) / 1000);
    if (remaining > 0) {
      setLockoutTimeLeft(remaining);
    } else {
      privacySession.clearLockout();
      setFailedAttempts(0);
    }
  }, []);

  useEffect(() => {
    if (lockoutTimeLeft <= 0) return;
    const interval = setInterval(() => {
      setLockoutTimeLeft((prev) => {
        if (prev <= 1) {
          privacySession.clearLockout();
          setFailedAttempts(0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutTimeLeft]);

  const lockApp = useCallback(() => {
    setIsLocked(true);
    setPinInput("");
    privacySession.lock();
  }, []);

  const completeUnlock = useCallback((duress: boolean) => {
    setIsLocked(false);
    setPinInput("");
    setError(false);
    setFailedAttempts(0);
    privacySession.markUnlocked({ duress });
  }, []);

  // Auto-prompt biometrics once when lock appears
  useEffect(() => {
    if (
      !isLocked ||
      !isRegistered ||
      hasAttemptedAutoBiometric.current ||
      lockoutTimeLeft > 0
    ) {
      return;
    }
    hasAttemptedAutoBiometric.current = true;
    void (async () => {
      const success = await authenticate();
      if (success) completeUnlock(false);
    })();
  }, [isLocked, isRegistered, authenticate, lockoutTimeLeft, completeUnlock]);

  // Inactivity + AppState (app switch)
  useEffect(() => {
    if (!settings.privacyPin) return;

    const clearInactivity = () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      inactivityTimer.current = null;
    };

    const resetInactivity = () => {
      clearInactivity();
      if (isLockedRef.current) return;
      if (!settings.lockOnInactivity) return;
      inactivityTimer.current = setTimeout(() => {
        lockApp();
      }, (settings.inactivityTimeout || 60) * 1000);
    };

    const onAppState = (next: AppStateStatus) => {
      if (
        settings.lockOnAppSwitch &&
        (next === "background" || next === "inactive") &&
        !isLockedRef.current
      ) {
        lockApp();
      }
      if (next === "active") {
        resetInactivity();
      }
    };

    resetInactivity();
    const sub = AppState.addEventListener("change", onAppState);
    return () => {
      clearInactivity();
      sub.remove();
    };
  }, [
    settings.privacyPin,
    settings.lockOnInactivity,
    settings.inactivityTimeout,
    settings.lockOnAppSwitch,
    lockApp,
  ]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: () => false,
      onPanResponderGrant: () => {
        if (!isLockedRef.current && settings.lockOnInactivity) {
          if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
          inactivityTimer.current = setTimeout(() => {
            lockApp();
          }, (settings.inactivityTimeout || 60) * 1000);
        }
      },
    })
  ).current;

  // Re-bind activity via capturing touch on root when unlocked
  const onRootTouch = useCallback(() => {
    if (isLockedRef.current || !settings.privacyPin || !settings.lockOnInactivity) {
      return;
    }
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(() => {
      lockApp();
    }, (settings.inactivityTimeout || 60) * 1000);
  }, [settings.privacyPin, settings.lockOnInactivity, settings.inactivityTimeout, lockApp]);

  const triggerErrorHaptic = async () => {
    await haptic.error();
  };

  const triggerTapHaptic = async () => {
    await haptic.impact();
  };

  const handleUnlock = useCallback(async () => {
    if (await pinMatches(pinInput, settings.privacyPin)) {
      completeUnlock(false);
    } else if (settings.fakePin && (await pinMatches(pinInput, settings.fakePin))) {
      completeUnlock(true);
    } else {
      setError(true);
      void triggerErrorHaptic();
      setTimeout(() => setError(false), 500);
      setPinInput("");
      const { attempts, lockedOut } = privacySession.recordFailedAttempt();
      setFailedAttempts(attempts);
      if (lockedOut) setLockoutTimeLeft(30);
    }
  }, [pinInput, settings.privacyPin, settings.fakePin, completeUnlock]);

  useEffect(() => {
    if (pinInput.length === 4) void handleUnlock();
  }, [pinInput, handleUnlock]);

  const handlePinClick = (num: string) => {
    if (lockoutTimeLeft > 0) return;
    if (pinInput.length < 4 && !error) {
      void triggerTapHaptic();
      setPinInput((prev) => prev + num);
    }
  };

  const handleDelete = () => {
    if (lockoutTimeLeft > 0) return;
    void triggerTapHaptic();
    setPinInput((prev) => prev.slice(0, -1));
  };

  const handleBiometricUnlock = async () => {
    if (lockoutTimeLeft > 0) return;
    const success = await authenticate();
    if (success) {
      completeUnlock(false);
    } else {
      setError(true);
      void triggerErrorHaptic();
      setTimeout(() => setError(false), 500);
    }
  };

  const keypadDisabled = lockoutTimeLeft > 0;

  return (
    <View style={{ flex: 1 }} onTouchStart={onRootTouch} {...panResponder.panHandlers}>
      <View
        style={{ flex: 1 }}
        pointerEvents={isLocked ? "none" : "auto"}
        accessibilityElementsHidden={isLocked}
        importantForAccessibility={isLocked ? "no-hide-descendants" : "auto"}
      >
        {children}
      </View>
      {isLocked ? (
    <View
      style={[
        styles.overlay,
        {
          backgroundColor: theme.colors.background,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      <View style={styles.inner}>
        <View
          style={[
            styles.lockBadge,
            {
              backgroundColor: theme.colors.secondary,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Lock color={theme.colors.primary} size={28} />
        </View>

        <Text
          style={{
            color: theme.colors.foreground,
            fontSize: theme.typography.xl,
            fontWeight: "900",
            marginBottom: theme.space.sm,
          }}
        >
          Privacy Lock
        </Text>

        {lockoutTimeLeft > 0 ? (
          <Text
            style={{
              color: theme.colors.destructive,
              fontSize: theme.typography.sm,
              fontWeight: "700",
              marginBottom: theme.space.xl,
            }}
          >
            Locked out. Try again in {lockoutTimeLeft}s
          </Text>
        ) : (
          <Text
            style={{
              color: theme.colors.mutedForeground,
              fontSize: theme.typography.xs,
              fontWeight: "700",
              letterSpacing: 1,
              textTransform: "uppercase",
              marginBottom: theme.space.xl,
            }}
          >
            Enter 4-Digit Security PIN
          </Text>
        )}

        <View style={[styles.dots, { marginBottom: theme.space.xxl }]}>
          {[0, 1, 2, 3].map((i) => {
            const filled = i < pinInput.length;
            return (
              <View
                key={i}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: error
                    ? theme.colors.destructive
                    : filled
                      ? theme.colors.primary
                      : theme.colors.border,
                  backgroundColor: error
                    ? theme.colors.destructive
                    : filled
                      ? theme.colors.primary
                      : theme.colors.muted,
                  transform: [{ scale: filled ? 1.15 : 1 }],
                }}
              />
            );
          })}
        </View>

        <View style={styles.keypad}>
          {(
            [
              ["1", "2", "3"],
              ["4", "5", "6"],
              ["7", "8", "9"],
            ] as const
          ).map((row) => (
            <View key={row.join("-")} style={styles.keyRow}>
              {row.map((num) => (
                <Key
                  key={num}
                  label={num}
                  disabled={keypadDisabled}
                  onPress={() => handlePinClick(num)}
                />
              ))}
            </View>
          ))}

          <View style={styles.keyRow}>
            {isRegistered ? (
              <Key
                disabled={keypadDisabled}
                onPress={() => void handleBiometricUnlock()}
                icon={<Fingerprint color={theme.colors.primary} size={26} />}
                accessibilityLabel="Unlock with biometrics"
              />
            ) : (
              <View style={styles.keyEmpty} />
            )}
            <Key
              label="0"
              disabled={keypadDisabled}
              onPress={() => handlePinClick("0")}
            />
            <Key
              disabled={keypadDisabled}
              onPress={handleDelete}
              icon={<Delete color={theme.colors.foreground} size={22} />}
              accessibilityLabel="Delete digit"
            />
          </View>
        </View>

        {isRegistered && lockoutTimeLeft <= 0 ? (
          <Pressable
            onPress={() => void handleBiometricUnlock()}
            style={{
              marginTop: theme.space.lg,
              paddingVertical: theme.space.sm,
              paddingHorizontal: theme.space.lg,
              borderRadius: theme.radius.full,
              borderWidth: 1,
              borderColor: theme.colors.primary,
              flexDirection: "row",
              alignItems: "center",
              gap: theme.space.sm,
            }}
          >
            <Fingerprint color={theme.colors.primary} size={18} />
            <Text
              style={{
                color: theme.colors.primary,
                fontWeight: "700",
                fontSize: theme.typography.sm,
              }}
            >
              Unlock with biometrics
            </Text>
          </Pressable>
        ) : null}

        {failedAttempts > 0 && lockoutTimeLeft <= 0 ? (
          <Text
            style={{
              color: theme.colors.mutedForeground,
              fontSize: 12,
              marginTop: theme.space.md,
            }}
          >
            Failed attempts: {failedAttempts}/5
          </Text>
        ) : null}

        <Pressable
          onPress={() => void logout()}
          style={{ marginTop: theme.space.xl, padding: theme.space.md }}
        >
          <Text
            style={{
              color: theme.colors.mutedForeground,
              fontSize: 11,
              fontWeight: "800",
              textTransform: "uppercase",
              letterSpacing: 1,
              textAlign: "center",
            }}
          >
            Forgot PIN? Sign Out
          </Text>
        </Pressable>
      </View>
    </View>
      ) : null}
    </View>
  );
}

function Key({
  label,
  icon,
  onPress,
  disabled,
  accessibilityLabel,
}: {
  label?: string;
  icon?: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.key,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          opacity: disabled ? 0.3 : pressed ? 0.7 : 1,
        },
      ]}
    >
      {icon ? (
        icon
      ) : (
        <Text
          style={{
            color: theme.colors.foreground,
            fontSize: 24,
            fontWeight: "700",
          }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const KEY_SIZE = 72;
const KEY_GAP = 18;

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 9999,
    alignItems: "center",
    justifyContent: "center",
  },
  inner: {
    width: "100%",
    maxWidth: 320,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  lockBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    marginBottom: 20,
  },
  dots: {
    flexDirection: "row",
    gap: 20,
  },
  keypad: {
    width: KEY_SIZE * 3 + KEY_GAP * 2,
    gap: KEY_GAP,
  },
  keyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  key: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    borderRadius: KEY_SIZE / 2,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  keyEmpty: {
    width: KEY_SIZE,
    height: KEY_SIZE,
  },
});
