import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";

import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshCategories } from "@/hooks/useGaneshCategories";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { uploadGaneshReceipt } from "@/services/ganesh/ganeshStorage";
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
  const { members } = usePandalMembers(pandalId);
  const writes = useGaneshWrites();
  const { can } = useGaneshPermissions();
  const [name, setName] = useState("");
  const [total, setTotal] = useState("");
  const [godFund, setGodFund] = useState("");
  const [personal, setPersonal] = useState("");
  const [funding, setFunding] = useState<Funding>("god");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [paidByMemberId, setPaidByMemberId] = useState(realUser?.uid ?? "");
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selectedCategory = categories.find((category) => category.id === categoryId) ?? categories[0];
  const closed = festivals.find((item) => item.id === festivalId)?.status === "closed";

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

  if (!can("expenses.create")) {
    return <GaneshWriteLock message="Your role cannot add expenses." />;
  }

  return (
    <GaneshScreen>
      <Input label="Expense name" value={name} onChangeText={setName} placeholder="Flowers" />
      <Input label="Amount" value={total} onChangeText={setTotal} keyboardType="numeric" />
      <Text style={{ color: theme.colors.mutedForeground, fontWeight: "700" }}>Funding</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {(["god", "personal", "split", "sponsored"] as Funding[]).map((item) => (
          <Pressable
            key={item}
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
          <Input label="God Fund amount" value={godFund} onChangeText={setGodFund} keyboardType="numeric" />
          <Input label="Personal amount" value={personal} onChangeText={setPersonal} keyboardType="numeric" />
        </>
      ) : null}
      <Text style={{ color: theme.colors.mutedForeground, fontWeight: "700" }}>Category</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {categories.map((category) => (
          <Pressable
            key={category.id}
            onPress={() => setCategoryId(category.id)}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: (categoryId || categories[0]?.id) === category.id ? theme.colors.primary : theme.colors.muted,
            }}
          >
            <Text
              style={{
                color:
                  (categoryId || categories[0]?.id) === category.id
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
      <Input label="Vendor (optional)" value={vendor} onChangeText={setVendor} />
      <Input label="Notes (optional)" value={notes} onChangeText={setNotes} />
      <Button
        variant="outline"
        onPress={() => {
          void ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6 }).then((result) => {
            if (!result.canceled) setReceiptUri(result.assets[0]?.uri ?? null);
          });
        }}
      >
        {receiptUri ? "Receipt selected" : "Add receipt photo (optional)"}
      </Button>
      <Button
        loading={busy}
        disabled={closed}
        onPress={() => {
          if (!selectedCategory) {
            toast.error("Add a category first.");
            return;
          }
          setBusy(true);
          const amounts = resolvedFunding();
          const upload = receiptUri && pandalId && festivalId
            ? uploadGaneshReceipt(pandalId, festivalId, receiptUri).catch(() => undefined)
            : Promise.resolve(undefined);
          upload
            .then((receiptPath) =>
              writes.addExpense({
                name,
                ...amounts,
                categoryId: selectedCategory.id,
                categoryName: selectedCategory.name,
                paidByMemberId: paidByMemberId || realUser?.uid || "",
                vendor,
                notes,
                date: todayDateInput(),
                receiptPath,
              })
            )
            .then(() => back())
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
