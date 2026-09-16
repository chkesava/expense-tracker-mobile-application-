import { useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Check, Ticket } from "lucide-react-native";

import {
  FilterChips,
  MetaLabel,
  Section,
  StatusStrip,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { newId } from "@/lib/id";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useTheme } from "@/theme/ThemeProvider";
import type { PaymentMethod } from "@/shared/types/ganesh";
import { todayDateInput } from "@/shared/utils/ganeshIdentity";
import { formatInr } from "@/shared/utils/ganeshMoney";
import type { TokenCapacity } from "@/shared/utils/ganeshTokenLaddu";
import type { RegisterTokenLadduResult } from "@/services/ganesh/ganeshTokenLaddu";

const METHOD_OPTIONS: Array<{ id: PaymentMethod; label: string }> = [
  { id: "cash", label: "Cash" },
  { id: "upi", label: "UPI" },
  { id: "other", label: "Other" },
];

export type TokenLadduRegisterFormProps = {
  capacity: TokenCapacity;
  /** Fixed price per laddu, or 0 when the price varies. */
  amountPerToken: number;
  onRegister: (input: {
    clientOpId: string;
    participantName: string;
    mobile?: string;
    quantity: number;
    amount: number;
    paymentMethod: PaymentMethod;
    receiptNumberPhysical: string;
    date: string;
    notes?: string;
  }) => Promise<RegisterTokenLadduResult>;
};

/**
 * The registration form.
 *
 * Kept inside the Token Laddu screen rather than pushed to its own `add-*`
 * route, because KAN-125 asks for one place for the whole lifecycle. The
 * internals still follow `add-contribution.tsx`: a `clientOpId` fixed for the
 * life of the form, a `busy` flag, and a lock once the write lands.
 */
export function TokenLadduRegisterForm({
  capacity,
  amountPerToken,
  onRegister,
}: TokenLadduRegisterFormProps) {
  const { theme } = useTheme();
  const g = useGaneshTokens();

  const [participantName, setParticipantName] = useState("");
  const [mobile, setMobile] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [receiptNumberPhysical, setReceiptNumberPhysical] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [amount, setAmount] = useState(amountPerToken > 0 ? String(amountPerToken) : "");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<RegisterTokenLadduResult | null>(null);

  /**
   * One idempotency key per form, replaced only after a successful save.
   *
   * A double tap therefore reaches the service with the same id and is refused
   * there, and a retry after a network failure reuses the key rather than
   * creating a second set of tokens.
   */
  const opIdRef = useRef(newId());

  const qty = Number(quantity || 0);
  // Recomputed rather than typed, so the total always matches the price the
  // committee actually set. Editable when the price varies.
  const fixedTotal = amountPerToken > 0 && Number.isFinite(qty) ? amountPerToken * qty : null;
  const effectiveAmount = fixedTotal ?? Number(amount || 0);

  const reset = () => {
    opIdRef.current = newId();
    setSaved(null);
    setParticipantName("");
    setMobile("");
    setQuantity("1");
    setReceiptNumberPhysical("");
    setNotes("");
    if (amountPerToken <= 0) setAmount("");
  };

  const submit = () => {
    setBusy(true);
    onRegister({
      clientOpId: opIdRef.current,
      participantName,
      mobile: mobile.trim() || undefined,
      quantity: qty,
      amount: effectiveAmount,
      paymentMethod,
      receiptNumberPhysical,
      date: todayDateInput(),
      notes: notes.trim() || undefined,
    })
      .then((result) => setSaved(result))
      .catch((error) => {
        logError("ganesh.registerTokenLaddu", error, { quantity: qty });
        toast.error(friendlyErrorMessage(error, "Could not register the Token Laddu."));
      })
      .finally(() => setBusy(false));
  };

  if (saved) {
    return (
      <Section
        title="Registered"
        icon={<Check size={18} color={g.saffron} strokeWidth={2.2} />}
      >
        <Text style={[styles.lead, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>
          {saved.tokenCodes.length} Token {saved.tokenCodes.length === 1 ? "Laddu" : "Laddus"} for this
          receipt
        </Text>
        <MetaLabel>Hand these numbers to the participant</MetaLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.codes}>
          {saved.tokenCodes.map((code) => (
            <View
              key={code}
              style={[styles.code, { backgroundColor: g.wash(g.saffron), borderColor: g.saffron }]}
            >
              <Text style={[styles.codeText, { color: g.saffron, fontFamily: theme.fontFamily.semibold }]}>
                {code}
              </Text>
            </View>
          ))}
        </ScrollView>
        {saved.receiptNumber ? <MetaLabel>Receipt {saved.receiptNumber}</MetaLabel> : null}
        {saved.alreadyRegistered ? (
          <StatusStrip
            tone="warning"
            message="This receipt was already registered. These are the same tokens, not new ones."
          />
        ) : null}
        <Button onPress={reset}>Register another</Button>
      </Section>
    );
  }

  return (
    <Section
      title="Register a Token Laddu"
      icon={<Ticket size={18} color={g.saffron} strokeWidth={2.2} />}
    >
      {capacity.full ? (
        <StatusStrip
          tone="warning"
          message="Every Token Laddu is registered. Raise the number before registering more."
        />
      ) : (
        <MetaLabel>
          {capacity.remaining} of {capacity.total} left to register
        </MetaLabel>
      )}
      <Input
        label="Name"
        value={participantName}
        onChangeText={setParticipantName}
        placeholder="Who bought the Token Laddu"
        editable={!capacity.full}
      />
      <Input
        label="Mobile"
        value={mobile}
        onChangeText={setMobile}
        keyboardType="phone-pad"
        placeholder="Optional"
        editable={!capacity.full}
      />
      <Input
        label="Receipt number"
        value={receiptNumberPhysical}
        onChangeText={setReceiptNumberPhysical}
        placeholder="From the Token Laddu book"
        helperText="The number printed in the receipt book, not the app's own receipt."
        editable={!capacity.full}
      />
      <Input
        label="Number of Token Laddus"
        value={quantity}
        onChangeText={setQuantity}
        keyboardType="number-pad"
        editable={!capacity.full}
      />
      <FilterChips
        label="Payment"
        value={paymentMethod}
        options={METHOD_OPTIONS}
        onChange={setPaymentMethod}
        disabled={capacity.full}
      />
      {fixedTotal == null ? (
        <Input
          label="Amount collected"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          editable={!capacity.full}
        />
      ) : (
        <View>
          <MetaLabel>Amount</MetaLabel>
          <Text style={[styles.total, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>
            {formatInr(fixedTotal)}
          </Text>
          <MetaLabel>
            {qty || 0} × {formatInr(amountPerToken)}
          </MetaLabel>
        </View>
      )}
      <Input
        label="Note"
        value={notes}
        onChangeText={setNotes}
        placeholder="Optional"
        editable={!capacity.full}
      />
      <Button loading={busy} disabled={capacity.full} onPress={submit}>
        {qty > 1 ? `Register ${qty} Token Laddus` : "Register Token Laddu"}
      </Button>
    </Section>
  );
}

const styles = StyleSheet.create({
  lead: { fontSize: 16 },
  codes: { gap: 8, paddingVertical: 4 },
  code: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  codeText: { fontSize: 14 },
  total: { fontSize: 20 },
});
