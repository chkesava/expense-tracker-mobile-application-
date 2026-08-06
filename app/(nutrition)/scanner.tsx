import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import { useTheme } from '@/theme/ThemeProvider';
import { useRouter } from 'expo-router';
import { ArrowLeft, ScanLine } from 'lucide-react-native';

export default function BarcodeScannerScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    const getCameraPermissions = async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    };
    getCameraPermissions();
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
      <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: theme.colors.foreground }}>No access to camera</Text>
        <TouchableOpacity style={{ marginTop: 20 }} onPress={() => router.back()}>
          <Text style={{ color: theme.colors.primary }}>Go Back</Text>
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
