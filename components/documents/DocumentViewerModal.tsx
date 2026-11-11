import { useEffect, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  X,
  Share2,
  Download,
  AlertTriangle,
  FileQuestion,
  ExternalLink,
  RefreshCw,
} from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import { haptic } from "@/lib/haptics";
import { logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import {
  documentTypeLabel,
  formatDocumentSize,
} from "@/shared/utils/accountDocuments";
import { DocumentImageViewer } from "./DocumentImageViewer";
import { DocumentPdfViewer } from "./DocumentPdfViewer";
import {
  cleanupCachedFile,
  downloadDocumentToCache,
  resolveDocumentUrl,
  shareDocumentFile,
  triggerWebDownload,
  viewerFriendlyError,
} from "./documentViewerUtils";
import { resolveDocumentKind, type DocumentViewerItem } from "./types";

export interface DocumentViewerModalProps {
  visible: boolean;
  document: DocumentViewerItem | null;
  onClose: () => void;
}

export function DocumentViewerModal({
  visible,
  document,
  onClose,
}: DocumentViewerModalProps) {
  const insets = useSafeAreaInsets();

  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [cachedFilePath, setCachedFilePath] = useState<string | null>(null);

  const resolveUrl = useCallback(async () => {
    if (!document) return;
    setResolving(true);
    setResolveError(null);
    setResolvedUrl(null);

    try {
      const url = await resolveDocumentUrl(document);
      setResolvedUrl(url);
    } catch (err) {
      logError("documentViewer.resolveUrl", err, { name: document.name });
      setResolveError(viewerFriendlyError(err));
    } finally {
      setResolving(false);
    }
  }, [document]);

  useEffect(() => {
    if (visible && document) {
      void resolveUrl();
    } else {
      setResolvedUrl(null);
      setResolveError(null);
      setResolving(false);
      if (cachedFilePath) {
        cleanupCachedFile(cachedFilePath);
        setCachedFilePath(null);
      }
    }
  }, [visible, document, resolveUrl]);

  const handleShare = async () => {
    if (!document || !resolvedUrl) return;
    setSharing(true);
    void haptic.selection();

    try {
      // On mobile, download to cache first if sharing from signed URL
      let fileUri = resolvedUrl;
      if (Platform.OS !== "web" && !fileUri.startsWith("file://")) {
        fileUri = await downloadDocumentToCache(resolvedUrl, document.name);
        setCachedFilePath(fileUri);
      }
      await shareDocumentFile(fileUri, document.mimeType, document.name);
    } catch (err) {
      logError("documentViewer.share", err);
      toast.error(viewerFriendlyError(err));
    } finally {
      setSharing(false);
    }
  };

  const handleDownload = () => {
    if (!document || !resolvedUrl) return;
    void haptic.selection();
    if (Platform.OS === "web") {
      triggerWebDownload(resolvedUrl, document.name);
      toast.success("Downloading document");
    } else {
      void handleShare();
    }
  };

  if (!visible || !document) {
    return null;
  }

  const kind = resolveDocumentKind(document.mimeType);
  const typeLabel = documentTypeLabel(document.mimeType);
  const sizeLabel = document.sizeBytes ? formatDocumentSize(document.sizeBytes) : undefined;
  const subtitle = [typeLabel, sizeLabel].filter(Boolean).join(" · ");

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <StatusBar barStyle="light-content" backgroundColor="#000000" />

        {/* Top Header */}
        <View
          style={[
            styles.header,
            {
              paddingTop: Math.max(insets.top, 16) + 4,
              paddingLeft: Math.max(insets.left, 16),
              paddingRight: Math.max(insets.right, 16),
            },
          ]}
        >
          <Pressable
            onPress={() => {
              void haptic.selection();
              onClose();
            }}
            accessibilityRole="button"
            accessibilityLabel="Close document viewer"
            hitSlop={12}
            style={({ pressed }) => [
              styles.headerBtn,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <X size={22} color="#ffffff" />
          </Pressable>

          <View style={styles.titleContainer}>
            <Text numberOfLines={1} style={styles.docTitle}>
              {document.name}
            </Text>
            {subtitle ? (
              <Text numberOfLines={1} style={styles.docSubtitle}>
                {subtitle}
              </Text>
            ) : null}
          </View>

          <View style={styles.headerActions}>
            {Platform.OS === "web" && (
              <Pressable
                onPress={handleDownload}
                accessibilityRole="button"
                accessibilityLabel="Download document"
                hitSlop={12}
                disabled={!resolvedUrl}
                style={({ pressed }) => [
                  styles.headerBtn,
                  { opacity: pressed ? 0.6 : !resolvedUrl ? 0.4 : 1 },
                ]}
              >
                <Download size={20} color="#ffffff" />
              </Pressable>
            )}

            <Pressable
              onPress={() => void handleShare()}
              accessibilityRole="button"
              accessibilityLabel="Share document"
              hitSlop={12}
              disabled={!resolvedUrl || sharing}
              style={({ pressed }) => [
                styles.headerBtn,
                { opacity: pressed ? 0.6 : !resolvedUrl || sharing ? 0.4 : 1 },
              ]}
            >
              {sharing ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Share2 size={20} color="#ffffff" />
              )}
            </Pressable>
          </View>
        </View>

        {/* Content Area */}
        <View
          style={[
            styles.content,
            {
              paddingBottom: Math.max(insets.bottom, 16),
              paddingLeft: Math.max(insets.left, 0),
              paddingRight: Math.max(insets.right, 0),
            },
          ]}
        >
          {resolving ? (
            <View style={styles.centeredState}>
              <ActivityIndicator size="large" color="#ffffff" />
              <Text style={styles.statusText}>Opening document…</Text>
            </View>
          ) : resolveError ? (
            <View style={styles.centeredState}>
              <View style={styles.errorIconBox}>
                <AlertTriangle size={36} color="#f87171" />
              </View>
              <Text style={styles.errorTitle}>Couldn't open document</Text>
              <Text style={styles.errorDesc}>{resolveError}</Text>
              <View style={styles.errorActions}>
                <Button
                  variant="outline"
                  size="sm"
                  onPress={() => void resolveUrl()}
                  style={styles.retryBtn}
                >
                  <RefreshCw size={16} color="#ffffff" style={{ marginRight: 6 }} />
                  <Text style={styles.retryBtnText}>Retry</Text>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={onClose}
                  style={styles.closeBtn}
                >
                  <Text style={styles.closeBtnText}>Close</Text>
                </Button>
              </View>
            </View>
          ) : resolvedUrl ? (
            kind === "image" ? (
              <DocumentImageViewer uri={resolvedUrl} name={document.name} />
            ) : kind === "pdf" ? (
              <DocumentPdfViewer
                url={resolvedUrl}
                fileName={document.name}
                onFallbackOpen={() => void handleShare()}
              />
            ) : (
              <View style={styles.centeredState}>
                <View style={styles.unsupportedIconBox}>
                  <FileQuestion size={40} color="#94a3b8" />
                </View>
                <Text style={styles.unsupportedTitle}>{document.name}</Text>
                <Text style={styles.unsupportedDesc}>
                  This file type ({typeLabel || document.mimeType}) cannot be viewed
                  directly in Spendly.
                </Text>
                <Button
                  variant="primary"
                  size="md"
                  onPress={() => void handleShare()}
                  style={styles.unsupportedBtn}
                >
                  <ExternalLink size={18} color="#ffffff" style={{ marginRight: 8 }} />
                  <Text style={styles.unsupportedBtnText}>Open with external app</Text>
                </Button>
              </View>
            )
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.94)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255, 255, 255, 0.15)",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    zIndex: 10,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  titleContainer: {
    flex: 1,
    marginHorizontal: 12,
  },
  docTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  docSubtitle: {
    color: "rgba(255, 255, 255, 0.65)",
    fontSize: 12,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  content: {
    flex: 1,
  },
  centeredState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  statusText: {
    color: "#ffffff",
    fontSize: 14,
    marginTop: 8,
  },
  errorIconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(248, 113, 113, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  errorTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
  },
  errorDesc: {
    color: "#94a3b8",
    fontSize: 14,
    textAlign: "center",
    maxWidth: 320,
  },
  errorActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  retryBtnText: {
    color: "#ffffff",
  },
  closeBtn: {},
  closeBtnText: {
    color: "#94a3b8",
  },
  unsupportedIconBox: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(148, 163, 184, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  unsupportedTitle: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "600",
    textAlign: "center",
  },
  unsupportedDesc: {
    color: "#94a3b8",
    fontSize: 14,
    textAlign: "center",
    maxWidth: 320,
  },
  unsupportedBtn: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  unsupportedBtnText: {
    color: "#ffffff",
    fontWeight: "600",
  },
});
