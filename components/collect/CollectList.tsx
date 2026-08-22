import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { HandCoins, Plus } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonHero, SkeletonList } from "@/components/common/Skeleton";
import { CreatePaymentRequestModal } from "@/components/collect/CreatePaymentRequestModal";
import { PaymentRequestCard } from "@/components/collect/PaymentRequestCard";
import { usePaymentRequests } from "@/hooks/usePaymentRequests";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { haptic } from "@/lib/haptics";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";

type CollectTab = "active" | "cancelled";

export function CollectList() {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const displayCurrency = useDisplayCurrency();
  const { requests, loading } = usePaymentRequests();

  const [activeTab, setActiveTab] = useState<CollectTab>("active");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const activeRequests = useMemo(
    () => requests.filter((r) => r.status === "active"),
    [requests]
  );
  const cancelledRequests = useMemo(
    () => requests.filter((r) => r.status === "cancelled"),
    [requests]
  );

  const totalPending = useMemo(
    () => activeRequests.reduce((sum, r) => sum + r.amount, 0),
    [activeRequests]
  );

  const displayList = activeTab === "active" ? activeRequests : cancelledRequests;

  if (loading) {
    return (
      <View style={[styles.container, { gap: 16 }]}>
        <SkeletonHero />
        <SkeletonList count={3} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Hero Banner */}
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
            style={[styles.heroSubtitle, { color: theme.colors.mutedForeground }]}
          >
            PAYMENT COLLECTION
          </Text>
          <Pressable
            onPress={() => {
              haptic.selection().catch(() => undefined);
              setIsCreateOpen(true);
            }}
            style={({ pressed }) => [
              styles.addBtn,
              { backgroundColor: theme.colors.primary },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Plus size={14} color={theme.colors.primaryForeground} strokeWidth={2.5} />
            <Text style={[styles.addBtnText, { color: theme.colors.primaryForeground }]}>
              New Request
            </Text>
          </Pressable>
        </View>

        <View style={styles.summaryRow}>
          <View>
            <Text style={[styles.summaryLabel, { color: theme.colors.mutedForeground }]}>
              TOTAL PENDING
            </Text>
            <Amount
              value={totalPending}
              currency={displayCurrency}
              ghostable
              style={{ fontSize: 28, fontWeight: "900", color: theme.colors.foreground }}
            />
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[styles.summaryLabel, { color: theme.colors.mutedForeground }]}>
              ACTIVE REQUESTS
            </Text>
            <Text
              style={{ fontSize: 28, fontWeight: "900", color: theme.colors.primary }}
            >
              {activeRequests.length}
            </Text>
          </View>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {(["active", "cancelled"] as CollectTab[]).map((tab) => {
          const isSelected = activeTab === tab;
          return (
            <Pressable
              key={tab}
              onPress={() => {
                haptic.selection().catch(() => undefined);
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
                {tab === "active"
                  ? `Active (${activeRequests.length})`
                  : `Cancelled (${cancelledRequests.length})`}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Requests List */}
      {displayList.length === 0 ? (
        <EmptyState
          illustration="collect"
          title={activeTab === "active" ? "No Pending Receivables" : "No Cancelled Requests"}
          description={
            activeTab === "active"
              ? "Create payment requests to track money lent to friends or pending reimbursements."
              : "Cancelled or closed payment requests will appear here for reference."
          }
          primaryAction={
            activeTab === "active"
              ? {
                  label: "Create Request",
                  icon: <Plus size={16} color="#FFFFFF" strokeWidth={2.4} />,
                  onPress: () => setIsCreateOpen(true),
                }
              : undefined
          }
          tip="Mark payment requests as collected with 1 tap to auto-credit your chosen account."
        />
      ) : (
        <View style={styles.listContainer}>
          {displayList.map((req) => (
            <PaymentRequestCard key={req.id} request={req} />
          ))}
        </View>
      )}

      <CreatePaymentRequestModal
        visible={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
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
    gap: 16,
  },
  heroHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginBottom: 2,
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
});
