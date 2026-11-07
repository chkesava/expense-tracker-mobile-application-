/**
 * Shared splits and vaults as push (SPENDLY-697), polled by the event pass
 * (events.ts). Recipients are always read from the current document at poll
 * time, never anyone outside it, and **never the person who acted**.
 *
 * Splits (`splits/{id}`; only the organiser `createdBy` may write one, so the
 * actor of any split change is the organiser):
 * - **Added:** a new split notifies each other participant (`participantIds`).
 * - **Settled:** when it first becomes settled (`settledAt`, stamped by the
 *   app), the other participants hear it's settled.
 * - Soft-deleted splits (`deletedAt`) never notify.
 *
 * "I paid" / opt-out claims (`splitShareClaims`, filed anonymously from the
 * public page): the organiser only, once per claim (the slot is re-armed
 * after the organiser applies or dismisses, so the key includes `updatedAt`).
 *
 * Vaults (`vaults/{id}/expenses`): a deposit or withdrawal notifies every
 * member and the owner except whoever recorded it.
 *
 * No amounts in the text. Each notice also gets an inbox row.
 *
 * Reads (Spark budget), hourly: splits created or settled in the last day,
 * claims filed in it (plus each claim's public share, for the organiser and
 * name), and the vault list plus each vault's new entries.
 */

import type { EventNotice, EventSource } from "../events";
import type { AdminFirestoreLike } from "../firestorePorts";

type Doc = { id: string; ref: { path: string }; data(): Record<string, unknown> | undefined };

const SPLITS_URL = "/vaults?tab=splits";
const VAULTS_URL = "/vaults?tab=shared";

const str = (v: unknown, fallback = ""): string => (typeof v === "string" && v.trim() ? v.trim() : fallback);
const uids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : []);
const rowId = (key: string) => `shared_${key.replace(/[^A-Za-z0-9_-]/g, "_")}`.slice(0, 200);

function notice(uid: string, key: string, kind: string, title: string, body: string, url: string, entityId: string): EventNotice {
  return { uid, key, kind, title, body, url, entityId, row: { id: rowId(key), type: kind } };
}

/** The other people on a split or vault: everyone listed, minus the actor, once each. */
export function otherMembers(members: readonly string[], actor: string): string[] {
  return [...new Set(members)].filter((u) => u !== actor);
}

export function createSharedEventSource(db: AdminFirestoreLike): EventSource {
  return {
    name: "shared",
    category: "shared",
    async poll({ sinceMs }) {
      const out: EventNotice[] = [];

      // Splits added, and splits settled.
      for (const [field, kind] of [
        ["createdAt", "split_added"],
        ["settledAt", "split_settled"],
      ] as const) {
        const snap = await db.collection("splits").where(field, ">=", sinceMs).get();
        for (const doc of snap.docs as Doc[]) {
          const d = doc.data() ?? {};
          if (d.deletedAt) continue;
          if (kind === "split_settled" && d.settled !== true) continue;
          const organiser = str(d.createdBy);
          if (!organiser) continue;
          const who = str(d.createdByName, "Someone");
          const title = str(d.title, "a split");
          for (const uid of otherMembers(uids(d.participantIds), organiser)) {
            out.push(
              kind === "split_added"
                ? notice(uid, `split:added:${doc.id}`, kind, `${who} added you to a split`, `"${title}" — open it to see your share.`, SPLITS_URL, doc.id)
                : notice(uid, `split:settled:${doc.id}`, kind, "Split settled", `"${title}" is fully settled.`, SPLITS_URL, doc.id)
            );
          }
        }
      }

      // Claims filed from the public page: the organiser only.
      const claims = await db.collection("splitShareClaims").where("updatedAt", ">=", sinceMs).get();
      for (const doc of claims.docs as Doc[]) {
        const c = doc.data() ?? {};
        const shareId = str(c.shareId);
        if (!shareId || (c.type !== "paid" && c.type !== "optOut")) continue;
        const share = await db.doc(`splitPublicShares/${shareId}`).get();
        const s = share.exists ? share.data() ?? {} : null;
        const organiser = s ? str(s.createdBy) : "";
        if (!s || !organiser) continue;
        const people = Array.isArray(s.participants) ? (s.participants as { claimKey?: unknown; name?: unknown }[]) : [];
        const name = str(people.find((p) => p.claimKey === c.participantKey)?.name, "Someone");
        const splitTitle = str(s.title, "your split");
        const key = `claim:${doc.id}:${Number(c.updatedAt) || 0}`;
        out.push(
          c.type === "paid"
            ? notice(organiser, key, "split_claim_paid", `${name} says they've paid`, `For "${splitTitle}". Check and apply it in Spendly.`, SPLITS_URL, str(s.splitId, shareId))
            : notice(organiser, key, "split_claim_opt_out", `${name} wants to drop out`, `Of "${splitTitle}". Review it in Spendly.`, SPLITS_URL, str(s.splitId, shareId))
        );
      }

      // Vault deposits and withdrawals: the other members.
      const vaults = await db.collection("vaults").get();
      for (const vault of vaults.docs as Doc[]) {
        const v = vault.data() ?? {};
        const members = [...uids(v.memberIds), ...uids([v.ownerId])];
        if (members.length < 2) continue; // nobody else to tell
        const entries = await db.collection(`vaults/${vault.id}/expenses`).where("createdAt", ">=", new Date(sinceMs)).get();
        for (const doc of entries.docs as Doc[]) {
          const e = doc.data() ?? {};
          const actor = str(e.createdBy);
          if (!actor) continue;
          const who = str(e.createdByName, "Someone");
          const what = e.type === "withdrawal" ? "a withdrawal from" : "a deposit to";
          for (const uid of otherMembers(members, actor)) {
            out.push(notice(uid, `vault:${vault.id}:${doc.id}`, "vault_entry", `${who} added ${what} ${str(v.name, "a vault")}`, "Open the vault to see it.", VAULTS_URL, vault.id));
          }
        }
      }
      return out;
    },
  };
}
