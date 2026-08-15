type ApkInstallStatus = "success" | "aborted" | "failure";

const ApkInstaller = {
  canRequestPackageInstalls: async (): Promise<boolean> => false,
  openUnknownSourcesSettings: async (): Promise<void> => undefined,
  installApk: async (_filePath: string): Promise<ApkInstallStatus> => {
    throw new Error("In-app APK install is only available on Android.");
  },
};

export default ApkInstaller;
