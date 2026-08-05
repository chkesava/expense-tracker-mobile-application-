import { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import {
  Calendar,
  ChevronRight,
  MapPin,
  Wallet,
  X,
} from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import { useTrips } from "@/hooks/useTrips";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import type { TripCategoryBudget } from "@/shared/types/trip";
import { TRIP_BUDGET_CATEGORIES } from "@/shared/utils/tripCalculations";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface CreateTripModalProps {
  visible: boolean;
  onClose: () => void;
}

type WizardStep = 1 | 2 | 3;

export function CreateTripModal({ visible, onClose }: CreateTripModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { settings: system } = useSystemSettings();
  const { createTrip } = useTrips();

  const [step, setStep] = useState<WizardStep>(1);

  // Step 1: Basics
  const [tripName, setTripName] = useState("");
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Step 2: Budget
  const [totalBudget, setTotalBudget] = useState("");
  const [categoryBudgets, setCategoryBudgets] = useState<
    Record<string, string>
  >({});

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setStep(1);
      setTripName("");
      setDestination("");
      setStartDate("");
      setEndDate("");
      setTotalBudget("");
      setCategoryBudgets({});
    }
  }, [visible]);

  const handleNext = () => {
    if (step === 1) {
      if (!destination.trim()) {
        Alert.alert("Error", "Please enter a destination.");
        return;
      }
      if (!startDate || !endDate) {
        Alert.alert("Error", "Please enter both start and end dates (YYYY-MM-DD).");
        return;
      }
      if (startDate > endDate) {
        Alert.alert("Error", "Start date must be before end date.");
        return;
      }
    }

    if (step === 2) {
      if (!totalBudget || parseFloat(totalBudget) <= 0) {
        Alert.alert("Error", "Please enter a valid total budget.");
        return;
      }
    }

    Haptics.selectionAsync().catch(() => undefined);
    setStep((prev) => Math.min(3, prev + 1) as WizardStep);
  };

  const handleBack = () => {
    Haptics.selectionAsync().catch(() => undefined);
    setStep((prev) => Math.max(1, prev - 1) as WizardStep);
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      const budgets: TripCategoryBudget[] = Object.entries(categoryBudgets)
        .filter(([, val]) => val && parseFloat(val) > 0)
        .map(([category, val]) => ({
          category,
          limit: parseFloat(val),
        }));

      await createTrip({
        tripName: tripName.trim() || destination.trim(),
        destination: destination.trim(),
        startDate,
        endDate,
        totalBudget: parseFloat(totalBudget),
        status: "active",
        categoryBudgets: budgets,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined
      );
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const stepTitles = ["Trip Details", "Budget Setup", "Review & Create"];
  const stepSubtitles = [
    "Where are you going?",
    "Set your spending limits",
    "Confirm your trip plan",
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.modalCard,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text
                style={[styles.title, { color: theme.colors.cardForeground }]}
              >
                {stepTitles[step - 1]}
              </Text>
              <Text
                style={[
                  styles.subtitle,
                  { color: theme.colors.mutedForeground },
                ]}
              >
                {stepSubtitles[step - 1]}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeButton,
                pressed && { opacity: 0.6 },
              ]}
            >
              <X size={20} color={theme.colors.mutedForeground} />
            </Pressable>
          </View>

          {/* Step Progress Indicator */}
          <View style={styles.stepRow}>
            {([1, 2, 3] as WizardStep[]).map((s) => (
              <View
                key={s}
                style={[
                  styles.stepDot,
                  {
                    backgroundColor:
                      s <= step ? theme.colors.primary : theme.colors.muted,
                    flex: 1,
                    height: s === step ? 4 : 3,
                  },
                ]}
              />
            ))}
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={{ gap: 16, paddingBottom: 16 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* ─── Step 1: Basics ─── */}
            {step === 1 && (
              <>
                <View style={{ gap: 6 }}>
                  <Text
                    style={[
                      styles.fieldLabel,
                      { color: theme.colors.mutedForeground },
                    ]}
                  >
                    DESTINATION *
                  </Text>
                  <TextInput
                    value={destination}
                    onChangeText={setDestination}
                    placeholder="e.g. Goa, Manali, Bangkok"
                    placeholderTextColor={theme.colors.mutedForeground}
                    style={[
                      styles.input,
                      {
                        backgroundColor: isDark
                          ? "rgba(255,255,255,0.04)"
                          : "rgba(0,0,0,0.02)",
                        borderColor: theme.colors.border,
                        color: theme.colors.foreground,
                      },
                    ]}
                  />
                </View>

                <View style={{ gap: 6 }}>
                  <Text
                    style={[
                      styles.fieldLabel,
                      { color: theme.colors.mutedForeground },
                    ]}
                  >
                    TRIP NAME (optional)
                  </Text>
                  <TextInput
                    value={tripName}
                    onChangeText={setTripName}
                    placeholder="e.g. Summer Goa Trip 2026"
                    placeholderTextColor={theme.colors.mutedForeground}
                    style={[
                      styles.input,
                      {
                        backgroundColor: isDark
                          ? "rgba(255,255,255,0.04)"
                          : "rgba(0,0,0,0.02)",
                        borderColor: theme.colors.border,
                        color: theme.colors.foreground,
                      },
                    ]}
                  />
                </View>

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text
                      style={[
                        styles.fieldLabel,
                        { color: theme.colors.mutedForeground },
                      ]}
                    >
                      START DATE *
                    </Text>
                    <TextInput
                      value={startDate}
                      onChangeText={setStartDate}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={theme.colors.mutedForeground}
                      style={[
                        styles.input,
                        {
                          backgroundColor: isDark
                            ? "rgba(255,255,255,0.04)"
                            : "rgba(0,0,0,0.02)",
                          borderColor: theme.colors.border,
                          color: theme.colors.foreground,
                        },
                      ]}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text
                      style={[
                        styles.fieldLabel,
                        { color: theme.colors.mutedForeground },
                      ]}
                    >
                      END DATE *
                    </Text>
                    <TextInput
                      value={endDate}
                      onChangeText={setEndDate}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={theme.colors.mutedForeground}
                      style={[
                        styles.input,
                        {
                          backgroundColor: isDark
                            ? "rgba(255,255,255,0.04)"
                            : "rgba(0,0,0,0.02)",
                          borderColor: theme.colors.border,
                          color: theme.colors.foreground,
                        },
                      ]}
                    />
                  </View>
                </View>
              </>
            )}

            {/* ─── Step 2: Budget ─── */}
            {step === 2 && (
              <>
                <View style={{ gap: 6 }}>
                  <Text
                    style={[
                      styles.fieldLabel,
                      { color: theme.colors.mutedForeground },
                    ]}
                  >
                    TOTAL TRIP BUDGET ({system.defaultCurrency}) *
                  </Text>
                  <TextInput
                    value={totalBudget}
                    onChangeText={setTotalBudget}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    placeholderTextColor={theme.colors.mutedForeground}
                    style={[
                      styles.input,
                      {
                        backgroundColor: isDark
                          ? "rgba(255,255,255,0.04)"
                          : "rgba(0,0,0,0.02)",
                        borderColor: theme.colors.border,
                        color: theme.colors.foreground,
                        fontSize: theme.typography.lg,
                        fontWeight: "700",
                      },
                    ]}
                  />
                </View>

                <Text
                  style={[
                    styles.fieldLabel,
                    { color: theme.colors.mutedForeground },
                  ]}
                >
                  CATEGORY LIMITS (optional)
                </Text>

                {TRIP_BUDGET_CATEGORIES.map((cat) => (
                  <View key={cat} style={styles.categoryBudgetRow}>
                    <Text
                      style={[
                        styles.categoryLabel,
                        { color: theme.colors.foreground },
                      ]}
                    >
                      {cat}
                    </Text>
                    <TextInput
                      value={categoryBudgets[cat] || ""}
                      onChangeText={(val) =>
                        setCategoryBudgets((prev) => ({ ...prev, [cat]: val }))
                      }
                      placeholder="No limit"
                      keyboardType="decimal-pad"
                      placeholderTextColor={theme.colors.mutedForeground}
                      style={[
                        styles.categoryBudgetInput,
                        {
                          backgroundColor: isDark
                            ? "rgba(255,255,255,0.04)"
                            : "rgba(0,0,0,0.02)",
                          borderColor: theme.colors.border,
                          color: theme.colors.foreground,
                        },
                      ]}
                    />
                  </View>
                ))}
              </>
            )}

            {/* ─── Step 3: Review ─── */}
            {step === 3 && (
              <View style={{ gap: 12 }}>
                <View
                  style={[
                    styles.reviewCard,
                    {
                      backgroundColor: isDark
                        ? "rgba(255,255,255,0.03)"
                        : "rgba(0,0,0,0.02)",
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <View style={styles.reviewRow}>
                    <MapPin size={14} color={theme.colors.primary} />
                    <Text
                      style={[
                        styles.reviewLabel,
                        { color: theme.colors.mutedForeground },
                      ]}
                    >
                      Destination
                    </Text>
                    <Text
                      style={[
                        styles.reviewValue,
                        { color: theme.colors.foreground },
                      ]}
                    >
                      {destination}
                    </Text>
                  </View>

                  {tripName ? (
                    <View style={styles.reviewRow}>
                      <Calendar size={14} color={theme.colors.primary} />
                      <Text
                        style={[
                          styles.reviewLabel,
                          { color: theme.colors.mutedForeground },
                        ]}
                      >
                        Trip Name
                      </Text>
                      <Text
                        style={[
                          styles.reviewValue,
                          { color: theme.colors.foreground },
                        ]}
                      >
                        {tripName}
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.reviewRow}>
                    <Calendar size={14} color={theme.colors.primary} />
                    <Text
                      style={[
                        styles.reviewLabel,
                        { color: theme.colors.mutedForeground },
                      ]}
                    >
                      Dates
                    </Text>
                    <Text
                      style={[
                        styles.reviewValue,
                        { color: theme.colors.foreground },
                      ]}
                    >
                      {startDate} → {endDate}
                    </Text>
                  </View>

                  <View style={styles.reviewRow}>
                    <Wallet size={14} color={theme.colors.primary} />
                    <Text
                      style={[
                        styles.reviewLabel,
                        { color: theme.colors.mutedForeground },
                      ]}
                    >
                      Total Budget
                    </Text>
                    <Text
                      style={[
                        styles.reviewValue,
                        {
                          color: theme.colors.foreground,
                          fontWeight: "800",
                        },
                      ]}
                    >
                      {system.defaultCurrency} {parseFloat(totalBudget).toLocaleString()}
                    </Text>
                  </View>
                </View>

                {Object.entries(categoryBudgets).filter(([, v]) => v && parseFloat(v) > 0)
                  .length > 0 && (
                  <View style={{ gap: 8 }}>
                    <Text
                      style={[
                        styles.fieldLabel,
                        { color: theme.colors.mutedForeground },
                      ]}
                    >
                      CATEGORY LIMITS
                    </Text>
                    {Object.entries(categoryBudgets)
                      .filter(([, val]) => val && parseFloat(val) > 0)
                      .map(([cat, val]) => (
                        <View key={cat} style={styles.reviewCategoryRow}>
                          <Text
                            style={{
                              fontSize: 13,
                              color: theme.colors.foreground,
                            }}
                          >
                            {cat}
                          </Text>
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: "700",
                              color: theme.colors.foreground,
                            }}
                          >
                            {system.defaultCurrency} {parseFloat(val).toLocaleString()}
                          </Text>
                        </View>
                      ))}
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          {/* Action Footer */}
          <View style={styles.actionFooter}>
            {step > 1 ? (
              <Button variant="outline" onPress={handleBack} style={{ flex: 1 }}>
                Back
              </Button>
            ) : (
              <Button variant="outline" onPress={onClose} style={{ flex: 1 }}>
                Cancel
              </Button>
            )}

            {step < 3 ? (
              <Button variant="primary" onPress={handleNext} style={{ flex: 2 }}>
                Next →
              </Button>
            ) : (
              <Button
                variant="primary"
                onPress={handleSave}
                disabled={isSubmitting}
                style={{ flex: 2 }}
              >
                {isSubmitting ? "Creating Trip..." : "🏕️ Create Trip"}
              </Button>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxHeight: "90%",
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
  },
  closeButton: {
    padding: 4,
  },
  stepRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 16,
  },
  stepDot: {
    borderRadius: 4,
  },
  scrollArea: {
    maxHeight: 440,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  categoryBudgetRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  categoryLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
  },
  categoryBudgetInput: {
    width: 110,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    textAlign: "right",
    fontSize: 13,
    fontWeight: "700",
  },
  reviewCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  reviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  reviewLabel: {
    fontSize: 12,
    flex: 1,
  },
  reviewValue: {
    fontSize: 13,
    fontWeight: "700",
  },
  reviewCategoryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  actionFooter: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
});
