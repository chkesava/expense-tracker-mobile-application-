import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Lock } from "lucide-react-native";

import { StatusStrip, useGaneshTokens } from "@/components/ganesh/ui";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * "This festival is closed" — said out loud, on every festival-scoped screen
 * (GS-058).
 *
 * A closed festival used to be communicated only by absent buttons: the FAB
 * disappeared and the quick actions greyed out, with nothing anywhere saying
 * why. To a collector that reads as revoked permissions, not as a year that
 * ended — and it is the same false signal `explainRefusal` was added to remove
 * on the write path (GS-035).
 *
 * Self-contained on purpose: it reads the session and festival status itself
 * and renders nothing when the festival is open, so a screen adds it with one
 * line and cannot get the condition subtly wrong. That matters because the
 * condition has to agree across five screens.
 *
 * The "create the next festival" route is offered only to a role that can
 * actually take it — dangling an action that will be refused is the problem
 * this banner exists to fix, in a new place.
 */
export function GaneshClosedBanner() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { push } = useRouter();
  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const { can } = useGaneshPermissions();

  const festival = festivals.find((item) => item.id === festivalId);
  // Only "closed" is a settled read-only state. An unknown or still-loading
  // status must not claim the books are shut (GS-032's lesson).
  if (festival?.status !== "closed") return null;

  const canCreateNext = can("festival.create");

  return (
    <View style={styles.wrap}>
      <StatusStrip
        tone="warning"
        icon={<Lock size={14} color={theme.colors.warning} strokeWidth={2.3} />}
        message={
          canCreateNext
            ? `${festival.name} is closed. The books are read-only — nothing new can be recorded against this year.`
            : `${festival.name} is closed. The books are read-only, so this is a record of the year rather than a permissions problem.`
        }
      />
      {canCreateNext ? (
        <Pressable
          onPress={() => push("/(ganesh)/create-festival" as never)}
          accessibilityRole="button"
        >
          <Text
            style={[
              styles.action,
              { color: g.saffron, fontFamily: theme.fontFamily.semibold },
            ]}
          >
            Create the next festival
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  action: {
    fontSize: 13.5,
    paddingVertical: 2,
  },
});
