import { useEffect, useMemo, useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronRight, FileText, Package, Receipt } from "lucide-react-native";

import { GaneshImageUploader } from "@/components/ganesh/GaneshImageUploader";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import { PendingHint } from "@/components/ganesh/GaneshSyncChip";
import {
  GaneshHeader,
  ListStateView,
  MetaLabel,
  Section,
  StatusBadge,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { pickerStatus, useGaneshPhotoUpload } from "@/hooks/useGaneshPhotoUpload";
import { useGaneshStorage } from "@/hooks/useGaneshStorage";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePandalDocument, usePandalDocumentAuditsFor } from "@/hooks/usePandalDocuments";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import type { PreparedGaneshImage } from "@/services/ganesh/storage/storageTypes";
import {
  documentCategoryLabel,
  documentEntityLabel,
  documentStatusLabel,
} from "@/shared/utils/ganeshDocuments";
import { formatGaneshWhen } from "@/shared/utils/ganeshIdentity";
import { useTheme } from "@/theme/ThemeProvider";

function auditActionLabel(action: string): string {
  const spaced = action.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export default function DocumentDetailScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { push, back } = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pandalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const { document, loading } = usePandalDocument(pandalId, id ?? null);
  const { audits } = usePandalDocumentAuditsFor(pandalId, id ?? null);
  const { can } = useGaneshPermissions();
  const writes = useGaneshWrites();
  const { signedUrl } = useGaneshStorage();
  const photoUpload = useGaneshPhotoUpload("festivalDocument");

  const [description, setDescription] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);
  const [photo, setPhoto] = useState<PreparedGaneshImage | null>(null);
  const [busy, setBusy] = useState(false);
  const photoJob = photoUpload.jobFor(document?.id);

  const festivalName = useMemo(
    () => festivals.find((festival) => festival.id === document?.festivalId)?.name,
    [document?.festivalId, festivals]
  );

  useEffect(() => {
    if (!document) return;
    setDescription(document.description ?? "");
  }, [document?.id, document?.description]);

  useEffect(() => {
    let cancelled = false;
    const path = document?.storagePath?.trim();
    if (!path || !pandalId) {
      setPhotoUrl(undefined);
      return;
    }
    signedUrl(path)
      .then((url) => {
        if (!cancelled) setPhotoUrl(url);
      })
      .catch((error) => {
        logError("ganesh.documentPreview", error);
        if (!cancelled) setPhotoUrl(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [document?.storagePath, pandalId, signedUrl]);

  if (!can("documents.read")) {
    return (
      <GaneshScreen safeTop>
        <GaneshHeader
          title="Document"
          icon={<FileText size={22} color={g.saffron} strokeWidth={2.2} />}
          onBack={back}
        />
        <GaneshWriteLock message="You do not have permission to view this document." />
      </GaneshScreen>
    );
  }

  if (loading && !document) {
    return (
      <GaneshScreen safeTop>
        <ListStateView loading title="Loading document" />
      </GaneshScreen>
    );
  }

  if (!document) {
    return (
      <GaneshScreen safeTop>
        <GaneshHeader
          title="Document"
          icon={<FileText size={22} color={g.saffron} strokeWidth={2.2} />}
          onBack={back}
        />
        <GaneshWriteLock message="Document not found." />
      </GaneshScreen>
    );
  }

  const canEdit = can("documents.update") && document.status === "active";
  const canArchive = can("documents.delete") && document.status === "active";
  const canReplaceFile =
    canEdit
    && document.entityType === "festival"
    && Boolean(document.festivalId);
  const entityRoute =
    document.entityType === "expense" && document.festivalId
      ? `/(ganesh)/expense/${document.entityId}?festivalId=${document.festivalId}`
      : document.entityType === "contribution"
        ? `/(ganesh)/contribution/${document.entityId}`
        : document.entityType === "asset"
          ? `/(ganesh)/asset/${document.entityId}`
          : document.entityType === "sponsor"
            ? `/(ganesh)/sponsor/${document.entityId}`
            : null;

  const run = (work: Promise<unknown>, fallback: string) => {
    setBusy(true);
    work
      .catch((error) => {
        logError("ganesh.documentDetail", error);
        toast.error(friendlyErrorMessage(error, fallback));
      })
      .finally(() => setBusy(false));
  };

  return (
    <GaneshScreen safeTop>
      <GaneshHeader
        title={document.description?.trim() || document.fileName || "Document"}
        subtitle={documentCategoryLabel(document.category)}
        icon={<FileText size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
        rightElement={
          <StatusBadge
            kind={document.status === "archived" ? "cancelled" : "received"}
            label={documentStatusLabel(document.status)}
          />
        }
      />

      {photoUrl ? (
        <Image
          source={{ uri: photoUrl }}
          accessibilityLabel={document.fileName || "Document preview"}
          style={[styles.photo, { backgroundColor: g.tile }]}
        />
      ) : null}

      <PendingHint pending={document.pendingWrite} />

      <Section title="Details">
        <View style={styles.factList}>
          <Fact label="Category" value={documentCategoryLabel(document.category)} />
          <Fact label="Linked to" value={documentEntityLabel(document.entityType)} />
          {festivalName ? <Fact label="Festival" value={festivalName} /> : null}
          {document.fileName ? <Fact label="File" value={document.fileName} /> : null}
          {document.fileSize > 0 ? (
            <Fact label="Size" value={`${Math.round(document.fileSize / 1024)} KB`} />
          ) : null}
          {document.createdAt ? (
            <Fact label="Added" value={formatGaneshWhen(document.createdAt)} />
          ) : null}
        </View>
        <MetaLabel>
          Vault rows are metadata only. Archiving here does not reverse any expense or contribution.
        </MetaLabel>
      </Section>

      {entityRoute ? (
        <Section title="Linked record">
          <Pressable
            onPress={() => push(entityRoute)}
            style={[styles.linkRow, { borderColor: theme.colors.border }]}
          >
            {document.entityType === "expense" ? (
              <Receipt size={17} color={theme.colors.mutedForeground} strokeWidth={2.2} />
            ) : (
              <Package size={17} color={theme.colors.mutedForeground} strokeWidth={2.2} />
            )}
            <Text
              style={[
                styles.linkTitle,
                { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium },
              ]}
            >
              Open {documentEntityLabel(document.entityType).toLowerCase()}
            </Text>
            <ChevronRight size={18} color={theme.colors.mutedForeground} />
          </Pressable>
        </Section>
      ) : null}

      {canEdit ? (
        <Section title="Edit">
          <Input
            label="Description"
            value={description}
            onChangeText={setDescription}
          />
          <Button
            loading={busy}
            onPress={() =>
              run(
                writes.updatePandalDocument(document.id, { description }),
                "Could not update document."
              )
            }
          >
            Save description
          </Button>
          {canReplaceFile ? (
            <GaneshImageUploader
              title="Replace photo"
              kind="photo"
              status={pickerStatus({
                job: photoJob,
                hasSelection: Boolean(photo),
                recordSaved: true,
                busy,
              })}
              previewUri={photo?.uri}
              disabled={busy}
              onPrepared={(file) => {
                setPhoto(file);
                setBusy(true);
                photoUpload
                  .queue(document.id, file)
                  .catch((error) => {
                    logError("ganesh.documentReplace", error);
                    toast.error(friendlyErrorMessage(error, "Could not queue that file."));
                  })
                  .finally(() => setBusy(false));
              }}
              onRemove={() => setPhoto(null)}
              onRetry={() => {
                setBusy(true);
                photoUpload
                  .retry(document.id)
                  .catch((error) => {
                    logError("ganesh.documentRetry", error);
                    toast.error(friendlyErrorMessage(error, "Could not retry upload."));
                  })
                  .finally(() => setBusy(false));
              }}
            />
          ) : null}
        </Section>
      ) : null}

      {canArchive ? (
        <Section title="Archive">
          <Button
            variant="outline"
            loading={busy}
            onPress={() => {
              Alert.alert(
                "Archive this document?",
                "It stays in the vault history but leaves the active list.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Archive",
                    style: "destructive",
                    onPress: () =>
                      run(
                        writes.archivePandalDocument(document.id).then(() => back()),
                        "Could not archive document."
                      ),
                  },
                ]
              );
            }}
          >
            Archive document
          </Button>
        </Section>
      ) : null}

      <Section title="History">
        {audits.length === 0 ? (
          <MetaLabel>No changes recorded yet.</MetaLabel>
        ) : (
          audits.slice(0, 12).map((audit) => (
            <Text
              key={audit.id}
              style={[styles.auditRow, { color: theme.colors.mutedForeground }]}
            >
              {auditActionLabel(audit.action)}
              {audit.at ? ` · ${formatGaneshWhen(audit.at)}` : ""}
              {audit.reason ? ` · ${audit.reason}` : ""}
            </Text>
          ))
        )}
      </Section>
    </GaneshScreen>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.fact}>
      <Text style={[styles.factLabel, { color: theme.colors.mutedForeground }]}>{label}</Text>
      <Text
        style={[
          styles.factValue,
          { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  photo: {
    width: "100%",
    height: 220,
    borderRadius: 16,
    marginBottom: 12,
  },
  factList: {
    gap: 10,
    marginBottom: 10,
  },
  fact: {
    gap: 2,
  },
  factLabel: {
    fontSize: 12,
  },
  factValue: {
    fontSize: 15,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
  },
  linkTitle: {
    flex: 1,
    fontSize: 15,
  },
  auditRow: {
    fontSize: 13,
    marginBottom: 6,
  },
});
