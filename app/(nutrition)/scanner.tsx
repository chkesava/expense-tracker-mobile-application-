import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Camera, CameraView } from "expo-camera";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, ScanLine } from "lucide-react-native";

import { Button } from "@/components/ui";
import { logError, logWarning } from "@/lib/errors";
import { emitNutritionScan } from "@/lib/nutritionScanBridge";
import { toast } from "@/lib/toast";
import { fetchFoodByBarcode } from "@/services/openFoodFactsService";
import { useTheme } from "@/theme/ThemeProvider";

export default function BarcodeScannerScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { dateStr, mealId } = useLocalSearchParams<{
    dateStr?: string;
    mealId?: string;
  }>();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const handledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const getCameraPermissions = async () => {
      try {
        const { status } = await Camera.requestCameraPermissionsAsync();
        if (!cancelled) setHasPermission(status === "granted");
      } catch (error) {
        logWarning("scanner.cameraPermission", error);
        if (!cancelled) setHasPermission(false);
      }
    };
    void getCameraPermissions();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (handledRef.current) return;
    handledRef.current = true;
    setScanned(true);
    setLookingUp(true);
    try {
      const food = await fetchFoodByBarcode(data);
      if (!food) {
        toast.error("Product not found in Open Food Facts");
        handledRef.current = false;
        setScanned(false);
        return;
      }
      emitNutritionScan(food);
      if (dateStr && mealId) {
        router.replace({
          pathname: "/(nutrition)/meal",
          params: { dateStr, mealId },
        } as never);
      } else {
        router.back();
      }
    } catch (error) {
      logError("nutrition.scanner.lookup", error);
      toast.error("Could not look up that barcode");
      handledRef.current = false;
      setScanned(false);
    } finally {
      setLookingUp(false);
    }
  };

  if (hasPermission === null) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={{ color: theme.colors.foreground, marginTop: 12 }}>
          Requesting camera permission…
        </Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View
        style={[
          styles.centered,
          { backgroundColor: theme.colors.background, padding: 24, gap: 8 },
        ]}
      >
        <Text
          style={{
            color: theme.colors.foreground,
            fontSize: 17,
            fontWeight: "700",
            textAlign: "center",
          }}
        >
          Camera access is off
        </Text>
        <Text
          style={{
            color: theme.colors.mutedForeground,
            fontSize: 14,
            textAlign: "center",
            lineHeight: 20,
          }}
        >
          Scanning barcodes needs the camera. You can turn it on in system settings.
        </Text>
        <Button
          onPress={() => {
            Linking.openSettings().catch((error) =>
              logWarning("scanner.openSettings", error)
            );
          }}
        >
          Open Settings
        </Button>
        <Button variant="ghost" onPress={() => router.back()}>
          Go Back
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [{ padding: 8 }, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft color="#FFF" size={24} />
        </Pressable>
        <Text style={styles.headerText}>Scan Food Barcode</Text>
      </View>

      <CameraView
        style={styles.camera}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "qr"],
        }}
      >
        <View style={styles.overlay}>
          <View style={[styles.scanArea, { borderColor: theme.colors.success }]}>
            <ScanLine color={theme.colors.success} size={48} />
          </View>
        </View>
      </CameraView>

      <Text style={styles.instructionText}>
        {lookingUp ? "Looking up product…" : "Center the barcode in the square"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
  },
  scanArea: {
    width: 250,
    height: 250,
    borderWidth: 2,
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    position: "absolute",
    top: 50,
    left: 20,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 10,
  },
  headerText: {
    color: "#FFF",
    fontSize: 18,
    marginLeft: 10,
    fontWeight: "bold",
  },
  instructionText: {
    position: "absolute",
    bottom: 100,
    color: "#FFF",
    fontSize: 16,
    textAlign: "center",
    width: "100%",
  },
});
