import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  Switch,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { doc, setDoc } from "firebase/firestore";
import { ListChecks, RotateCcw, EyeOff, Settings as SettingsIcon, X } from "lucide-react-native";

import { CategoryManager } from "@/components/categories/CategoryManager";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useBiometrics } from "@/hooks/useBiometrics";
import { getFirestoreDb } from "@/lib/firebase";
import { haptic } from "@/lib/haptics";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import { useUserDoc } from "@/providers/UserDocProvider";
import type { DefaultView, NavigationStyle } from "@/shared/types/settings";
import { useTheme } from "@/theme/ThemeProvider";
import {
  THEME_LABELS,
  THEME_NAMES,
  type ThemeName,
  themeUsesDarkPalette,
} from "@/theme/tokens";
import {
  DashboardWidgetToggles,
  AutoCategorizationRulesManager,
  CategoryBudgetsManager,
  FinancialGoalsManager,
  AccountTypesManager,
  AccountsManager,
} from "@/components/settings/SettingsSubmenus";
import { useSetupProgress } from "@/providers/SetupProgressProvider";

const INACTIVITY_OPTIONS = [
  { value: "15", label: "15s" },
  { value: "30", label: "30s" },
  { value: "60", label: "1m" },
  { value: "300", label: "5m" },
  { value: "600", label: "10m" },
];

const DEFAULT_VIEWS: { value: DefaultView; label: string }[] = [
  { value: "dashboard", label: "Dashboard" },
  { value: "expenses", label: "Expenses" },
  { value: "analytics", label: "Analytics" },
  { value: "add", label: "Add" },
];

const NAV_STYLES: { value: NavigationStyle; label: string }[] = [
  { value: "bottom", label: "Bottom tabs" },
  { value: "dock", label: "Action dock" },
];

const COMMON_TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
];

/**
 * Settings — profile, general, personalize, privacy.
 */
export default function SettingsScreen() {
  const { theme, themeName, setThemeName } = useTheme();
  const { user, realUser, logout } = useAuth();
  const { data, role, isAdmin } = useUserDoc();
  const {
    settings,
    setTimezone,
    setDefaultView,
    setMonthlyBudget,
    setUpiId,
    setLockPastMonths,
    setNavigationStyle,
    setDefaultCategory,
    setEnableInvestments,
    setHapticFeedback,
    setPrivacyPin,
    setFakePin,
    setLockOnInactivity,
    setInactivityTimeout,
    setLockOnAppSwitch,
  } = useSettings();
  const { settings: system } = useSystemSettings();
  const {
    isSupported: biometricsSupported,
    isRegistered: biometricsRegistered,
    register: registerBiometrics,
    unregister: unregisterBiometrics,
  } = useBiometrics();

  const [username, setUsername] = useState("");
  const [budgetText, setBudgetText] = useState(String(settings.monthlyBudget || 0));
  const [savingProfile, setSavingProfile] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [newFakePin, setNewFakePin] = useState("");
  const [confirmFakePin, setConfirmFakePin] = useState("");
  const [showCategoryManagerModal, setShowCategoryManagerModal] = useState(false);

  useEffect(() => {
    setUsername(typeof data?.username === "string" ? data.username : "");
  }, [data?.username]);

  useEffect(() => {
    setBudgetText(String(settings.monthlyBudget || 0));
  }, [settings.monthlyBudget]);

  const onSaveProfile = async () => {
    const db = getFirestoreDb();
    if (!realUser || !db) return;
    setSavingProfile(true);
    try {
      await setDoc(
        doc(db, "users", realUser.uid),
        {
          username: username.trim(),
          email: realUser.email,
          displayName: realUser.displayName,
          photoURL: realUser.photoURL,
        },
        { merge: true }
      );
      toast.success("Profile saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save profile");
    } finally {
      setSavingProfile(false);
    }
  };

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

  const onEnableFakePin = () => {
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
    if (newFakePin === settings.privacyPin) {
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

  const onLogout = async () => {
    try {
      await logout();
      toast.success("Signed out");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Logout failed");
    }
  };

  const timezones = COMMON_TIMEZONES.includes(settings.timezone)
    ? COMMON_TIMEZONES
    : [settings.timezone, ...COMMON_TIMEZONES];

  return (
    <PageShell contentContainerStyle={{ gap: theme.space.lg }}>
      <PageHeader
        title="Settings"
        subtitle="Preferences & Security"
        icon={<SettingsIcon size={22} color={theme.colors.primary} />}
      />

      {/* Getting Started — onboarding controls */}
      <GettingStartedCard />

      <Card title="Profile" subtitle={`${role}${isAdmin ? " · admin" : ""}`}>
        <View style={{ gap: theme.space.md }}>
          <Text style={{ color: theme.colors.mutedForeground, fontSize: theme.typography.sm }}>
            {user?.displayName || "—"} · {user?.email || "—"}
          </Text>
          <Input
            label="Username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            placeholder="yourname"
          />
          <Button loading={savingProfile} onPress={onSaveProfile}>
            Save profile
          </Button>
          <Button variant="destructive" onPress={onLogout}>
            Sign out
          </Button>
        </View>
      </Card>

      <Card title="General" subtitle={`Currency from system: ${system.defaultCurrency}`}>
        <View style={{ gap: theme.space.md }}>
          <Input
            label="Default category"
            value={settings.defaultCategory}
            onChangeText={setDefaultCategory}
            placeholder="Food & Dining"
          />

          <FieldLabel label="Timezone" />
          <ChipRow
            options={timezones.map((tz) => ({ value: tz, label: tz }))}
            selected={settings.timezone}
            onSelect={setTimezone}
          />

          <FieldLabel label="Default view" />
          <ChipRow
            options={DEFAULT_VIEWS}
            selected={settings.defaultView}
            onSelect={(v) => setDefaultView(v as DefaultView)}
          />

          <Input
            label="Monthly budget"
            value={budgetText}
            onChangeText={setBudgetText}
            keyboardType="numeric"
            onBlur={() => {
              const n = Number(budgetText);
              setMonthlyBudget(Number.isFinite(n) ? Math.max(0, n) : 0);
            }}
          />

          <Input
            label="UPI ID"
            value={settings.upiId}
            onChangeText={setUpiId}
            autoCapitalize="none"
            placeholder="name@bank"
          />

          <RowSwitch
            label="Lock past months"
            value={settings.lockPastMonths}
            onValueChange={setLockPastMonths}
          />

          <RowSwitch
            label="Enable Investments feature"
            value={settings.enableInvestments}
            onValueChange={setEnableInvestments}
          />
        </View>
      </Card>

      <Card
        title="Categories & Taxonomy"
        subtitle="Manage hierarchy, colors, emojis & merge categories"
      >
        <View style={{ gap: theme.space.md }}>
          <Text
            style={{
              color: theme.colors.mutedForeground,
              fontSize: theme.typography.sm,
              lineHeight: 18,
            }}
          >
            Customize your expense categories, add subcategories, set favorites, or merge categories with automatic historical rewrites.
          </Text>
          <Button
            variant="outline"
            onPress={() => setShowCategoryManagerModal(true)}
          >
            Open Category Manager
          </Button>
        </View>
      </Card>

      <Card title="Personalize" subtitle="Synced to your account">
        <View style={{ gap: theme.space.md }}>
          <FieldLabel label="Theme" />
          <ChipRow
            options={THEME_NAMES.map((name) => ({
              value: name,
              label: THEME_LABELS[name],
            }))}
            selected={themeName}
            onSelect={(v) => setThemeName(v as ThemeName)}
          />

          <FieldLabel label="Navigation style" />
          <ChipRow
            options={NAV_STYLES}
            selected={settings.navigationStyle}
            onSelect={(v) => setNavigationStyle(v as NavigationStyle)}
          />

          <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: theme.space.sm }} />

          <RowSwitch
            label="Haptic feedback"
            value={settings.hapticFeedback}
            onValueChange={setHapticFeedback}
          />

          {settings.hapticFeedback ? (
            <View style={{ gap: theme.space.xs, marginTop: -theme.space.xs }}>
              <Text
                style={{
                  color: theme.colors.mutedForeground,
                  fontSize: theme.typography.xs,
                }}
              >
                Test vibration patterns:
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space.xs }}>
                <Button
                  size="sm"
                  variant="outline"
                  onPress={() => {
                    void haptic.save();
                    toast.success("Save vibration tested");
                  }}
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onPress={() => {
                    void haptic.delete();
                    toast.show("Delete vibration tested", "message");
                  }}
                >
                  Delete
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onPress={() => {
                    void haptic.success();
                    toast.success("Success vibration tested");
                  }}
                >
                  Success
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onPress={() => {
                    void haptic.error();
                    toast.error("Error vibration tested");
                  }}
                >
                  Error
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onPress={() => {
                    void haptic.navigation();
                    toast.info("Navigation vibration tested");
                  }}
                >
                  Navigation
                </Button>
              </View>
            </View>
          ) : null}

          <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: theme.space.sm }} />
          <DashboardWidgetToggles />

          <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: theme.space.sm }} />
          <AutoCategorizationRulesManager />
        </View>
      </Card>

      <CategoryBudgetsManager />

      <FinancialGoalsManager />

      <AccountTypesManager />

      <AccountsManager />

      <Card title="Privacy" subtitle="PIN, duress, lock, biometrics">
        <View style={{ gap: theme.space.md }}>
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
                  {biometricsRegistered
                    ? "Disable biometrics"
                    : "Enable biometrics"}
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
                Opens an isolated empty vault ({`{uid}_duress`}). Must differ from
                your real PIN.
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
                    onChangeText={(t) =>
                      setNewFakePin(t.replace(/\D/g, "").slice(0, 4))
                    }
                    keyboardType="number-pad"
                    secureTextEntry
                    maxLength={4}
                  />
                  <Input
                    label="Confirm duress PIN"
                    value={confirmFakePin}
                    onChangeText={(t) =>
                      setConfirmFakePin(t.replace(/\D/g, "").slice(0, 4))
                    }
                    keyboardType="number-pad"
                    secureTextEntry
                    maxLength={4}
                  />
                  <Button onPress={onEnableFakePin}>Enable duress PIN</Button>
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
                onChangeText={(t) => setNewPin(t.replace(/\D/g, "").slice(0, 4))}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={4}
              />
              <Input
                label="Confirm PIN"
                value={confirmPin}
                onChangeText={(t) =>
                  setConfirmPin(t.replace(/\D/g, "").slice(0, 4))
                }
                keyboardType="number-pad"
                secureTextEntry
                maxLength={4}
              />
              <Button onPress={onEnablePin}>Enable privacy PIN</Button>
            </>
          )}
        </View>
      </Card>

      <Modal
        visible={showCategoryManagerModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCategoryManagerModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: theme.colors.background,
            paddingTop: 16,
            paddingHorizontal: 16,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: "800",
                color: theme.colors.foreground,
              }}
            >
              Categories & Taxonomy
            </Text>
            <Pressable
              onPress={() => setShowCategoryManagerModal(false)}
              style={{
                padding: 8,
                borderRadius: 20,
                backgroundColor: theme.colors.muted,
              }}
            >
              <X size={18} color={theme.colors.foreground} />
            </Pressable>
          </View>
          <CategoryManager />
        </View>
      </Modal>
    </PageShell>
  );
}

function FieldLabel({ label }: { label: string }) {
  const { theme } = useTheme();
  return (
    <Text
      style={{
        color: theme.colors.mutedForeground,
        fontSize: theme.typography.xs,
        fontWeight: "600",
      }}
    >
      {label}
    </Text>
  );
}

function RowSwitch({
  label,
  value,
  onValueChange,
  description,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  description?: string;
}) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const handleToggle = () => {
    Haptics.selectionAsync().catch(() => undefined);
    onValueChange(!value);
  };

  return (
    <Pressable
      onPress={handleToggle}
      android_ripple={{
        color: theme.colors.primary + "14",
        borderless: false,
      }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: theme.space.md,
        minHeight: 52,
        paddingVertical: 8,
        paddingHorizontal: 4,
      }}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.colors.foreground, fontSize: 15, fontWeight: "600" }}>
          {label}
        </Text>
        {description ? (
          <Text style={{ color: theme.colors.mutedForeground, fontSize: 12, marginTop: 2 }}>
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
        thumbColor="#FFFFFF"
      />
    </Pressable>
  );
}

function ChipRow<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: { value: T; label: string }[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((opt) => {
        const active = opt.value === selected;
        return (
          <Pressable
            key={opt.value}
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
              onSelect(opt.value);
            }}
            android_ripple={{
              color: active ? "rgba(255,255,255,0.2)" : theme.colors.primary + "1A",
              borderless: false,
            }}
            style={{
              paddingHorizontal: 16,
              minHeight: 40,
              justifyContent: "center",
              alignItems: "center",
              borderRadius: 20,
              borderWidth: 1,
              borderColor: active ? theme.colors.primary : theme.colors.border,
              backgroundColor: active
                ? theme.colors.primary
                : isDark
                ? "rgba(255,255,255,0.03)"
                : "rgba(0,0,0,0.02)",
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
          >
            <Text
              style={{
                color: active
                  ? theme.colors.primaryForeground
                  : theme.colors.foreground,
                fontSize: 14,
                fontWeight: active ? "700" : "500",
              }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function GettingStartedCard() {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const router = useRouter();

  let setupProgress: ReturnType<typeof useSetupProgress> | null = null;
  try {
    setupProgress = useSetupProgress();
  } catch {
    // SetupProgressProvider not yet mounted — skip rendering
    return null;
  }

  if (!setupProgress) return null;

  const {
    completedCount,
    totalCount,
    progress,
    isOnboarding,
    dismissOnboarding,
    resetOnboarding,
  } = setupProgress;

  return (
    <Card
      title="Getting Started"
      subtitle={
        isOnboarding
          ? `${completedCount} / ${totalCount} steps completed`
          : "Setup complete!"
      }
    >
      <View style={{ gap: theme.space.md }}>
        {/* Progress bar */}
        <View
          style={{
            height: 6,
            borderRadius: 3,
            backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
            overflow: "hidden",
          }}
        >
          <View
            style={{
              height: 6,
              borderRadius: 3,
              backgroundColor: theme.colors.primary,
              width: `${Math.round(progress * 100)}%`,
            }}
          />
        </View>

        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            router.push("/dashboard");
          }}
          android_ripple={{
            color: theme.colors.primary + "14",
            borderless: false,
          }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            minHeight: 48,
            paddingVertical: 10,
            paddingHorizontal: 6,
            borderRadius: 12,
          }}
        >
          <ListChecks size={20} color={theme.colors.primary} />
          <Text
            style={{
              color: theme.colors.foreground,
              fontSize: 15,
              fontWeight: "700",
            }}
          >
            View Setup Checklist
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
            resetOnboarding();
          }}
          android_ripple={{
            color: theme.colors.primary + "14",
            borderless: false,
          }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            minHeight: 48,
            paddingVertical: 10,
            paddingHorizontal: 6,
            borderRadius: 12,
          }}
        >
          <RotateCcw size={20} color={theme.colors.mutedForeground} />
          <Text
            style={{
              color: theme.colors.foreground,
              fontSize: 15,
              fontWeight: "600",
            }}
          >
            Restart Onboarding
          </Text>
        </Pressable>

        {isOnboarding && (
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
              dismissOnboarding();
            }}
            android_ripple={{
              color: theme.colors.primary + "14",
              borderless: false,
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              minHeight: 48,
              paddingVertical: 10,
              paddingHorizontal: 6,
              borderRadius: 12,
            }}
          >
            <EyeOff size={20} color={theme.colors.mutedForeground} />
            <Text
              style={{
                color: theme.colors.mutedForeground,
                fontSize: 15,
                fontWeight: "600",
              }}
            >
              Hide Onboarding
            </Text>
          </Pressable>
        )}
      </View>
    </Card>
  );
}
