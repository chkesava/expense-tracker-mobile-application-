/**
 * The queue driver (GS-040).
 *
 * The worker is deliberately passive — it drains what is due and says when to
 * come back. This is the piece that decides *when*, and it is mounted once for
 * the whole Ganesh app rather than per screen, which is the entire point: the
 * upload no longer belongs to the screen that started it.
 *
 * It wakes on all five things GS-040 lists as survivable:
 *
 * - **app restart** — a run on mount, over jobs read back from disk
 * - **network loss** — a run on the offline → online edge
 * - **background/foreground** — a run when `AppState` returns to `active`
 * - **upload failure** — a timer set to the earliest `nextAttemptAt`
 * - **a fresh enqueue** — the kick registered with the queue
 *
 * React Native gives a JS app no true background execution, so a job queued
 * while the app is killed resumes at the next launch rather than mid-sleep.
 * That is a real limit and the UI copy says so rather than implying otherwise.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { logError } from "@/lib/errors";
import { getFirebaseAuth } from "@/lib/firebase";
import { toast } from "@/lib/toast";
import { useNetwork } from "@/providers/NetworkProvider";
import {
  currentUploadJobs,
  loadUploadJobs,
  setUploadQueueKick,
  subscribeUploadJobs,
  uploadFailureNotice,
  type GaneshUploadJob,
} from "@/services/ganesh/storage/uploadQueue";
import { defaultUploadWorkerDeps, runUploadQueue } from "@/services/ganesh/storage/uploadQueue/uploadWorker";
import { pruneStagedFiles } from "@/services/ganesh/storage/uploadQueue/uploadStaging";

type GaneshUploadQueueValue = {
  jobs: GaneshUploadJob[];
  /** Jobs still working or waiting for a retry. */
  pending: GaneshUploadJob[];
  /** Jobs that have given up and need the user. */
  failed: GaneshUploadJob[];
  /** Run the worker now — used by a manual retry. */
  runNow: () => void;
};

const GaneshUploadQueueContext = createContext<GaneshUploadQueueValue>({
  jobs: [],
  pending: [],
  failed: [],
  runNow: () => undefined,
});

export function GaneshUploadQueueProvider({ children }: { children: ReactNode }) {
  const { isOnline } = useNetwork();
  const [jobs, setJobs] = useState<GaneshUploadJob[]>(currentUploadJobs);
  const onlineRef = useRef(isOnline);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Failures already announced, so a retry timer does not re-toast them. */
  const announcedRef = useRef(new Set<string>());

  onlineRef.current = isOnline;

  const run = useCallback(() => {
    void (async () => {
      try {
        const deps = await defaultUploadWorkerDeps({
          currentUid: () => getFirebaseAuth()?.currentUser?.uid ?? null,
          isOnline: () => onlineRef.current,
        });
        const result = await runUploadQueue(deps);
        if (timerRef.current) clearTimeout(timerRef.current);
        if (result.nextWakeAt) {
          // Capped so a five-minute backoff does not become a five-minute
          // timer the OS may never honour; the worker re-checks what is due.
          const delay = Math.min(Math.max(result.nextWakeAt - Date.now(), 1_000), 60_000);
          timerRef.current = setTimeout(run, delay);
        }
      } catch (error) {
        logError("ganesh.uploadQueue.run", error);
      }
    })();
  }, []);

  // Queue state for the UI, and the announcement of permanent failures.
  useEffect(() => {
    const unsubscribe = subscribeUploadJobs((next) => {
      setJobs(next);
      for (const job of next) {
        if (job.state !== "FAILED") {
          announcedRef.current.delete(job.id);
          continue;
        }
        if (announcedRef.current.has(job.id)) continue;
        announcedRef.current.add(job.id);
        toast.error(uploadFailureNotice(job));
      }
    });
    void loadUploadJobs()
      .then((loaded) => {
        // Files with no job left to own them are leftovers from a crash between
        // staging an image and persisting its record.
        pruneStagedFiles(new Set(loaded.map((job) => job.file.uri)));
        run();
      })
      .catch((error) => logError("ganesh.uploadQueue.load", error));
    return unsubscribe;
  }, [run]);

  // A fresh enqueue starts uploading immediately.
  useEffect(() => {
    setUploadQueueKick(run);
    return () => setUploadQueueKick(null);
  }, [run]);

  // The offline → online edge, not every network event.
  const wasOnline = useRef(isOnline);
  useEffect(() => {
    if (isOnline && !wasOnline.current) run();
    wasOnline.current = isOnline;
  }, [isOnline, run]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") run();
    });
    return () => subscription.remove();
  }, [run]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  const value = useMemo<GaneshUploadQueueValue>(() => {
    return {
      jobs,
      pending: jobs.filter(
        (job) => job.state === "PENDING" || job.state === "UPLOADING" || job.state === "RETRYING"
      ),
      failed: jobs.filter((job) => job.state === "FAILED"),
      runNow: run,
    };
  }, [jobs, run]);

  return (
    <GaneshUploadQueueContext.Provider value={value}>{children}</GaneshUploadQueueContext.Provider>
  );
}

export function useGaneshUploadQueue(): GaneshUploadQueueValue {
  return useContext(GaneshUploadQueueContext);
}
