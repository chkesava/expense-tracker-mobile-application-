/**
 * SPENDLY-634 spike — throwaway probe, Spendly Test only, never shipped.
 *
 * Proves @react-native-firebase works in this app before the migration:
 * native Auth + Firestore against the emulator, durable persistence across a
 * force-stop, rules seeing `request.auth`, and an offline write surviving a
 * restart. Everything is logged as `[rnfb-spike]` for logcat; the app's own
 * (JS SDK) data path is untouched.
 */

import { getApp } from "@react-native-firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  getIdToken,
  signInWithEmailAndPassword,
} from "@react-native-firebase/auth";
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDocsFromCache,
  increment,
  initializeFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "@react-native-firebase/firestore";

import { Alert } from "react-native";

import { env, isLocalTestMode } from "@/lib/env";

const DEMO_EMAIL = "demo@spendly.test";
const DEMO_PASSWORD = "spendly-demo";

const t0 = Date.now();
const lines: string[] = [];
const log = (msg: string, extra?: unknown) => {
  const line = `+${Date.now() - t0}ms ${msg}${extra === undefined ? "" : ` ${JSON.stringify(extra)}`}`;
  lines.push(line);
  console.log(`[rnfb-spike] ${line}`);
};
/** Logcat may drop JS logs; the alert is the reliable read-out. */
export function showRnfbSpikeReport(): void {
  Alert.alert("rnfb-spike", lines.join(String.fromCharCode(10)) || "(no lines)");
}

let started = false;

export function runRnfbSpike(): void {
  console.log(`[rnfb-spike] entry started=${started} localTest=${isLocalTestMode()} host=${env.firebaseEmulatorHost}`);
  if (started || !isLocalTestMode()) return;
  started = true;
  Alert.alert("rnfb-spike", "probe started");
  setTimeout(showRnfbSpikeReport, 12_000);
  void probe().catch((error: unknown) =>
    log("FAILED", { message: error instanceof Error ? error.message : String(error) })
  );
}

async function probe(): Promise<void> {
  const host = env.firebaseEmulatorHost || "127.0.0.1";
  const app = getApp();
  log("native app", { name: app.name, projectId: app.options.projectId });

  const db = await initializeFirestore(app, { persistence: true, cacheSizeBytes: 50 * 1024 * 1024 });
  connectFirestoreEmulator(db, host, 8080);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${host}:9099`);

  // 1. Did the native session survive the restart?
  const restored = auth.currentUser;
  log("session at launch", { restored: Boolean(restored), uid: restored?.uid ?? null });

  const uid = restored?.uid ?? (await signInWithEmailAndPassword(auth, DEMO_EMAIL, DEMO_PASSWORD)).user.uid;
  const token = await getIdToken(auth.currentUser!).catch(() => "");
  log("signed in", { uid, idTokenLength: token.length });

  // 2. Disk cache: readable before any network round trip?
  try {
    const cached = await getDocsFromCache(collection(db, "users", uid, "accounts"));
    log("accounts from disk cache", { count: cached.size });
  } catch (error) {
    log("accounts from disk cache: miss", { message: error instanceof Error ? error.message : String(error) });
  }

  // 3. Live listener: first snapshot source and timing; rules must allow it
  //    (a permission error here means request.auth did not reach the rules).
  let first = true;
  onSnapshot(
    collection(db, "users", uid, "accounts"),
    { includeMetadataChanges: true },
    (snap) => {
      log(first ? "accounts first snapshot" : "accounts snapshot", {
        count: snap.size,
        fromCache: snap.metadata.fromCache,
        hasPendingWrites: snap.metadata.hasPendingWrites,
      });
      first = false;
    },
    (error) => log("accounts listener error", { message: error.message })
  );

  // 4. A write that must survive a force-stop when queued offline.
  const probeRef = doc(db, "users", uid, "meta", "rnfbSpike");
  onSnapshot(
    probeRef,
    { includeMetadataChanges: true },
    (snap) =>
      log("probe doc", {
        launches: snap.data()?.launches ?? null,
        fromCache: snap.metadata.fromCache,
        hasPendingWrites: snap.metadata.hasPendingWrites,
      }),
    (error) => log("probe doc error", { message: error.message })
  );
  void setDoc(probeRef, { launches: increment(1), lastAt: serverTimestamp() }, { merge: true })
    .then(() => log("probe write acknowledged by server"))
    .catch((error: unknown) =>
      log("probe write failed", { message: error instanceof Error ? error.message : String(error) })
    );
  log("probe write queued");
}
