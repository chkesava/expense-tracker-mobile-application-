import { useMemo } from "react";
import { useRouter } from "expo-router";
import {
  Building2,
  ClipboardList,
  FileBarChart,
  Gift,
  HandCoins,
  Landmark,
  Receipt,
  Wallet,
} from "lucide-react-native";

import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import {
  DataRow,
  FundHero,
  GaneshHeader,
  Money,
  NavRow,
  Section,
  StatusStrip,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { useContributions } from "@/hooks/useContributions";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshSummary } from "@/hooks/useGaneshSummary";
import { usePandalAssets } from "@/hooks/usePandalAssets";
import { usePermanentFund } from "@/hooks/usePermanentFund";
import { useSponsorships } from "@/hooks/useSponsorships";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { summarizeAssets } from "@/shared/utils/ganeshAssets";
import { summarizeContributions } from "@/shared/utils/ganeshContributions";
import { summarizeSponsorships } from "@/shared/utils/ganeshSponsors";
import {
  assetPurchaseAmountOf,
  availableGodFund,
  regularExpenseAmount,
  totalCashIn,
  totalExpenses,
} from "@/shared/utils/ganeshMath";
import { useTheme } from "@/theme/ThemeProvider";

function Line({
  label,
  value,
  divider,
  emphasis,
}: {
  label: string;
  value: number;
  divider?: boolean;
  emphasis?: boolean;
}) {
  return (
    <DataRow
      title={label}
      divider={divider}
      value={<Money value={value} size={emphasis ? "primary" : "secondary"} />}
    />
  );
}

export default function AdminReportsScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { push, back } = useRouter();
  const { pandalId, festivalId } = useGaneshSession();

  const { festivals } = useFestivals(pandalId);
  const { summary } = useGaneshSummary(pandalId, festivalId);
  const { contributions } = useContributions(pandalId, festivalId);
  const { sponsorships } = useSponsorships(pandalId, festivalId);
  const { assets } = usePandalAssets(pandalId);
  const { fund } = usePermanentFund(pandalId);

  const contributionTotals = useMemo(
    () => summarizeContributions(contributions),
    [contributions]
  );
  const sponsorTotals = useMemo(() => summarizeSponsorships(sponsorships), [sponsorships]);
  const assetSummary = useMemo(() => summarizeAssets(assets), [assets]);
  const festival = festivals.find((item) => item.id === festivalId);

  const glyph = (Icon: typeof Wallet) => (
    <Icon size={17} color={theme.colors.mutedForeground} strokeWidth={2.2} />
  );

  return (
    <GaneshScreen safeTop>
      <GaneshHeader
        title="Reports"
        subtitle={festival?.name}
        icon={<FileBarChart size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
      />

      <FundHero
        eyebrow="Closing God Fund"
        amount={availableGodFund(summary)}
        kind="god"
        breakdown={[
          { label: "Cash in", value: totalCashIn(summary) },
          { label: "Cash out", value: summary.godFundExpenses + summary.reimbursements },
        ]}
        action={{ label: "Full festival report", onPress: () => push("/(ganesh)/report" as never) }}
      />

      <Section title="This festival">
        <Line label="Total cash in" value={totalCashIn(summary)} divider />
        <Line label="God Fund expenses" value={summary.godFundExpenses} divider />
        <Line label="Reimbursements paid" value={summary.reimbursements} divider />
        <Line label="All expenses" value={totalExpenses(summary)} divider />
        <Line label="Regular spending" value={regularExpenseAmount(summary)} divider />
        <Line label="Asset purchases" value={assetPurchaseAmountOf(summary)} />
      </Section>

      <Section title="Funds that carry over">
        <Line label="Returned to Permanent Fund" value={summary.transferredToPermanentFund} divider />
        <Line label="Permanent Fund balance" value={fund.total} divider emphasis />
        <Line label="Pandal asset worth" value={assetSummary.estimatedValue} />
      </Section>

      <Section
        title="Promised vs received"
        subtitle="Promised and cancelled amounts are not cash and are not in the closing balance."
      >
        <Line label="Contributions received" value={contributionTotals.cashReceived} divider />
        <Line label="Contributions promised" value={contributionTotals.promisedCash} divider />
        <Line label="In-kind received" value={contributionTotals.inKindReceived} divider />
        <Line label="In-kind promised" value={contributionTotals.promisedInKind} divider />
        <Line label="Cancelled" value={contributionTotals.cancelledValue} />
      </Section>

      <Section
        title="Sponsors"
        subtitle="Separate from the closing balance. Expense sponsorship is never income."
      >
        <Line label="Cash received" value={sponsorTotals.cashReceived} divider />
        <Line label="Cash promised" value={sponsorTotals.promisedCash} divider />
        <Line label="In-kind received" value={sponsorTotals.inKindReceived} divider />
        <Line label="In-kind promised" value={sponsorTotals.promisedInKind} divider />
        <Line label="Cancelled" value={sponsorTotals.cancelledValue} />
      </Section>

      <Section title="Open the list behind a number">
        <NavRow
          title="Festival summary"
          meta="Cash in, expenses, and closing balance"
          icon={glyph(FileBarChart)}
          divider
          onPress={() => push("/(ganesh)/report" as never)}
        />
        <NavRow
          title="Collections"
          meta="Households, collectors, and payment methods"
          icon={glyph(Wallet)}
          divider
          onPress={() => push("/(ganesh)/collections" as never)}
        />
        <NavRow
          title="Expenses"
          meta="God Fund, personal, and pending reimbursements"
          icon={glyph(Receipt)}
          divider
          onPress={() => push("/(ganesh)/expenses" as never)}
        />
        <NavRow
          title="Committee contributions"
          meta="Who paid this festival"
          icon={glyph(ClipboardList)}
          divider
          onPress={() => push("/(ganesh)/committee" as never)}
        />
        <NavRow
          title="Contributions"
          meta="Received, promised, in-kind, and cancelled"
          icon={glyph(Gift)}
          divider
          onPress={() => push("/(ganesh)/contributions" as never)}
        />
        <NavRow
          title="Sponsors"
          meta="Deals per sponsor, and what has actually arrived"
          icon={glyph(Building2)}
          divider
          onPress={() => push("/(ganesh)/sponsors" as never)}
        />
        <NavRow
          title="Reimbursements"
          meta="Personal money still to be paid back"
          icon={glyph(HandCoins)}
          divider
          onPress={() => push("/(ganesh)/committee" as never)}
        />
        <NavRow
          title="Permanent Fund history"
          meta="Donations and festival transfers"
          icon={glyph(Landmark)}
          onPress={() => push("/(ganesh)/permanent-fund" as never)}
        />
      </Section>

      <StatusStrip
        tone="muted"
        message="These are running totals for the current festival. The full report has the complete statement."
      />
    </GaneshScreen>
  );
}
