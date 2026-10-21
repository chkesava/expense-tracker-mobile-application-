import React, { createContext, useContext, useMemo, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
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
const SpendlyScopeVarsContext = createContext<StyleProp<ViewStyle> | null>(null);

/**
 * SPENDLY-542: on web an RN Modal portals to the end of <body>, outside this
 * View, so it lost the Spendly variables and every common/Modal and
 * common/Dialog drew a light card in dark themes. Those components re-apply
 * the variables from this context inside their window. Outside the Spendly
 * shell (Ganesh Seva, Nutrition) the context is null and nothing changes.
 */
export function useSpendlyScopeVars(): StyleProp<ViewStyle> | null {
  return useContext(SpendlyScopeVarsContext);
}

export function SpendlyUIScope({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const scopeStyle = useMemo(() => vars(toGluestackVars(theme)), [theme]);

  return (
    <SpendlyScopeVarsContext.Provider value={scopeStyle}>
      <View style={[{ flex: 1 }, scopeStyle]}>
        {children}
      </View>
    </SpendlyScopeVarsContext.Provider>
  );
}
