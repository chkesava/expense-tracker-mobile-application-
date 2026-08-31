import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
} from "firebase/firestore";

import { getFirebaseAuth, getFirestoreDb } from "@/lib/firebase";
import {
  GANESH_SESSION_LEGACY_KEY,
  ganeshSessionStorageKey,
  hasGaneshSession,
  parseGaneshSession,
} from "@/shared/utils/ganeshSessionStorage";

const soft = (task: Promise<unknown>) => task.catch(() => undefined);

let started = false;

/**
 * Warm Firestore's cache for the saved Pandal session while the splash plays.
 * Failures are ignored — the overlay must never wait on this.
 */
export function prefetchGaneshStartup(): void {
  if (started) return;
  started = true;
  void runPrefetch();
}

async function runPrefetch(): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  const uid = getFirebaseAuth()?.currentUser?.uid;
  const namespaced = uid
    ? await AsyncStorage.getItem(ganeshSessionStorageKey(uid)).catch(() => null)
    : null;
  const parsed = parseGaneshSession(namespaced);
  const legacy = hasGaneshSession(parsed)
    ? parsed
    : parseGaneshSession(await AsyncStorage.getItem(GANESH_SESSION_LEGACY_KEY).catch(() => null));
  const pandalId = legacy?.pandalId ?? null;
  const festivalId = legacy?.festivalId ?? null;
  if (!pandalId || !festivalId) return;

  const festival = collection(db, "pandals", pandalId, "festivals", festivalId, "seva");
  const contributions = collection(db, "pandals", pandalId, "festivals", festivalId, "contributions");
  const collections = collection(db, "pandals", pandalId, "festivals", festivalId, "collections");
  const expenses = collection(db, "pandals", pandalId, "festivals", festivalId, "expenses");
  const activity = collection(db, "pandals", pandalId, "festivals", festivalId, "activity");

  await Promise.all([
    soft(getDoc(doc(db, "pandals", pandalId))),
    soft(getDoc(doc(db, "pandals", pandalId, "festivals", festivalId))),
    soft(getDoc(doc(db, "pandals", pandalId, "festivals", festivalId, "summary", "current"))),
    soft(getDocs(query(festival, orderBy("date", "asc"), limit(40)))),
    soft(getDocs(query(contributions, orderBy("createdAt", "desc"), limit(40)))),
    soft(getDocs(query(collections, orderBy("createdAt", "desc"), limit(40)))),
    soft(getDocs(query(expenses, orderBy("createdAt", "desc"), limit(40)))),
    soft(getDocs(query(activity, orderBy("createdAt", "desc"), limit(20)))),
  ]);
}
