import { useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { doc, setDoc } from "firebase/firestore";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { getFirestoreDb } from "@/lib/firebase";
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
} from "@/theme/tokens";

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
 * Phase 3 settings subset — profile, general prefs, personalize.
 * Privacy / Manage / Accounts / Data deferred.
 */
export default function SettingsScreen() {
  const { theme, themeName, setThemeName } = useTheme();
  const { user, logout } = useAuth();
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
  } = useSettings();
  const { settings: system } = useSystemSettings();

  const [username, setUsername] = useState("");
  const [budgetText, setBudgetText] = useState(String(settings.monthlyBudget || 0));
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    setUsername(typeof data?.username === "string" ? data.username : "");
  }, [data?.username]);

  useEffect(() => {
    setBudgetText(String(settings.monthlyBudget || 0));
  }, [settings.monthlyBudget]);

  const onSaveProfile = async () => {
    const db = getFirestoreDb();
    if (!user || !db) return;
    setSavingProfile(true);
    try {
      await setDoc(
        doc(db, "users", user.uid),
        {
          username: username.trim(),
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
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
    <SafeAreaView
      edges={["bottom"]}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <ScrollView
        contentContainerStyle={{
          padding: theme.space.lg,
          gap: theme.space.lg,
          paddingBottom: theme.space.xxl,
        }}
        keyboardShouldPersistTaps="handled"
      >
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

            <Text style={{ color: theme.colors.mutedForeground, fontSize: 12 }}>
              enableInvestments: {settings.enableInvestments ? "on" : "off"} (user
              flag; UI toggle later)
            </Text>
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
          </View>
        </Card>

        <Text
          style={{
            color: theme.colors.mutedForeground,
            fontSize: theme.typography.xs,
            textAlign: "center",
          }}
        >
          Privacy, accounts, budgets, and data tools arrive in later phases.
        </Text>
      </ScrollView>
    </SafeAreaView>
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
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: theme.space.md,
      }}
    >
      <Text style={{ color: theme.colors.foreground, flex: 1 }}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
      />
    </View>
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
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space.sm }}>
      {options.map((opt) => {
        const active = opt.value === selected;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onSelect(opt.value)}
            style={{
              paddingHorizontal: theme.space.md,
              paddingVertical: theme.space.sm,
              borderRadius: theme.radius.full,
              borderWidth: 1,
              borderColor: active ? theme.colors.primary : theme.colors.border,
              backgroundColor: active ? theme.colors.primary : theme.colors.card,
            }}
          >
            <Text
              style={{
                color: active
                  ? theme.colors.primaryForeground
                  : theme.colors.foreground,
                fontSize: theme.typography.sm,
                fontWeight: "600",
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
