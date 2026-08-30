import { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { AdminGlyph } from "@/components/ganesh/admin/adminArt";
import { AdminQueryState } from "@/components/ganesh/AdminQueryState";
import { FestivalStackHero } from "@/components/ganesh/chrome/FestivalStackHero";
import { ganeshStackLayout } from "@/components/ganesh/chrome/stackLayout";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { PandalSectionCard } from "@/components/ganesh/pandal/PandalSectionCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { useTheme } from "@/theme/ThemeProvider";

export default function AdminContributionSetupScreen() {
  const { theme } = useTheme();
  const { push, back } = useRouter();
  const { pandalId, festivalId } = useGaneshSession();
  const { festivals, loading, error, retry } = useFestivals(pandalId);
  const festival = festivals.find((item) => item.id === festivalId);
  const writes = useGaneshWrites();
  const [_memberTarget, setMemberTarget] = useState<string | undefined>(undefined);
  const [_houseTarget, setHouseTarget] = useState<string | undefined>(undefined);
  const memberTarget = _memberTarget ?? String(festival?.contributionTargetAmount ?? 0);
  const houseTarget = _houseTarget ?? String(festival?.householdTargetAmount ?? 0);

  return (
    <GaneshScreen contentContainerStyle={ganeshStackLayout.bleed}>
      <FestivalStackHero
        title="Contribution setup"
        subtitle={festival?.name}
        onBack={back}
        mark={<AdminGlyph name="iconContribution" size={40} />}
      />
      <View style={ganeshStackLayout.body}>
      <Text style={{ color: theme.colors.mutedForeground, lineHeight: 22 }}>
        Committee target and household chanda stay separate. For a child or anyone who should pay
        less, open them on Committee and set a custom amount.
      </Text>
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
          <PandalSectionCard title={festival.name} subtitle="This festival">
            <View style={{ gap: 12, paddingHorizontal: 2, paddingBottom: 8 }}>
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
              <Text style={{ color: theme.colors.mutedForeground }}>
                Current default {formatInr(festival.contributionTargetAmount ?? 0)} per committee
                person. Custom amounts already set on a person stay as they are.
              </Text>
              <Button
                onPress={() => {
                  writes
                    .updateFestivalTargets({
                      contributionMode: "same",
                      contributionTargetAmount: Number(memberTarget),
                      householdTargetAmount: Number(houseTarget),
                    })
                    .catch((caught) => {
                      logError("ganesh.admin.setup", caught);
                      toast.error(friendlyErrorMessage(caught, "Could not save targets."));
                    });
                }}
              >
                Save targets
              </Button>
              <Button variant="outline" onPress={() => push("/(ganesh)/committee" as never)}>
                Set a custom amount for one person
              </Button>
            </View>
          </PandalSectionCard>
        ) : null}
      </AdminQueryState>
      </View>
    </GaneshScreen>
  );
}
