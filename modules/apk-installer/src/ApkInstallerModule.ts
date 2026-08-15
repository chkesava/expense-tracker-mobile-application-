import { NativeModule, requireNativeModule } from "expo";

import type { ApkInstallStatus } from "./ApkInstaller.types";

declare class ApkInstallerModuleType extends NativeModule {
  canRequestPackageInstalls(): Promise<boolean>;
  openUnknownSourcesSettings(): Promise<void>;
  installApk(filePath: string): Promise<ApkInstallStatus>;
}

export default requireNativeModule<ApkInstallerModuleType>("ApkInstaller");
