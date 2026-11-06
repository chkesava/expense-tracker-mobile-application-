/**
 * Push device registration rules (SPENDLY-224, epic SPENDLY-222).
 *
 * Each signed-in Spendly install keeps one document at
 * `users/{uid}/devices/{installId}` holding its Expo push token, so the server
 * sender (SPENDLY-227) can reach every device a user is signed in on. This
 * module is the pure part: who may register, what the document holds, and when
 * a write is actually needed (registration runs on every launch and foreground,
 * but writes at most once a day per install unless something changed).
 */

export const DEVICES_COLLECTION = "devices";

/** Expo push tokens look like `ExponentPushToken[xxxxxxxx]`. */
const EXPO_PUSH_TOKEN = /^Expo(?:nent)?PushToken\[[A-Za-z0-9_-]{8,200}\]$/;

export function isExpoPushToken(value: unknown): value is string {
  return typeof value === "string" && EXPO_PUSH_TOKEN.test(value);
}

/** Install ids are generated here and stored on the device. */
const INSTALL_ID = /^[A-Za-z0-9_-]{16,64}$/;

export function isInstallId(value: unknown): value is string {
  return typeof value === "string" && INSTALL_ID.test(value);
}

export type DevicePlatform = "android" | "ios";

/** The fields the app writes, besides the timestamps (rules pin the same set). */
export type DeviceDocFields = {
  token: string;
  tokenType: "expo";
  platform: DevicePlatform;
  product: "expense";
  appVersion: string;
  locale: string;
};

/** Every field a device document may hold (firestore.rules `deviceWellFormed`). */
export const DEVICE_DOC_KEYS = [
  "token",
  "tokenType",
  "platform",
  "product",
  "appVersion",
  "locale",
  "createdAt",
  "updatedAt",
  "lastSeenAt",
] as const;

const clip = (value: string, max: number) => value.slice(0, max);

export function buildDeviceFields(input: {
  token: string;
  platform: DevicePlatform;
  appVersion?: string | null;
  locale?: string | null;
}): DeviceDocFields {
  return {
    token: input.token,
    tokenType: "expo",
    platform: input.platform,
    product: "expense",
    appVersion: clip(String(input.appVersion || "unknown"), 32),
    locale: clip(String(input.locale || "und"), 35),
  };
}

export type PushRegistrationSkip =
  | "signed-out"
  | "web"
  | "not-spendly"
  | "local-test-build"
  | "expo-go"
  | "duress"
  | "no-permission";

/**
 * Whether this session may register for push. Registration never asks for
 * permission (SPENDLY-225 owns the prompt); it only runs once it is granted.
 */
export function pushRegistrationSkipReason(input: {
  uid: string | null | undefined;
  platform: string;
  activeProduct: string | null;
  localTestBuild: boolean;
  expoGo: boolean;
  duress: boolean;
  permissionGranted: boolean;
}): PushRegistrationSkip | null {
  if (!input.uid) return "signed-out";
  if (input.platform !== "android" && input.platform !== "ios") return "web";
  // Expense builds, and the combined build (no product set), only.
  if (input.activeProduct !== null && input.activeProduct !== "expense") return "not-spendly";
  // The test build has no FCM by design (google-services.localtest.json).
  if (input.localTestBuild) return "local-test-build";
  // Expo Go can't receive remote push for this project.
  if (input.expoGo) return "expo-go";
  // Never write anything for the decoy session (READ_MODEL_RULES R1.4).
  if (input.duress) return "duress";
  if (!input.permissionGranted) return "no-permission";
  return null;
}

/** What this install last wrote, kept on the device. */
export type DeviceRegistrationRecord = {
  uid: string;
  token: string;
  appVersion: string;
  locale: string;
  /** Local date key (YYYY-MM-DD) of the last write. */
  writtenOn: string;
};

/**
 * `create`: no document for this user on this install yet (or it was removed),
 * so write the full document with `createdAt`. `refresh`: the document exists
 * and something changed, or it hasn't been touched today. `none`: nothing to do.
 */
export function deviceWriteNeeded(
  last: DeviceRegistrationRecord | null,
  next: { uid: string; fields: DeviceDocFields; today: string }
): "create" | "refresh" | "none" {
  if (!last || last.uid !== next.uid) return "create";
  if (
    last.token !== next.fields.token ||
    last.appVersion !== next.fields.appVersion ||
    last.locale !== next.fields.locale ||
    last.writtenOn !== next.today
  ) {
    return "refresh";
  }
  return "none";
}

export function parseRegistrationRecord(raw: string | null): DeviceRegistrationRecord | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<DeviceRegistrationRecord>;
    if (
      typeof v.uid === "string" &&
      typeof v.token === "string" &&
      typeof v.appVersion === "string" &&
      typeof v.locale === "string" &&
      typeof v.writtenOn === "string"
    ) {
      return v as DeviceRegistrationRecord;
    }
  } catch {
    // fall through
  }
  return null;
}
