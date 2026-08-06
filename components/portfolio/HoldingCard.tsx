import React from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Amount } from '@/components/common/Amount';
import { useTheme } from '@/theme/ThemeProvider';
import { themeUsesDarkPalette } from '@/theme/tokens';
import type { HoldingWithMetrics, InstrumentType } from '@/shared/features/portfolio/types';

interface HoldingCardProps {
  holding: HoldingWithMetrics;
  currency: string;
  onPress: () => void;
}

const INSTRUMENT_COLORS: Record<InstrumentType | string, string> = {
  stock: '#3b82f6', // blue
  mutual_fund: '#a855f7', // purple
  crypto: '#f97316', // orange
  etf: '#14b8a6', // teal
  gold: '#eab308', // yellow
};

export function HoldingCard({ holding, currency, onPress }: HoldingCardProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const isPositive = holding.dayChange >= 0;
  const green = isDark ? '#4ade80' : '#16a34a';
  const red = isDark ? '#f87171' : '#dc2626';
  const returnColor = isPositive ? green : red;

  const textStyle = { color: theme.colors.foreground };
  const subTextStyle = { color: theme.colors.mutedForeground };
  const cardBg = { backgroundColor: theme.colors.card };
  const borderColor = { borderColor: theme.colors.border };

  const instrumentColor = INSTRUMENT_COLORS[holding.instrumentType] || '#888';

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={[styles.card, cardBg, borderColor]}
    >
      <View style={styles.leftContent}>
        <View style={styles.symbolRow}>
          <View style={[styles.colorIndicator, { backgroundColor: instrumentColor }]} />
          <Text style={[styles.symbol, textStyle]} numberOfLines={1}>
            {holding.symbol}
          </Text>
          <View style={[styles.exchangeTag, { backgroundColor: theme.colors.muted }]}>
            <Text style={[styles.exchangeText, { color: theme.colors.mutedForeground }]}>
              {holding.exchange}
            </Text>
          </View>
        </View>
        <Text style={[styles.name, subTextStyle]} numberOfLines={1}>
          {holding.name}
        </Text>
        <Text style={[styles.qtyPrice, subTextStyle]}>
          {holding.quantity} @ <Amount value={holding.averageBuyPrice} currency={currency} style={styles.inlineAmount} />
        </Text>
      </View>

      <View style={styles.rightContent}>
        <View style={styles.valueRow}>
          <Amount
            value={holding.currentValue}
            currency={currency}
            style={[styles.currentValue, textStyle]}
            ghostable
          />
          <View style={[styles.liveIndicator, { backgroundColor: holding.hasLiveQuote ? green : '#9ca3af' }]} />
        </View>

        <View style={[styles.returnBadge, { backgroundColor: isPositive ? 'rgba(74, 222, 128, 0.1)' : 'rgba(248, 113, 113, 0.1)' }]}>
          <Amount
            value={Math.abs(holding.dayChange)}
            currency={currency}
            style={[styles.returnValue, { color: returnColor }]}
            prefix={isPositive ? '+' : '-'}
            ghostable
          />
          <Text style={[styles.returnPercent, { color: returnColor }]}>
            {' '}({isPositive ? '+' : ''}{holding.dayChangePercent.toFixed(2)}%)
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  leftContent: {
    flex: 1,
    paddingRight: 12,
  },
  symbolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  colorIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  symbol: {
    fontSize: 16,
    fontWeight: '700',
    marginRight: 6,
  },
  exchangeTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  exchangeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  name: {
    fontSize: 13,
    marginBottom: 4,
  },
  qtyPrice: {
    fontSize: 12,
  },
  inlineAmount: {
    fontSize: 12,
  },
  rightContent: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  currentValue: {
    fontSize: 16,
    fontWeight: '700',
    marginRight: 6,
  },
  liveIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  returnBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  returnValue: {
    fontSize: 12,
    fontWeight: '600',
  },
  returnPercent: {
    fontSize: 12,
    fontWeight: '700',
  },
});
