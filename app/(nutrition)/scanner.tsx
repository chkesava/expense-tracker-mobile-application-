import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Linking } from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import { logWarning } from '@/lib/errors';
import { useTheme } from '@/theme/ThemeProvider';
import { useRouter } from 'expo-router';
import { ArrowLeft, ScanLine } from 'lucide-react-native';

export default function BarcodeScannerScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const getCameraPermissions = async () => {
      try {
        const { status } = await Camera.requestCameraPermissionsAsync();
        if (!cancelled) setHasPermission(status === 'granted');
      } catch (error) {
        // An unguarded throw here left `hasPermission` null forever, pinning
        // the screen on "Requesting camera permission…" with no way out.
        logWarning('scanner.cameraPermission', error);
        if (!cancelled) setHasPermission(false);
      }
    };
    void getCameraPermissions();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleBarCodeScanned = ({ type, data }: { type: string, data: string }) => {
    setScanned(true);
    Alert.alert('Barcode Scanned', `Type: ${type}\nData: ${data}`, [
      { text: 'Scan Again', onPress: () => setScanned(false) },
      { text: 'Close', onPress: () => router.back() }
    ]);
  };

  if (hasPermission === null) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: theme.colors.foreground }}>Requesting camera permission...</Text>
      </View>
    );
  }
  
  if (hasPermission === false) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 8 }}>
        <Text style={{ color: theme.colors.foreground, fontSize: 17, fontWeight: '700', textAlign: 'center' }}>
          Camera access is off
        </Text>
        <Text style={{ color: theme.colors.mutedForeground, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
          Scanning barcodes needs the camera. You can turn it on in system settings.
        </Text>
        <TouchableOpacity
          style={{ marginTop: 16 }}
          onPress={() => {
            Linking.openSettings().catch((error) =>
              logWarning('scanner.openSettings', error)
            );
          }}
        >
          <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>Open Settings</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ marginTop: 8 }} onPress={() => router.back()}>
          <Text style={{ color: theme.colors.mutedForeground }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#000',
    },
    camera: {
      flex: 1,
    },
    overlay: {
      flex: 1,
      backgroundColor: 'transparent',
      justifyContent: 'center',
      alignItems: 'center',
    },
    scanArea: {
      width: 250,
      height: 250,
      borderWidth: 2,
      borderColor: theme.colors.success,
      backgroundColor: 'transparent',
      justifyContent: 'center',
      alignItems: 'center',
    },
    header: {
      position: 'absolute',
      top: 50,
      left: 20,
      flexDirection: 'row',
      alignItems: 'center',
      zIndex: 10,
    },
    headerText: {
      color: '#FFF',
      fontSize: 18,
      marginLeft: 10,
      fontWeight: 'bold',
    },
    instructionText: {
      position: 'absolute',
      bottom: 100,
      color: '#FFF',
      fontSize: 16,
      textAlign: 'center',
      width: '100%',
    }
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
          <ArrowLeft color="#FFF" size={24} />
        </TouchableOpacity>
        <Text style={styles.headerText}>Scan Food Barcode</Text>
      </View>
      
      <CameraView
        style={styles.camera}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'qr'],
        }}
      >
        <View style={styles.overlay}>
          <View style={styles.scanArea}>
            <ScanLine color={theme.colors.success} size={48} />
          </View>
        </View>
      </CameraView>
      
      <Text style={styles.instructionText}>Center the barcode in the square</Text>
    </View>
  );
}
