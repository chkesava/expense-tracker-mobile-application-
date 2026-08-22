import { useEffect, useRef, useState, useCallback } from "react";
import { Text, View } from "react-native";
import { useFocusEffect } from "expo-router";

import {
  ChipRow,
  FieldLabel,
  RowSwitch,
  SettingsPanel,
} from "@/components/settings/SettingsControls";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { haptic } from "@/lib/haptics";
import { toast } from "@/lib/toast";
import { useTranslation, SUPPORTED_LANGUAGES } from "@/providers/LocalizationProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import type {
  DateFormatOption,
  DefaultView,
  FirstDayOfWeekOption,
  NavigationStyle,
  NumberFormatOption,
} from "@/shared/types/settings";
import { SUPPORTED_CURRENCIES } from "@/shared/utils/formatCurrency";
import { useTheme } from "@/theme/ThemeProvider";

const DEFAULT_VIEWS: { value: DefaultView; label: string }[] = [
  { value: "dashboard", label: "Dashboard" },
  { value: "expenses", label: "Expenses" },
  { value: "analytics", label: "Analytics" },
  { value: "add", label: "Add" },
];

const DATE_FORMAT_OPTIONS: { value: DateFormatOption; label: string }[] = [
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
  { value: "DD MMM YYYY", label: "DD MMM YYYY" },
];

const NUMBER_FORMAT_OPTIONS: { value: NumberFormatOption; label: string }[] = [
  { value: "auto", label: "Auto (Regional)" },
  { value: "standard", label: "Standard (1,000,000)" },
  { value: "lakhs", label: "Indian (10,00,000)" },
];

const FIRST_DAY_OPTIONS: { value: FirstDayOfWeekOption; label: string }[] = [
  { value: "monday", label: "Monday" },
  { value: "sunday", label: "Sunday" },
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

export function PreferencesSection() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const {
    settings,
    setTimezone,
    setDefaultView,
    setUpiId,
    setLockPastMonths,
    setNavigationStyle,
    setDefaultCategory,
    setEnableInvestments,
    setCompactListMode,
    setHapticFeedback,
    setCurrency,
    setLanguage,
    setDateFormat,
    setNumberFormat,
    setFirstDayOfWeek,
  } = useSettings();
  const { settings: system } = useSystemSettings();

  const timezones = COMMON_TIMEZONES.includes(settings.timezone)
    ? COMMON_TIMEZONES
    : [settings.timezone, ...COMMON_TIMEZONES];

  const [categoryText, setCategoryText] = useState(settings.defaultCategory);
  const [upiText, setUpiText] = useState(settings.upiId);
  const categoryFocusedRef = useRef(false);
  const upiFocusedRef = useRef(false);
  const categoryTextRef = useRef(categoryText);
  const upiTextRef = useRef(upiText);
  const cloudCategoryRef = useRef(settings.defaultCategory);
  const cloudUpiRef = useRef(settings.upiId);
  categoryTextRef.current = categoryText;
  upiTextRef.current = upiText;
  cloudCategoryRef.current = settings.defaultCategory;
  cloudUpiRef.current = settings.upiId;

  useEffect(() => {
    if (!categoryFocusedRef.current) setCategoryText(settings.defaultCategory);
  }, [settings.defaultCategory]);

  useEffect(() => {
    if (!upiFocusedRef.current) setUpiText(settings.upiId);
  }, [settings.upiId]);

  useEffect(() => {
    if (categoryText === settings.defaultCategory) return;
    const timer = setTimeout(() => setDefaultCategory(categoryText), 500);
    return () => clearTimeout(timer);
  }, [categoryText, setDefaultCategory, settings.defaultCategory]);

  useEffect(() => {
    if (upiText === settings.upiId) return;
    const timer = setTimeout(() => setUpiId(upiText), 500);
    return () => clearTimeout(timer);
  }, [setUpiId, settings.upiId, upiText]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        if (categoryTextRef.current !== cloudCategoryRef.current) {
          setDefaultCategory(categoryTextRef.current);
        }
        if (upiTextRef.current !== cloudUpiRef.current) {
          setUpiId(upiTextRef.current);
        }
      };
    }, [setDefaultCategory, setUpiId])
  );

  return (
    <View style={{ gap: 16 }}>
      <SettingsPanel
        title="Defaults"
        subtitle={`System currency: ${system.defaultCurrency}`}
      >
        <Input
          label="Default category"
          value={categoryText}
          onChangeText={setCategoryText}
          placeholder="Food & Dining"
          onFocus={() => {
            categoryFocusedRef.current = true;
          }}
          onBlur={() => {
            categoryFocusedRef.current = false;
            setDefaultCategory(categoryText);
          }}
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
          label="UPI ID"
          value={upiText}
          onChangeText={setUpiText}
          autoCapitalize="none"
          placeholder="name@bank"
          onFocus={() => {
            upiFocusedRef.current = true;
          }}
          onBlur={() => {
            upiFocusedRef.current = false;
            setUpiId(upiText);
          }}
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

        <RowSwitch
          label="Compact transaction list"
          value={settings.compactListMode}
          onValueChange={setCompactListMode}
        />
        <Text
          style={{
            color: theme.colors.mutedForeground,
            fontSize: theme.typography.xs,
          }}
        >
          Tighter rows in Transactions — hides the category/account sub-line to
          fit more on screen.
        </Text>
      </SettingsPanel>

      <SettingsPanel title="Language & formats">
        <FieldLabel label={t("currency_label", "Preferred Currency")} />
        <ChipRow
          options={SUPPORTED_CURRENCIES.map((c) => ({
            value: c.code,
            label: `${c.flag} ${c.code} (${c.symbol})`,
          }))}
          selected={settings.currency || "INR"}
          onSelect={(v) => {
            setCurrency(v);
            toast.success(`Currency set to ${v}`);
          }}
        />

        <FieldLabel label={t("language_label", "Language")} />
        <ChipRow
          options={SUPPORTED_LANGUAGES.map((l) => ({
            value: l.code,
            label: `${l.flag} ${l.nativeLabel}`,
          }))}
          selected={settings.language || "en"}
          onSelect={(v) => {
            setLanguage(v);
            toast.success("Language updated");
          }}
        />

        <FieldLabel label={t("date_format_label", "Date Format")} />
        <ChipRow
          options={DATE_FORMAT_OPTIONS}
          selected={settings.dateFormat || "YYYY-MM-DD"}
          onSelect={(v) => setDateFormat(v as DateFormatOption)}
        />

        <FieldLabel label={t("number_format_label", "Number Format")} />
        <ChipRow
          options={NUMBER_FORMAT_OPTIONS}
          selected={settings.numberFormat || "auto"}
          onSelect={(v) => setNumberFormat(v as NumberFormatOption)}
        />

        <FieldLabel label={t("first_day_of_week_label", "First Day of Week")} />
        <ChipRow
          options={FIRST_DAY_OPTIONS}
          selected={settings.firstDayOfWeek || "monday"}
          onSelect={(v) => setFirstDayOfWeek(v as FirstDayOfWeekOption)}
        />
      </SettingsPanel>

      <SettingsPanel title="Navigation & haptics">
        <FieldLabel label="Navigation style" />
        <ChipRow
          options={NAV_STYLES}
          selected={settings.navigationStyle}
          onSelect={(v) => setNavigationStyle(v as NavigationStyle)}
        />

        <RowSwitch
          label="Haptic feedback"
          value={settings.hapticFeedback}
          onValueChange={setHapticFeedback}
        />

        {settings.hapticFeedback ? (
          <View style={{ gap: 8 }}>
            <Text
              style={{
                color: theme.colors.mutedForeground,
                fontSize: theme.typography.xs,
              }}
            >
              Test vibration patterns:
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
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
      </SettingsPanel>
    </View>
  );
}
