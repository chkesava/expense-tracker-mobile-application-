import { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { FileText } from "lucide-react-native";

import { FormDetails } from "@/components/ganesh/FormDetails";
import { GaneshImageUploader } from "@/components/ganesh/GaneshImageUploader";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import { FilterChips, GaneshHeader, MetaLabel, useGaneshTokens } from "@/components/ganesh/ui";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useFestivalWriteLock } from "@/hooks/useFestivalWriteLock";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { pickerStatus, useGaneshPhotoUpload } from "@/hooks/useGaneshPhotoUpload";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import type { PreparedGaneshImage } from "@/services/ganesh/storage/storageTypes";
import type { GaneshDocumentCategory } from "@/shared/types/ganesh";
import { DOCUMENT_CATEGORIES } from "@/shared/utils/ganeshDocuments";

const STANDALONE_CATEGORIES = DOCUMENT_CATEGORIES.filter((row) =>
  ["festival_document", "invoice", "quotation", "sponsorship_document", "other"].includes(row.id)
);

export default function AddDocumentScreen() {
  const g = useGaneshTokens();
  const { back } = useRouter();
  const { pandalId, festivalId } = useGaneshSession();
  const writes = useGaneshWrites();
  const { closed, lockMessage } = useFestivalWriteLock();
  const { can } = useGaneshPermissions();
  const photoUpload = useGaneshPhotoUpload("festivalDocument");

  const [category, setCategory] = useState<GaneshDocumentCategory>("festival_document");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<PreparedGaneshImage | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const photoJob = photoUpload.jobFor(savedId);

  const queuePhoto = async (recordId: string, file: PreparedGaneshImage) => {
    try {
      await photoUpload.queue(recordId, file);
      return true;
    } catch (error) {
      logError("ganesh.documentPhotoQueue", error);
      toast.error(
        friendlyErrorMessage(error, "Document saved, but the file could not be queued.")
      );
      return false;
    }
  };

  if (!can("documents.create")) {
    return (
      <GaneshScreen safeTop>
        <GaneshHeader
          title="Add document"
          icon={<FileText size={22} color={g.saffron} strokeWidth={2.2} />}
          onBack={back}
        />
        <GaneshWriteLock message="You do not have permission to add documents." />
      </GaneshScreen>
    );
  }

  if (!pandalId || !festivalId) {
    return (
      <GaneshScreen safeTop>
        <GaneshHeader
          title="Add document"
          icon={<FileText size={22} color={g.saffron} strokeWidth={2.2} />}
          onBack={back}
        />
        <GaneshWriteLock message="Select a Pandal and festival first." />
      </GaneshScreen>
    );
  }

  if (closed) {
    return (
      <GaneshScreen safeTop>
        <GaneshHeader
          title="Add document"
          icon={<FileText size={22} color={g.saffron} strokeWidth={2.2} />}
          onBack={back}
        />
        <GaneshWriteLock message={lockMessage} />
      </GaneshScreen>
    );
  }

  return (
    <GaneshScreen safeTop>
      <GaneshHeader
        title="Add document"
        subtitle="Festival file for the vault"
        icon={<FileText size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
      />
      <MetaLabel>
        This creates a vault record only. It does not change God Fund, Permanent Fund, or any
        ledger balance.
      </MetaLabel>
      <View style={{ gap: 12, paddingHorizontal: 16 }}>
        <FilterChips
          label="Category"
          value={category}
          options={STANDALONE_CATEGORIES}
          onChange={(id) => setCategory(id as GaneshDocumentCategory)}
        />
        <Input
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="e.g. Sound system quotation"
        />
        <FormDetails label="Add photo">
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
          disabled={Boolean(savedId) || !photo}
          onPress={() => {
            if (!photo) {
              toast.error("Choose a photo first.");
              return;
            }
            setBusy(true);
            writes
              .createFestivalDocument({
                festivalId,
                category,
                description,
              })
              .then(async (id) => {
                setSavedId(id);
                const queued = await queuePhoto(id, photo);
                if (queued) back();
              })
              .catch((error) => {
                logError("ganesh.addDocument", error);
                toast.error(friendlyErrorMessage(error, "Could not save document."));
              })
              .finally(() => setBusy(false));
          }}
        >
          Save document
        </Button>
      </View>
    </GaneshScreen>
  );
}
