import React, { useMemo, type ReactNode } from "react";
import { View } from "react-native";
import { vars } from "nativewind";
import { OverlayProvider } from "@gluestack-ui/core/overlay/creator";

import { useTheme } from "@/theme/ThemeProvider";
import { toGluestackVars } from "@/theme/gluestackVars";

/**
 * Re-points the Gluestack colour variables at the active Spendly theme for
 * everything under the Spendly shell. Ganesh Seva and Nutrition render
 * outside this scope and keep the root GluestackUIProvider defaults.
 *
 * The nested OverlayProvider matters: Gluestack Modal / AlertDialog portal
 * into the nearest provider, and the root one sits outside this View, so
 * without it every dialog would lose the Spendly variables.
 */
export function SpendlyUIScope({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const scopeStyle = useMemo(() => vars(toGluestackVars(theme)), [theme]);

  return (
    <View style={[{ flex: 1 }, scopeStyle]}>
      <OverlayProvider>{children}</OverlayProvider>
    </View>
  );
}
