import { useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { ChevronDown, ChevronUp, MessageSquare } from "lucide-react-native";

import { SmsConsentDialog } from "@/components/privacy/SmsConsentDialog";
import { NotificationConsentDialog } from "@/components/privacy/NotificationConsentDialog";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAccounts } from "@/hooks/useAccounts";
import { useDpdpConsent } from "@/hooks/useDpdpConsent";
import { useSmsPermission } from "@/hooks/useSmsPermission";
import { useSmsReviewInbox } from "@/hooks/useSmsReviewInbox";
import { useAuth } from "@/providers/AuthProvider";
import { useSmsReceiver } from "@/providers/SmsReceiverProvider";
import { toast } from "@/lib/toast";
import { clearSmsLocalStores } from "@/services/privacy/clearLocalUserData";
import { requestSmsNotificationPermission } from "@/services/sms/smsNotifications";
import type { SmsHandlingMode } from "@/services/sms/smsAutomationPrefs";
import { dispatchWriteReady } from "@/services/sms/smsAutoAdd";
import { defaultSmsReader } from "@/services/sms/smsReader";
import type { SmsPermissionStatus } from "@/services/sms/smsPermissions";
import { filterRelevantSms } from "@/services/sms/smsRelevanceFilter";
import {
  loadSmsDedupeKeys,
  mergeSmsDedupeKeys,
} from "@/services/sms/smsDedupeStore";
import { processRawSmsMessages } from "@/services/sms/smsPipeline";
import type { RawSmsMessage } from "@/shared/types/smsTransaction";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

const HANDLING_OPTIONS: Array<{
  mode: SmsHandlingMode;
  label: string;
  description: string;
}> = [
  {
    mode: "manual",
    label: "Manual",
    description: "Scan when you want. Live SMS is not queued or saved.",
  },
  {
    mode: "review",
    label: "Review before adding",
    description: "Send every detected transaction to the Review Inbox.",
  },
  {
    mode: "auto",
    label: "Automatically add",
    description: "Save high-confidence drafts. Low-confidence ones go to Review Inbox.",
  },
];

function handlingModeSummary(enabled: boolean, mode: SmsHandlingMode): string {
  if (!enabled) return "Off";
  if (mode === "auto") return "Automatically add";
  if (mode === "manual") return "Manual";
  return "Review before adding";
}

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
 * Phase 2: permission + local inbox scan (no Firebase upload of raw SMS).
 */
export function SmsAutomationSettings() {
  const router = useRouter();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const [consentOpen, setConsentOpen] = useState(false);
  const [notifyConsentOpen, setNotifyConsentOpen] = useState(false);
  const [consentBusy, setConsentBusy] = useState(false);
  const [readerExpanded, setReaderExpanded] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<{
    total: number;
    relevant: number;
    writeReady: number;
    duplicates: number;
    samples: Array<{ id: string; address: string }>;
  } | null>(null);
  const {
    supported,
    permissionStatus,
    permissionLoading,
    prefs,
    prefsLoading,
    requestPermission,
    openSystemSettings,
    setEnabled,
    setHandlingMode,
  } = useSmsPermission();
  const { purposes, setPurposes } = useDpdpConsent();
  const { user } = useAuth();
  const { accounts } = useAccounts();
  const { listening, inboundStatus } = useSmsReceiver();
  const { count: inboxCount } = useSmsReviewInbox();

  const granted = permissionStatus === "granted";
  const busy = permissionLoading || prefsLoading || scanning || consentBusy;

  const afterSmsGranted = async () => {
    await setPurposes({ sms: true });
    if (!purposes.notifications) {
      setNotifyConsentOpen(true);
    }
  };

  const onAllowSmsAccess = () => {
    setConsentOpen(true);
  };

  const onConfirmSmsConsent = async () => {
    setConsentBusy(true);
    try {
      const status = await requestPermission();
      if (status === "granted") {
        await setEnabled(true);
        await afterSmsGranted();
        setConsentOpen(false);
        toast.success("SMS access allowed");
        return;
      }
      setConsentOpen(false);
      if (status === "blocked") {
        toast.error("SMS permission blocked. Open system settings to enable it.");
        return;
      }
      if (status === "unavailable") {
        toast.info("SMS tracking is only available on Android.");
        return;
      }
      toast.info("SMS access was not granted. You can try again anytime.");
    } finally {
      setConsentBusy(false);
    }
  };

  const onToggleEnabled = async (next: boolean) => {
    if (!next) {
      await setEnabled(false);
      await setPurposes({ sms: false });
      await clearSmsLocalStores();
      toast.success("SMS reader disabled. Consent withdrawn and local queues cleared.");
      return;
    }
    setConsentOpen(true);
  };

  const onScanInboxLocally = async () => {
    if (!supported) {
      toast.info("SMS reading is only available on Android.");
      return;
    }
    if (!granted) {
      toast.info("Allow SMS access first.");
      return;
    }

    setScanning(true);
    try {
      // Local-only: never upload raw SMS / body / sender to Firebase.
      const all = await defaultSmsReader.readMessages({
        limit: 80,
        relevantOnly: false,
      });
      const relevant = filterRelevantSms(all);
      const known = await loadSmsDedupeKeys();
      const pipeline = processRawSmsMessages(relevant, {
        knownDedupeKeys: known,
        accounts,
      });
      await mergeSmsDedupeKeys(known);
      const dispatched = await dispatchWriteReady(pipeline.writeReady, {
        mode: prefs.handlingMode === "auto" ? "auto" : "review",
        uid: user?.uid,
      });
      const duplicates = pipeline.records.filter(
        (r) => r.skipReason === "duplicate"
      ).length;

      const samples = relevant.slice(0, 5).map((m: RawSmsMessage) => ({
        id: m.id,
        address: m.address,
      }));

      setLastScan({
        total: all.length,
        relevant: relevant.length,
        writeReady: pipeline.writeReady.length,
        duplicates,
        samples,
      });

      if (dispatched.committed > 0 && dispatched.queued > 0) {
        toast.success(
          `${dispatched.committed} added, ${dispatched.queued} sent to Review Inbox`
        );
      } else if (dispatched.committed > 0) {
        toast.success(
          `${dispatched.committed} high-confidence transaction${dispatched.committed === 1 ? "" : "s"} added`
        );
      } else if (dispatched.queued > 0) {
        toast.success(
          `${dispatched.queued} transaction${dispatched.queued === 1 ? "" : "s"} added to Transaction Inbox`
        );
      } else {
        toast.success(
          `No new transactions (${duplicates} already seen)`
        );
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not read SMS inbox";
      toast.error(message);
    } finally {
      setScanning(false);
    }
  };

  return (
    <Card
      title="Automation"
      subtitle="SMS transaction reader"
      icon={<MessageSquare size={18} color={theme.colors.primary} />}
    >
      <View style={{ gap: theme.space.md }}>
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
          <Text style={{ color: theme.colors.mutedForeground, fontSize: 12 }}>
            Live detection:{" "}
            {listening
              ? "active (waiting for new SMS)"
              : prefs.enabled && granted
                ? "starting…"
                : "off"}
          </Text>
          {inboundStatus.lastReceivedAtMs ? (
            <Text style={{ color: theme.colors.mutedForeground, fontSize: 12 }}>
              Last SMS event:{" "}
              {new Date(inboundStatus.lastReceivedAtMs).toLocaleString()}
              {inboundStatus.lastSender
                ? ` · ${inboundStatus.lastSender}`
                : ""}
              {inboundStatus.lastDetectionKind
                ? ` · ${inboundStatus.lastDetectionKind}`
                : ""}
              {` · relevant ${inboundStatus.lastRelevantCount}`}
              {inboundStatus.lastWriteReadyCount
                ? ` · new ${inboundStatus.lastWriteReadyCount}`
                : ""}
              {inboundStatus.lastAutoAddedCount
                ? ` · auto-added ${inboundStatus.lastAutoAddedCount}`
                : ""}
              {inboundStatus.lastInboxQueuedCount
                ? ` · inbox ${inboundStatus.lastInboxQueuedCount}`
                : ""}
              {inboundStatus.lastDuplicateCount
                ? ` · duplicates ${inboundStatus.lastDuplicateCount}`
                : ""}
            </Text>
          ) : null}
        </View>

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
                {handlingModeSummary(prefs.enabled, prefs.handlingMode)}
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
                label="SMS Transaction Reader"
                description={prefs.enabled ? "ON" : "Off"}
                value={prefs.enabled}
                disabled={!supported || busy}
                onValueChange={(v) => void onToggleEnabled(v)}
              />
              <Text
                style={{
                  color: theme.colors.foreground,
                  fontSize: 13,
                  fontWeight: "700",
                  marginTop: 8,
                }}
              >
                Transaction handling
              </Text>
              {HANDLING_OPTIONS.map((option) => {
                const selected = prefs.handlingMode === option.mode;
                const disabled = !supported || busy || !prefs.enabled;
                return (
                  <Pressable
                    key={option.mode}
                    onPress={() => {
                      if (disabled) return;
                      Haptics.selectionAsync().catch(() => undefined);
                      void setHandlingMode(option.mode);
                    }}
                    disabled={disabled}
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-start",
                      gap: 12,
                      paddingVertical: 10,
                      opacity: disabled ? 0.45 : 1,
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, disabled }}
                    accessibilityLabel={option.label}
                  >
                    <View
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        borderWidth: 2,
                        borderColor: selected
                          ? theme.colors.primary
                          : theme.colors.mutedForeground,
                        alignItems: "center",
                        justifyContent: "center",
                        marginTop: 1,
                      }}
                    >
                      {selected ? (
                        <View
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 5,
                            backgroundColor: theme.colors.primary,
                          }}
                        />
                      ) : null}
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text
                        style={{
                          color: theme.colors.foreground,
                          fontSize: 15,
                          fontWeight: "600",
                        }}
                      >
                        {option.label}
                      </Text>
                      <Text
                        style={{
                          color: theme.colors.mutedForeground,
                          fontSize: 12,
                          lineHeight: 17,
                        }}
                      >
                        {option.description}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
              <Text
                style={{
                  color: theme.colors.mutedForeground,
                  fontSize: 12,
                  lineHeight: 18,
                  marginTop: 4,
                }}
              >
                High-confidence transactions can be automatically added.
                Low-confidence ones go to Review Inbox.
              </Text>
            </View>
          ) : null}
        </View>

        <View style={{ gap: 8 }}>
          <Button
            variant="primary"
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
              router.push("/sms-inbox" as any);
            }}
          >
            {inboxCount > 0
              ? `Open Transaction Inbox (${inboxCount})`
              : "Open Transaction Inbox"}
          </Button>
          <Button
            variant="tonal"
            loading={scanning}
            disabled={!supported || !granted || busy || !purposes.sms}
            onPress={() => void onScanInboxLocally()}
          >
            Scan inbox locally
          </Button>
          {lastScan ? (
            <View style={{ gap: 4 }}>
              <Text style={{ color: theme.colors.mutedForeground, fontSize: 12 }}>
                Last local scan: {lastScan.writeReady} new of {lastScan.relevant}{" "}
                relevant ({lastScan.duplicates} duplicates, {lastScan.total}{" "}
                recent, not uploaded)
              </Text>
              {lastScan.samples.length > 0 ? (
                <Text style={{ color: theme.colors.mutedForeground, fontSize: 12 }}>
                  Senders:{" "}
                  {lastScan.samples.map((s) => s.address || "(unknown)").join(", ")}
                </Text>
              ) : null}
            </View>
          ) : null}

          <Button
            variant="outline"
            disabled={!supported || busy}
            onPress={() => void openSystemSettings()}
          >
            Manage SMS permission in system settings
          </Button>
          <Text style={{ color: theme.colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
            Raw SMS stays on your device and is not uploaded. Turn the reader off here to
            withdraw consent and clear the local review queue. You can also revoke SMS
            permission in Android settings.
          </Text>
          {!supported ? (
            <Text style={{ color: theme.colors.mutedForeground, fontSize: 12 }}>
              SMS reading is not available on iOS or web.
            </Text>
          ) : null}
        </View>
      </View>
      <SmsConsentDialog
        isOpen={consentOpen}
        onClose={() => setConsentOpen(false)}
        confirming={consentBusy}
        onConfirm={() => void onConfirmSmsConsent()}
      />
      <NotificationConsentDialog
        isOpen={notifyConsentOpen}
        onClose={() => setNotifyConsentOpen(false)}
        onConfirm={() => {
          void (async () => {
            await setPurposes({ notifications: true });
            await requestSmsNotificationPermission();
            setNotifyConsentOpen(false);
          })();
        }}
      />
    </Card>
  );
}
