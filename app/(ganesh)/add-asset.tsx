import { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Package } from "lucide-react-native";

import { ChoiceChips } from "@/components/ganesh/ChoiceChips";
import { FormDetails } from "@/components/ganesh/FormDetails";
import { GaneshImageUploader } from "@/components/ganesh/GaneshImageUploader";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import { FilterChips, GaneshHeader, useGaneshTokens } from "@/components/ganesh/ui";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useGaneshExpenses } from "@/hooks/useGaneshExpenses";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { pickerStatus, useGaneshPhotoUpload } from "@/hooks/useGaneshPhotoUpload";
import { useFestivalWriteLock } from "@/hooks/useFestivalWriteLock";
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
  const g = useGaneshTokens();
  const { back } = useRouter();
  const { pandalId, festivalId } = useGaneshSession();
  const { expenses } = useGaneshExpenses(pandalId, festivalId);
  const writes = useGaneshWrites();
  const { closed, lockMessage } = useFestivalWriteLock();
  const { can } = useGaneshPermissions();
  const photoUpload = useGaneshPhotoUpload("assetPhoto");
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
  const [savedId, setSavedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const photoJob = photoUpload.jobFor(savedId);
  const openExpenses = expenses.filter((expense) => !expense.voided);

  /**
   * Hand the photo to the durable queue (GS-040).
   *
   * The old path uploaded inline and, when offline, kept the image in component
   * state to re-try from an effect — so the photo lived exactly as long as this
   * screen did. The enqueue below resolves only once the image is staged on
   * disk and the job is written, which is what makes leaving the screen,
   * backgrounding, or killing the app survivable.
   */
  const queuePhoto = async (recordId: string, file: PreparedGaneshImage) => {
    try {
      await photoUpload.queue(recordId, file);
      return true;
    } catch (error) {
      logError("ganesh.assetPhotoQueue", error);
      toast.error(friendlyErrorMessage(error, "Asset saved, but the photo could not be queued."));
      return false;
    }
  };

  if (!can("assets.create")) {
    return <GaneshWriteLock message="Your role cannot add Pandal assets." />;
  }
  if (closed) {
    // The last money screen with no closed-festival guard (GS-057): the user
    // could fill in a whole asset form that the rules would then refuse.
    return <GaneshWriteLock message={lockMessage} />;
  }

  return (
    <GaneshScreen>
      <GaneshHeader
        title="Add asset"
        icon={<Package size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
      />
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
      <FormDetails>
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
            <FilterChips
              layout="wrap"
              value={relatedExpenseId || "none"}
              options={[
                { id: "none", label: "None" },
                ...openExpenses.map((expense) => ({
                  id: expense.id,
                  label: `${expense.name} · ${formatInr(expense.totalAmount)}`,
                })),
              ]}
              onChange={(next) => setRelatedExpenseId(next === "none" ? "" : next)}
              disabled={Boolean(savedId)}
            />
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
        status={pickerStatus({
          job: photoJob,
          hasSelection: Boolean(photo),
          recordSaved: Boolean(savedId),
          busy,
        })}
        previewUri={photo?.uri}
        disabled={busy}
        onPrepared={setPhoto}
        onRemove={() => {
          setPhoto(null);
          if (savedId) void photoUpload.cancel(savedId);
        }}
        onRetry={() => {
          if (!savedId) return;
          setBusy(true);
          // A job that gave up is re-armed in the queue; no job at all means
          // the enqueue never landed, so it is attempted from scratch.
          const again = photoJob
            ? photoUpload.retry(savedId).then(() => true)
            : photo
              ? queuePhoto(savedId, photo)
              : Promise.resolve(false);
          void again
            .then((ok) => {
              if (ok) back();
            })
            .finally(() => setBusy(false));
        }}
      />
      </FormDetails>
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
              const queued = await queuePhoto(id, photo);
              if (queued) back();
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
