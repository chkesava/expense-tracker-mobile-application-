import { useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";

import { FormDetails } from "@/components/ganesh/FormDetails";
import {
  FilterChips,
  MetaLabel,
  Pill,
  Section,
  StatusStrip,
  type ChipOption,
} from "@/components/ganesh/ui";
import { PrasadamProviderPicker } from "@/components/ganesh/prasadam/PrasadamProviderPicker";
import { useSessionTone } from "@/components/ganesh/prasadam/PrasadamSessionTone";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { newId } from "@/lib/id";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { toast } from "@/lib/toast";
import type {
  PrasadamEntry,
  PrasadamSession,
  PrasadamType,
  PrasadamUnit,
} from "@/shared/types/ganeshPrasadam";
import {
  findDuplicateProvider,
  normalizeQuantity,
  prasadamTypeLabel,
  validatePrasadamEntry,
} from "@/shared/utils/ganeshPrasadam";
import { formatSevaDate } from "@/shared/utils/ganeshSeva";
import { useTheme } from "@/theme/ThemeProvider";

export type PrasadamProviderDraft = {
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
  /**
   * The form's own submission id, stable for the life of this form instance.
   * The service uses it as the document id, so a double tap or an offline
   * retry re-targets the same document instead of minting a second entry.
   */
  clientOpId: string;
};

const UNITS: Array<ChipOption<PrasadamUnit>> = [
  { id: "pieces", label: "Pieces" },
  { id: "kg", label: "Kg" },
  { id: "litres", label: "Litres" },
  { id: "packets", label: "Packets" },
  { id: "plates", label: "Plates" },
  { id: "other", label: "Other" },
];

const TYPES: Array<ChipOption<PrasadamType>> = (
  ["sweet", "savoury", "laddu", "meal", "fruit", "drink", "other"] as PrasadamType[]
).map((id) => ({ id, label: prasadamTypeLabel(id) }));

/**
 * Record one provider, then the next.
 *
 * Rendered *inside* the session card rather than pushed as its own route. The
 * requirement that adding the next provider must not mean leaving the session
 * is a statement about navigation cost: a pushed form is push → fill → back →
 * find the session again, five times over for five providers. Inline, the day,
 * the session and the running count stay on screen the whole time.
 *
 * The session and day are shown as fixed pills for the same reason they are
 * immutable in the data model — filing a morning provider under the evening by
 * accident is the one mistake this form should make impossible.
 */
export function PrasadamProviderForm({
  date,
  session,
  entries,
  mode = "create",
  initial,
  onSubmit,
  onDone,
  onCancel,
}: {
  date: string;
  session: PrasadamSession;
  /** Everything already recorded, for the duplicate-provider warning. */
  entries: readonly PrasadamEntry[];
  mode?: "create" | "edit";
  initial?: Partial<PrasadamProviderDraft>;
  /**
   * Performs the write. `silent` is passed on the rapid path so the hook skips
   * its toast — a toast per provider over six providers is noise, and the
   * inline confirmation plus the rising count says it better.
   */
  onSubmit: (draft: PrasadamProviderDraft, opts: { silent: boolean }) => Promise<unknown>;
  /** Called after a save that should close the form. */
  onDone: () => void;
  onCancel: () => void;
}) {
  const { theme } = useTheme();
  const tone = useSessionTone(session);

  const [providerName, setProviderName] = useState(initial?.providerName ?? "");
  const [providerId, setProviderId] = useState(initial?.providerId);
  const [providerSource, setProviderSource] = useState(initial?.providerSource);
  const [mobile, setMobile] = useState(initial?.mobile ?? "");
  const [prasadamType, setPrasadamType] = useState<PrasadamType>(
    initial?.prasadamType ?? "sweet"
  );
  const [prasadamLabel, setPrasadamLabel] = useState(initial?.prasadamLabel ?? "");
  const [quantity, setQuantity] = useState(
    initial?.quantity !== undefined ? String(initial.quantity) : ""
  );
  const [unit, setUnit] = useState<PrasadamUnit>(initial?.unit ?? "pieces");
  const [unitLabel, setUnitLabel] = useState(initial?.unitLabel ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [justSaved, setJustSaved] = useState<string | null>(null);

  // One id per form instance, regenerated only after a successful save. A
  // double tap or an offline retry therefore re-targets the same document.
  const opIdRef = useRef(newId());

  const draft: PrasadamProviderDraft & { date: string; session: PrasadamSession } = {
    date,
    session,
    clientOpId: opIdRef.current,
    providerName,
    providerId,
    providerSource,
    mobile: mobile || undefined,
    prasadamType,
    prasadamLabel: prasadamLabel || undefined,
    quantity: normalizeQuantity(quantity) ?? Number.NaN,
    unit,
    unitLabel: unitLabel || undefined,
    notes: notes || undefined,
  };

  const valid = validatePrasadamEntry(draft);

  const duplicate = useMemo(() => {
    if (mode === "edit" || !providerName.trim()) return undefined;
    return findDuplicateProvider(entries, date, session, {
      providerId,
      providerName,
      mobile,
    });
  }, [mode, entries, date, session, providerId, providerName, mobile]);

  function resetForNextProvider() {
    setProviderName("");
    setProviderId(undefined);
    setProviderSource(undefined);
    setMobile("");
    setPrasadamLabel("");
    setQuantity("");
    setNotes("");
    setTouched(false);
    // The unit and the type are kept: a provider run is usually all pieces or
    // all kg, and re-picking them for every row is the friction this avoids.
    opIdRef.current = newId();
  }

  function save(andAnother: boolean) {
    if (!valid.ok) return;
    setBusy(true);
    const name = providerName.trim();
    onSubmit(draft, { silent: andAnother })
      .then(() => {
        if (andAnother) {
          void haptic.success();
          setJustSaved(name);
          resetForNextProvider();
        } else {
          onDone();
        }
      })
      .catch((error) => {
        // Every value is kept, and the same opId is reused, so retrying after a
        // failure cannot produce two entries.
        logError("ganesh.prasadam.save", error);
        toast.error(
          friendlyErrorMessage(error, "Could not record this provider.")
        );
      })
      .finally(() => setBusy(false));
  }

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Pill label={tone.label} />
        <Pill label={formatSevaDate(date, true)} tone="muted" />
      </View>

      {justSaved ? (
        <StatusStrip
          tone="positive"
          message={`${justSaved} recorded. Add the next provider.`}
        />
      ) : null}

      {duplicate ? (
        <StatusStrip
          tone="warning"
          message={`${duplicate.providerName} is already recorded for this session. Add another item, or edit the existing entry.`}
        />
      ) : null}

      <Input
        label="Who is providing?"
        value={providerName}
        onChangeText={(next) => {
          setProviderName(next);
          setTouched(true);
          setJustSaved(null);
          // Typing over a linked name unlinks it: the snapshot is what was
          // typed, and silently keeping a stale link would misattribute it.
          if (providerId) {
            setProviderId(undefined);
            setProviderSource(undefined);
          }
        }}
        placeholder="Their name"
      />

      {providerId ? (
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <Pill label={`Linked to ${providerName}`} />
          <Button
            variant="ghost"
            onPress={() => {
              setProviderId(undefined);
              setProviderSource(undefined);
            }}
          >
            Unlink
          </Button>
        </View>
      ) : (
        <PrasadamProviderPicker
          search={providerName}
          onPick={(picked) => {
            setProviderName(picked.name);
            setProviderId(picked.id);
            setProviderSource(picked.source);
            if (picked.mobile) setMobile(picked.mobile);
          }}
        />
      )}

      <Input
        label="What are they providing?"
        value={prasadamLabel}
        onChangeText={(next) => {
          setPrasadamLabel(next);
          setTouched(true);
        }}
        placeholder="Laddu, pulihora, payasam…"
      />

      <Section title="Kind" plain rule={false}>
        <FilterChips
          layout="wrap"
          value={prasadamType}
          options={TYPES}
          onChange={setPrasadamType}
        />
      </Section>

      <Input
        label="How much?"
        value={quantity}
        onChangeText={(next) => {
          setQuantity(next);
          setTouched(true);
        }}
        keyboardType="number-pad"
        placeholder="0"
      />

      <Section title="Counted in" plain rule={false}>
        <FilterChips layout="wrap" value={unit} options={UNITS} onChange={setUnit} />
      </Section>

      {unit === "other" ? (
        <Input
          label="Name the unit"
          value={unitLabel}
          onChangeText={setUnitLabel}
          placeholder="Dabba, bucket, tray…"
        />
      ) : null}

      <FormDetails>
        <Input
          label="Mobile (optional)"
          value={mobile}
          onChangeText={setMobile}
          keyboardType="phone-pad"
          placeholder="For the committee's record"
        />
        <Input
          label="Note (optional)"
          value={notes}
          onChangeText={setNotes}
          placeholder="Anything worth remembering"
        />
      </FormDetails>

      {!valid.ok && touched ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: theme.colors.destructive, fontSize: 13 }}
        >
          {valid.error}
        </Text>
      ) : null}

      {mode === "create" ? (
        <>
          {/* Primary, because the *next* provider is the fast path. */}
          <Button loading={busy} disabled={!valid.ok} onPress={() => save(true)}>
            Save and add another
          </Button>
          <Button
            variant="secondary"
            disabled={busy || !valid.ok}
            onPress={() => save(false)}
          >
            Save and close
          </Button>
        </>
      ) : (
        <Button loading={busy} disabled={!valid.ok} onPress={() => save(false)}>
          Save changes
        </Button>
      )}

      <Button variant="ghost" disabled={busy} onPress={onCancel}>
        {mode === "edit" ? "Discard changes" : "Done"}
      </Button>

      <MetaLabel>
        Recorded under {tone.label.toLowerCase()} on {formatSevaDate(date, true)}. To move
        it, cancel this entry and record it again.
      </MetaLabel>
    </View>
  );
}
