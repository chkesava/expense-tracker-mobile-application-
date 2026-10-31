import { getAuth, type Auth } from "@/lib/auth";
import type { FirebaseApp } from "firebase/app";

/** Web Auth uses browser persistence by default. */
export function createAuth(firebaseApp: FirebaseApp): Auth {
  return getAuth(firebaseApp);
}
