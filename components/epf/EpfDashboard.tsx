import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronDown, ChevronRight, IdCard, Plus } from "lucide-react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { EpfEstablishmentCard } from "@/components/epf/EpfEstablishmentCard";
import { EpfEstablishmentFormModal } from "@/components/epf/EpfEstablishmentFormModal";
import { EpfCurrentMonthCard } from "@/components/epf/EpfCurrentMonthCard";
import { EpfPortfolioCard } from "@/components/epf/EpfPortfolioCard";
import { EpfProfileCard } from "@/components/epf/EpfProfileCard";
import { EpfProfileFormModal } from "@/components/epf/EpfProfileFormModal";
import { Button } from "@/components/ui/Button";
import { useEpf } from "@/hooks/useEpf";
import { useEpfLedger } from "@/hooks/useEpfLedger";
import { epfPortfolioSummary } from "@/shared/features/epf/utils/portfolio";
import { epfTodayKey } from "@/shared/features/epf/utils/epfClock";
import type { EpfEstablishment } from "@/shared/features/epf/types";
import { useTheme } from "@/theme/ThemeProvider";
import { combineEpfLoad } from "@/shared/features/epf/utils/loadState";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";

export function EpfDashboard() {
  const { theme } = useTheme();
  const router = useRouter();
  const {
    profile,
    profileLoading,
    profileError,
    retryProfile,
    establishments,
    liveEstablishments,
    archivedEstablishments,
    establishmentsLoading,
    establishmentsFromCache,
    establishmentsError,
    retryEstablishments,
    activeEstablishment,
    hasProfile,
    saveProfile,
    addEstablishment,
    updateEstablishment,
    archiveEstablishment,
    restoreEstablishment,
    deleteEstablishment,
  } = useEpf();

  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [establishmentModalOpen, setEstablishmentModalOpen] = useState(false);
  const [editing, setEditing] = useState<EpfEstablishment | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const todayKey = useMemo(() => epfTodayKey(), []);

  // SPENDLY-740 (epic SPENDLY-735): the contribution catch-up, FY interest
  // and the stored EPF summary are the server's (`epf-daily`, 08:30 IST).
  // This screen only reads the rows and shows the overview.
  const ledger = useEpfLedger({ enabled: hasProfile });
  const summarySources = useMemo(
    () => ({
      establishments,
      contributions: ledger.contributions,
      transfers: ledger.transfers,
      interestEntries: ledger.interestEntries,
      adjustments: ledger.reconciliations,
    }),
    [establishments, ledger.contributions, ledger.transfers, ledger.interestEntries, ledger.reconciliations]
  );
  const ready = !establishmentsLoading && !establishmentsError && !ledger.loading && !ledger.error;
  // Display only (SPENDLY-653's derivation); nothing is written from here.
  const portfolio = useMemo(
    () => (hasProfile && ready ? epfPortfolioSummary(summarySources) : null),
    [hasProfile, ready, summarySources]
  );
  const load = combineEpfLoad([
    { loading: profileLoading, error: profileError, retry: retryProfile },
    { loading: establishmentsLoading, error: establishmentsError, retry: retryEstablishments },
  ]);
  const loading = load.loading;
  const error = load.error;

  const openAdd = () => {
    setEditing(null);
    setEstablishmentModalOpen(true);
  };

  const openEdit = (establishment: EpfEstablishment) => {
    setEditing(establishment);
    setEstablishmentModalOpen(true);
  };

  // Archived establishments get this too — their history must stay reachable.
  const openContributions = (establishment: EpfEstablishment) => {
    router.push(`/epf/${establishment.id}`);
  };

  const modals = (
    <>
      <EpfProfileFormModal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        profile={profile}
        onSubmit={saveProfile}
      />
      <EpfEstablishmentFormModal
        isOpen={establishmentModalOpen}
        onClose={() => setEstablishmentModalOpen(false)}
        establishment={editing}
        existing={establishments}
        onCreate={addEstablishment}
        onUpdate={updateEstablishment}
        onArchive={archiveEstablishment}
        onRestore={restoreEstablishment}
        onDelete={deleteEstablishment}
      />
    </>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <DashboardSkeleton variant="section" rows={3} />
        <DashboardSkeleton variant="section" rows={2} />
      </View>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Couldn't load EPF"
        description={error.message}
        onRetry={load.retryAll}
      />
    );
  }

  if (!hasProfile) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon={<IdCard size={theme.iconSize.xl} color={theme.colors.primary} />}
          title="Track your EPF"
          description="Add your UAN and the employers you have worked for, so contributions and interest can be tracked against the right establishment."
          primaryAction={{ label: "Set up EPF", onPress: () => setProfileModalOpen(true) }}
        />
        {modals}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {profile ? <EpfProfileCard profile={profile} onEdit={() => setProfileModalOpen(true)} /> : null}

      {/* Total across every employer — the list below is its breakdown. */}
      <EpfPortfolioCard summary={portfolio} />

      <EpfCurrentMonthCard
        establishment={activeEstablishment}
        onOpen={openContributions}
      />

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.colors.foreground }]}>Establishments</Text>
        <Button size="sm" variant="secondary" onPress={openAdd}>
          <View style={styles.addLabel}>
            <Plus size={theme.iconSize.sm} color={theme.colors.foreground} />
            <Text style={[styles.addText, { color: theme.colors.foreground }]}>Add</Text>
          </View>
        </Button>
      </View>

      {liveEstablishments.length === 0 ? (
        <EmptyState
          compact
          title="No employers yet"
          description="Add the employer you currently work for, then any previous ones."
          primaryAction={{ label: "Add establishment", onPress: openAdd }}
        />
      ) : (
        liveEstablishments.map((establishment) => (
          <EpfEstablishmentCard
            key={establishment.id}
            establishment={establishment}
            todayKey={todayKey}
            onEdit={openEdit}
            onOpenContributions={openContributions}
          />
        ))
      )}

      {archivedEstablishments.length > 0 ? (
        <>
          <Pressable
            onPress={() => setShowArchived((value) => !value)}
            style={styles.archivedToggle}
            accessibilityRole="button"
            accessibilityLabel={
              showArchived ? "Hide archived establishments" : "Show archived establishments"
            }
          >
            {showArchived ? (
              <ChevronDown size={theme.iconSize.sm} color={theme.colors.mutedForeground} />
            ) : (
              <ChevronRight size={theme.iconSize.sm} color={theme.colors.mutedForeground} />
            )}
            <Text style={[styles.archivedLabel, { color: theme.colors.mutedForeground }]}>
              Archived ({archivedEstablishments.length})
            </Text>
          </Pressable>

          {showArchived
            ? archivedEstablishments.map((establishment) => (
                <EpfEstablishmentCard
                  key={establishment.id}
                  establishment={establishment}
                  todayKey={todayKey}
                  onEdit={openEdit}
                  onOpenContributions={openContributions}
                />
              ))
            : null}
        </>
      ) : null}

      {modals}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  addLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  addText: {
    fontSize: 13,
    fontWeight: "600",
  },
  archivedToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    marginTop: 4,
  },
  archivedLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
});
