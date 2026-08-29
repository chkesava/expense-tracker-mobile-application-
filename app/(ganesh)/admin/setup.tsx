import { useState } from "react";
import { Text } from "react-native";
import { useRouter } from "expo-router";
import { Target } from "lucide-react-native";

import { AdminQueryState } from "@/components/ganesh/AdminQueryState";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshHeader, useGaneshTokens } from "@/components/ganesh/ui";
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
  const g = useGaneshTokens();
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
    <GaneshScreen>
      <GaneshHeader
        title="Contribution setup"
        icon={<Target size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
      />
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
          <>
            <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
              {festival.name}
            </Text>
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
          </>
        ) : null}
      </AdminQueryState>
    </GaneshScreen>
  );
}
