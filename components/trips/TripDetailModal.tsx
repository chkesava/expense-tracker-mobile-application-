import { useMemo } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import {
  CalendarDays,
  CheckCircle2,
  MapPin,
  Trash2,
  TrendingUp,
  Unlink,
  Wallet,
  X,
} from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Button } from "@/components/ui/Button";
import { useExpenses } from "@/hooks/useExpenses";
import { useTrips } from "@/hooks/useTrips";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import type { Trip } from "@/shared/types/trip";
import {
  computeTripCategoryBreakdown,
  getTripDaysInfo,
  getTripStatus,
  isTripOverBudget,
} from "@/shared/utils/tripCalculations";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface TripDetailModalProps {
  visible: boolean;
  trip: Trip | null;
  onClose: () => void;
}

export function TripDetailModal({ visible, trip, onClose }: TripDetailModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { settings: system } = useSystemSettings();
  const { expenses } = useExpenses();
  const { deleteTrip, completeTrip, unlinkExpense } = useTrips();

  const categoryBreakdown = useMemo(() => {
    if (!trip) return [];
    return computeTripCategoryBreakdown(expenses, trip);
  }, [expenses, trip]);

  const linkedExpenses = useMemo(() => {
    if (!trip) return [];
    return expenses.filter((e) => e.tripId === trip.id);
  }, [expenses, trip]);

  if (!trip) return null;

  const today = new Date().toISOString().split("T")[0];
  const status = getTripStatus(trip, today);
  const daysInfo = getTripDaysInfo(trip, today);
  const overBudget = isTripOverBudget(trip);
  const spentPercent = trip.totalBudget > 0
    ? Math.min(100, Math.round(((trip.spentAmount || 0) / trip.totalBudget) * 100))
    : 0;

  const statusColors: Record<string, string> = {
    active: "#22C55E",
    upcoming: "#3B82F6",
    completed: theme.colors.mutedForeground,
  };
  const statusColor = statusColors[status] || theme.colors.mutedForeground;

  const handleDelete = () => {
    Alert.alert(
      "Delete Trip",
      `Delete "${trip.tripName || trip.destination}"? All linked expenses will be unlinked.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteTrip(trip.id!);
            onClose();
          },
        },
      ]
    );
  };

  const handleComplete = () => {
    Alert.alert("Complete Trip", "Mark this trip as completed?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Complete",
        onPress: async () => {
          await completeTrip(trip.id!);
          onClose();
        },
      },
    ]);
  };

  const handleUnlinkExpense = (expenseId: string, amount: number) => {
    Alert.alert("Unlink Expense", "Remove this expense from the trip?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Unlink",
        style: "destructive",
        onPress: () => unlinkExpense(expenseId, trip.id!, amount),
      },
    ]);
  };

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
            <View style={{ flex: 1 }}>
              <View style={styles.badgeRow}>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: `${statusColor}22` },
                  ]}
                >
                  <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                    {status.toUpperCase()}
                  </Text>
                </View>
                {overBudget && (
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: "rgba(239,68,68,0.15)" },
                    ]}
                  >
                    <Text style={[styles.statusBadgeText, { color: "#EF4444" }]}>
                      OVER BUDGET
                    </Text>
                  </View>
                )}
              </View>
              <Text
                style={[styles.title, { color: theme.colors.cardForeground }]}
                numberOfLines={1}
              >
                {trip.tripName || trip.destination}
              </Text>
              <View style={styles.metaRow}>
                <MapPin size={12} color={theme.colors.mutedForeground} />
                <Text
                  style={[styles.metaText, { color: theme.colors.mutedForeground }]}
                >
                  {trip.destination} · {trip.startDate} → {trip.endDate}
                </Text>
              </View>
              {status === "active" && (
                <Text
                  style={{ fontSize: 11, color: statusColor, fontWeight: "700", marginTop: 2 }}
                >
                  {daysInfo.daysRemaining} day{daysInfo.daysRemaining !== 1 ? "s" : ""} remaining
                </Text>
              )}
              {status === "upcoming" && (
                <Text
                  style={{ fontSize: 11, color: statusColor, fontWeight: "700", marginTop: 2 }}
                >
                  Starts in {daysInfo.daysRemaining} day{daysInfo.daysRemaining !== 1 ? "s" : ""}
                </Text>
              )}
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={({ pressed }) => [
                styles.closeButton,
                pressed && { opacity: 0.6 },
              ]}
            >
              <X size={20} color={theme.colors.mutedForeground} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={{ gap: 16, paddingBottom: 16 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Budget Progress Card */}
            <View
              style={[
                styles.budgetCard,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.03)"
                    : "rgba(0,0,0,0.02)",
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <View style={styles.budgetRow}>
                <View>
                  <Text
                    style={[
                      styles.budgetLabel,
                      { color: theme.colors.mutedForeground },
                    ]}
                  >
                    SPENT
                  </Text>
                  <Amount
                    value={trip.spentAmount || 0}
                    currency={system.defaultCurrency}
                    ghostable
                    style={{
                      fontSize: 22,
                      fontWeight: "900",
                      color: overBudget ? "#EF4444" : theme.colors.foreground,
                    }}
                  />
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text
                    style={[
                      styles.budgetLabel,
                      { color: theme.colors.mutedForeground },
                    ]}
                  >
                    TOTAL BUDGET
                  </Text>
                  <Amount
                    value={trip.totalBudget}
                    currency={system.defaultCurrency}
                    ghostable
                    style={{
                      fontSize: 16,
                      fontWeight: "800",
                      color: theme.colors.foreground,
                    }}
                  />
                </View>
              </View>

              <View
                style={[
                  styles.progressTrack,
                  { backgroundColor: theme.colors.muted },
                ]}
              >
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${spentPercent}%`,
                      backgroundColor: overBudget ? "#EF4444" : theme.colors.primary,
                    },
                  ]}
                />
              </View>
              <Text
                style={{
                  fontSize: 11,
                  color: overBudget ? "#EF4444" : theme.colors.mutedForeground,
                  fontWeight: "600",
                  textAlign: "right",
                }}
              >
                {spentPercent}% used · {system.defaultCurrency}{" "}
                {Math.max(0, trip.totalBudget - (trip.spentAmount || 0)).toLocaleString()} remaining
              </Text>
            </View>

            {/* Category Breakdown */}
            {categoryBreakdown.length > 0 && (
              <View style={{ gap: 10 }}>
                <Text
                  style={[
                    styles.sectionHeading,
                    { color: theme.colors.mutedForeground },
                  ]}
                >
                  CATEGORY BREAKDOWN
                </Text>

                {categoryBreakdown.map((cat) => (
                  <View key={cat.category} style={{ gap: 4 }}>
                    <View style={styles.catRow}>
                      <Text
                        style={[
                          styles.catName,
                          { color: theme.colors.foreground },
                        ]}
                      >
                        {cat.category}
                      </Text>
                      <View style={{ flexDirection: "row", gap: 4 }}>
                        <Amount
                          value={cat.spent}
                          currency={system.defaultCurrency}
                          ghostable
                          style={{
                            fontSize: 12,
                            fontWeight: "700",
                            color: cat.isOverBudget ? "#EF4444" : theme.colors.foreground,
                          }}
                        />
                        {cat.limit > 0 && (
                          <Text
                            style={{
                              fontSize: 12,
                              color: theme.colors.mutedForeground,
                            }}
                          >
                            / {system.defaultCurrency} {cat.limit.toLocaleString()}
                          </Text>
                        )}
                      </View>
                    </View>

                    {cat.limit > 0 && (
                      <View
                        style={[
                          styles.catProgressTrack,
                          { backgroundColor: theme.colors.muted },
                        ]}
                      >
                        <View
                          style={[
                            styles.catProgressFill,
                            {
                              width: `${cat.percentage}%`,
                              backgroundColor: cat.isOverBudget
                                ? "#EF4444"
                                : theme.colors.primary,
                            },
                          ]}
                        />
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Linked Expenses */}
            {linkedExpenses.length > 0 && (
              <View style={{ gap: 8 }}>
                <Text
                  style={[
                    styles.sectionHeading,
                    { color: theme.colors.mutedForeground },
                  ]}
                >
                  LINKED EXPENSES ({linkedExpenses.length})
                </Text>

                {linkedExpenses.map((exp) => (
                  <View
                    key={exp.id}
                    style={[
                      styles.expenseRow,
                      {
                        backgroundColor: isDark
                          ? "rgba(255,255,255,0.03)"
                          : "rgba(0,0,0,0.02)",
                        borderColor: theme.colors.border,
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "700",
                          color: theme.colors.foreground,
                        }}
                        numberOfLines={1}
                      >
                        {exp.note || exp.category}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: theme.colors.mutedForeground,
                        }}
                      >
                        {exp.category} · {exp.date}
                      </Text>
                    </View>
                    <View
                      style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                    >
                      <Amount
                        value={exp.amount}
                        currency={system.defaultCurrency}
                        ghostable
                        style={{
                          fontSize: 13,
                          fontWeight: "800",
                          color: theme.colors.foreground,
                        }}
                      />
                      <Pressable
                        onPress={() =>
                          handleUnlinkExpense(exp.id || "", exp.amount)
                        }
                        style={({ pressed }) => [
                          styles.unlinkBtn,
                          pressed && { opacity: 0.7 },
                        ]}
                      >
                        <Unlink size={14} color={theme.colors.mutedForeground} />
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.actionFooter}>
            <Button variant="destructive" onPress={handleDelete} style={{ flex: 1 }}>
              Delete
            </Button>
            {status !== "completed" && (
              <Button variant="primary" onPress={handleComplete} style={{ flex: 2 }}>
                Mark Complete
              </Button>
            )}
            {status === "completed" && (
              <Button variant="outline" onPress={onClose} style={{ flex: 2 }}>
                Done
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
    marginBottom: 16,
  },
  badgeRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 6,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 12,
  },
  closeButton: {
    padding: 4,
  },
  scrollArea: {
    maxHeight: 460,
  },
  budgetCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  budgetRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  budgetLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  sectionHeading: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  catRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  catName: {
    fontSize: 13,
    fontWeight: "600",
  },
  catProgressTrack: {
    height: 5,
    borderRadius: 3,
    overflow: "hidden",
  },
  catProgressFill: {
    height: "100%",
    borderRadius: 3,
  },
  expenseRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  unlinkBtn: {
    padding: 4,
  },
  actionFooter: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
});
