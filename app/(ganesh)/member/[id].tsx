import { useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { MetricGrid } from "@/components/ganesh/MetricGrid";
import { PendingHint } from "@/components/ganesh/GaneshSyncChip";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useContributions } from "@/hooks/useContributions";
import { useFestivalMembers } from "@/hooks/useFestivalMembers";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { formatGaneshWhen } from "@/shared/utils/ganeshIdentity";
import {
  committeePayStatus,
  effectiveCommitteeTarget,
  memberRemainingContribution,
} from "@/shared/utils/ganeshMath";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { ganeshRoleLabel } from "@/shared/utils/ganeshPermissions";
import { useTheme } from "@/theme/ThemeProvider";

export default function MemberDetailScreen() {
  const { theme } = useTheme();
  const { push } = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const festival = festivals.find((item) => item.id === festivalId);
  const { members } = useFestivalMembers(pandalId, festivalId);
  const { members: pandalMembers } = usePandalMembers(pandalId);
  const { contributions } = useContributions(pandalId, festivalId);
  const writes = useGaneshWrites();
  const { can } = useGaneshPermissions();
  const festivalMember = members.find((item) => item.userId === id);
  const pandalMember = pandalMembers.find((item) => item.userId === id);
  const name = festivalMember?.displayName ?? pandalMember?.displayName;
  const role = pandalMember?.role ?? festivalMember?.role;
  const paid = festivalMember?.contributionPaid ?? 0;
  const defaultTarget = festival?.contributionTargetAmount ?? 0;
  const target = effectiveCommitteeTarget(festivalMember, defaultTarget);
  const overridden = Boolean(festivalMember?.contributionTargetOverridden);
  const due = memberRemainingContribution({
    contributionPaid: paid,
    contributionTarget: target,
  });
  const status = committeePayStatus(paid, target, overridden);
  const [_customTarget, setCustomTarget] = useState<string | undefined>(undefined);
  const customTarget = _customTarget ?? String(target);
  const [busy, setBusy] = useState(false);
  const payments = contributions.filter(
    (item) =>
      !item.voided &&
      item.contributorMemberId === id &&
      item.isCommitteeContribution &&
      item.kind === "money"
  );

  if (!name) {
    return (
      <GaneshScreen>
        <Text style={{ color: theme.colors.mutedForeground }}>Member not found.</Text>
      </GaneshScreen>
    );
  }

  return (
    <GaneshScreen>
      <Text style={{ color: theme.colors.foreground, fontSize: 24, fontWeight: "800" }}>
        {name}
      </Text>
      <Text style={{ color: theme.colors.mutedForeground }}>
        {ganeshRoleLabel(role)} · {festival?.name ?? "Festival"} ·{" "}
        {status === "paid" ? "Paid" : status === "partial" ? "Partial" : "Not paid"}
      </Text>
      <MetricGrid
        items={[
          { label: "Paid", value: paid },
          { label: "Target", value: target },
          { label: "Due", value: due },
          { label: "Personal expenses", value: festivalMember?.personalExpenses ?? 0 },
          { label: "Reimbursed", value: festivalMember?.reimbursed ?? 0 },
          { label: "Pending reimbursement", value: festivalMember?.pendingReimbursement ?? 0 },
        ]}
      />
      {can("festival.update") && festival?.status === "open" ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
            This person's target
          </Text>
          <Text style={{ color: theme.colors.mutedForeground, lineHeight: 20 }}>
            Committee default is {formatInr(defaultTarget)}. Set a lower amount for a child or
            anyone who should pay less. Changing the default later will not overwrite this.
          </Text>
          {overridden ? (
            <Text style={{ color: theme.colors.primary, fontWeight: "700" }}>
              Custom target · {formatInr(target)}
            </Text>
          ) : null}
          <Input
            label="Target for this person"
            value={customTarget}
            onChangeText={setCustomTarget}
            keyboardType="numeric"
          />
          <Button
            loading={busy}
            onPress={() => {
              if (!id) return;
              setBusy(true);
              writes
                .setMemberContributionTarget(id, {
                  amount: Number(customTarget),
                  displayName: name,
                  role,
                })
                .then(() => setCustomTarget(undefined))
                .catch((error) => {
                  logError("ganesh.memberTarget", error);
                  toast.error(friendlyErrorMessage(error, "Could not save this person's target."));
                })
                .finally(() => setBusy(false));
            }}
          >
            Save this person's target
          </Button>
          {overridden ? (
            <Button
              variant="ghost"
              loading={busy}
              onPress={() => {
                if (!id) return;
                setBusy(true);
                writes
                  .setMemberContributionTarget(id, {
                    resetToDefault: true,
                    displayName: name,
                    role,
                  })
                  .then(() => setCustomTarget(undefined))
                  .catch((error) => {
                    logError("ganesh.memberTarget.reset", error);
                    toast.error(friendlyErrorMessage(error, "Could not reset this target."));
                  })
                  .finally(() => setBusy(false));
              }}
            >
              Use committee default
            </Button>
          ) : null}
        </View>
      ) : null}
      {can("contributions.create") && festival?.status === "open" ? (
        <Button onPress={() => push(`/(ganesh)/add-member-payment?memberId=${id}` as never)}>
          Record payment
        </Button>
      ) : null}
      {can("reimbursements.create") && (festivalMember?.pendingReimbursement ?? 0) > 0 ? (
        <Button onPress={() => push(`/(ganesh)/add-reimbursement?memberId=${id}` as never)}>
          Reimburse
        </Button>
      ) : null}
      <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
        Festival payments
      </Text>
      {payments.length === 0 ? (
        <Text style={{ color: theme.colors.mutedForeground }}>
          No committee payments recorded for this festival yet.
        </Text>
      ) : (
        payments.map((item) => (
          <View
            key={item.id}
            style={{
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
              borderWidth: 1,
              borderRadius: 16,
              padding: 14,
              gap: 4,
            }}
          >
            <Text style={{ color: theme.colors.primary, fontWeight: "800" }}>
              {formatInr(item.amount)}
            </Text>
            <Text style={{ color: theme.colors.mutedForeground }}>
              {item.status}
              {item.description ? ` · ${item.description}` : ""}
              {formatGaneshWhen(item.createdAt, item.date)
                ? ` · ${formatGaneshWhen(item.createdAt, item.date)}`
                : ""}
            </Text>
            <PendingHint pending={item.pendingWrite} />
          </View>
        ))
      )}
    </GaneshScreen>
  );
}
