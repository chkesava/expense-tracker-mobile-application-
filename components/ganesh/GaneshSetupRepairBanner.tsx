import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { TriangleAlert } from "lucide-react-native";

import { StatusStrip, useGaneshTokens } from "@/components/ganesh/ui";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { getFirestoreDb } from "@/lib/firebase";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { inspectPandalSetup } from "@/services/ganesh/ganeshWrites";
import {
  describePandalSetupGaps,
  type PandalSetupDiagnosis,
} from "@/shared/utils/ganeshPandalSetup";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Offers to finish a half-created Pandal (GS-071).
 *
 * Creation is one atomic batch followed by several separate steps, and
 * Firestore cannot roll back across them. A failure part-way leaves a real
 * Pandal missing its summary, its categories or the creator's festival-member
 * row — and until now nothing said so. What the committee saw instead was an
 * expense form with no categories, or totals stuck at zero, neither of which
 * points back at setup.
 *
 * Renders nothing when setup is complete, which is almost always.
 *
 * The check is a one-shot read rather than a listener: an incomplete setup does
 * not fix itself while you watch, and a live subscription on every Pandal open
 * would cost four reads a render for a state that should never occur.
 */
export function GaneshSetupRepairBanner() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { push } = useRouter();
  const { pandalId } = useGaneshSession();
  const { realUser } = useAuth();
  const { can } = useGaneshPermissions();
  const writes = useGaneshWrites();

  const [diagnosis, setDiagnosis] = useState<PandalSetupDiagnosis | null>(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    const db = getFirestoreDb();
    if (!db || !pandalId || !realUser?.uid) return;
    try {
      setDiagnosis(await inspectPandalSetup(db, pandalId, realUser.uid));
    } catch (error) {
      // A failed check must not itself become a scary banner: the Pandal is
      // probably fine and this is a read that did not land.
      logError("ganesh.inspectPandalSetup", error);
    }
  }, [pandalId, realUser?.uid]);

  useEffect(() => {
    setDiagnosis(null);
    void check();
  }, [check]);

  if (!diagnosis || diagnosis.complete) return null;

  const message = describePandalSetupGaps(diagnosis.gaps);
  // Only an admin can write the missing documents, so only an admin is offered
  // the action. Everyone else is told what is wrong rather than handed a button
  // that will be refused (GS-035).
  const canRepair = can("festival.create");

  const repair = () => {
    setBusy(true);
    writes
      .repairPandalSetup()
      .then(() => check())
      .catch((error) => {
        logError("ganesh.repairPandalSetup", error);
        toast.error(friendlyErrorMessage(error, "Could not finish the setup."));
      })
      .finally(() => setBusy(false));
  };

  return (
    <View style={styles.wrap}>
      <StatusStrip
        tone="warning"
        icon={<TriangleAlert size={14} color={theme.colors.warning} strokeWidth={2.3} />}
        message={message}
      />
      {canRepair ? (
        <Pressable
          disabled={busy}
          onPress={
            diagnosis.repairable ? repair : () => push("/(ganesh)/create-festival")
          }
          accessibilityRole="button"
        >
          <Text
            style={[
              styles.action,
              {
                color: busy ? theme.colors.mutedForeground : g.saffron,
                fontFamily: theme.fontFamily.semibold,
              },
            ]}
          >
            {busy
              ? "Finishing…"
              : diagnosis.repairable
                ? "Finish setting up"
                : "Create the festival"}
          </Text>
        </Pressable>
      ) : (
        <Text style={{ color: theme.colors.mutedForeground, fontSize: 13 }}>
          A Pandal Admin can finish this.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  action: { fontSize: 13.5, paddingVertical: 2 },
});
