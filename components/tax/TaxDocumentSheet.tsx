import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { FileText, Paperclip } from "lucide-react-native";

import { Modal } from "@/components/common/Modal";
import { SheetActions } from "@/components/common/SheetActions";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { logWarning } from "@/lib/errors";
import { TAX_DOCUMENT_CATEGORY_LABELS } from "@/shared/features/tax/data/categories";
import { TAX_DOCUMENT_CATEGORIES, type TaxDocument, type TaxDocumentCategory } from "@/shared/features/tax/types";
import { taxFileRejection, type PickedTaxFile } from "@/shared/features/tax/utils/documents";
import { ALLOWED_DOCUMENT_TYPES, formatDocumentSize } from "@/shared/utils/accountDocuments";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

export type TaxDocumentSheetMode =
  | { kind: "add"; category?: TaxDocumentCategory }
  | { kind: "edit"; document: TaxDocument }
  | { kind: "retry"; document: TaxDocument };

/**
 * Store, edit or finish uploading a tax document (SPENDLY-298).
 *
 * - add: pick a PDF or image (up to 10 MB), its kind, a name and a note;
 * - edit: name, note and kind only — the stored file never changes;
 * - retry: pick the same file again for an upload that didn't finish.
 */
export function TaxDocumentSheet({
  mode,
  busy,
  onAdd,
  onEdit,
  onRetry,
  onClose,
}: {
  mode: TaxDocumentSheetMode | null;
  busy: boolean;
  onAdd: (input: { category: TaxDocumentCategory; name: string; note?: string; file: PickedTaxFile }) => Promise<unknown>;
  onEdit: (document: TaxDocument, change: { name: string; note?: string; category: TaxDocumentCategory }) => Promise<unknown>;
  onRetry: (document: TaxDocument, file: PickedTaxFile) => Promise<unknown>;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const [file, setFile] = useState<PickedTaxFile | null>(null);
  const [category, setCategory] = useState<TaxDocumentCategory | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [pickError, setPickError] = useState<string | null>(null);

  useEffect(() => {
    if (!mode) return;
    const document = mode.kind === "add" ? null : mode.document;
    setFile(null);
    setPickError(null);
    setCategory(document?.category ?? (mode.kind === "add" ? mode.category ?? null : null));
    setName(document?.name ?? "");
    setNote(document?.note ?? "");
  }, [mode]);

  if (!mode) return null;

  const pick = async () => {
    setPickError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [...ALLOWED_DOCUMENT_TYPES],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) return;
      const picked: PickedTaxFile = {
        uri: asset.uri,
        fileName: asset.name || "document",
        mimeType: asset.mimeType || "",
        size: asset.size ?? 0,
      };
      // Say "that won't work" now, not after a 10 MB transfer fails.
      const rejection = taxFileRejection(picked);
      if (rejection) {
        setPickError(rejection);
        return;
      }
      setFile(picked);
      setName((current) => current || picked.fileName);
    } catch (error) {
      logWarning("tax.documents.pick", error);
      setPickError("Couldn't open the file picker.");
    }
  };

  const canSave =
    !busy &&
    (mode.kind === "retry"
      ? Boolean(file)
      : Boolean(category) && name.trim().length > 0 && (mode.kind === "edit" || Boolean(file)));

  const save = async () => {
    if (!canSave || !category) return;
    if (mode.kind === "add" && file) await onAdd({ category, name: name.trim(), note: note.trim() || undefined, file });
    else if (mode.kind === "edit") await onEdit(mode.document, { category, name: name.trim(), note: note.trim() || undefined });
    else if (mode.kind === "retry" && file) await onRetry(mode.document, file);
    onClose();
  };

  const title = mode.kind === "add" ? "Add document" : mode.kind === "edit" ? "Edit document" : "Finish upload";
  const label = { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm };
  const helper = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={title}
      density="compact"
      footer={
        <SheetActions
          secondary={{ label: "Cancel", onPress: onClose }}
          primary={{
            label: mode.kind === "edit" ? "Save" : "Upload",
            onPress: () => void save(),
            disabled: !canSave,
            loading: busy,
          }}
        />
      }
    >
      <View style={{ gap: theme.space.lg }}>
        {mode.kind === "edit" ? (
          <View style={[styles.stored, { backgroundColor: surfaces.tile, borderRadius: theme.radius.md, padding: theme.space.md, gap: theme.space.sm }]}>
            <FileText size={16} color={theme.colors.mutedForeground} />
            <Text numberOfLines={1} style={[helper, { flex: 1 }]}>
              {mode.document.fileName} · {formatDocumentSize(mode.document.sizeBytes)}
            </Text>
          </View>
        ) : (
          <View style={{ gap: theme.space.sm }}>
            {mode.kind === "retry" ? (
              <Text style={helper}>Pick {mode.document.fileName} again to finish storing it.</Text>
            ) : null}
            <Button variant="tonal" size="sm" onPress={() => void pick()} accessibilityLabel="Choose a PDF or image">
              {file ? "Choose a different file" : "Choose a file"}
            </Button>
            {file ? (
              <View style={[styles.stored, { gap: theme.space.sm }]}>
                <Paperclip size={14} color={theme.colors.mutedForeground} />
                <Text numberOfLines={1} style={[helper, { flex: 1 }]}>
                  {file.fileName} · {formatDocumentSize(file.size)}
                </Text>
              </View>
            ) : (
              <Text style={helper}>PDF, JPEG, PNG or WebP, up to 10 MB. Password-protected PDFs are stored as they are.</Text>
            )}
            {pickError ? (
              <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.destructive, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.medium }}>
                {pickError}
              </Text>
            ) : null}
          </View>
        )}

        {mode.kind !== "retry" ? (
          <>
            <View style={{ gap: theme.space.sm }}>
              <Text style={label}>What is it?</Text>
              <View style={[styles.wrap, { gap: theme.space.sm }]} accessibilityRole="radiogroup">
                {TAX_DOCUMENT_CATEGORIES.map((id) => (
                  <Chip
                    key={id}
                    label={TAX_DOCUMENT_CATEGORY_LABELS[id]}
                    selected={category === id}
                    onPress={() => setCategory(id)}
                    appearance="outline"
                    size="sm"
                    accessibilityRole="radio"
                  />
                ))}
              </View>
            </View>
            <Input label="Name" value={name} onChangeText={setName} maxLength={120} placeholder="e.g. Form 16 – Acme" />
            <Input label="Note (optional)" value={note} onChangeText={setNote} maxLength={500} />
          </>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap" },
  stored: { flexDirection: "row", alignItems: "center" },
});
