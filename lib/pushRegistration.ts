/**
 * Registers this Spendly install for remote push (SPENDLY-224).
 *
 * Keeps `users/{uid}/devices/{installId}` current with this install's Expo push
 * token, so the server sender (SPENDLY-227) can reach every device the user is
 * signed in on, and removes it on sign-out. Rules: shared/utils/pushDevice.
 *
 * - Never asks for notification permission (SPENDLY-225 owns the prompt).
 * - Writes at most once a day per install unless the token, version or locale
 *   changed; both writes and deletes tell the read model (`noteDirectWrites`).
 * - Never throws and never blocks app start or sign-out: failures are warnings.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import { ACTIVE_PRODUCT } from "@/lib/activeProduct";
import { isLocalTestMode } from "@/lib/env";
import { logWarning } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from "@/lib/firestore";
import { commitWrite } from "@/lib/firestoreWrite";
import { noteDirectWrites } from "@/lib/readModelWriteHooks";
import { todayDateKey } from "@/shared/utils/dates";
import {
  DEVICES_COLLECTION,
  buildDeviceFields,
  deviceWriteNeeded,
  isExpoPushToken,
  isInstallId,
  parseRegistrationRecord,
  pushRegistrationSkipReason,
  type DevicePlatform,
  type PushRegistrationSkip,
} from "@/shared/utils/pushDevice";

const INSTALL_ID_KEY = "spendly:push:installId";
const RECORD_KEY = "spendly:push:registration";
/** A background write; don't hold the caller for a slow network. */
const WRITE_GRACE_MS = 4000;

function newInstallId(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 24; i++) id += alphabet[Math.floor(Math.random() * alphabet.length)];
  return id;
}

/** A stable id for this install (a reinstall gets a new one). */
export async function getInstallId(): Promise<string> {
  const stored = await AsyncStorage.getItem(INSTALL_ID_KEY).catch(() => null);
  if (isInstallId(stored)) return stored;
  const id = newInstallId();
  await AsyncStorage.setItem(INSTALL_ID_KEY, id).catch(() => undefined);
  return id;
}

// SPENDLY-693: who delivers reminders depends on whether this install is
// registered, so the reminder schedulers listen for changes.
const listeners = new Set<() => void>();

/** Called whenever this install's registration is written or removed. */
export function onPushRegistrationChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitChange(): void {
  for (const l of listeners) {
    try {
      l();
    } catch {
      // a listener must never break registration
    }
  }
}

async function clearRecord(): Promise<void> {
  await AsyncStorage.removeItem(RECORD_KEY).catch(() => undefined);
  emitChange();
}

/** Whether this install is registered for push for `uid` (its last write was for that user). */
export async function isRegisteredForUser(uid: string | null | undefined): Promise<boolean> {
  if (!uid) return false;
  const record = parseRegistrationRecord(await AsyncStorage.getItem(RECORD_KEY).catch(() => null));
  return record?.uid === uid;
}

export type PushRegistrationResult =
  | { status: "skipped"; reason: PushRegistrationSkip | "no-token" | "no-db" }
  | { status: "unchanged" | "created" | "refreshed" }
  | { status: "failed" };

/**
 * Makes sure this install's device document is current for `uid`.
 * `duress` is the privacy decoy session, which never registers.
 */
export async function registerPushDevice(uid: string | null | undefined, opts: { duress: boolean }): Promise<PushRegistrationResult> {
  try {
    const { Platform } = await import("react-native");
    const Constants = (await import("expo-constants")).default;
    const Notifications = await import("expo-notifications");

    const permissionGranted =
      Platform.OS === "web" ? false : (await Notifications.getPermissionsAsync()).status === "granted";
    const skip = pushRegistrationSkipReason({
      uid,
      platform: Platform.OS,
      activeProduct: ACTIVE_PRODUCT,
      localTestBuild: isLocalTestMode(),
      expoGo: Constants.executionEnvironment === "storeClient",
      duress: opts.duress,
      permissionGranted,
    });
    if (skip || !uid) return { status: "skipped", reason: skip ?? "signed-out" };

    const db = getFirestoreDb();
    if (!db) return { status: "skipped", reason: "no-db" };

    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
    if (!isExpoPushToken(token)) return { status: "skipped", reason: "no-token" };

    const Application = await import("expo-application");
    const fields = buildDeviceFields({
      token,
      platform: Platform.OS as DevicePlatform,
      appVersion: Application.nativeApplicationVersion,
      locale: Intl.DateTimeFormat().resolvedOptions().locale,
    });
    const today = todayDateKey();
    const last = parseRegistrationRecord(await AsyncStorage.getItem(RECORD_KEY).catch(() => null));
    const need = deviceWriteNeeded(last, { uid, fields, today });
    if (need === "none") return { status: "unchanged" };

    const installId = await getInstallId();
    const ref = doc(db, "users", uid, DEVICES_COLLECTION, installId);
    // A write that fails after the grace period clears the record, so the next
    // launch writes the full document again.
    const onLateFailure = (error: unknown) => {
      logWarning("pushRegistration.write", error, { need });
      void clearRecord();
    };
    if (need === "create") {
      await commitWrite(
        () =>
          setDoc(ref, {
            ...fields,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            lastSeenAt: serverTimestamp(),
          }),
        { graceMs: WRITE_GRACE_MS, onLateFailure }
      );
    } else {
      await commitWrite(
        () => updateDoc(ref, { ...fields, updatedAt: serverTimestamp(), lastSeenAt: serverTimestamp() }),
        { graceMs: WRITE_GRACE_MS, onLateFailure }
      );
    }
    noteDirectWrites(uid, [ref.path]);
    await AsyncStorage.setItem(
      RECORD_KEY,
      JSON.stringify({ uid, token, appVersion: fields.appVersion, locale: fields.locale, writtenOn: today })
    ).catch(() => undefined);
    emitChange();
    return { status: need === "create" ? "created" : "refreshed" };
  } catch (error) {
    // e.g. the document was removed elsewhere, so the refresh found nothing:
    // forget the record and write it in full next time.
    logWarning("pushRegistration.register", error);
    await clearRecord();
    return { status: "failed" };
  }
}

/**
 * Removes this install's device document for `uid` (sign-out), so pushes for
 * that account stop reaching this device. Call while still signed in.
 */
export async function unregisterPushDevice(uid: string | null | undefined): Promise<void> {
  try {
    const record = parseRegistrationRecord(await AsyncStorage.getItem(RECORD_KEY).catch(() => null));
    await clearRecord();
    if (!uid || !record || record.uid !== uid) return;
    const db = getFirestoreDb();
    if (!db) return;
    const ref = doc(db, "users", uid, DEVICES_COLLECTION, await getInstallId());
    await commitWrite(() => deleteDoc(ref), {
      graceMs: WRITE_GRACE_MS,
      onLateFailure: (error) => logWarning("pushRegistration.unregister", error),
    });
    noteDirectWrites(uid, [ref.path]);
  } catch (error) {
    logWarning("pushRegistration.unregister", error);
  }
}
