import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Target } from "lucide-react-native";

import { AdminQueryState } from "@/components/ganesh/AdminQueryState";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import {
  GaneshHeader,
  Money,
  Section,
  StatTile,
  StatusStrip,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";

export default function AdminContributionSetupScreen() {
  const g = useGaneshTokens();
  const { push, back } = useRouter();
  const { pandalId, festivalId } = useGaneshSession();
  const { festivals, loading, error, retry } = useFestivals(pandalId);
  const festival = festivals.find((item) => item.id === festivalId);
  const writes = useGaneshWrites();

  const [_memberTarget, setMemberTarget] = useState<string | undefined>(undefined);
  const [_houseTarget, setHouseTarget] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const memberTarget = _memberTarget ?? String(festival?.contributionTargetAmount ?? 0);
  const houseTarget = _houseTarget ?? String(festival?.householdTargetAmount ?? 0);

  return (
    <GaneshScreen safeTop>
      <GaneshHeader
        title="Contribution setup"
        subtitle={festival?.name}
        icon={<Target size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
      />

      <AdminQueryState
        loading={loading && !festival}
        error={error}
        onRetry={retry}
        empty={
          !festival
            ? { title: "No festival selected", description: "Create a festival first." }
            : null
        }
      >
        {festival ? (
          <>
            <StatusStrip
              tone="info"
              message="The committee target and the household chanda target are separate numbers."
            />

            <Section title="Current defaults">
              <View style={styles.statRow}>
                <StatTile label="Per committee person">
                  <Money
                    value={festival.contributionTargetAmount ?? 0}
                    size="primary"
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  />
                </StatTile>
                <StatTile label="Per household">
                  <Money
                    value={festival.householdTargetAmount ?? 0}
                    size="primary"
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  />
                </StatTile>
              </View>
            </Section>

            <Section
              title="Change the defaults"
              subtitle="Custom amounts already set on a person stay as they are."
            >
              <View style={styles.form}>
                <Input
                  label="Same amount for every committee member"
                  value={memberTarget}
                  onChangeText={setMemberTarget}
                  keyboardType="numeric"
                />
                <Input
                  label="Household chanda target"
                  value={houseTarget}
                  onChangeText={setHouseTarget}
                  keyboardType="numeric"
                />
                <Button
                  loading={busy}
                  onPress={() => {
                    setBusy(true);
                    writes
                      .updateFestivalTargets({
                        contributionMode: "same",
                        contributionTargetAmount: Number(memberTarget),
                        householdTargetAmount: Number(houseTarget),
                      })
                      .catch((caught) => {
                        logError("ganesh.admin.setup", caught);
                        toast.error(friendlyErrorMessage(caught, "Could not save targets."));
                      })
                      .finally(() => setBusy(false));
                  }}
                >
                  Save targets
                </Button>
              </View>
            </Section>

            <Section
              title="One person at a time"
              subtitle="For a child, or anyone who should pay less, open them on Committee and set a custom amount."
            >
              <Button variant="outline" onPress={() => push("/(ganesh)/committee" as never)}>
                Open Committee
              </Button>
            </Section>
          </>
        ) : null}
      </AdminQueryState>
    </GaneshScreen>
  );
}

const styles = StyleSheet.create({
  statRow: {
    flexDirection: "row",
    gap: 10,
  },
  form: {
    gap: 12,
  },
});
