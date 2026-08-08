import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Amount } from '@/components/common/Amount';
import { useTheme } from '@/theme/ThemeProvider';
import { themeUsesDarkPalette } from '@/theme/tokens';
import { TrendingUp, TrendingDown, ArrowLeftRight } from 'lucide-react-native';
import type { PortfolioSummary } from '@/shared/features/portfolio/types';

interface PortfolioSummaryCardProps {
  summary: PortfolioSummary;
  currency: string;
  onManageCash?: () => void;
}

export function PortfolioSummaryCard({ summary, currency, onManageCash }: PortfolioSummaryCardProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const isTodayPositive = summary.todayGainLoss >= 0;
  const isOverallPositive = summary.overallGainLoss >= 0;

  const textStyle = { color: theme.colors.foreground };
  const subTextStyle = { color: theme.colors.mutedForeground };
  const green = isDark ? '#4ade80' : '#16a34a';
  const red = isDark ? '#f87171' : '#dc2626';

  const todayColor = isTodayPositive ? green : red;
  const overallColor = isOverallPositive ? green : red;

  const TodayIcon = isTodayPositive ? TrendingUp : TrendingDown;

  return (
    <Card style={styles.card}>
      <View style={styles.heroSection}>
        <Text style={[styles.label, subTextStyle]}>Total Portfolio Value</Text>
        <Amount
          value={summary.portfolioValue}
          currency={currency}
          style={[styles.heroValue, textStyle]}
          ghostable
        />
        <View style={styles.todayReturnContainer}>
          <TodayIcon size={16} color={todayColor} />
          <Amount
            value={Math.abs(summary.todayGainLoss)}
            currency={currency}
            style={[styles.todayReturnAmount, { color: todayColor }]}
            prefix={isTodayPositive ? '+' : '-'}
            ghostable
          />
          <Text style={[styles.todayReturnPercent, { color: todayColor }]}>
            ({isTodayPositive ? '+' : ''}{summary.todayGainLossPercent.toFixed(2)}%)
          </Text>
          <Text style={[styles.todayReturnLabel, subTextStyle]}> Today</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={[styles.label, subTextStyle]}>Overall P&L</Text>
          <View style={styles.inlineAmount}>
            <Amount
              value={Math.abs(summary.overallGainLoss)}
              currency={currency}
              style={[styles.statValue, { color: overallColor }]}
              prefix={isOverallPositive ? '+' : '-'}
              ghostable
            />
            <Text style={[styles.statPercent, { color: overallColor }]}>
              {' '}({isOverallPositive ? '+' : ''}{summary.overallGainLossPercent.toFixed(2)}%)
            </Text>
          </View>
        </View>
        <Pressable
          onPress={onManageCash}
          style={({ pressed }) => [
            styles.statItem,
            onManageCash ? { opacity: pressed ? 0.7 : 1 } : null,
          ]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={[styles.label, subTextStyle]}>Cash Balance</Text>
            {onManageCash && (
              <ArrowLeftRight size={11} color={theme.colors.primary} />
            )}
          </View>
          <Amount
            value={summary.cashBalance}
            currency={currency}
            style={[styles.statValue, textStyle]}
            ghostable
          />
        </Pressable>
        <View style={styles.statItem}>
          <Text style={[styles.label, subTextStyle]}>Holdings</Text>
          <Text style={[styles.statValue, textStyle]}>{summary.totalHoldings}</Text>
        </View>
      </View>

      {(summary.topGainer || summary.topLoser) && (
        <View style={[styles.topMoversRow, { borderTopColor: theme.colors.border }]}>
          {summary.topGainer && (
            <View style={styles.moverBadge}>
              <Text style={[styles.moverSymbol, textStyle]}>{summary.topGainer.symbol}</Text>
              <Text style={[styles.moverReturn, { color: green }]}>
                +{summary.topGainer.dayChangePercent.toFixed(2)}%
              </Text>
            </View>
          )}
          {summary.topLoser && (
            <View style={[styles.moverBadge, { marginLeft: summary.topGainer ? 12 : 0 }]}>
              <Text style={[styles.moverSymbol, textStyle]}>{summary.topLoser.symbol}</Text>
              <Text style={[styles.moverReturn, { color: red }]}>
                {summary.topLoser.dayChangePercent.toFixed(2)}%
              </Text>
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 16,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  label: {
    fontSize: 13,
    marginBottom: 4,
    fontWeight: '500',
  },
  heroValue: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 8,
  },
  todayReturnContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayReturnAmount: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 4,
  },
  todayReturnPercent: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 4,
  },
  todayReturnLabel: {
    fontSize: 14,
    marginLeft: 4,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statItem: {
    flex: 1,
  },
  inlineAmount: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  statPercent: {
    fontSize: 13,
    fontWeight: '600',
  },
  topMoversRow: {
    flexDirection: 'row',
    paddingTop: 12,
    borderTopWidth: 1,
  },
  moverBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(150, 150, 150, 0.1)',
  },
  moverSymbol: {
    fontSize: 12,
    fontWeight: '600',
    marginRight: 6,
  },
  moverReturn: {
    fontSize: 12,
    fontWeight: '700',
  },
});
