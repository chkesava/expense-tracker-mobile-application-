import { useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AccountabilityLine } from "@/components/ganesh/AccountabilityLine";
import { GaneshSignedPreview } from "@/components/ganesh/GaneshSignedPreview";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { PendingHint } from "@/components/ganesh/GaneshSyncChip";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshExpense } from "@/hooks/useGaneshExpenses";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePandalAssets } from "@/hooks/usePandalAssets";
import { usePandalMembers } from "@/hooks/usePandalMembers";
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
  const { push } = useRouter();
  const params = useLocalSearchParams<{ id: string; festivalId?: string }>();
  const { pandalId, festivalId: sessionFestivalId } = useGaneshSession();
  const expenseFestivalId =
    typeof params.festivalId === "string" && params.festivalId ? params.festivalId : sessionFestivalId;
  const { festivals } = useFestivals(pandalId);
  const { expense, loading } = useGaneshExpense(pandalId, expenseFestivalId, params.id ?? null);
  const { assets } = usePandalAssets(pandalId);
  const { members } = usePandalMembers(pandalId);
  const { can } = useGaneshPermissions();
  const writes = useGaneshWrites();
  const [total, setTotal] = useState("");
  const [godFund, setGodFund] = useState("");
  const [personal, setPersonal] = useState("");
  const [sponsored, setSponsored] = useState("");
  const [busy, setBusy] = useState(false);
  const festival = festivals.find((item) => item.id === expenseFestivalId);
  const linkedAsset = assets.find((item) => item.id === expense?.assetId);
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
        <Text style={{ color: theme.colors.mutedForeground }}>Loading expense…</Text>
      </GaneshScreen>
    );
  }

  if (!expense) {
    return (
      <GaneshScreen>
        <Text style={{ color: theme.colors.foreground, fontSize: 22, fontWeight: "800" }}>
          Expense not found
        </Text>
        <Text style={{ color: theme.colors.mutedForeground }}>
          It may belong to another festival, or it was removed.
        </Text>
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
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ color: theme.colors.foreground, fontSize: 22, fontWeight: "800", flex: 1 }}>
          {expense.name}
        </Text>
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 999,
            backgroundColor: theme.colors.muted,
          }}
        >
          <Text style={{ color: theme.colors.mutedForeground, fontWeight: "700", fontSize: 12 }}>
            {isPurchase ? "Asset purchase" : "Regular"}
          </Text>
        </View>
      </View>
      <Text style={{ color: theme.colors.primary, fontWeight: "800" }}>
        {formatInr(expense.totalAmount)}
      </Text>
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
