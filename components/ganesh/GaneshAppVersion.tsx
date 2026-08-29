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

export function GaneshAppVersion({ centered }: { centered?: boolean }) {
  return (
    <MetaLabel style={centered ? { textAlign: "center", alignSelf: "center" } : undefined}>
      {ganeshAppVersionLabel()}
    </MetaLabel>
  );
}
