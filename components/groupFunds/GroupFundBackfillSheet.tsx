import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";

import { CurrencyPrefix } from "@/components/common/CurrencyPrefix";
import { DateField } from "@/components/common/DateField";
import { LoadingState } from "@/components/common/LoadingState";
import { Modal } from "@/components/common/Modal";
import { SheetActions } from "@/components/common/SheetActions";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { useGroupFundMonth } from "@/hooks/useGroupFundMonth";
import { toast } from "@/lib/toast";
import { useSettings } from "@/providers/SettingsProvider";
import type { GroupFund, GroupFundEvent } from "@/shared/types/groupFund";
import { formatMonthLabel } from "@/shared/utils/dateDisplay";
import { shiftMonthKey, todayDateKey } from "@/shared/utils/dates";
import { memberMonthStatus } from "@/shared/utils/groupFundMath";
import { fundStartPeriod, memberOwesIn, parseGroupFundAmount } from "@/shared/utils/groupFundModel";
import { groupFundBackfillId, type BackfillContributionInput } from "@/shared/utils/groupFundWrites";
import { useTheme } from "@/theme/ThemeProvider";

type RowDraft = { include: boolean; amount: string };

export type GroupFundBackfillSheetProps = {
  visible: boolean;
  fund: GroupFund;
  accounts: { id: string; name: string }[];
  currency: string;
  /** This device's newest events, laid over the read-model copy (R3.4). */
  recentEvents?: readonly GroupFundEvent[];
  onClose: () => void;
  onSubmit: (rows: BackfillContributionInput[], monthLabel: string) => Promise<boolean>;
};

/**
 * SPENDLY-700: record a past month by hand, the whole group at once. No cron.
 *
 * The money from past months is almost always already in the bank, so
 * "Already in my balance" is the default: it counts for each member and the
 * month, but moves no account balance (otherwise it would be counted twice).
 * Each member's month has a fixed id, so a month already recorded for them is
 * shown as done and can't be recorded again.
 */
export function GroupFundBackfillSheet({ visible, fund, accounts, currency, recentEvents, onClose, onSubmit }: GroupFundBackfillSheetProps) {
  const { theme } = useTheme();
  const { settings } = useSettings();
  const money = useGhostMoney(currency);
  const currentPeriod = todayDateKey().slice(0, 7);
  const start = fundStartPeriod(fund);
  const purposes = useMemo(() => fund.purposes.filter((p) => p.cadence === "monthly"), [fund.purposes]);

  const [period, setPeriod] = useState(shiftMonthKey(currentPeriod, -1));
  const [purposeId, setPurposeId] = useState("");
  const [alreadyInBalance, setAlreadyInBalance] = useState(true);
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState(todayDateKey());
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const previous = shiftMonthKey(currentPeriod, -1);
    setPeriod(start && previous < start ? start : previous);
    setPurposeId(purposes.find((p) => !p.archived && p.expectedPerMember)?.id ?? purposes[0]?.id ?? "");
    setAlreadyInBalance(true);
    setAccountId("");
    setDate(todayDateKey());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const month = useGroupFundMonth(visible ? fund.id : undefined, period, fund.version, recentEvents);
  const purpose = fund.purposes.find((p) => p.id === purposeId);
  const members = useMemo(() => fund.members.filter((m) => memberOwesIn(m, period)), [fund.members, period]);
  const recordedIds = useMemo(() => new Set(month.events.map((e) => e.id)), [month.events]);

  const rows = useMemo(
    () =>
      members.map((m) => {
        const status = memberMonthStatus(fund, month.events, m.id, purposeId, period);
        const expected = status.expected ?? 0;
        const pending = Math.max(0, expected - status.received);
        const recorded = recordedIds.has(groupFundBackfillId(fund.id, period, purposeId, m.id));
        return { member: m, received: status.received, expected, pending, recorded };
      }),
    [members, fund, month.events, purposeId, period, recordedIds]
  );

  // Fresh defaults whenever the month or purpose changes: include whoever still owes.
  useEffect(() => {
    const next: Record<string, RowDraft> = {};
    for (const r of rows) {
      const suggest = r.pending > 0 ? r.pending : r.expected > 0 && r.received === 0 ? r.expected : 0;
      next[r.member.id] = { include: !r.recorded && suggest > 0, amount: suggest > 0 ? String(suggest) : "" };
    }
    setDrafts(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, purposeId, month.loading]);

  const chosen = rows.filter((r) => !r.recorded && drafts[r.member.id]?.include);
  const total = chosen.reduce((sum, r) => sum + (parseGroupFundAmount(drafts[r.member.id]?.amount ?? "") || 0), 0);
  const monthLabel = formatMonthLabel(period, settings.dateFormat, { long: true });
  const canGoBack = !start || period > start;
  const ready = chosen.length > 0 && Boolean(purposeId) && (alreadyInBalance || Boolean(accountId));

  const submit = async () => {
    const built: BackfillContributionInput[] = [];
    for (const r of chosen) {
      const amount = parseGroupFundAmount(drafts[r.member.id]?.amount ?? "");
      if (!(amount > 0)) {
        toast.error(`Enter an amount for ${r.member.name}, or untick them.`);
        return;
      }
      built.push({
        purposeId,
        memberId: r.member.id,
        period,
        amount,
        alreadyInBalance,
        accountId: accountId || undefined,
        ...(alreadyInBalance ? {} : { date }),
      });
    }
    setBusy(true);
    try {
      const ok = await onSubmit(built, monthLabel);
      if (ok) onClose();
    } finally {
      setBusy(false);
    }
  };

  const label = [styles.label, { color: theme.colors.foreground }];
  const helper = [styles.helper, { color: theme.colors.mutedForeground }];

  return (
    <Modal
      isOpen={visible}
      onClose={onClose}
      title="Record past months"
      footer={
        <SheetActions
          secondary={{ label: "Cancel", onPress: onClose }}
          primary={{
            label: chosen.length > 0 ? `Record ${chosen.length} · ${money(total)}` : "Record",
            onPress: submit,
            disabled: busy || !ready,
            loading: busy,
          }}
        />
      }
    >
      <View style={styles.body}>
        <Text style={helper}>
          For payments members made before you tracked them here. You enter it yourself; nothing is filled in automatically.
        </Text>

        <View style={styles.monthRow}>
          <Button
            variant="ghost"
            size="icon"
            onPress={() => setPeriod((p) => shiftMonthKey(p, -1))}
            disabled={!canGoBack}
            accessibilityLabel="Previous month"
          >
            <ChevronLeft size={18} color={canGoBack ? theme.colors.foreground : theme.colors.mutedForeground} />
          </Button>
          <Text style={[styles.monthText, { color: theme.colors.foreground }]}>{monthLabel}</Text>
          <Button
            variant="ghost"
            size="icon"
            onPress={() => setPeriod((p) => shiftMonthKey(p, 1))}
            disabled={period >= currentPeriod}
            accessibilityLabel="Next month"
          >
            <ChevronRight size={18} color={period < currentPeriod ? theme.colors.foreground : theme.colors.mutedForeground} />
          </Button>
        </View>
        {start && period === start ? <Text style={helper}>This is the fund's first month. Change "Collection starts" in Edit fund to go further back.</Text> : null}

        {purposes.length > 1 ? (
          <View style={styles.group}>
            <Text style={label}>Purpose</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {purposes.map((p) => (
                <Chip key={p.id} label={p.name} selected={purposeId === p.id} onPress={() => setPurposeId(p.id)} />
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.group}>
          <Text style={label}>Where is this money now?</Text>
          <View style={styles.wrap}>
            <Chip label="Already in my balance" selected={alreadyInBalance} onPress={() => setAlreadyInBalance(true)} />
            <Chip label="Not in my balance yet" selected={!alreadyInBalance} onPress={() => setAlreadyInBalance(false)} />
          </View>
          <Text style={helper}>
            {alreadyInBalance
              ? "No account balance changes. Use this when the money already reached your bank or cash. Pick the account below to show where it sits (optional)."
              : "The account below goes up once, today. Use this only if the money hasn't been added to any account yet."}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {alreadyInBalance ? <Chip label="Don't say" selected={!accountId} onPress={() => setAccountId("")} /> : null}
            {accounts.map((a) => (
              <Chip key={a.id} label={a.name} selected={accountId === a.id} onPress={() => setAccountId(a.id)} />
            ))}
          </ScrollView>
          {alreadyInBalance ? null : <DateField value={date} onChange={setDate} accessibilityLabel="Date received" />}
        </View>

        <View style={styles.group}>
          <Text style={label}>Members</Text>
          {month.loading ? (
            <LoadingState variant="spinner" />
          ) : rows.length === 0 ? (
            <Text style={helper}>Nobody owed anything for {monthLabel}.</Text>
          ) : (
            rows.map((r) => {
              const draft = drafts[r.member.id] ?? { include: false, amount: "" };
              return (
                <View key={r.member.id} style={[styles.row, { borderColor: theme.colors.border }]}>
                  <View style={styles.flex}>
                    <Text style={[styles.name, { color: theme.colors.foreground }]}>{r.member.name}</Text>
                    <Text style={helper}>
                      {r.recorded
                        ? "Already recorded for this month"
                        : r.expected > 0
                          ? `Paid ${money(r.received)} of ${money(r.expected)}`
                          : r.received > 0
                            ? `Paid ${money(r.received)}`
                            : "Nothing recorded"}
                    </Text>
                  </View>
                  {r.recorded ? (
                    <Chip label="Done" size="sm" disabled />
                  ) : (
                    <>
                      <View style={styles.amount}>
                        <Input
                          leadingIcon={<CurrencyPrefix />}
                          value={draft.amount}
                          onChangeText={(v) => setDrafts((d) => ({ ...d, [r.member.id]: { include: true, amount: v } }))}
                          keyboardType="decimal-pad"
                          accessibilityLabel={`Amount from ${r.member.name}`}
                        />
                      </View>
                      <Chip
                        label={draft.include ? "Paid" : "Skip"}
                        size="sm"
                        selected={draft.include}
                        onPress={() => setDrafts((d) => ({ ...d, [r.member.id]: { ...draft, include: !draft.include } }))}
                        accessibilityLabel={draft.include ? `${r.member.name} paid. Tap to skip` : `Skip ${r.member.name}. Tap to include`}
                      />
                    </>
                  )}
                </View>
              );
            })
          )}
        </View>
        {purpose && !purpose.expectedPerMember ? (
          <Text style={helper}>This purpose has no expected amount, so enter what each member paid.</Text>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: { gap: 16, paddingBottom: 8 },
  group: { gap: 8 },
  label: { fontSize: 12, fontWeight: "700" },
  helper: { fontSize: 11 },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  monthText: { fontSize: 15, fontWeight: "700", minWidth: 140, textAlign: "center" },
  chips: { flexDirection: "row", gap: 8 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  name: { fontSize: 14, fontWeight: "600" },
  amount: { width: 120 },
  flex: { flex: 1 },
});
