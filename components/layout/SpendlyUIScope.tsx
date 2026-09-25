import React, { useMemo, type ReactNode } from "react";
import { View } from "react-native";
import { vars } from "nativewind";

import { useTheme } from "@/theme/ThemeProvider";
import { toGluestackVars } from "@/theme/gluestackVars";

/**
 * Re-points the Gluestack colour variables at the active Spendly theme for
 * everything under the Spendly shell. Ganesh Seva and Nutrition render
 * outside this scope and keep the root GluestackUIProvider defaults.
 *
 * The overlay host for Gluestack Modal / AlertDialog is NOT here: portaled
 * content renders wherever the OverlayProvider sits, so it must sit *inside*
 * the app providers or every sheet loses their context (SPENDLY-154 found
 * "useGlobalMonth must be used within a ModalProvider" on device). The
 * Spendly shell mounts it inside AppShellInner instead; it still sits under
 * this View, so portaled dialogs keep these variables.
 */
export function SpendlyUIScope({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const scopeStyle = useMemo(() => vars(toGluestackVars(theme)), [theme]);

  return (
    <View style={[{ flex: 1 }, scopeStyle]}>
      {children}
    </View>
  );
}
