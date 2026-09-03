import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ShieldCheck } from "lucide-react-native";

import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import { FilterChips, GaneshHeader, MetaLabel, useGaneshTokens } from "@/components/ganesh/ui";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { usePandals } from "@/hooks/usePandals";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Pandal custody — who holds this Pandal, and retiring it (GS-017).
 *
 * Both actions are Pandal-level and admin-only, which is why they live here
 * rather than beside the festival settings on the Pandal tab.
 *
 * There is no delete. `firestore.rules` refuses one outright: Firestore cannot
 * cascade, so deleting a Pandal would leave every festival ledger unreachable
 * and undeletable instead of removed. Archive is reversible and keeps all of it
 * readable.
 */
export default function PandalCustodyScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { back } = useRouter();
  const { pandalId } = useGaneshSession();
  const { pandals } = usePandals();
  const { festivals } = useFestivals(pandalId);
  const { members } = usePandalMembers(pandalId);
  const { isAdmin } = useGaneshPermissions();
  const writes = useGaneshWrites();

  const pandal = pandals.find((item) => item.id === pandalId);
  const archived = pandal?.archived === true;
  const openFestivals = festivals.filter((festival) => festival.status === "open");

  // Ownership can only land on an active admin, so only they are offered. The
  // service re-checks this — the picker is convenience, not the guard.
  const eligibleOwners = members.filter(
    (member) => member.role === "admin" && member.status === "active"
  );
  const currentOwner = members.find((member) => member.userId === pandal?.ownerId);

  const [reason, setReason] = useState("");
  const [nextOwnerId, setNextOwnerId] = useState("");
  const [busy, setBusy] = useState(false);

  if (!isAdmin) {
    return <GaneshWriteLock message="Only a Pandal Admin can change who holds this Pandal." />;
  }

  const runArchive = (nextArchived: boolean) => {
    setBusy(true);
    writes
      .setPandalArchived({ archived: nextArchived, reason })
      .then(() => {
        setReason("");
        back();
      })
      .catch((caught) => {
        logError("ganesh.pandal.archive", caught);
        toast.error(friendlyErrorMessage(caught, "Could not change the Pandal."));
      })
      .finally(() => setBusy(false));
  };

  const confirmArchive = () => {
    if (!reason.trim()) {
      toast.error("Enter a reason so the committee has a record of why.");
      return;
    }
    if (openFestivals.length > 0) {
      // The service refuses this too; saying so here avoids a pointless round
      // trip and names the festival that has to be settled first.
      toast.error(
        `Close ${openFestivals.map((festival) => festival.name).join(", ")} first, so any money left in it is settled.`
      );
      return;
    }
    Alert.alert(
      "Archive this Pandal?",
      "Its records stay readable, but no new collections, expenses or contributions can be added. A Pandal Admin can restore it later.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Archive", style: "destructive", onPress: () => runArchive(true) },
      ]
    );
  };

  const transfer = () => {
    if (!nextOwnerId) {
      toast.error("Choose which Admin should hold the Pandal.");
      return;
    }
    setBusy(true);
    writes
      .transferPandalOwnership(nextOwnerId)
      .then(() => {
        setNextOwnerId("");
        back();
      })
      .catch((caught) => {
        logError("ganesh.pandal.transfer", caught);
        toast.error(friendlyErrorMessage(caught, "Could not transfer the Pandal."));
      })
      .finally(() => setBusy(false));
  };

  return (
    <GaneshScreen>
      <GaneshHeader
        title="Pandal custody"
        subtitle={pandal?.name}
        icon={<ShieldCheck size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
      />

      <View style={{ gap: 12 }}>
        <Text style={{ color: theme.colors.foreground, fontWeight: "600" }}>Who holds this Pandal</Text>
        <MetaLabel>
          {currentOwner
            ? `${currentOwner.displayName} is on record as holding this Pandal.`
            : "The founder who created this Pandal is no longer a member."}
        </MetaLabel>
        <MetaLabel>
          Holding the Pandal is a record, not a permission — every action is gated on being an
          active Admin. Ownership can move to any active Admin so it does not get stuck with
          someone who has left.
        </MetaLabel>
        {eligibleOwners.length > 1 ? (
          <>
            <FilterChips
              label="Move to"
              layout="wrap"
              value={nextOwnerId}
              options={eligibleOwners
                .filter((member) => member.userId !== pandal?.ownerId)
                .map((member) => ({ id: member.userId, label: member.displayName }))}
              onChange={setNextOwnerId}
              disabled={busy}
            />
            <Button variant="outline" loading={busy} onPress={transfer}>
              Transfer Pandal
            </Button>
          </>
        ) : (
          <MetaLabel>
            Make another person a Pandal Admin before the Pandal can be handed over.
          </MetaLabel>
        )}
      </View>

      <View style={{ gap: 12 }}>
        <Text style={{ color: theme.colors.foreground, fontWeight: "600" }}>
          {archived ? "Restore this Pandal" : "Archive this Pandal"}
        </Text>
        {archived ? (
          <>
            <MetaLabel>
              {pandal?.archiveReason
                ? `Archived because: ${pandal.archiveReason}`
                : "This Pandal is archived."}
            </MetaLabel>
            <Button variant="outline" loading={busy} onPress={() => runArchive(false)}>
              Restore Pandal
            </Button>
          </>
        ) : (
          <>
            <MetaLabel>
              For a Pandal that is finished or was created by mistake. Nothing is deleted — the
              committee keeps every record — and an Admin can restore it.
              {openFestivals.length > 0
                ? ` Close ${openFestivals.map((festival) => festival.name).join(", ")} first.`
                : ""}
            </MetaLabel>
            <Input
              label="Reason"
              value={reason}
              onChangeText={setReason}
              placeholder="Festival finished, committee dissolved…"
              editable={!busy}
            />
            <Button variant="outline" loading={busy} onPress={confirmArchive}>
              Archive Pandal
            </Button>
          </>
        )}
      </View>
    </GaneshScreen>
  );
}
