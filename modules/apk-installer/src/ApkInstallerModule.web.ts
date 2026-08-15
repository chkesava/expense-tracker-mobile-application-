import { NativeModule, registerWebModule } from "expo";

import type { ApkInstallStatus } from "./ApkInstaller.types";

class ApkInstallerModule extends NativeModule {
  async canRequestPackageInstalls(): Promise<boolean> {
    return false;
  }

  async openUnknownSourcesSettings(): Promise<void> {
    return;
  }

  async installApk(_filePath: string): Promise<ApkInstallStatus> {
    throw new Error("In-app APK install is only available on Android.");
  }
}

export default registerWebModule(ApkInstallerModule, "ApkInstaller");
