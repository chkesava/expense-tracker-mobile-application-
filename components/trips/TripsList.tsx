import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { MapPin, Plane, Plus } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { CreateTripModal } from "@/components/trips/CreateTripModal";
import { TripDetailModal } from "@/components/trips/TripDetailModal";
import { useTrips } from "@/hooks/useTrips";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import type { Trip } from "@/shared/types/trip";
import {
  computeTripSummary,
  getTripDaysInfo,
  getTripStatus,
  isTripOverBudget,
} from "@/shared/utils/tripCalculations";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

type TripTab = "active" | "upcoming" | "completed";

export function TripsList() {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { settings: system } = useSystemSettings();
  const { trips, loading } = useTrips();

  const [activeTab, setActiveTab] = useState<TripTab>("active");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);

  const today = new Date().toISOString().split("T")[0];

  const summary = useMemo(() => computeTripSummary(trips, today), [trips, today]);

  const filteredTrips = useMemo(() => {
    return trips.filter((t) => getTripStatus(t, today) === activeTab);
  }, [trips, activeTab, today]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Hero Summary Banner */}
      <View
        style={[
          styles.heroCard,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: isDark ? 0.35 : 0.08,
            shadowRadius: 16,
            elevation: 6,
          },
        ]}
      >
        <View style={styles.heroHeader}>
          <Text
            style={[
              styles.heroSubtitle,
              { color: theme.colors.mutedForeground },
            ]}
          >
            TRAVEL BUDGETS & TRIPS
          </Text>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
              setIsCreateOpen(true);
            }}
            style={({ pressed }) => [
              styles.addBtn,
              { backgroundColor: theme.colors.primary },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Plus
              size={14}
              color={theme.colors.primaryForeground}
              strokeWidth={2.5}
            />
            <Text
              style={[
                styles.addBtnText,
                { color: theme.colors.primaryForeground },
              ]}
            >
              New Trip
            </Text>
          </Pressable>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text
              style={[
                styles.summaryCount,
                { color: "#22C55E" },
              ]}
            >
              {summary.activeCount}
            </Text>
            <Text
              style={[
                styles.summaryLabel,
                { color: theme.colors.mutedForeground },
              ]}
            >
              Active
            </Text>
          </View>

          <View
            style={[
              styles.summaryDivider,
              { backgroundColor: theme.colors.border },
            ]}
          />

          <View style={styles.summaryItem}>
            <Text
              style={[
                styles.summaryCount,
                { color: "#3B82F6" },
              ]}
            >
              {summary.upcomingCount}
            </Text>
            <Text
              style={[
                styles.summaryLabel,
                { color: theme.colors.mutedForeground },
              ]}
            >
              Upcoming
            </Text>
          </View>

          <View
            style={[
              styles.summaryDivider,
              { backgroundColor: theme.colors.border },
            ]}
          />

          <View style={styles.summaryItem}>
            <Text
              style={[
                styles.summaryCount,
                { color: theme.colors.mutedForeground },
              ]}
            >
              {summary.completedCount}
            </Text>
            <Text
              style={[
                styles.summaryLabel,
                { color: theme.colors.mutedForeground },
              ]}
            >
              Completed
            </Text>
          </View>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {(["active", "upcoming", "completed"] as TripTab[]).map((tab) => {
          const isSelected = activeTab === tab;
          return (
            <Pressable
              key={tab}
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                setActiveTab(tab);
              }}
              style={[
                styles.filterPill,
                isSelected
                  ? { backgroundColor: theme.colors.primary }
                  : {
                      backgroundColor: isDark
                        ? "rgba(255,255,255,0.06)"
                        : "rgba(0,0,0,0.04)",
                    },
              ]}
            >
              <Text
                style={[
                  styles.filterPillText,
                  {
                    color: isSelected
                      ? theme.colors.primaryForeground
                      : theme.colors.mutedForeground,
                    fontWeight: isSelected ? "700" : "500",
                  },
                ]}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Trips List */}
      {filteredTrips.length === 0 ? (
        <EmptyState
          emoji="✈️"
          title="No Trips Yet"
          description="Plan and track travel expenses with friends."
        />
      ) : (
        <View style={styles.listContainer}>
          {filteredTrips.map((trip) => {
            const status = getTripStatus(trip, today);
            const daysInfo = getTripDaysInfo(trip, today);
            const over = isTripOverBudget(trip);
            const spentPercent =
              trip.totalBudget > 0
                ? Math.min(
                    100,
                    Math.round(
                      ((trip.spentAmount || 0) / trip.totalBudget) * 100
                    )
                  )
                : 0;

            const statusColor =
              status === "active"
                ? "#22C55E"
                : status === "upcoming"
                  ? "#3B82F6"
                  : theme.colors.mutedForeground;

            return (
              <Pressable
                key={trip.id}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => undefined);
                  setSelectedTrip(trip);
                }}
                style={({ pressed }) => [
                  styles.tripCard,
                  {
                    backgroundColor: theme.colors.card,
                    borderColor: over
                      ? "rgba(239,68,68,0.4)"
                      : theme.colors.border,
                  },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <View style={styles.tripTopRow}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={styles.badgeRow}>
                      <View
                        style={[
                          styles.statusBadge,
                          { backgroundColor: `${statusColor}22` },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusBadgeText,
                            { color: statusColor },
                          ]}
                        >
                          {status.toUpperCase()}
                        </Text>
                      </View>
                      {over && (
                        <View
                          style={[
                            styles.statusBadge,
                            { backgroundColor: "rgba(239,68,68,0.15)" },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusBadgeText,
                              { color: "#EF4444" },
                            ]}
                          >
                            OVER BUDGET
                          </Text>
                        </View>
                      )}
                    </View>

                    <Text
                      style={[
                        styles.tripName,
                        { color: theme.colors.foreground },
                      ]}
                      numberOfLines={1}
                    >
                      {trip.tripName || trip.destination}
                    </Text>

                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <MapPin size={11} color={theme.colors.mutedForeground} />
                      <Text
                        style={[
                          styles.tripMeta,
                          { color: theme.colors.mutedForeground },
                        ]}
                      >
                        {trip.destination} · {trip.startDate} → {trip.endDate}
                      </Text>
                    </View>

                    {status === "active" && (
                      <Text
                        style={{
                          fontSize: 11,
                          color: statusColor,
                          fontWeight: "700",
                        }}
                      >
                        {daysInfo.daysRemaining} day{daysInfo.daysRemaining !== 1 ? "s" : ""} left
                      </Text>
                    )}
                    {status === "upcoming" && (
                      <Text
                        style={{
                          fontSize: 11,
                          color: statusColor,
                          fontWeight: "700",
                        }}
                      >
                        Starts in {daysInfo.daysRemaining} day{daysInfo.daysRemaining !== 1 ? "s" : ""}
                      </Text>
                    )}
                  </View>

                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Amount
                      value={trip.spentAmount || 0}
                      currency={system.defaultCurrency}
                      ghostable
                      style={{
                        fontSize: theme.typography.md,
                        fontWeight: "800",
                        color: over ? "#EF4444" : theme.colors.foreground,
                      }}
                    />
                    <Text
                      style={{
                        fontSize: 11,
                        color: theme.colors.mutedForeground,
                      }}
                    >
                      of {system.defaultCurrency}{" "}
                      {trip.totalBudget.toLocaleString()}
                    </Text>
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "700",
                        color: over ? "#EF4444" : theme.colors.primary,
                      }}
                    >
                      {spentPercent}% used
                    </Text>
                  </View>
                </View>

                {/* Budget Progress Bar */}
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
                        backgroundColor: over ? "#EF4444" : theme.colors.primary,
                      },
                    ]}
                  />
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Modals */}
      <CreateTripModal
        visible={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />
      <TripDetailModal
        visible={!!selectedTrip}
        trip={selectedTrip}
        onClose={() => setSelectedTrip(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 24,
    gap: 16,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: "center",
  },
  heroCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
  },
  heroHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  heroSubtitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  addBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  summaryCount: {
    fontSize: 24,
    fontWeight: "900",
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  summaryDivider: {
    width: 1,
    height: 32,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
  },
  filterPill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: "center",
  },
  filterPillText: {
    fontSize: 12,
  },
  listContainer: {
    gap: 12,
  },
  tripCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  tripTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
  tripName: {
    fontSize: 15,
    fontWeight: "700",
  },
  tripMeta: {
    fontSize: 11,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
});
