import { useMemo, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import {
  AlertTriangle,
  FileText,
  Image as ImageIcon,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react-native";

import { accountAccent, ACCOUNT_RED } from "@/components/accounts/accountScreenTheme";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import type { AccountDocument } from "@/shared/types/expense";
import {
  accountDocumentSortMs,
  documentTypeLabel,
  formatDocumentSize,
  isPendingDocument,
} from "@/shared/utils/accountDocuments";

const UPLOADED_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function uploadedLabel(document: AccountDocument): string | undefined {
  const ms = accountDocumentSortMs(document);
  if (!ms) return undefined;
  return UPLOADED_FORMATTER.format(new Date(ms));
}

/**
 * Documents stored against an account (SPENDLY-88).
 *
 * Every row states type, size and date, because the question a user brings to
 * this list is "is this the statement I need" and the file name alone rarely
 * answers it.
 */
export function AccountDocumentsCard({
  documents,
  loading,
  busyId,
  onAdd,
  onOpen,
  onEdit,
  onRetry,
  onDelete,
}: {
  documents: AccountDocument[];
  loading: boolean;
  /** The document currently being opened, retried or deleted. */
  busyId?: string;
  onAdd: () => void;
  onOpen: (document: AccountDocument) => void;
  onEdit: (document: AccountDocument) => void;
  onRetry: (document: AccountDocument) => void;
  onDelete: (document: AccountDocument) => void;
}) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const accent = accountAccent(isDark);

  const subtitle = useMemo(() => {
    if (loading) return "Loading…";
    if (documents.length === 0) return "Nothing stored yet";
    const pending = documents.filter(isPendingDocument).length;
    const base = `${documents.length} ${documents.length === 1 ? "document" : "documents"}`;
    return pending > 0 ? `${base} · ${pending} unfinished` : base;
  }, [documents, loading]);

  const iconButton = (
    label: string,
    icon: ReactNode,
    onPress: () => void,
    disabled?: boolean
  ) => (
    <Pressable
      onPress={() => {
        if (disabled) return;
        void haptic.selection();
        onPress();
      }}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={({ pressed }) => [
        styles.iconBtn,
        {
          borderColor: isDark ? "rgba(148,163,184,0.16)" : "rgba(15,23,42,0.08)",
          backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.03)",
          opacity: disabled ? 0.35 : pressed ? 0.6 : 1,
        },
      ]}
    >
      {icon}
    </Pressable>
  );

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text
            style={[
              styles.title,
              {
                color: theme.colors.foreground,
                fontFamily: theme.fontFamily.semibold,
              },
            ]}
          >
            Documents
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.mutedForeground }]}>
            {subtitle}
          </Text>
        </View>

        <Pressable
          onPress={() => {
            void haptic.selection();
            onAdd();
          }}
          accessibilityRole="button"
          accessibilityLabel="Add document"
          style={({ pressed }) => [
            styles.addBtn,
            { borderColor: accent, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Text
            style={[
              styles.addLabel,
              { color: accent, fontFamily: theme.fontFamily.medium },
            ]}
          >
            Add document
          </Text>
        </Pressable>
      </View>

      {documents.length === 0 && !loading ? (
        <View style={styles.empty}>
          <FileText size={22} color={theme.colors.mutedForeground} />
          <Text
            style={[
              styles.emptyTitle,
              {
                color: theme.colors.foreground,
                fontFamily: theme.fontFamily.medium,
              },
            ]}
          >
            No documents yet
          </Text>
          <Text style={[styles.emptyBody, { color: theme.colors.mutedForeground }]}>
            Keep statements, sanction letters and certificates with the account
            they belong to. PDFs and images up to 10 MB.
          </Text>
        </View>
      ) : null}

      {documents.map((document, index) => {
        const pending = isPendingDocument(document);
        const busy = busyId === document.id;
        const uploaded = uploadedLabel(document);
        const isImage = document.mimeType?.startsWith("image/");

        return (
          <View
            key={document.id}
            style={[
              styles.row,
              index > 0
                ? {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: theme.colors.border,
                    paddingTop: 12,
                  }
                : null,
            ]}
          >
            <View
              style={[
                styles.fileIcon,
                {
                  backgroundColor: pending
                    ? "rgba(239,68,68,0.10)"
                    : isDark
                      ? "rgba(255,255,255,0.05)"
                      : "rgba(15,23,42,0.04)",
                },
              ]}
            >
              {pending ? (
                <AlertTriangle size={16} color={ACCOUNT_RED} />
              ) : isImage ? (
                <ImageIcon size={16} color={theme.colors.mutedForeground} />
              ) : (
                <FileText size={16} color={theme.colors.mutedForeground} />
              )}
            </View>

            <Pressable
              onPress={() => {
                if (pending || busy) return;
                void haptic.selection();
                onOpen(document);
              }}
              disabled={pending || busy}
              accessibilityRole="button"
              accessibilityLabel={
                pending ? `${document.name}, upload unfinished` : `Open ${document.name}`
              }
              style={styles.rowText}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.rowTitle,
                  {
                    color: theme.colors.foreground,
                    fontFamily: theme.fontFamily.medium,
                  },
                ]}
              >
                {document.name}
              </Text>
              <Text style={[styles.rowMeta, { color: theme.colors.mutedForeground }]}>
                {documentTypeLabel(document.mimeType)}
                {" · "}
                {formatDocumentSize(document.sizeBytes)}
                {uploaded ? ` · ${uploaded}` : ""}
              </Text>
              {document.note ? (
                <Text
                  numberOfLines={2}
                  style={[styles.rowNote, { color: theme.colors.mutedForeground }]}
                >
                  {document.note}
                </Text>
              ) : null}
              {pending ? (
                <Text style={[styles.pending, { color: ACCOUNT_RED }]}>
                  Upload did not finish — retry or remove it.
                </Text>
              ) : null}
            </Pressable>

            <View style={styles.rowActions}>
              {busy ? (
                <ActivityIndicator size="small" color={theme.colors.mutedForeground} />
              ) : (
                <>
                  {pending
                    ? iconButton(
                        "Retry upload",
                        <RefreshCw size={15} color={theme.colors.mutedForeground} />,
                        () => onRetry(document)
                      )
                    : iconButton(
                        "Edit document details",
                        <Pencil size={15} color={theme.colors.mutedForeground} />,
                        () => onEdit(document)
                      )}
                  {iconButton(
                    "Delete document",
                    <Trash2 size={15} color={theme.colors.destructive} />,
                    () => onDelete(document)
                  )}
                </>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderCurve: "continuous",
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headerText: {
    flexShrink: 1,
  },
  title: {
    fontSize: 15,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  addBtn: {
    borderRadius: 999,
    borderCurve: "continuous",
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  addLabel: {
    fontSize: 13,
  },
  empty: {
    alignItems: "center",
    gap: 6,
    paddingVertical: 12,
  },
  emptyTitle: {
    fontSize: 14,
  },
  emptyBody: {
    fontSize: 12,
    textAlign: "center",
    lineHeight: 17,
    maxWidth: 300,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  fileIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    flex: 1,
    gap: 3,
  },
  rowTitle: {
    fontSize: 14,
  },
  rowMeta: {
    fontSize: 11.5,
    fontVariant: ["tabular-nums"],
  },
  rowNote: {
    fontSize: 12,
    lineHeight: 16,
  },
  pending: {
    fontSize: 11.5,
    marginTop: 2,
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 30,
    justifyContent: "flex-end",
  },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
