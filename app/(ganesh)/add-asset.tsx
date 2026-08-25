import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Package } from "lucide-react-native";

import { GaneshImageUploader, type GaneshUploadStatus } from "@/components/ganesh/GaneshImageUploader";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import {
  FilterChips,
  FormShell,
  MoreDetails,
  Section,
  StatusStrip,
  useGaneshTokens,
} from "@/components/ganesh/ui";
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

/** The label for the "where did it come from" field depends on ownership. */
const SOURCE_LABELS: Partial<Record<AssetOwnershipType, string>> = {
  donated: "Donated by",
  sponsored: "Sponsored by",
  transferred: "Transferred from",
  other: "Where it came from",
};

export default function AddAssetScreen() {
  const g = useGaneshTokens();
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
  const locked = Boolean(savedId);
  const sourceLabel = SOURCE_LABELS[ownership];

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

  const parsedQty = Number(quantity);
  const qtyValid = Number.isInteger(parsedQty) && parsedQty > 0;
  const optionalFilled = [location, description].filter((value) => value.trim()).length;

  return (
    <FormShell
      title="Add asset"
      subtitle="Stays with the Pandal"
      icon={<Package size={22} color={g.saffron} strokeWidth={2.2} />}
      onBack={back}
      submitLabel="Save asset"
      submitting={busy}
      submitDisabled={locked || !name.trim() || !qtyValid}
      onSubmit={() => {
        setBusy(true);
        writes
          .createPandalAsset({
            name,
            category,
            quantity: parsedQty,
            unit,
            ownershipType: ownership,
            estimatedValue: estimatedValue.trim() ? Number(estimatedValue) : 0,
            condition,
            location,
            description,
            sourceName,
            relatedExpenseId: ownership === "purchased" ? relatedExpenseId : undefined,
            relatedExpenseFestivalId:
              ownership === "purchased" && relatedExpenseId && festivalId ? festivalId : undefined,
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
      footerHint={
        photoStatus === "waiting" ? (
          <StatusStrip
            tone="warning"
            message="Asset saved. The photo uploads as soon as you are back online."
          />
        ) : !qtyValid && quantity.trim() ? (
          <StatusStrip tone="warning" message="Quantity must be a whole number above zero." />
        ) : null
      }
    >
      <Section title="The item" plain>
        <View style={styles.form}>
          <Input
            label="Item name"
            value={name}
            onChangeText={setName}
            placeholder="Plastic chairs"
            autoCapitalize="sentences"
            editable={!locked}
            autoFocus
          />
          <Input
            label="Quantity"
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="number-pad"
            editable={!locked}
          />
          <FilterChips
            label="Unit"
            value={unit}
            options={ASSET_UNITS}
            onChange={setUnit}
            disabled={locked}
          />
          <FilterChips
            label="Category"
            value={category}
            options={ASSET_CATEGORIES}
            onChange={setCategory}
            disabled={locked}
          />
          <FilterChips
            label="Condition"
            value={condition}
            options={ASSET_CONDITIONS}
            onChange={setCondition}
            disabled={locked}
          />
        </View>
      </Section>

      <Section
        title="Where it came from"
        subtitle="Linking an expense records provenance only — it never creates or changes a money record."
      >
        <View style={styles.form}>
          <FilterChips
            label="How the Pandal got it"
            value={ownership}
            options={ASSET_OWNERSHIP}
            onChange={(next) => {
              setOwnership(next);
              setRelatedExpenseId("");
              setSourceName("");
            }}
            disabled={locked}
          />

          {ownership === "purchased" ? (
            openExpenses.length === 0 ? (
              <StatusStrip
                tone="muted"
                message="No expenses this festival yet. You can still add the item."
              />
            ) : (
              <FilterChips
                label="Linked expense (optional)"
                value={relatedExpenseId}
                options={[
                  { id: "", label: "None" },
                  ...openExpenses.map((expense) => ({
                    id: expense.id,
                    label: `${expense.name} · ${formatInr(expense.totalAmount)}`,
                  })),
                ]}
                onChange={setRelatedExpenseId}
                disabled={locked}
              />
            )
          ) : null}

          {sourceLabel ? (
            <Input
              label={sourceLabel}
              value={sourceName}
              onChangeText={setSourceName}
              editable={!locked}
            />
          ) : null}

          <Input
            label="Estimated value (optional)"
            value={estimatedValue}
            onChangeText={setEstimatedValue}
            keyboardType="numeric"
            editable={!locked}
          />
        </View>
      </Section>

      <Section title="Photo" plain>
        <GaneshImageUploader
          title="Item photo"
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
      </Section>

      <MoreDetails filledCount={optionalFilled}>
        <Input
          label="Stored at"
          value={location}
          onChangeText={setLocation}
          placeholder="Store room"
          editable={!locked}
        />
        <Input
          label="Description"
          value={description}
          onChangeText={setDescription}
          editable={!locked}
        />
      </MoreDetails>
    </FormShell>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 14,
  },
});
