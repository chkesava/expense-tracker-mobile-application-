import { Image, StyleSheet, View } from "react-native";

/** Dedicated 3D locker asset — swap this file without changing card layout. */
const VAULT_SAFE_SOURCE = require("@/assets/account/vault-safe.webp");

export function AccountSafeIllustration({
  size = 138,
}: {
  size?: number;
}) {
  return (
    <View pointerEvents="none" style={[styles.wrap, { width: size, height: size }]}>
      <Image
        source={VAULT_SAFE_SOURCE}
        style={{ width: size, height: size }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
});
