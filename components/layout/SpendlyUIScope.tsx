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
 * common/Modal and common/Dialog open real RN Modal windows (`useRNModal`).
 * They render in place in the React tree, so they inherit these variables and
 * their caller's context. The Gluestack OverlayProvider fallback is NOT here.
 * Portalled content renders wherever that provider sits, so it has to be
 * inside the app providers. The Spendly shell mounts it inside AppShellInner,
 * still under this View.
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
