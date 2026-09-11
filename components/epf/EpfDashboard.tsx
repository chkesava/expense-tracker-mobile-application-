import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { IdCard, Plus } from "lucide-react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { SkeletonCard } from "@/components/common/Skeleton";
import { EpfEstablishmentCard } from "@/components/epf/EpfEstablishmentCard";
import { EpfEstablishmentFormModal } from "@/components/epf/EpfEstablishmentFormModal";
import { EpfProfileCard } from "@/components/epf/EpfProfileCard";
import { EpfProfileFormModal } from "@/components/epf/EpfProfileFormModal";
import { Button } from "@/components/ui/Button";
import { useEpf } from "@/hooks/useEpf";
import type { EpfEstablishment } from "@/shared/features/epf/types";
import { todayDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";

export function EpfDashboard() {
  const { theme } = useTheme();
  const {
    profile,
    profileLoading,
    profileError,
    retryProfile,
    establishments,
    establishmentsLoading,
    establishmentsError,
    retryEstablishments,
    hasProfile,
    saveProfile,
    addEstablishment,
    updateEstablishment,
    deleteEstablishment,
  } = useEpf();

  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [establishmentModalOpen, setEstablishmentModalOpen] = useState(false);
  const [editing, setEditing] = useState<EpfEstablishment | null>(null);

  const todayKey = useMemo(() => todayDateKey(), []);
  const loading = profileLoading || establishmentsLoading;
  const error = profileError ?? establishmentsError;

  const openAdd = () => {
    setEditing(null);
    setEstablishmentModalOpen(true);
  };

  const openEdit = (establishment: EpfEstablishment) => {
    setEditing(establishment);
    setEstablishmentModalOpen(true);
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
        onDelete={deleteEstablishment}
      />
    </>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Couldn't load EPF"
        description={error.message}
        onRetry={() => {
          retryProfile();
          retryEstablishments();
        }}
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

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.colors.foreground }]}>Establishments</Text>
        <Button size="sm" variant="secondary" onPress={openAdd}>
          <View style={styles.addLabel}>
            <Plus size={theme.iconSize.sm} color={theme.colors.foreground} />
            <Text style={[styles.addText, { color: theme.colors.foreground }]}>Add</Text>
          </View>
        </Button>
      </View>

      {establishments.length === 0 ? (
        <EmptyState
          compact
          title="No employers yet"
          description="Add the employer you currently work for, then any previous ones."
          primaryAction={{ label: "Add establishment", onPress: openAdd }}
        />
      ) : (
        establishments.map((establishment) => (
          <EpfEstablishmentCard
            key={establishment.id}
            establishment={establishment}
            todayKey={todayKey}
            onEdit={openEdit}
          />
        ))
      )}

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
});
