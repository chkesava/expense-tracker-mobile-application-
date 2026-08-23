import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { ChoiceChips } from "@/components/ganesh/ChoiceChips";
import { GaneshImageUploader, type GaneshUploadStatus } from "@/components/ganesh/GaneshImageUploader";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useGaneshExpenses } from "@/hooks/useGaneshExpenses";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshStorage } from "@/hooks/useGaneshStorage";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import type { PreparedGaneshImage } from "@/services/ganesh/storage/storageTypes";
import type { AssetOwnershipType } from "@/shared/types/ganesh";
import {
  ASSET_CATEGORIES,
  ASSET_CONDITIONS,
  ASSET_OWNERSHIP,
  ASSET_UNITS,
} from "@/shared/utils/ganeshAssets";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { useTheme } from "@/theme/ThemeProvider";

export default function AddAssetScreen() {
  const { theme } = useTheme();
  const { back } = useRouter();
  const { pandalId, festivalId } = useGaneshSession();
  const { expenses } = useGaneshExpenses(pandalId, festivalId);
  const writes = useGaneshWrites();
  const { can } = useGaneshPermissions();
  const { isOnline, uploadAssetPhoto } = useGaneshStorage();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<(typeof ASSET_CATEGORIES)[number]["id"]>("furniture");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState<(typeof ASSET_UNITS)[number]["id"]>("pieces");
  const [ownership, setOwnership] = useState<AssetOwnershipType>("purchased");
  const [sourceName, setSourceName] = useState("");
  const [relatedExpenseId, setRelatedExpenseId] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [condition, setCondition] = useState<(typeof ASSET_CONDITIONS)[number]["id"]>("good");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<PreparedGaneshImage | null>(null);
  const [photoStatus, setPhotoStatus] = useState<GaneshUploadStatus>("idle");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const openExpenses = expenses.filter((expense) => !expense.voided);

  const persistPhoto = async (assetId: string, file: PreparedGaneshImage) => {
    if (!isOnline) {
      setPhotoStatus("waiting");
      return false;
    }
    setPhotoStatus("uploading");
    try {
      await uploadAssetPhoto(assetId, file);
      setPhotoStatus("uploaded");
      return true;
    } catch (error) {
      logError("ganesh.assetPhotoUpload", error);
      setPhotoStatus("failed");
      toast.error("Asset saved, but photo upload failed.");
      return false;
    }
  };

  useEffect(() => {
    if (!isOnline || photoStatus !== "waiting" || !savedId || !photo) return;
    setBusy(true);
    void persistPhoto(savedId, photo)
      .then((ok) => {
        if (ok) back();
      })
      .finally(() => setBusy(false));
  }, [isOnline, photoStatus, savedId, photo]);

  if (!can("assets.create")) {
    return <GaneshWriteLock message="Your role cannot add Pandal assets." />;
  }

  return (
    <GaneshScreen>
      <Input
        label="Item name"
        value={name}
        onChangeText={setName}
        placeholder="Plastic chairs"
        editable={!savedId}
      />
      <ChoiceChips
        label="Category"
        value={category}
        options={ASSET_CATEGORIES}
        onChange={setCategory}
        disabled={Boolean(savedId)}
      />
      <Input
        label="Quantity"
        value={quantity}
        onChangeText={setQuantity}
        keyboardType="number-pad"
        editable={!savedId}
      />
      <ChoiceChips
        label="Unit"
        value={unit}
        options={ASSET_UNITS}
        onChange={setUnit}
        disabled={Boolean(savedId)}
      />
      <ChoiceChips
        label="How did the Pandal get this?"
        value={ownership}
        options={ASSET_OWNERSHIP}
        onChange={(next) => {
          setOwnership(next);
          setRelatedExpenseId("");
          setSourceName("");
        }}
        disabled={Boolean(savedId)}
      />
      {ownership === "purchased" ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: theme.colors.mutedForeground, fontWeight: "700" }}>
            Link a festival expense (optional)
          </Text>
          <Text style={{ color: theme.colors.mutedForeground, lineHeight: 20 }}>
            This does not create or change any money record.
          </Text>
          {openExpenses.length === 0 ? (
            <Text style={{ color: theme.colors.mutedForeground }}>
              No expenses this festival. You can still add the item.
            </Text>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Pressable
                disabled={Boolean(savedId)}
                onPress={() => setRelatedExpenseId("")}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: !relatedExpenseId ? theme.colors.primary : theme.colors.muted,
                }}
              >
                <Text
                  style={{
                    color: !relatedExpenseId ? theme.colors.primaryForeground : theme.colors.foreground,
                    fontWeight: "700",
                  }}
                >
                  None
                </Text>
              </Pressable>
              {openExpenses.map((expense) => (
                <Pressable
                  key={expense.id}
                  disabled={Boolean(savedId)}
                  onPress={() => setRelatedExpenseId(expense.id)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 999,
                    backgroundColor:
                      relatedExpenseId === expense.id ? theme.colors.primary : theme.colors.muted,
                  }}
                >
                  <Text
                    style={{
                      color:
                        relatedExpenseId === expense.id
                          ? theme.colors.primaryForeground
                          : theme.colors.foreground,
                      fontWeight: "700",
                    }}
                  >
                    {expense.name} · {formatInr(expense.totalAmount)}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      ) : null}
      {ownership === "donated" ? (
        <Input
          label="Donated by"
          value={sourceName}
          onChangeText={setSourceName}
          placeholder="Name of the donor"
          editable={!savedId}
        />
      ) : null}
      {ownership === "sponsored" ? (
        <Input
          label="Sponsored by"
          value={sourceName}
          onChangeText={setSourceName}
          placeholder="Sponsor name"
          editable={!savedId}
        />
      ) : null}
      {ownership === "transferred" || ownership === "other" ? (
        <Input
          label="Note (optional)"
          value={sourceName}
          onChangeText={setSourceName}
          placeholder="Where it came from"
          editable={!savedId}
        />
      ) : null}
      <Input
        label="Estimated value (optional)"
        value={estimatedValue}
        onChangeText={setEstimatedValue}
        keyboardType="numeric"
        editable={!savedId}
      />
      <ChoiceChips
        label="Condition"
        value={condition}
        options={ASSET_CONDITIONS}
        onChange={setCondition}
        disabled={Boolean(savedId)}
      />
      <Input
        label="Location (optional)"
        value={location}
        onChangeText={setLocation}
        placeholder="Store room"
        editable={!savedId}
      />
      <Input
        label="Description (optional)"
        value={description}
        onChangeText={setDescription}
        editable={!savedId}
      />
      <GaneshImageUploader
        title="Photo"
        kind="photo"
        status={photoStatus}
        previewUri={photo?.uri}
        disabled={busy}
        onPrepared={(file) => {
          setPhoto(file);
          setPhotoStatus("selected");
        }}
        onRemove={() => {
          setPhoto(null);
          setPhotoStatus("idle");
        }}
        onRetry={() => {
          if (!savedId || !photo) return;
          setBusy(true);
          void persistPhoto(savedId, photo)
            .then((ok) => {
              if (ok) back();
            })
            .finally(() => setBusy(false));
        }}
      />
      <Button
        loading={busy}
        disabled={Boolean(savedId)}
        onPress={() => {
          setBusy(true);
          writes
            .createPandalAsset({
              name,
              category,
              quantity: Number(quantity),
              unit,
              ownershipType: ownership,
              estimatedValue: estimatedValue.trim() ? Number(estimatedValue) : 0,
              condition,
              location,
              description,
              sourceName,
              relatedExpenseId: ownership === "purchased" ? relatedExpenseId : undefined,
              relatedExpenseFestivalId:
                ownership === "purchased" && relatedExpenseId && festivalId
                  ? festivalId
                  : undefined,
            })
            .then(async (id) => {
              setSavedId(id);
              if (!photo) {
                back();
                return;
              }
              const uploaded = await persistPhoto(id, photo);
              if (uploaded) back();
            })
            .catch((error) => {
              logError("ganesh.addAsset", error);
              toast.error(friendlyErrorMessage(error, "Could not save asset."));
            })
            .finally(() => setBusy(false));
        }}
      >
        Save asset
      </Button>
    </GaneshScreen>
  );
}
