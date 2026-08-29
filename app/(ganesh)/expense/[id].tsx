import { useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { Receipt } from "lucide-react-native";

import { AccountabilityLine } from "@/components/ganesh/AccountabilityLine";
import { GaneshSignedPreview } from "@/components/ganesh/GaneshSignedPreview";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { PendingHint } from "@/components/ganesh/GaneshSyncChip";
import {
  GaneshEmptyState,
  GaneshHeader,
  Money,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshExpense } from "@/hooks/useGaneshExpenses";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePandalAssets } from "@/hooks/usePandalAssets";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { usePandalSponsors } from "@/hooks/usePandalSponsors";
import { useSponsorships } from "@/hooks/useSponsorships";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { ganeshStoredPath } from "@/services/ganesh/storage/storageService";
import { isAssetPurchaseExpense } from "@/shared/utils/ganeshAssets";
import { memberDisplayName } from "@/shared/utils/ganeshIdentity";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { useTheme } from "@/theme/ThemeProvider";

export default function ExpenseDetailScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { push, back } = useRouter();
  const params = useLocalSearchParams<{ id: string; festivalId?: string }>();
  const { pandalId, festivalId: sessionFestivalId } = useGaneshSession();
  const expenseFestivalId =
    typeof params.festivalId === "string" && params.festivalId ? params.festivalId : sessionFestivalId;
  const { festivals } = useFestivals(pandalId);
  const { expense, loading } = useGaneshExpense(pandalId, expenseFestivalId, params.id ?? null);
  const { assets } = usePandalAssets(pandalId);
  const { members } = usePandalMembers(pandalId);
  const { sponsors } = usePandalSponsors(pandalId);
  const { sponsorships } = useSponsorships(pandalId, expenseFestivalId);
  const { can } = useGaneshPermissions();
  const writes = useGaneshWrites();
  const [total, setTotal] = useState("");
  const [godFund, setGodFund] = useState("");
  const [personal, setPersonal] = useState("");
  const [sponsored, setSponsored] = useState("");
  const [busy, setBusy] = useState(false);
  const festival = festivals.find((item) => item.id === expenseFestivalId);
  const linkedAsset = assets.find((item) => item.id === expense?.assetId);
  const linkedSponsorship = sponsorships.find((item) => item.id === expense?.linkedSponsorshipId);
  const linkedSponsor = sponsors.find((item) => item.id === linkedSponsorship?.sponsorId);
  const receiptPath = ganeshStoredPath(expense?.receipt, expense?.receiptPath);
  const isPurchase = isAssetPurchaseExpense(expense);
  const canEdit = can("expenses.update") && festival?.status === "open" && expense && !expense.voided;
  const canVoid = can("expenses.void") && expense && !expense.voided;

  useEffect(() => {
    if (!expense) return;
    setTotal(String(expense.totalAmount ?? ""));
    setGodFund(String(expense.godFundAmount ?? ""));
    setPersonal(String(expense.personalAmount ?? ""));
    setSponsored(String(expense.sponsoredAmount ?? ""));
  }, [expense?.id, expense?.updatedAt?.seconds]);

  if (loading && !expense) {
    return (
      <GaneshScreen>
        <GaneshHeader
          title="Expense"
          icon={<Receipt size={22} color={g.saffron} strokeWidth={2.2} />}
          onBack={back}
        />
        <Text style={{ color: theme.colors.mutedForeground }}>Loading expense…</Text>
      </GaneshScreen>
    );
  }

  if (!expense) {
    return (
      <GaneshScreen>
        <GaneshHeader
          title="Expense"
          icon={<Receipt size={22} color={g.saffron} strokeWidth={2.2} />}
          onBack={back}
        />
        <GaneshEmptyState
          icon={<Receipt size={22} color={g.saffron} strokeWidth={2.2} />}
          title="Expense not found"
          description="It may belong to another festival, or it was removed."
        />
      </GaneshScreen>
    );
  }

  const confirmVoid = () => {
    const assetName = linkedAsset?.name ?? "linked item";
    const message = isPurchase
      ? `This expense created an asset (${assetName}). Voiding does not delete the asset.`
      : "This reverses the cash on the festival. The record stays in history.";
    Alert.alert("Void this expense?", message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Void",
        style: "destructive",
        onPress: () => {
          setBusy(true);
          writes
            .voidFinancialRecord(
              {
                entityType: "expense",
                entityId: expense.id,
                reason: isPurchase
                  ? "Voided asset purchase. Asset kept."
                  : "Voided from expense detail",
              },
              { festivalId: expenseFestivalId ?? undefined }
            )
            .catch((error) => {
              logError("ganesh.voidExpense", error);
              toast.error(friendlyErrorMessage(error, "Could not void."));
            })
            .finally(() => setBusy(false));
        },
      },
    ]);
  };

  return (
    <GaneshScreen>
      <GaneshHeader
        title={expense.name}
        subtitle={isPurchase ? "Asset purchase" : "Festival expense"}
        icon={<Receipt size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
      />
      <Money value={expense.totalAmount} size="title" />
      <Text style={{ color: theme.colors.mutedForeground }}>
        God Fund {formatInr(expense.godFundAmount)} · Personal {formatInr(expense.personalAmount)}
        {expense.sponsoredAmount > 0 ? ` · Sponsored ${formatInr(expense.sponsoredAmount)}` : ""}
      </Text>
      {festival ? (
        <Text style={{ color: theme.colors.mutedForeground }}>{festival.name}</Text>
      ) : null}
      {expense.voided ? (
        <Text style={{ color: theme.colors.mutedForeground, fontWeight: "700" }}>
          Voided{expense.voidReason ? ` · ${expense.voidReason}` : ""}
        </Text>
      ) : null}
      <AccountabilityLine
        paidBy={memberDisplayName(members, expense.paidByMemberId)}
        enteredBy={memberDisplayName(members, expense.createdBy)}
        at={expense.createdAt}
        date={expense.date}
      />
      {expense.vendor ? (
        <Text style={{ color: theme.colors.mutedForeground }}>Vendor {expense.vendor}</Text>
      ) : null}
      {expense.notes ? (
        <Text style={{ color: theme.colors.mutedForeground }}>{expense.notes}</Text>
      ) : null}
      <PendingHint pending={expense.pendingWrite} />
      {linkedSponsorship || (expense.sponsoredAmount > 0 && linkedSponsor) ? (
        <Pressable
          onPress={() =>
            push(
              `/(ganesh)/sponsor/${linkedSponsorship?.sponsorId ?? linkedSponsor?.id}` as never
            )
          }
          style={{
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
            borderWidth: 1,
            borderRadius: 16,
            padding: 14,
            gap: 4,
          }}
        >
          <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>Sponsor</Text>
          <Text style={{ color: theme.colors.mutedForeground }}>
            {linkedSponsor?.name ?? "Linked sponsor"}
            {expense.sponsoredAmount > 0 ? ` · ${formatInr(expense.sponsoredAmount)}` : ""}
          </Text>
        </Pressable>
      ) : null}
      {linkedAsset ? (
        <Pressable
          onPress={() => push(`/(ganesh)/asset/${linkedAsset.id}` as never)}
          style={{
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
            borderWidth: 1,
            borderRadius: 16,
            padding: 14,
            gap: 4,
          }}
        >
          <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
            Linked asset
          </Text>
          <Text style={{ color: theme.colors.mutedForeground }}>{linkedAsset.name}</Text>
        </Pressable>
      ) : isPurchase ? (
        <Text style={{ color: theme.colors.mutedForeground }}>
          This purchase created an asset that is still in the Pandal inventory.
        </Text>
      ) : null}
      {pandalId && expenseFestivalId && receiptPath ? (
        <GaneshSignedPreview
          path={receiptPath}
          pandalId={pandalId}
          festivalId={expenseFestivalId}
        />
      ) : null}

      {canEdit ? (
        <View style={{ gap: 16 }}>
          <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>Correct amount</Text>
          <Input label="Total" value={total} onChangeText={setTotal} keyboardType="numeric" />
          <Input label="God Fund" value={godFund} onChangeText={setGodFund} keyboardType="numeric" />
          <Input label="Personal" value={personal} onChangeText={setPersonal} keyboardType="numeric" />
          <Input
            label="Sponsored"
            value={sponsored}
            onChangeText={setSponsored}
            keyboardType="numeric"
          />
          {isPurchase ? (
            <Text style={{ color: theme.colors.mutedForeground }}>
              This updates the amount paid on the asset. Estimated value stays the same.
            </Text>
          ) : null}
          <Button
            loading={busy}
            onPress={() => {
              setBusy(true);
              writes
                .updateExpenseAmounts(
                  expense.id,
                  {
                    totalAmount: Number(total),
                    godFundAmount: Number(godFund),
                    personalAmount: Number(personal),
                    sponsoredAmount: Number(sponsored || 0),
                  },
                  { festivalId: expenseFestivalId ?? undefined }
                )
                .catch((error) => {
                  logError("ganesh.updateExpense", error);
                  toast.error(friendlyErrorMessage(error, "Could not update amount."));
                })
                .finally(() => setBusy(false));
            }}
          >
            Save amount
          </Button>
        </View>
      ) : null}

      {canVoid ? (
        <Button variant="outline" loading={busy} onPress={confirmVoid}>
          Void expense
        </Button>
      ) : null}
    </GaneshScreen>
  );
}
