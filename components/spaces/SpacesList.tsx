import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Plus } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { SearchBar } from "@/components/common/SearchBar";
import { SkeletonCard } from "@/components/common/Skeleton";
import { SpaceCard } from "@/components/spaces/SpaceCard";
import { SpaceDetailModal } from "@/components/spaces/SpaceDetailModal";
import { SpaceFormModal } from "@/components/spaces/SpaceFormModal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useExpenses } from "@/hooks/useExpenses";
import { useSpaces } from "@/hooks/useSpaces";
import type { Space } from "@/shared/types/space";
import { summarizeSpace, summarizeSpaces } from "@/shared/utils/spaceMath";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { haptic } from "@/lib/haptics";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";

type StatusFilter = "ACTIVE" | "ARCHIVED" | "all";

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "ACTIVE", label: "Active" },
  { id: "ARCHIVED", label: "Archived" },
  { id: "all", label: "All" },
];

export function SpacesList() {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const displayCurrency = useDisplayCurrency();

  const { expenses } = useExpenses();
  const {
    spaces,
    loading,
    createSpace,
    updateSpace,
    deleteSpace,
    removeExpenseFromSpace,
    archiveSpace,
    restoreSpace,
  } = useSpaces();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ACTIVE");
  const [searchQuery, setSearchQuery] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSpace, setEditingSpace] = useState<Space | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const summaries = useMemo(() => {
    const map = new Map<string, ReturnType<typeof summarizeSpace>>();
    for (const space of spaces) {
      if (!space.id) continue;
      map.set(space.id, summarizeSpace(space, expenses));
    }
    return map;
  }, [spaces, expenses]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return spaces.filter((space) => {
      if (statusFilter !== "all" && space.status !== statusFilter) return false;
      if (!q) return true;
      return (
        space.name.toLowerCase().includes(q) ||
        (space.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [spaces, statusFilter, searchQuery]);

  const totals = useMemo(
    () => summarizeSpaces(filtered, expenses),
    [filtered, expenses]
  );

  const selectedSpace = useMemo(
    () => spaces.find((space) => space.id === selectedId) ?? null,
    [spaces, selectedId]
  );

  const openCreate = () => {
    setEditingSpace(null);
    setIsFormOpen(true);
  };

  const pillStyle = (isActive: boolean) => ({
    backgroundColor: isActive
      ? theme.colors.primary
      : isDark
        ? "rgba(255,255,255,0.06)"
        : "rgba(0,0,0,0.04)",
    borderColor: isActive ? theme.colors.primary : theme.colors.border,
  });

  const pillTextStyle = (isActive: boolean) => ({
    color: isActive ? theme.colors.primaryForeground : theme.colors.foreground,
    fontWeight: isActive ? ("700" as const) : ("500" as const),
  });

  return (
    <View style={styles.container}>
      {spaces.length > 0 ? (
        <Card style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryCell}>
              <Text
                style={[styles.summaryLabel, { color: theme.colors.mutedForeground }]}
              >
                TRACKED IN SPACES
              </Text>
              <Amount
                value={totals.totalSpent}
                currency={displayCurrency}
                style={{
                  fontSize: 20,
                  fontWeight: "900",
                  color: theme.colors.foreground,
                }}
              />
            </View>

            <View style={{ alignItems: "flex-end" }}>
              <Text
                style={[styles.summaryLabel, { color: theme.colors.mutedForeground }]}
              >
                SPACES
              </Text>
              <Text style={[styles.summaryValue, { color: theme.colors.foreground }]}>
                {totals.spaceCount}
              </Text>
            </View>
          </View>

          {totals.overBudgetCount > 0 ? (
            <Text style={[styles.warning, { color: "#EF4444" }]}>
              {totals.overBudgetCount} space
              {totals.overBudgetCount === 1 ? " is" : "s are"} over budget
            </Text>
          ) : null}
        </Card>
      ) : null}

      {spaces.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillRow}
        >
          {STATUS_FILTERS.map((filter) => {
            const isActive = statusFilter === filter.id;
            return (
              <Pressable
                key={filter.id}
                onPress={() => {
                  haptic.selection().catch(() => undefined);
                  setStatusFilter(filter.id);
                }}
                style={[styles.pill, pillStyle(isActive)]}
              >
                <Text style={[styles.pillText, pillTextStyle(isActive)]}>
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {spaces.length > 2 ? (
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search spaces..."
        />
      ) : null}

      {spaces.length > 0 ? (
        <Button onPress={openCreate} variant="outline">
          <Plus size={16} color={theme.colors.foreground} />
          <Text style={{ fontWeight: "700", color: theme.colors.foreground }}>
            Create Space
          </Text>
        </Button>
      ) : null}

      {loading ? (
        <View style={{ gap: 12 }}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState
          illustration="general"
          title={spaces.length === 0 ? "No Spending Spaces" : "No Matching Spaces"}
          description={
            spaces.length === 0
              ? "Group related expenses together, like a hospital stay or a home renovation, and track them against an optional budget."
              : "Try a different status or search term."
          }
          primaryAction={{
            label: "Create Space",
            icon: <Plus size={16} color="#FFFFFF" strokeWidth={2.4} />,
            onPress: openCreate,
          }}
          tip="A space only labels existing expenses. Nothing is duplicated and your totals never change."
        />
      ) : (
        <View style={{ gap: 12 }}>
          {filtered.map((space) => {
            const summary = space.id ? summaries.get(space.id) : null;
            if (!space.id || !summary) return null;
            return (
              <SpaceCard
                key={space.id}
                space={space}
                summary={summary}
                currency={displayCurrency}
                onPress={() => setSelectedId(space.id ?? null)}
              />
            );
          })}
        </View>
      )}

      <SpaceFormModal
        visible={isFormOpen}
        space={editingSpace}
        onClose={() => {
          setIsFormOpen(false);
          setEditingSpace(null);
        }}
        onCreate={createSpace}
        onUpdate={updateSpace}
      />

      <SpaceDetailModal
        visible={!!selectedSpace}
        space={selectedSpace}
        expenses={expenses}
        currency={displayCurrency}
        onClose={() => setSelectedId(null)}
        onEdit={(space) => {
          setSelectedId(null);
          setEditingSpace(space);
          setIsFormOpen(true);
        }}
        onDelete={async (id) => {
          const ok = await deleteSpace(id);
          if (ok) setSelectedId(null);
          return ok;
        }}
        onArchiveToggle={async (space) => {
          if (!space.id) return false;
          return space.status === "ARCHIVED"
            ? restoreSpace(space.id)
            : archiveSpace(space.id);
        }}
        onRemoveExpense={removeExpenseFromSpace}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 14,
  },
  summaryCard: {
    borderRadius: 18,
    borderCurve: "continuous",
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  summaryCell: {
    gap: 2,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: "900",
  },
  warning: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 12,
  },
  pillRow: {
    flexDirection: "row",
    gap: 8,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderCurve: "continuous",
    borderWidth: 1,
  },
  pillText: {
    fontSize: 12,
  },
});
