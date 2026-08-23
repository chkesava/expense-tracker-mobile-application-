import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { GaneshImageUploader, type GaneshUploadStatus } from "@/components/ganesh/GaneshImageUploader";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshCategories } from "@/hooks/useGaneshCategories";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshStorage } from "@/hooks/useGaneshStorage";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import type { PreparedGaneshImage } from "@/services/ganesh/storage/storageTypes";
import { todayDateInput } from "@/shared/utils/ganeshIdentity";
import { useTheme } from "@/theme/ThemeProvider";

type Funding = "god" | "personal" | "split" | "sponsored";

export default function AddExpenseScreen() {
  const { theme } = useTheme();
  const { back } = useRouter();
  const { realUser } = useAuth();
  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const { categories } = useGaneshCategories(pandalId, festivalId);
  const visibleCategories = categories.filter((category) => !category.disabled);
  const { members } = usePandalMembers(pandalId);
  const writes = useGaneshWrites();
  const { can } = useGaneshPermissions();
  const { isOnline, uploadExpenseReceipt } = useGaneshStorage();
  const [name, setName] = useState("");
  const [total, setTotal] = useState("");
  const [godFund, setGodFund] = useState("");
  const [personal, setPersonal] = useState("");
  const [funding, setFunding] = useState<Funding>("god");
  const [categoryId, setCategoryId] = useState(visibleCategories[0]?.id ?? "");
  const [paidByMemberId, setPaidByMemberId] = useState(realUser?.uid ?? "");
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");
  const [receipt, setReceipt] = useState<PreparedGaneshImage | null>(null);
  const [receiptStatus, setReceiptStatus] = useState<GaneshUploadStatus>("idle");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selectedCategory =
    visibleCategories.find((category) => category.id === categoryId) ?? visibleCategories[0];
  const closed = festivals.find((item) => item.id === festivalId)?.status === "closed";
  const ledgerSaved = Boolean(savedId);

  const resolvedFunding = () => {
    const totalAmount = Number(total);
    if (funding === "god") return { totalAmount, godFundAmount: totalAmount, personalAmount: 0, sponsoredAmount: 0 };
    if (funding === "personal") return { totalAmount, godFundAmount: 0, personalAmount: totalAmount, sponsoredAmount: 0 };
    if (funding === "sponsored") return { totalAmount, godFundAmount: 0, personalAmount: 0, sponsoredAmount: totalAmount };
    return {
      totalAmount,
      godFundAmount: Number(godFund),
      personalAmount: Number(personal),
      sponsoredAmount: 0,
    };
  };

  const persistReceipt = async (expenseId: string, file: PreparedGaneshImage) => {
    if (!isOnline) {
      setReceiptStatus("waiting");
      return false;
    }
    setReceiptStatus("uploading");
    try {
      await uploadExpenseReceipt(expenseId, file);
      setReceiptStatus("uploaded");
      return true;
    } catch (error) {
      logError("ganesh.receiptUpload", error);
      setReceiptStatus("failed");
      toast.error("Expense saved, but receipt upload failed.");
      return false;
    }
  };

  useEffect(() => {
    if (!isOnline || receiptStatus !== "waiting" || !savedId || !receipt) return;
    setBusy(true);
    void persistReceipt(savedId, receipt)
      .then((ok) => {
        if (ok) back();
      })
      .finally(() => setBusy(false));
  }, [isOnline, receiptStatus, savedId, receipt]);

  if (!can("expenses.create")) {
    return <GaneshWriteLock message="Your role cannot add expenses." />;
  }

  return (
    <GaneshScreen>
      <Input label="Expense name" value={name} onChangeText={setName} placeholder="Flowers" editable={!ledgerSaved} />
      <Input label="Amount" value={total} onChangeText={setTotal} keyboardType="numeric" editable={!ledgerSaved} />
      <Text style={{ color: theme.colors.mutedForeground, fontWeight: "700" }}>Funding</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {(["god", "personal", "split", "sponsored"] as Funding[]).map((item) => (
          <Pressable
            key={item}
            disabled={ledgerSaved}
            onPress={() => setFunding(item)}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: funding === item ? theme.colors.primary : theme.colors.muted,
            }}
          >
            <Text
              style={{
                color: funding === item ? theme.colors.primaryForeground : theme.colors.foreground,
                fontWeight: "700",
                textTransform: "capitalize",
              }}
            >
              {item === "god" ? "God Fund" : item}
            </Text>
          </Pressable>
        ))}
      </View>
      {funding === "split" ? (
        <>
          <Input label="God Fund amount" value={godFund} onChangeText={setGodFund} keyboardType="numeric" editable={!ledgerSaved} />
          <Input label="Personal amount" value={personal} onChangeText={setPersonal} keyboardType="numeric" editable={!ledgerSaved} />
        </>
      ) : null}
      <Text style={{ color: theme.colors.mutedForeground, fontWeight: "700" }}>Category</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {visibleCategories.map((category) => (
          <Pressable
            key={category.id}
            disabled={ledgerSaved}
            onPress={() => setCategoryId(category.id)}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: (categoryId || visibleCategories[0]?.id) === category.id ? theme.colors.primary : theme.colors.muted,
            }}
          >
            <Text
              style={{
                color:
                  (categoryId || visibleCategories[0]?.id) === category.id
                    ? theme.colors.primaryForeground
                    : theme.colors.foreground,
                fontWeight: "700",
              }}
            >
              {category.name}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={{ color: theme.colors.mutedForeground, fontWeight: "700" }}>Paid by</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {members.map((member) => (
          <Pressable
            key={member.userId}
            disabled={ledgerSaved}
            onPress={() => setPaidByMemberId(member.userId)}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: paidByMemberId === member.userId ? theme.colors.primary : theme.colors.muted,
            }}
          >
            <Text
              style={{
                color: paidByMemberId === member.userId ? theme.colors.primaryForeground : theme.colors.foreground,
                fontWeight: "700",
              }}
            >
              {member.displayName}
            </Text>
          </Pressable>
        ))}
      </View>
      <Input label="Vendor (optional)" value={vendor} onChangeText={setVendor} editable={!ledgerSaved} />
      <Input label="Notes (optional)" value={notes} onChangeText={setNotes} editable={!ledgerSaved} />
      <GaneshImageUploader
        title="Receipt"
        kind="receipt"
        status={receiptStatus}
        previewUri={receipt?.uri}
        disabled={busy}
        onPrepared={(file) => {
          setReceipt(file);
          setReceiptStatus("selected");
        }}
        onRemove={() => {
          setReceipt(null);
          setReceiptStatus("idle");
        }}
        onRetry={() => {
          if (!savedId || !receipt) return;
          setBusy(true);
          void persistReceipt(savedId, receipt)
            .then((ok) => {
              if (ok) back();
            })
            .finally(() => setBusy(false));
        }}
      />
      <Button
        loading={busy}
        disabled={closed || ledgerSaved}
        onPress={() => {
          if (!selectedCategory) {
            toast.error("Add a category first.");
            return;
          }
          setBusy(true);
          writes
            .addExpense({
              name,
              ...resolvedFunding(),
              categoryId: selectedCategory.id,
              categoryName: selectedCategory.name,
              paidByMemberId: paidByMemberId || realUser?.uid || "",
              vendor,
              notes,
              date: todayDateInput(),
            })
            .then(async (id) => {
              setSavedId(id);
              if (!receipt) {
                back();
                return;
              }
              const uploaded = await persistReceipt(id, receipt);
              if (uploaded) back();
            })
            .catch((error) => {
              logError("ganesh.addExpense", error);
              toast.error(friendlyErrorMessage(error, "Could not save expense."));
            })
            .finally(() => setBusy(false));
        }}
      >
        Save expense
      </Button>
    </GaneshScreen>
  );
}
