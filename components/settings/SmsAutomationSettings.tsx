import { useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { ChevronDown, ChevronUp, MessageSquare } from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useSmsPermission } from "@/hooks/useSmsPermission";
import { toast } from "@/lib/toast";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import type { SmsPermissionStatus } from "@/services/sms/smsPermissions";

function permissionLabel(status: SmsPermissionStatus, supported: boolean): string {
  if (!supported) return "Android only";
  switch (status) {
    case "granted":
      return "Permission granted";
    case "blocked":
      return "Permission blocked — open system settings";
    case "denied":
      return "Permission not granted";
    case "unavailable":
      return "Unavailable on this device";
    default:
      return "Unknown";
  }
}

function RowSwitch({
  label,
  value,
  onValueChange,
  description,
  disabled,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  description?: string;
  disabled?: boolean;
}) {
  const { theme } = useTheme();

  const handleToggle = () => {
    if (disabled) return;
    Haptics.selectionAsync().catch(() => undefined);
    onValueChange(!value);
  };

  return (
    <Pressable
      onPress={handleToggle}
      disabled={disabled}
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
        opacity: disabled ? 0.45 : 1,
      }}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: Boolean(disabled) }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: theme.colors.foreground, fontSize: 15, fontWeight: "600" }}>
          {label}
        </Text>
        {description ? (
          <Text style={{ color: theme.colors.mutedForeground, fontSize: 12 }}>
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
        thumbColor="#FFFFFF"
      />
    </Pressable>
  );
}

/**
 * Settings → Automation → SMS Transaction Reader
 * Phase 1: permission grant/revoke/detect only (no parsing).
 */
export function SmsAutomationSettings() {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const [readerExpanded, setReaderExpanded] = useState(true);
  const {
    supported,
    permissionStatus,
    permissionLoading,
    prefs,
    prefsLoading,
    requestPermission,
    openSystemSettings,
    setEnabled,
    setAutoAdd,
    setReviewBeforeAdding,
  } = useSmsPermission();

  const granted = permissionStatus === "granted";
  const busy = permissionLoading || prefsLoading;

  const onAllowSmsAccess = async () => {
    const status = await requestPermission();
    if (status === "granted") {
      await setEnabled(true);
      toast.success("SMS access allowed");
      return;
    }
    if (status === "blocked") {
      toast.error("SMS permission blocked. Open system settings to enable it.");
      return;
    }
    if (status === "unavailable") {
      toast.info("SMS tracking is only available on Android.");
      return;
    }
    toast.info("SMS access was not granted. You can try again anytime.");
  };

  const onToggleEnabled = async (next: boolean) => {
    const status = await setEnabled(next);
    if (!next) {
      toast.success("SMS reader disabled");
      return;
    }
    if (status === "granted") {
      toast.success("SMS reader enabled");
      return;
    }
    if (status === "blocked") {
      toast.error("Permission blocked. Open system settings to grant SMS access.");
      return;
    }
    if (status === "unavailable") {
      toast.info("SMS tracking is only available on Android.");
      return;
    }
    toast.info("Permission denied. SMS reader stays off.");
  };

  return (
    <Card
      title="Automation"
      subtitle="SMS transaction reader"
      icon={<MessageSquare size={18} color={theme.colors.primary} />}
    >
      <View style={{ gap: theme.space.md }}>
        {/* Intro / allow card */}
        <View
          style={{
            gap: 12,
            padding: 16,
            borderRadius: 16,
            borderCurve: "continuous",
            backgroundColor: isDark
              ? "rgba(107, 99, 255, 0.12)"
              : "rgba(79, 70, 255, 0.06)",
            borderWidth: 1,
            borderColor: isDark
              ? "rgba(107, 99, 255, 0.22)"
              : "rgba(79, 70, 255, 0.12)",
          }}
        >
          <Text
            style={{
              color: theme.colors.foreground,
              fontSize: 18,
              fontWeight: "700",
            }}
          >
            Automatic Expense Tracking
          </Text>
          <Text
            style={{
              color: theme.colors.mutedForeground,
              fontSize: 14,
              lineHeight: 21,
            }}
          >
            Vault can detect transaction SMS from your bank and automatically
            create expenses.
          </Text>

          {!granted ? (
            <Button
              loading={busy}
              disabled={!supported || busy}
              onPress={() => void onAllowSmsAccess()}
            >
              Allow SMS Access
            </Button>
          ) : (
            <Text
              style={{
                color: theme.colors.success,
                fontSize: 13,
                fontWeight: "600",
              }}
            >
              SMS access is allowed
            </Text>
          )}

          <Text style={{ color: theme.colors.mutedForeground, fontSize: 12 }}>
            You can disable this anytime from Settings.
          </Text>

          <Text style={{ color: theme.colors.mutedForeground, fontSize: 12 }}>
            Status: {permissionLabel(permissionStatus, supported)}
          </Text>
        </View>

        {/* SMS Transaction Reader submenu */}
        <View
          style={{
            borderRadius: 14,
            borderCurve: "continuous",
            borderWidth: 1,
            borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
            overflow: "hidden",
          }}
        >
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
              setReaderExpanded((v) => !v);
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 14,
              paddingVertical: 14,
              gap: 12,
            }}
            accessibilityRole="button"
            accessibilityLabel={`SMS Transaction Reader, ${readerExpanded ? "expanded" : "collapsed"}`}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text
                style={{
                  color: theme.colors.foreground,
                  fontSize: 15,
                  fontWeight: "700",
                }}
              >
                SMS Transaction Reader
              </Text>
              <Text style={{ color: theme.colors.mutedForeground, fontSize: 12 }}>
                Enabled / Auto Add / Review
              </Text>
            </View>
            {readerExpanded ? (
              <ChevronUp size={20} color={theme.colors.foreground} />
            ) : (
              <ChevronDown size={20} color={theme.colors.foreground} />
            )}
          </Pressable>

          {readerExpanded ? (
            <View
              style={{
                paddingHorizontal: 14,
                paddingBottom: 12,
                gap: 4,
                borderTopWidth: 1,
                borderTopColor: theme.colors.border,
              }}
            >
              <RowSwitch
                label="Enabled"
                description="Master switch for SMS-based expense tracking"
                value={prefs.enabled}
                disabled={!supported || busy}
                onValueChange={(v) => void onToggleEnabled(v)}
              />
              <RowSwitch
                label="Auto Add"
                description="Create expenses automatically when a bank SMS is detected"
                value={prefs.autoAdd}
                disabled={!supported || busy || !prefs.enabled}
                onValueChange={(v) => void setAutoAdd(v)}
              />
              <RowSwitch
                label="Review Before Adding"
                description="Show candidates for confirmation before they are saved"
                value={prefs.reviewBeforeAdding}
                disabled={!supported || busy || !prefs.enabled}
                onValueChange={(v) => void setReviewBeforeAdding(v)}
              />
            </View>
          ) : null}
        </View>

        <View style={{ gap: 8 }}>
          <Button
            variant="outline"
            disabled={!supported || busy}
            onPress={() => void openSystemSettings()}
          >
            Manage SMS permission in system settings
          </Button>
          <Text style={{ color: theme.colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
            To revoke access, turn off SMS permission in Android settings. Vault
            detects the change when you return.
          </Text>
          {!supported ? (
            <Text style={{ color: theme.colors.mutedForeground, fontSize: 12 }}>
              SMS reading is not available on iOS or web.
            </Text>
          ) : null}
        </View>
      </View>
    </Card>
  );
}
