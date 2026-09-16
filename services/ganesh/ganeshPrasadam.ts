import {
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
  type Firestore,
} from "firebase/firestore";

import { commitWrite } from "@/lib/firestoreWrite";
import { omitUndefined } from "@/shared/utils/firestorePayload";
import type {
  PrasadamEntry,
  PrasadamSession,
  PrasadamType,
  PrasadamUnit,
} from "@/shared/types/ganeshPrasadam";
import { festivalCol } from "@/shared/utils/ganeshPaths";
import { requireOpenFestival } from "@/services/ganesh/ganeshFestivalGuard";
import { activity, audit } from "@/services/ganesh/ganeshWrites";
import {
  assertCanCancelPrasadamEntry,
  assertCanEditPrasadamEntry,
  formatPrasadamQuantity,
  prasadamSessionLabel,
  validatePrasadamEntry,
} from "@/shared/utils/ganeshPrasadam";

/**
 * Prasadam register writers (KAN-126).
 *
 * Every path here is a plain `writeBatch`, and that is the load-bearing
 * decision. Not one of them reads a counter, checks a capacity or allocates a
 * number, so there is nothing a concurrent writer could invalidate and nothing
 * a transaction would buy — while staying on batches means a volunteer at the
 * prasadam counter with no signal can record who brought what and have it sync
 * later. That is the single strongest offline case in the app, and it is why
 * this feature deliberately diverges from KAN-125's registration path. See the
 * note in `services/ganesh/ganeshWriter.ts`.
 *
 * Concurrency is handled by the data model rather than by locking: every entry
 * is its own document, so two people recording into the same session at the
 * same moment write to two different places and neither can lose.
 */

type GaneshActor = {
  uid: string;
  displayName: string;
  phone?: string;
};

function pathRef(db: Firestore, segments: string[]) {
  const [root, ...rest] = segments;
  return doc(db, root, ...rest);
}

function entryRef(db: Firestore, pandalId: string, festivalId: string, id: string) {
  return pathRef(db, [
    ...festivalCol(pandalId, festivalId, "prasadamEntries"),
    id,
  ]);
}

export type PrasadamEntryInput = {
  date: string;
  session: PrasadamSession;
  providerName: string;
  providerId?: string;
  providerSource?: "member" | "household";
  mobile?: string;
  prasadamType: PrasadamType;
  prasadamLabel?: string;
  quantity: number;
  unit: PrasadamUnit;
  unitLabel?: string;
  notes?: string;
  sevaId?: string;
  /**
   * Minted once per form mount and used as the document id, so a double tap or
   * a retried write re-targets the same document instead of minting a second
   * row. Required rather than optional: an entry without one has no protection
   * at all, and the form always has one to give.
   */
  clientOpId: string;
};

/** The one-line description used on the activity feed and the audit row. */
function describe(input: PrasadamEntryInput): string {
  const item = input.prasadamLabel?.trim();
  const quantity = formatPrasadamQuantity(
    input.quantity,
    input.unit,
    input.unitLabel
  );
  return [item, quantity, prasadamSessionLabel(input.session)]
    .filter(Boolean)
    .join(" · ");
}

export async function createPrasadamEntry(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  input: PrasadamEntryInput
): Promise<string> {
  await requireOpenFestival(db, pandalId, festivalId);
  const valid = validatePrasadamEntry(input);
  if (!valid.ok) throw new Error(valid.error);

  const id = input.clientOpId.trim();
  if (!id) throw new Error("This entry is missing its submission id.");

  const ref = entryRef(db, pandalId, festivalId, id);

  // Idempotency for the realistic duplicate: a double tap, or a retry after a
  // timeout. Wrapped in a catch so an offline cache miss degrades to "write
  // it" rather than failing — and a double tap on the same device still hits
  // the local cache and stops here.
  const existing = await getDoc(ref).catch(() => null);
  if (existing?.exists()) return id;

  const providerName = input.providerName.trim();
  const batch = writeBatch(db);

  batch.set(
    ref,
    omitUndefined({
      date: input.date,
      session: input.session,
      providerName,
      providerId: input.providerId?.trim() || undefined,
      providerSource: input.providerId ? input.providerSource : undefined,
      mobile: input.mobile?.trim() || undefined,
      prasadamType: input.prasadamType,
      prasadamLabel: input.prasadamLabel?.trim() || undefined,
      quantity: input.quantity,
      unit: input.unit,
      unitLabel: input.unit === "other" ? input.unitLabel?.trim() : undefined,
      notes: input.notes?.trim() || undefined,
      sevaId: input.sevaId?.trim() || undefined,
      status: "recorded",
      voided: false,
      clientOpId: id,
      createdBy: actor.uid,
      createdAt: serverTimestamp(),
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    } satisfies Record<string, unknown>)
  );

  // No `amount` or `estimatedValue` on the activity row, deliberately: an
  // amount here is how an in-kind offering sneaks into a money-shaped feed and
  // starts looking like income.
  activity(batch, db, pandalId, festivalId, {
    title: "Prasadam recorded",
    subtitle: `${providerName} · ${describe(input)}`,
    actorId: actor.uid,
    entityType: "prasadamEntry",
    entityId: id,
  });

  audit(
    batch,
    db,
    pandalId,
    festivalId,
    actor.uid,
    "created",
    "prasadamEntry",
    id,
    { newValue: { providerName, date: input.date, session: input.session } }
  );

  await commitWrite(() => batch.commit(), { label: "prasadam" });
  return id;
}

export async function updatePrasadamEntry(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  entryId: string,
  input: Omit<PrasadamEntryInput, "clientOpId">
): Promise<void> {
  const valid = validatePrasadamEntry(input);
  if (!valid.ok) throw new Error(valid.error);

  const ref = entryRef(db, pandalId, festivalId, entryId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("That prasadam entry is no longer here.");
  const previous = snap.data() as PrasadamEntry;
  assertCanEditPrasadamEntry(previous);

  const providerName = input.providerName.trim();
  const batch = writeBatch(db);

  // `date` and `session` are absent on purpose, and the rules refuse them too:
  // moving an entry between sessions would make a day's counts irreconcilable
  // against its own history, so relocating one is a cancel and a re-record.
  //
  // Clearable fields are written as empty strings rather than omitted —
  // `omitUndefined` would silently keep the old value, which is the note
  // already sitting on `updateSeva`.
  batch.update(ref, {
    providerName,
    providerId: input.providerId?.trim() ?? "",
    providerSource: input.providerId ? (input.providerSource ?? "") : "",
    mobile: input.mobile?.trim() ?? "",
    prasadamType: input.prasadamType,
    prasadamLabel: input.prasadamLabel?.trim() ?? "",
    quantity: input.quantity,
    unit: input.unit,
    unitLabel: input.unit === "other" ? (input.unitLabel?.trim() ?? "") : "",
    notes: input.notes?.trim() ?? "",
    sevaId: input.sevaId?.trim() ?? "",
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  });

  audit(
    batch,
    db,
    pandalId,
    festivalId,
    actor.uid,
    "edited",
    "prasadamEntry",
    entryId,
    {
      oldValue: {
        providerName: previous.providerName,
        quantity: previous.quantity,
        unit: previous.unit,
      },
      newValue: {
        providerName,
        quantity: input.quantity,
        unit: input.unit,
      },
    }
  );

  await commitWrite(() => batch.commit(), { label: "prasadam" });
}

/**
 * Cancel, never delete.
 *
 * The entry stays readable so a finished festival's register still reconciles
 * with what the committee remembers, and the reversal is visible rather than a
 * gap. Terminal by design: a cancelled entry cannot be edited or restored, so
 * correcting a mistaken cancellation means recording a fresh entry — which
 * keeps the correction in the audit trail instead of rewriting history.
 */
export async function cancelPrasadamEntry(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  festivalId: string,
  input: { entryId: string; reason: string }
): Promise<void> {
  const reason = input.reason?.trim();
  if (!reason) throw new Error("Say why this entry is being cancelled.");

  const ref = entryRef(db, pandalId, festivalId, input.entryId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("That prasadam entry is no longer here.");
  const previous = snap.data() as PrasadamEntry;
  assertCanCancelPrasadamEntry(previous);

  const batch = writeBatch(db);
  batch.update(ref, {
    status: "cancelled",
    cancelReason: reason,
    voided: true,
    voidReason: reason,
    voidedBy: actor.uid,
    voidedAt: serverTimestamp(),
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  });

  activity(batch, db, pandalId, festivalId, {
    title: "Prasadam entry cancelled",
    subtitle: `${previous.providerName} · ${prasadamSessionLabel(previous.session)}`,
    actorId: actor.uid,
    entityType: "prasadamEntry",
    entityId: input.entryId,
  });

  audit(
    batch,
    db,
    pandalId,
    festivalId,
    actor.uid,
    "cancelled",
    "prasadamEntry",
    input.entryId,
    { reason, oldValue: { status: "recorded" }, newValue: { status: "cancelled" } }
  );

  await commitWrite(() => batch.commit(), { label: "cancel prasadam" });
}
