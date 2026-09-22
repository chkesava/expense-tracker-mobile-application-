import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { FileText, Paperclip } from "lucide-react-native";

import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { accountAccent, ACCOUNT_RED } from "@/components/accounts/accountScreenTheme";
import { haptic } from "@/lib/haptics";
import { logWarning } from "@/lib/errors";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import type { AccountDocument } from "@/shared/types/expense";
import type { PickedDocumentFile } from "@/services/accounts/accountDocumentsStore";
import {
  ALLOWED_DOCUMENT_TYPES,
  DOCUMENT_NAME_MAX,
  DOCUMENT_NOTE_MAX,
  documentRejectionReason,
  documentTypeLabel,
  formatDocumentSize,
} from "@/shared/utils/accountDocuments";

/**
 * Add a document, or edit an existing one's name and note (SPENDLY-88).
 *
 * One sheet for both because the fields are the same; what changes is whether a
 * file is being picked. Editing never re-picks: the stored bytes are not being
 * replaced, so offering a file picker there would imply they could be.
 */
export function AccountDocumentModal({
  isOpen,
  document,
  onClose,
  onAdd,
  onSaveMeta,
}: {
  isOpen: boolean;
  /** The document being edited, or undefined when adding a new one. */
  document?: AccountDocument;
  onClose: () => void;
  onAdd: (file: PickedDocumentFile, meta: { name: string; note: string }) => Promise<void>;
  onSaveMeta: (meta: { name: string; note: string }) => Promise<void>;
}) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const accent = accountAccent(isDark);

  const [file, setFile] = useState<PickedDocumentFile | undefined>();
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [pickError, setPickError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const isEditing = Boolean(document);

  // Reset on every open so a cancelled add never leaks into the next one.
  useEffect(() => {
    if (!isOpen) return;
    setFile(undefined);
    setName(document?.name ?? "");
    setNote(document?.note ?? "");
    setPickError(undefined);
    setSaving(false);
  }, [isOpen, document]);

  const pick = async () => {
    setPickError(undefined);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [...ALLOWED_DOCUMENT_TYPES],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) return;

      const picked: PickedDocumentFile = {
        uri: asset.uri,
        fileName: asset.name || "document",
        mimeType: asset.mimeType || "",
        size: asset.size ?? 0,
      };

      // Check before anything is uploaded, so the user hears "that won't work"
      // now rather than after waiting for a 10 MB transfer to fail.
      const rejection = documentRejectionReason(picked);
      if (rejection) {
        setPickError(rejection);
        return;
      }

      setFile(picked);
      // Seed the name from the file only while the user has not typed one.
      setName((current) => current || picked.fileName);
    } catch (error) {
      logWarning("accountDocuments.pick", error);
      setPickError("Could not open the file picker.");
    }
  };

  const canSave = useMemo(() => {
    if (saving) return false;
    if (name.trim().length === 0) return false;
    if (isEditing) {
      return name.trim() !== (document?.name ?? "") || note.trim() !== (document?.note ?? "");
    }
    return Boolean(file);
  }, [document, file, isEditing, name, note, saving]);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const meta = { name: name.trim(), note: note.trim() };
      if (isEditing) {
        await onSaveMeta(meta);
      } else if (file) {
        await onAdd(file, meta);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Edit document" : "Add document"}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        {isEditing ? (
          <View
            style={[
              styles.storedFile,
              {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.04)"
                  : "rgba(15,23,42,0.03)",
                borderColor: isDark
                  ? "rgba(148,163,184,0.16)"
                  : "rgba(15,23,42,0.08)",
              },
            ]}
          >
            <FileText size={16} color={theme.colors.mutedForeground} />
            <View style={styles.storedText}>
              <Text
                numberOfLines={1}
                style={[styles.storedName, { color: theme.colors.foreground }]}
              >
                {document?.fileName}
              </Text>
              <Text style={[styles.storedMeta, { color: theme.colors.mutedForeground }]}>
                {documentTypeLabel(document?.mimeType)}
                {" · "}
                {formatDocumentSize(document?.sizeBytes)}
                {" · the stored file is not replaced"}
              </Text>
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() => {
              void haptic.selection();
              void pick();
            }}
            accessibilityRole="button"
            accessibilityLabel="Choose a file"
            style={({ pressed }) => [
              styles.picker,
              {
                backgroundColor: file
                  ? `${accent}12`
                  : isDark
                    ? "rgba(255,255,255,0.04)"
                    : "rgba(15,23,42,0.03)",
                borderColor: file
                  ? accent
                  : isDark
                    ? "rgba(148,163,184,0.20)"
                    : "rgba(15,23,42,0.10)",
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Paperclip size={18} color={file ? accent : theme.colors.mutedForeground} />
            <View style={styles.pickerText}>
              <Text
                numberOfLines={1}
                style={[
                  styles.pickerTitle,
                  {
                    color: file ? theme.colors.foreground : theme.colors.mutedForeground,
                    fontFamily: theme.fontFamily.medium,
                  },
                ]}
              >
                {file ? file.fileName : "Choose a file"}
              </Text>
              <Text style={[styles.pickerMeta, { color: theme.colors.mutedForeground }]}>
                {file
                  ? `${documentTypeLabel(file.mimeType)} · ${formatDocumentSize(file.size)}`
                  : "PDF or image, up to 10 MB"}
              </Text>
            </View>
          </Pressable>
        )}

        {pickError ? (
          <Text style={[styles.error, { color: ACCOUNT_RED }]}>{pickError}</Text>
        ) : null}

        <Input
          label="Name"
          placeholder="What is this document?"
          value={name}
          onChangeText={setName}
          maxLength={DOCUMENT_NAME_MAX}
          autoCapitalize="sentences"
        />

        <Input
          label="Note"
          placeholder="Optional"
          value={note}
          onChangeText={setNote}
          maxLength={DOCUMENT_NOTE_MAX}
          multiline
          numberOfLines={3}
          autoCapitalize="sentences"
          style={styles.noteInput}
        />

        <View style={styles.actions}>
          <Button variant="ghost" onPress={onClose} style={styles.action}>
            Cancel
          </Button>
          <Button
            onPress={() => {
              void handleSave();
            }}
            disabled={!canSave}
            loading={saving}
            style={styles.action}
          >
            {isEditing ? "Save" : "Upload"}
          </Button>
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 14,
    paddingBottom: 8,
  },
  picker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
    borderStyle: "dashed",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  pickerText: {
    flex: 1,
    gap: 2,
  },
  pickerTitle: {
    fontSize: 14,
  },
  pickerMeta: {
    fontSize: 11.5,
  },
  storedFile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  storedText: {
    flex: 1,
    gap: 2,
  },
  storedName: {
    fontSize: 13.5,
  },
  storedMeta: {
    fontSize: 11.5,
  },
  noteInput: {
    minHeight: 76,
    textAlignVertical: "top",
  },
  error: {
    fontSize: 12,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  action: {
    flex: 1,
  },
});
