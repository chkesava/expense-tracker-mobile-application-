import { View } from "react-native";

import { CheckForAppUpdate } from "@/components/CheckForAppUpdate";
import { MetaLabel } from "@/components/ganesh/ui";
import {
  getInstalledVersionCode,
  getInstalledVersionName,
} from "@/hooks/useAppUpdate";

/** Installed Ganesh Seva version, from the native binary (or the Expo manifest on web). */
export function ganeshAppVersionLabel(): string {
  const name = getInstalledVersionName();
  const code = getInstalledVersionCode();
  return code !== null ? `Ganesh Seva v${name} · build ${code}` : `Ganesh Seva v${name}`;
}

export function GaneshAppVersion({
  centered,
  showUpdateCheck,
}: {
  centered?: boolean;
  showUpdateCheck?: boolean;
}) {
  return (
    <View style={{ gap: 10, alignItems: centered ? "center" : "stretch", alignSelf: centered ? "center" : "stretch" }}>
      <MetaLabel style={centered ? { textAlign: "center" } : undefined}>
        {ganeshAppVersionLabel()}
      </MetaLabel>
      {showUpdateCheck ? <CheckForAppUpdate /> : null}
    </View>
  );
}
