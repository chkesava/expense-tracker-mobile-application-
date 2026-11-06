import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";

import { CurrencyPrefix } from "@/components/common/CurrencyPrefix";
import { DateField } from "@/components/common/DateField";
import { Modal } from "@/components/common/Modal";
import { SheetActions } from "@/components/common/SheetActions";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { appDialog } from "@/lib/appDialog";
import { toast } from "@/lib/toast";
import { useSettings } from "@/providers/SettingsProvider";
import type { GroupFund } from "@/shared/types/groupFund";
import { formatMonthLabel } from "@/shared/utils/dateDisplay";
import { shiftMonthKey, todayDateKey } from "@/shared/utils/dates";
import type { MemberMonthStatus } from "@/shared/utils/groupFundMath";
import { contributionDuplicateWarning } from "@/shared/utils/groupFundMessages";
import { parseGroupFundAmount } from "@/shared/utils/groupFundModel";
import { useTheme } from "@/theme/ThemeProvider";

export type GroupFundEventMode = "contribution" | "payout" | "opening" | "transfer" | "move";

export type GroupFundEventValues = {
  purposeId: string;
  toPurposeId: string;
  memberId: string;
  accountId: string;
  toAccountId: string;
  amount: number;
  date: string;
  period: string;
  recipient: string;
  reference: string;
  note: string;
};

const TITLES: Record<GroupFundEventMode, string> = {
  contribution: "Add contribution",
  payout: "Record payout",
  opening: "Opening balance",
  transfer: "Move between purposes",
  move: "Move between accounts",
};

const HINTS: Record<GroupFundEventMode, string> = {
  contribution: "Adds to the account's balance once. Never counted as your income.",
  payout: "Takes it out of the account once. Never counted as your spending.",
  opening: "Money you already held before tracking. No account balance changes.",
  transfer: "The fund's total stays the same. No account balance changes.",
  move: "E.g. cash deposited in the bank. Shows as a transfer on both accounts.",
};

export type GroupFundEventSheetProps = {
  visible: boolean;
  mode: GroupFundEventMode;
  fund: GroupFund;
  accounts: { id: string; name: string }[];
  /** Mint one event id per submit; a retry of the same submit reuses it. */
  newEventId: () => string;
  /** Contribution only: what this member already paid toward this purpose for the month. */
  checkMemberMonth?: (memberId: string, purposeId: string, period: string) => Promise<MemberMonthStatus | null>;
  /** SPENDLY-688: pre-filled from the month view ("record Ravi's October payment"). */
  initial?: { memberId?: string; purposeId?: string; period?: string; amount?: number };
  onClose: () => void;
  onSubmit: (eventId: string, values: GroupFundEventValues) => Promise<boolean>;
};

/**
 * One sheet for every Group Funds money event (SPENDLY-687). The fields shown
 * follow the mode; the builders in shared/utils/groupFundWrites validate
 * again (and the store and rules after them), so this only guides input.
 */
export function GroupFundEventSheet({
  visible,
  mode,
  fund,
  accounts,
  newEventId,
  checkMemberMonth,
  initial,
  onClose,
  onSubmit,
}: GroupFundEventSheetProps) {
  const { theme } = useTheme();
  const { settings } = useSettings();
  const currency = useDisplayCurrency();
  const money = useGhostMoney(currency);
  const activePurposes = useMemo(() => fund.purposes.filter((p) => !p.archived), [fund.purposes]);
  // Payouts and moves may draw on an archived purpose that still holds money.
  const sourcePurposes = useMemo(
    () => (mode === "contribution" || mode === "opening" ? activePurposes : fund.purposes.filter((p) => !p.archived || (fund.byPurpose[p.id]?.held ?? 0) > 0)),
    [mode, activePurposes, fund.purposes, fund.byPurpose]
  );
  const activeMembers = useMemo(() => fund.members.filter((m) => !m.archived), [fund.members]);

  const [purposeId, setPurposeId] = useState("");
  const [toPurposeId, setToPurposeId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayDateKey());
  const [recipient, setRecipient] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  // The month a contribution counts for. Defaults to the payment's month; a
  // payment made in November for October is moved back here.
  const [period, setPeriod] = useState(todayDateKey().slice(0, 7));
  const [periodTouched, setPeriodTouched] = useState(false);
  const [status, setStatus] = useState<MemberMonthStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const eventIdRef = useRef<string | null>(null);
  // True while the amount is our suggestion, so it follows the member and month.
  const amountAutoRef = useRef(true);

  useEffect(() => {
    if (!visible) return;
    eventIdRef.current = null;
    setPurposeId(initial?.purposeId ?? (sourcePurposes.length === 1 ? sourcePurposes[0].id : ""));
    setToPurposeId("");
    setMemberId(initial?.memberId ?? "");
    setAccountId(accounts.length === 1 ? accounts[0].id : "");
    setToAccountId("");
    setAmount(initial?.amount ? String(initial.amount) : "");
    amountAutoRef.current = true;
    setDate(todayDateKey());
    setRecipient("");
    setReference("");
    setNote("");
    setPeriod(initial?.period ?? todayDateKey().slice(0, 7));
    setPeriodTouched(Boolean(initial?.period));
    setStatus(null);
    // Reset only when the sheet opens or its mode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, mode]);

  const purpose = fund.purposes.find((p) => p.id === purposeId);
  const member = fund.members.find((m) => m.id === memberId);

  // The month follows the payment date until the user picks one.
  useEffect(() => {
    if (!periodTouched && /^\d{4}-\d{2}/.test(date)) setPeriod(date.slice(0, 7));
  }, [date, periodTouched]);

  // What this member already paid for this purpose and month (one bounded read).
  useEffect(() => {
    setStatus(null);
    if (mode !== "contribution" || !checkMemberMonth || !memberId || !purposeId) return;
    let live = true;
    void checkMemberMonth(memberId, purposeId, period).then((s) => {
      if (!live) return;
      setStatus(s);
      // Suggest what's still due (or the expected amount) when nothing was typed.
      if (s && s.expected !== null && amountAutoRef.current) {
        const pending = Math.max(0, s.expected - s.received);
        setAmount(pending > 0 ? String(pending) : "");
      }
    });
    return () => {
      live = false;
    };
  }, [mode, checkMemberMonth, memberId, purposeId, period]);

  // Without a member check (e.g. offline), still suggest the expected amount.
  useEffect(() => {
    if (mode === "contribution" && !checkMemberMonth && purpose?.expectedPerMember && !amount) setAmount(String(purpose.expectedPerMember));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purposeId]);

  const monthLabel = formatMonthLabel(period, settings.dateFormat, { long: true });

  const heldInPurpose = purpose ? fund.byPurpose[purpose.id]?.held ?? 0 : 0;
  const needsAccount = mode !== "transfer";
  const accountOptional = mode === "opening";

  const ready =
    Boolean(purposeId) &&
    Boolean(amount.trim()) &&
    (mode !== "contribution" || Boolean(memberId)) &&
    (!needsAccount || accountOptional || Boolean(accountId)) &&
    (mode !== "transfer" || Boolean(toPurposeId)) &&
    (mode !== "move" || Boolean(toAccountId));

  const submit = async () => {
    const value = parseGroupFundAmount(amount);
    if (!(value > 0)) {
      toast.error("Enter a valid amount.");
      return;
    }
    const warning =
      mode === "contribution" && status && member && purpose
        ? contributionDuplicateWarning({
            memberName: member.name,
            purposeName: purpose.name,
            monthLabel,
            expected: status.expected,
            received: status.received,
            amount: value,
            money,
          })
        : null;
    if (warning) {
      appDialog.show({
        title: "Already paid?",
        message: warning,
        buttons: [
          { text: "Check again", style: "cancel" },
          { text: "Record anyway", onPress: () => void save(value) },
        ],
      });
      return;
    }
    await save(value);
  };

  const save = async (value: number) => {
    // One id per submit: a retry after a failure reuses it, so it can't apply twice.
    eventIdRef.current ??= newEventId();
    setBusy(true);
    try {
      const ok = await onSubmit(eventIdRef.current, {
        purposeId,
        toPurposeId,
        memberId,
        accountId,
        toAccountId,
        amount: value,
        date,
        period,
        recipient,
        reference,
        note,
      });
      if (ok) {
        eventIdRef.current = null;
        onClose();
      }
    } finally {
      setBusy(false);
    }
  };

  const label = [styles.label, { color: theme.colors.foreground }];
  const helper = [styles.helper, { color: theme.colors.mutedForeground }];

  const chipRow = (
    items: { id: string; name: string }[],
    selected: string,
    onSelect: (id: string) => void,
    a11y: (name: string) => string,
    exclude?: string
  ) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {items
        .filter((i) => i.id !== exclude)
        .map((i) => (
          <Chip key={i.id} label={i.name} selected={selected === i.id} onPress={() => onSelect(i.id)} accessibilityLabel={a11y(i.name)} />
        ))}
    </ScrollView>
  );

  return (
    <Modal
      isOpen={visible}
      onClose={onClose}
      title={TITLES[mode]}
      footer={
        <SheetActions
          secondary={{ label: "Cancel", onPress: onClose }}
          primary={{ label: TITLES[mode], onPress: submit, disabled: busy || !ready, loading: busy }}
        />
      }
    >
      <View style={styles.body}>
        <Text style={helper}>{HINTS[mode]}</Text>

        {mode === "contribution" ? (
          <View style={styles.group}>
            <Text style={label}>Member *</Text>
            {activeMembers.length === 0 ? (
              <Text style={helper}>Add members to this fund first (Edit fund).</Text>
            ) : (
              chipRow(activeMembers, memberId, setMemberId, (n) => `Paid by ${n}`)
            )}
          </View>
        ) : null}

        <View style={styles.group}>
          <Text style={label}>{mode === "transfer" ? "From purpose *" : "Purpose *"}</Text>
          {chipRow(sourcePurposes, purposeId, setPurposeId, (n) => `Purpose ${n}`)}
          {purpose && (mode === "payout" || mode === "transfer") ? (
            <Text style={helper}>Holds {money(heldInPurpose)}</Text>
          ) : null}
        </View>

        {mode === "contribution" ? (
          <View style={styles.group}>
            <Text style={label}>Counts for</Text>
            <View style={styles.monthRow}>
              <Button
                variant="ghost"
                size="icon"
                onPress={() => {
                  setPeriodTouched(true);
                  setPeriod((p) => shiftMonthKey(p, -1));
                }}
                accessibilityLabel="Previous month"
              >
                <ChevronLeft size={18} color={theme.colors.foreground} />
              </Button>
              <Text style={[styles.monthText, { color: theme.colors.foreground }]}>{monthLabel}</Text>
              <Button
                variant="ghost"
                size="icon"
                onPress={() => {
                  setPeriodTouched(true);
                  setPeriod((p) => shiftMonthKey(p, 1));
                }}
                accessibilityLabel="Next month"
              >
                <ChevronRight size={18} color={theme.colors.foreground} />
              </Button>
            </View>
            {member && purpose && status ? (
              <Text
                style={[
                  helper,
                  status.expected !== null && status.received >= status.expected ? { color: theme.colors.warning } : null,
                ]}
                accessibilityLiveRegion="polite"
              >
                {status.expected !== null
                  ? status.received >= status.expected
                    ? `${member.name} has already paid ${money(status.received)} of ${money(status.expected)} for ${monthLabel}.`
                    : status.received > 0
                      ? `${member.name} paid ${money(status.received)} of ${money(status.expected)} for ${monthLabel}; ${money(status.expected - status.received)} still due.`
                      : `${member.name} hasn't paid for ${monthLabel} yet. Expected ${money(status.expected)}.`
                  : status.received > 0
                    ? `${member.name} already paid ${money(status.received)} for ${monthLabel}.`
                    : `Nothing recorded from ${member.name} for ${monthLabel} yet.`}
              </Text>
            ) : null}
          </View>
        ) : null}

        {mode === "transfer" ? (
          <View style={styles.group}>
            <Text style={label}>To purpose *</Text>
            {chipRow(activePurposes, toPurposeId, setToPurposeId, (n) => `To purpose ${n}`, purposeId)}
          </View>
        ) : null}

        <View style={styles.group}>
          <Text style={label}>Amount ({currency}) *</Text>
          <Input
            leadingIcon={<CurrencyPrefix />}
            value={amount}
            onChangeText={(v) => {
              amountAutoRef.current = false;
              setAmount(v);
            }}
            placeholder="e.g. 6000"
            keyboardType="decimal-pad"
            accessibilityLabel="Amount"
          />
        </View>

        {needsAccount ? (
          <View style={styles.group}>
            <Text style={label}>
              {mode === "contribution"
                ? "Received in *"
                : mode === "payout"
                  ? "Paid from *"
                  : mode === "move"
                    ? "From account *"
                    : "Held in (optional)"}
            </Text>
            {accounts.length === 0 ? (
              <Text style={helper}>Add a bank or cash account first.</Text>
            ) : (
              chipRow(accounts, accountId, setAccountId, (n) => `Account ${n}`)
            )}
          </View>
        ) : null}

        {mode === "move" ? (
          <View style={styles.group}>
            <Text style={label}>To account *</Text>
            {chipRow(accounts, toAccountId, setToAccountId, (n) => `To account ${n}`, accountId)}
          </View>
        ) : null}

        <View style={styles.group}>
          <Text style={label}>Date</Text>
          <DateField value={date} onChange={setDate} accessibilityLabel="Date" />
        </View>

        {mode === "payout" ? (
          <>
            <View style={styles.group}>
              <Text style={label}>Paid to (optional)</Text>
              <Input value={recipient} onChangeText={setRecipient} placeholder="e.g. Dokra centre" accessibilityLabel="Paid to" />
            </View>
            <View style={styles.group}>
              <Text style={label}>Reference (optional)</Text>
              <Input value={reference} onChangeText={setReference} placeholder="e.g. UTR or receipt no." accessibilityLabel="Reference" />
            </View>
          </>
        ) : null}

        <View style={styles.group}>
          <Text style={label}>Note (optional)</Text>
          <Input value={note} onChangeText={setNote} placeholder="Anything to remember" accessibilityLabel="Note" />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: { gap: 16, paddingBottom: 8 },
  group: { gap: 8 },
  label: { fontSize: 12, fontWeight: "700" },
  helper: { fontSize: 11 },
  chips: { flexDirection: "row", gap: 8 },
  monthRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  monthText: { fontSize: 14, fontWeight: "600", minWidth: 120, textAlign: "center" },
});
