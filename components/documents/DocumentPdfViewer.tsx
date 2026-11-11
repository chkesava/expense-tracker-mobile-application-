import { useEffect, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { FileText, ExternalLink, AlertTriangle } from "lucide-react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { Button } from "@/components/ui/Button";
import {
  isNativePdfRendererAvailable,
  renderPdfPagesNative,
  type RenderedPdfPage,
} from "@/modules/pdf-renderer";
import {
  cleanupCachedFile,
  downloadDocumentToCache,
  viewerFriendlyError,
} from "./documentViewerUtils";

interface DocumentPdfViewerProps {
  url: string;
  fileName: string;
  onFallbackOpen?: () => void;
  onLoadingChange?: (loading: boolean) => void;
}

export function DocumentPdfViewer({
  url,
  fileName,
  onFallbackOpen,
  onLoadingChange,
}: DocumentPdfViewerProps) {
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [localCachePath, setLocalCachePath] = useState<string | null>(null);
  const [pages, setPages] = useState<RenderedPdfPage[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorReason, setErrorReason] = useState<string | null>(null);

  // Zoom gestures for native PDF scroll view
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(0.9, Math.min(savedScale.value * e.scale, 4));
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withSpring(1);
        savedScale.value = 1;
      } else if (scale.value > 3.5) {
        scale.value = withSpring(3.5);
        savedScale.value = 3.5;
      } else {
        savedScale.value = scale.value;
      }
    });

  const animatedContentStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // Native rendering effect
  useEffect(() => {
    if (Platform.OS === "web") {
      setLoading(false);
      onLoadingChange?.(false);
      return;
    }

    let isMounted = true;
    let cachedUri: string | null = null;

    async function loadNativePdf() {
      setLoading(true);
      setErrorReason(null);
      onLoadingChange?.(true);

      try {
        // Step 1: Download to local cache
        cachedUri = await downloadDocumentToCache(url, fileName, (pct) => {
          if (isMounted) setDownloadProgress(pct);
        });
        if (!isMounted) return;
        setLocalCachePath(cachedUri);

        // Step 2: Check native renderer availability
        if (!isNativePdfRendererAvailable()) {
          setErrorReason("In-app PDF rendering is not available in this build.");
          setLoading(false);
          onLoadingChange?.(false);
          return;
        }

        // Step 3: Render pages
        const result = await renderPdfPagesNative(cachedUri, 30, 1600);
        if (!isMounted) return;

        setTotalPages(result.totalPages);
        setPages(result.renderedPages);
        setLoading(false);
        onLoadingChange?.(false);
      } catch (err) {
        if (!isMounted) return;
        setErrorReason(viewerFriendlyError(err));
        setLoading(false);
        onLoadingChange?.(false);
      }
    }

    void loadNativePdf();

    return () => {
      isMounted = false;
      if (cachedUri) {
        cleanupCachedFile(cachedUri);
      }
    };
  }, [url, fileName, onLoadingChange]);

  // Web viewer: rendered via iframe inside the modal
  if (Platform.OS === "web") {
    return (
      <View style={styles.webContainer}>
        {/* @ts-ignore React Native Web supports iframe */}
        <iframe
          src={url}
          title={fileName}
          style={styles.iframe}
          aria-label={fileName}
        />
      </View>
    );
  }

  // Loading state
  if (loading) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator size="large" color="#ffffff" />
        <Text style={styles.loadingText}>
          {downloadProgress > 0 && downloadProgress < 100
            ? `Downloading document… ${downloadProgress}%`
            : "Preparing PDF pages…"}
        </Text>
      </View>
    );
  }

  // Error or Fallback state
  if (errorReason || pages.length === 0) {
    return (
      <View style={styles.fallbackContainer}>
        <View style={styles.fallbackIconBox}>
          <FileText size={48} color="#60a5fa" />
        </View>
        <Text style={styles.fallbackTitle}>{fileName}</Text>
        <Text style={styles.fallbackSubtitle}>
          {errorReason || "This PDF requires an external viewer."}
        </Text>

        {onFallbackOpen && (
          <Button
            variant="primary"
            size="md"
            onPress={onFallbackOpen}
            style={styles.openExternalBtn}
          >
            <ExternalLink size={18} color="#ffffff" style={{ marginRight: 8 }} />
            <Text style={styles.openExternalBtnText}>Open with system app</Text>
          </Button>
        )}
      </View>
    );
  }

  // Native multi-page display with zoom
  return (
    <View style={styles.nativeContainer}>
      <GestureDetector gesture={pinchGesture}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator
          maximumZoomScale={3}
          minimumZoomScale={1}
        >
          <Animated.View style={animatedContentStyle}>
            {pages.map((page) => {
              const ratio = page.width > 0 && page.height > 0 ? page.width / page.height : 1 / 1.414;
              return (
                <View key={page.pageIndex} style={styles.pageCard}>
                  <Image
                    source={{ uri: page.uri }}
                    style={[styles.pageImage, { aspectRatio: ratio }]}
                    contentFit="contain"
                    accessibilityLabel={`${fileName}, page ${page.pageIndex + 1}`}
                    accessible
                  />
                  <Text style={styles.pageNumber}>
                    Page {page.pageIndex + 1} of {totalPages}
                  </Text>
                </View>
              );
            })}
          </Animated.View>

          {totalPages > pages.length && (
            <View style={styles.morePagesBanner}>
              <Text style={styles.morePagesText}>
                Showing first {pages.length} of {totalPages} pages.
              </Text>
              {onFallbackOpen && (
                <Button
                  variant="outline"
                  size="sm"
                  onPress={onFallbackOpen}
                  style={styles.morePagesBtn}
                >
                  <Text style={styles.morePagesBtnText}>Open full PDF externally</Text>
                </Button>
              )}
            </View>
          )}
        </ScrollView>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  webContainer: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "#1e293b",
  },
  iframe: {
    width: "100%",
    height: "100%",
    borderWidth: 0,
    backgroundColor: "#ffffff",
  },
  nativeContainer: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  scrollView: {
    flex: 1,
    width: "100%",
  },
  scrollContent: {
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: "center",
    gap: 16,
  },
  pageCard: {
    width: "100%",
    maxWidth: 680,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
    marginBottom: 16,
  },
  pageImage: {
    width: "100%",
  },
  pageNumber: {
    textAlign: "center",
    fontSize: 12,
    color: "#64748b",
    paddingVertical: 6,
    backgroundColor: "#f8fafc",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e8f0",
  },
  centerBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  loadingText: {
    color: "#ffffff",
    fontSize: 14,
  },
  fallbackContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },
  fallbackIconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(96, 165, 250, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  fallbackTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  fallbackSubtitle: {
    color: "#94a3b8",
    fontSize: 14,
    textAlign: "center",
    maxWidth: 320,
  },
  openExternalBtn: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  openExternalBtnText: {
    color: "#ffffff",
    fontWeight: "600",
  },
  morePagesBanner: {
    padding: 16,
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 8,
    width: "100%",
    maxWidth: 680,
  },
  morePagesText: {
    color: "#e2e8f0",
    fontSize: 13,
  },
  morePagesBtn: {
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  morePagesBtnText: {
    color: "#ffffff",
    fontSize: 13,
  },
});
