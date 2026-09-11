/**
 * EPF profile + establishments data hook — KAN-65.
 *
 * Deliberately thin: every decision rule lives in `shared/features/epf/utils`
 * because `vitest.config.ts` does not run `hooks/**`. If you are about to add
 * a conditional here, add it there instead and call it from here.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import { logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { forgetSnapshotPath, logQuerySnapshot } from "@/lib/firestoreReadDebug";
import { commitWrite, writeSavedMessage } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import { useAuth } from "@/providers/AuthProvider";
import type { EpfProfileFormInput } from "@/shared/features/epf/schemas";
import type { EpfEstablishment, EpfProfile } from "@/shared/features/epf/types";
import {
  EPF_ESTABLISHMENTS_COLLECTION,
  EPF_PROFILE_COLLECTION,
  EPF_PROFILE_DOC_ID,
} from "@/shared/features/epf/types";
import {
  deriveEmploymentStatus,
  findActiveEstablishment,
  isOpenEnded,
  normalizeEstablishment,
  sortEstablishments,
  validateEstablishmentAgainstExisting,
} from "@/shared/features/epf/utils";

/** Firestore rejects undefined; drop those keys on create. */
function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    if (val !== undefined) out[key] = val;
  }
  return out as T;
}

/**
 * On update, an explicit `undefined` means "remove this field".
 *
 * Required here: re-opening an employment ("I still work here") must actually
 * delete `dateLeft`, not leave the stale value in place.
 */
function withFieldDeletes<T extends Record<string, unknown>>(
  value: T
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] = val === undefined ? deleteField() : val;
  }
  return out;
}

export type EpfEstablishmentInput = Omit<
  EpfEstablishment,
  "id" | "profileId" | "employmentStatus" | "createdAt" | "updatedAt"
>;

export function useEpf(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  // Duress-aware uid, matching every other investment hook: a duress session
  // must show an empty EPF tree rather than the real UAN.
  const { user } = useAuth();
  const uid = user?.uid;

  const [profile, setProfile] = useState<EpfProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const {
    error: profileError,
    setError: setProfileError,
    retry: retryProfile,
    attempt: profileAttempt,
  } = useLoadFailure();

  const [establishments, setEstablishments] = useState<EpfEstablishment[]>([]);
  const [establishmentsLoading, setEstablishmentsLoading] = useState(true);
  const {
    error: establishmentsError,
    setError: setEstablishmentsError,
    retry: retryEstablishments,
    attempt: establishmentsAttempt,
  } = useLoadFailure();

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }

    setProfileLoading(true);
    const path = `users/${uid}/${EPF_PROFILE_COLLECTION}/${EPF_PROFILE_DOC_ID}`;
    const ref = doc(db, "users", uid, EPF_PROFILE_COLLECTION, EPF_PROFILE_DOC_ID);

    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        setProfile(
          snap.exists()
            ? ({ id: snap.id, ...(snap.data() as Omit<EpfProfile, "id">) } as EpfProfile)
            : null
        );
        setProfileError(null);
        setProfileLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.epfProfile",
        (failure) => {
          setProfileError(failure);
          setProfileLoading(false);
        },
        "Couldn't load your EPF profile."
      )
    );

    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, enabled, profileAttempt]);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db) {
      setEstablishments([]);
      setEstablishmentsLoading(false);
      return;
    }

    setEstablishmentsLoading(true);
    const path = `users/${uid}/${EPF_ESTABLISHMENTS_COLLECTION}`;
    // No orderBy: sorting is client-side via sortEstablishments, so no
    // composite index is needed and a document missing the order field is
    // never silently dropped from the result.
    const q = query(collection(db, "users", uid, EPF_ESTABLISHMENTS_COLLECTION));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        logQuerySnapshot(path, snapshot);
        setEstablishments(
          sortEstablishments(
            snapshot.docs.map((docSnap) =>
              normalizeEstablishment(docSnap.id, docSnap.data() as Record<string, unknown>)
            )
          )
        );
        setEstablishmentsError(null);
        setEstablishmentsLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.epfEstablishments",
        (failure) => {
          setEstablishmentsError(failure);
          setEstablishmentsLoading(false);
        },
        "Couldn't load your EPF establishments."
      )
    );

    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, enabled, establishmentsAttempt]);

  const activeEstablishment = useMemo(
    () => findActiveEstablishment(establishments),
    [establishments]
  );

  const saveProfile = useCallback(
    async (input: EpfProfileFormInput): Promise<boolean> => {
      const db = getFirestoreDb();
      if (!uid || !db) {
        toast.error("Not authenticated");
        return false;
      }

      try {
        const ref = doc(db, "users", uid, EPF_PROFILE_COLLECTION, EPF_PROFILE_DOC_ID);
        const outcome = await commitWrite(
          () =>
            setDoc(
              ref,
              withoutUndefined({
                employeeName: input.employeeName,
                uan: input.uan,
                notes: input.notes || undefined,
                updatedAt: serverTimestamp(),
                createdAt: profile ? undefined : serverTimestamp(),
              }),
              // merge so activeEstablishmentId and any future field survive.
              { merge: true }
            ),
          { label: "EPF profile" }
        );
        toast.success(writeSavedMessage(outcome, "EPF profile saved"));
        return true;
      } catch (err) {
        logError("epf.saveprofile", err);
        toast.error("Failed to save EPF profile");
        return false;
      }
    },
    [uid, profile]
  );

  /**
   * Claim or release the single-current-employment lock.
   *
   * Client-SDK transactions can read documents but not queries, so the profile
   * doc's `activeEstablishmentId` pointer is the only thing two devices can
   * contend on. Overlap between two *closed* periods needs a collection query
   * and so stays client-guard-only.
   */
  const runWithCurrentLock = useCallback(
    async (
      establishmentId: string,
      claiming: boolean,
      write: (transaction: Parameters<Parameters<typeof runTransaction>[1]>[0]) => void
    ): Promise<void> => {
      const db = getFirestoreDb();
      if (!db || !uid) throw new Error("Not authenticated");

      const profileRef = doc(db, "users", uid, EPF_PROFILE_COLLECTION, EPF_PROFILE_DOC_ID);

      await runTransaction(db, async (transaction) => {
        const profileSnap = await transaction.get(profileRef);
        const pointer = profileSnap.exists()
          ? ((profileSnap.data() as EpfProfile).activeEstablishmentId ?? null)
          : null;

        if (claiming && pointer && pointer !== establishmentId) {
          throw new Error("MULTIPLE_CURRENT");
        }

        write(transaction);

        transaction.set(
          profileRef,
          {
            activeEstablishmentId: claiming ? establishmentId : null,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      });
    },
    [uid]
  );

  const addEstablishment = useCallback(
    async (input: EpfEstablishmentInput): Promise<string | null> => {
      const db = getFirestoreDb();
      if (!uid || !db) {
        toast.error("Not authenticated");
        return null;
      }

      const guard = validateEstablishmentAgainstExisting(establishments, {
        dateJoined: input.dateJoined,
        dateLeft: input.dateLeft,
      });
      if (!guard.ok) {
        toast.error(guard.message);
        return null;
      }

      try {
        const ref = doc(collection(db, "users", uid, EPF_ESTABLISHMENTS_COLLECTION));
        const payload = withoutUndefined({
          ...input,
          dateLeft: input.dateLeft || undefined,
          notes: input.notes || undefined,
          profileId: EPF_PROFILE_DOC_ID,
          employmentStatus: deriveEmploymentStatus(input.dateLeft),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        const outcome = await commitWrite(
          () =>
            runWithCurrentLock(ref.id, isOpenEnded(input), (transaction) => {
              transaction.set(ref, payload);
            }),
          { label: "EPF establishment" }
        );
        toast.success(writeSavedMessage(outcome, "Establishment added"));
        return ref.id;
      } catch (err) {
        if (err instanceof Error && err.message === "MULTIPLE_CURRENT") {
          toast.error("Close your current employment before adding a new one.");
          return null;
        }
        logError("epf.addestablishment", err);
        toast.error("Failed to add establishment");
        return null;
      }
    },
    [uid, establishments, runWithCurrentLock]
  );

  const updateEstablishment = useCallback(
    async (id: string, updates: Partial<EpfEstablishmentInput>): Promise<boolean> => {
      const db = getFirestoreDb();
      if (!uid || !db) {
        toast.error("Not authenticated");
        return false;
      }

      const existing = establishments.find((item) => item.id === id);
      if (!existing) {
        toast.error("Establishment not found");
        return false;
      }

      const merged = { ...existing, ...updates };
      const nextDateLeft = "dateLeft" in updates ? updates.dateLeft || undefined : existing.dateLeft;

      const guard = validateEstablishmentAgainstExisting(establishments, {
        id,
        dateJoined: merged.dateJoined,
        dateLeft: nextDateLeft,
      });
      if (!guard.ok) {
        toast.error(guard.message);
        return false;
      }

      try {
        const ref = doc(db, "users", uid, EPF_ESTABLISHMENTS_COLLECTION, id);
        const payload = withFieldDeletes({
          ...updates,
          ...("dateLeft" in updates ? { dateLeft: nextDateLeft } : {}),
          ...("notes" in updates ? { notes: updates.notes || undefined } : {}),
          employmentStatus: deriveEmploymentStatus(nextDateLeft),
          updatedAt: serverTimestamp(),
        });

        const becomingCurrent = !nextDateLeft;
        const outcome = await commitWrite(
          () =>
            runWithCurrentLock(id, becomingCurrent, (transaction) => {
              transaction.update(ref, payload);
            }),
          { label: "EPF establishment" }
        );
        toast.success(writeSavedMessage(outcome, "Establishment updated"));
        return true;
      } catch (err) {
        if (err instanceof Error && err.message === "MULTIPLE_CURRENT") {
          toast.error("Close your current employment before reopening this one.");
          return false;
        }
        logError("epf.updateestablishment", err);
        toast.error("Failed to update establishment");
        return false;
      }
    },
    [uid, establishments, runWithCurrentLock]
  );

  const closeEstablishment = useCallback(
    (id: string, dateLeft: string) => updateEstablishment(id, { dateLeft }),
    [updateEstablishment]
  );

  const deleteEstablishment = useCallback(
    async (id: string): Promise<boolean> => {
      const db = getFirestoreDb();
      if (!uid || !db) {
        toast.error("Not authenticated");
        return false;
      }

      try {
        const ref = doc(db, "users", uid, EPF_ESTABLISHMENTS_COLLECTION, id);
        const wasCurrent = establishments.some((item) => item.id === id && isOpenEnded(item));

        const outcome = await commitWrite(
          () =>
            wasCurrent
              ? runWithCurrentLock(id, false, (transaction) => {
                  transaction.delete(ref);
                })
              : deleteDoc(ref),
          { label: "EPF establishment" }
        );
        toast.success(writeSavedMessage(outcome, "Establishment removed"));
        return true;
      } catch (err) {
        logError("epf.deleteestablishment", err);
        toast.error("Failed to remove establishment");
        return false;
      }
    },
    [uid, establishments, runWithCurrentLock]
  );

  return {
    profile,
    profileLoading,
    profileError,
    retryProfile,

    establishments,
    establishmentsLoading,
    establishmentsError,
    retryEstablishments,

    activeEstablishment,
    hasProfile: Boolean(profile),

    saveProfile,
    addEstablishment,
    updateEstablishment,
    closeEstablishment,
    deleteEstablishment,
  };
}
