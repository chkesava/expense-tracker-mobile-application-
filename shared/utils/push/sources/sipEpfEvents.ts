/**
 * SIP and EPF events as push (SPENDLY-229), polled by the event pass (events.ts).
 *
 * **SIP:** executeSips writes an inbox row for every executed, failed or
 * skipped run (`users/{uid}/notifications`, type `sip_*`, deterministic id).
 * Each new row is pushed once, with the row's own wording; the row already
 * exists, so the inbox and the push always match. Paused or cancelled plans
 * don't run, so they never produce a row.
 *
 * **EPF** (`users/{uid}/epfContributions`):
 * - "Contribution expected": when the monthly EPF cron releases a month to
 *   `expected` (`statusUpdatedAt` in the lookback, status still `expected`).
 * - "Not credited yet": once, the day after `expectedCreditTo` passes with
 *   the status still `expected`; never once it's credited, missed or reversed.
 * Both write their inbox row. Amounts are never in the text.
 *
 * Reads (Spark budget): SIP rows created in the last day; EPF rows whose
 * status changed in the last day or whose credit window ended in the last 3.
 */

import { shiftDateKey } from "../../dates";
import type { EventNotice, EventSource } from "../events";
import type { AdminFirestoreLike } from "../firestorePorts";

type Doc = { ref: { path: string }; data(): Record<string, unknown> | undefined };

function userPath(path: string, collection: string): { uid: string; id: string } | null {
  const parts = path.split("/");
  return parts.length === 4 && parts[0] === "users" && parts[2] === collection ? { uid: parts[1], id: parts[3] } : null;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-10" → "October 2026". */
export function monthLabel(month: unknown): string {
  if (typeof month !== "string" || !/^\d{4}-\d{2}$/.test(month)) return "this month";
  return `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

/** "2026-11-15" → "15 Nov". */
function dayLabel(date: unknown): string | null {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1].slice(0, 3)}`;
}

export function createSipEventSource(db: AdminFirestoreLike): EventSource {
  return {
    name: "sip",
    category: "investments",
    async poll({ sinceMs }) {
      const snap = await db.collectionGroup("notifications").where("createdAt", ">=", new Date(sinceMs)).get();
      const out: EventNotice[] = [];
      for (const doc of snap.docs as Doc[]) {
        const at = userPath(doc.ref.path, "notifications");
        const d = doc.data() ?? {};
        if (!at || typeof d.type !== "string" || !d.type.startsWith("sip_")) continue;
        if (typeof d.title !== "string" || !d.title) continue;
        const meta = (d.meta ?? {}) as { sipId?: unknown };
        out.push({
          uid: at.uid,
          key: `sip:${at.id}`,
          kind: d.type,
          title: d.title,
          body: typeof d.body === "string" ? d.body : "",
          url: "/investments",
          entityId: typeof meta.sipId === "string" ? meta.sipId : at.id,
        });
      }
      return out;
    },
  };
}

export function createEpfEventSource(db: AdminFirestoreLike): EventSource {
  return {
    name: "epf",
    category: "investments",
    async poll({ sinceMs, today }) {
      const out: EventNotice[] = [];
      const notice = (doc: Doc, kind: "expected" | "late"): EventNotice | null => {
        const at = userPath(doc.ref.path, "epfContributions");
        const d = doc.data() ?? {};
        if (!at || d.status !== "expected") return null;
        const month = monthLabel(d.month);
        const by = dayLabel(d.expectedCreditTo);
        const url = typeof d.establishmentId === "string" && /^[A-Za-z0-9_-]+$/.test(d.establishmentId) ? `/epf/${d.establishmentId}` : "/epf";
        return kind === "expected"
          ? {
              uid: at.uid,
              key: `epf:expected:${at.id}`,
              kind: "epf_expected",
              title: "EPF contribution expected",
              body: by ? `Your EPF for ${month} should be credited by ${by}.` : `Your EPF for ${month} should be credited soon.`,
              url,
              entityId: at.id,
              row: { id: `epf_expected_${at.id}`, type: "epf_expected" },
            }
          : {
              uid: at.uid,
              key: `epf:late:${at.id}`,
              kind: "epf_late",
              title: "EPF credit not seen yet",
              body: `Your EPF for ${month} hasn't been marked credited. Check your passbook and update it in Spendly.`,
              url,
              entityId: at.id,
              row: { id: `epf_late_${at.id}`, type: "epf_late" },
            };
      };
      const released = await db.collectionGroup("epfContributions").where("statusUpdatedAt", ">=", new Date(sinceMs)).get();
      for (const doc of released.docs as Doc[]) {
        const n = notice(doc, "expected");
        if (n) out.push(n);
      }
      const ended = await db
        .collectionGroup("epfContributions")
        .where("expectedCreditTo", ">=", shiftDateKey(today, -3))
        .where("expectedCreditTo", "<", today)
        .get();
      for (const doc of ended.docs as Doc[]) {
        const n = notice(doc, "late");
        if (n) out.push(n);
      }
      return out;
    },
  };
}
