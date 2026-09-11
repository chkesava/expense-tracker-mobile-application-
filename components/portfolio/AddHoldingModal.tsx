import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Text, Modal, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useTheme } from '@/theme/ThemeProvider';
import { themeUsesDarkPalette } from '@/theme/tokens';
import { X } from 'lucide-react-native';
import { Amount } from '@/components/common/Amount';
import { newId } from '@/lib/id';
import { addHoldingSchema } from '@/shared/features/portfolio/schemas';
import type { HoldingFundingSource } from '@/shared/features/portfolio/schemas';
import {
  canAfford,
  holdingPurchaseAmount,
} from '@/shared/features/portfolio/utils/investmentCash';
import type { Holding, InstrumentType, Exchange, Broker } from '@/shared/features/portfolio/types';

export type AddHoldingOptions = {
  fundingSource: HoldingFundingSource;
  /** Minted once per open so a retried submit rewrites the same docs. */
  entryId: string;
  holdingId: string;
};

interface AddHoldingModalProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (
    params: Omit<Holding, 'id' | 'createdAt' | 'updatedAt'>,
    options: AddHoldingOptions
  ) => Promise<string | null>;
  /** Spendable investment cash, derived from the cash ledger. */
  availableCash: number;
  currency: string;
  /** Opens the top-up flow so the user can fund the purchase first. */
  onAddCash?: () => void;
}

const INSTRUMENTS: { label: string; value: InstrumentType }[] = [
  { label: 'Stock', value: 'stock' },
  { label: 'ETF', value: 'etf' },
  { label: 'Mutual Fund', value: 'mutual_fund' },
  { label: 'Crypto', value: 'crypto' },
];

const EXCHANGES: { label: string; value: Exchange }[] = [
  { label: 'NSE', value: 'NSE' },
  { label: 'BSE', value: 'BSE' },
  { label: 'US', value: 'US' },
];

const BROKERS: { label: string; value: Broker }[] = [
  { label: 'Zerodha', value: 'Zerodha' },
  { label: 'Groww', value: 'Groww' },
  { label: 'Upstox', value: 'Upstox' },
  { label: 'Angel One', value: 'Angel One' },
  { label: 'Other', value: 'Other' },
];

export function AddHoldingModal({
  visible,
  onClose,
  onAdd,
  availableCash,
  currency,
  onAddCash,
}: AddHoldingModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const [instrument, setInstrument] = useState<InstrumentType>('stock');
  const [exchange, setExchange] = useState<Exchange>('NSE');
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [broker, setBroker] = useState<Broker>('Zerodha');

  const [fundingSource, setFundingSource] = useState<HoldingFundingSource>('investment_cash');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  /**
   * Minted once per open and reused across retries, so re-submitting after a
   * timeout rewrites the same holding and the same cash entry instead of
   * deducting twice.
   */
  const writeIds = useRef({ holdingId: newId(), entryId: newId() });

  const purchaseAmount = useMemo(
    () => holdingPurchaseAmount(parseFloat(quantity), parseFloat(price)),
    [quantity, price]
  );
  const affordability = useMemo(
    () => canAfford(availableCash, purchaseAmount),
    [availableCash, purchaseAmount]
  );
  const deductsCash = fundingSource === 'investment_cash' && purchaseAmount > 0;
  const cashAfter = deductsCash ? availableCash - purchaseAmount : availableCash;

  // Someone recording a portfolio they already own has no investment cash to
  // spend; defaulting them to "deduct" would only ever show them a shortfall.
  useEffect(() => {
    if (!visible) return;
    if (availableCash <= 0) setFundingSource('external');
  }, [visible, availableCash]);

  const resetForm = () => {
    setInstrument('stock');
    setExchange('NSE');
    setSymbol('');
    setName('');
    setQuantity('');
    setPrice('');
    setTargetPrice('');
    setBroker('Zerodha');
    setFundingSource(availableCash > 0 ? 'investment_cash' : 'external');
    setError('');
    writeIds.current = { holdingId: newId(), entryId: newId() };
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    try {
      setError('');
      if (!symbol.trim() || !name.trim() || !quantity || !price) {
        setError('Please fill all required fields');
        return;
      }

      const numQty = parseFloat(quantity);
      const numPrice = parseFloat(price);

      if (isNaN(numQty) || numQty <= 0) {
        setError('Invalid quantity');
        return;
      }

      if (isNaN(numPrice) || numPrice <= 0) {
        setError('Invalid price');
        return;
      }

      setLoading(true);

      const normalizedSymbol = symbol.trim().toUpperCase();
      const yahooSymbol = instrument === 'mutual_fund'
        ? normalizedSymbol
        : instrument === 'crypto'
          ? symbol.trim().toLowerCase()
          : exchange === 'NSE'
            ? `${normalizedSymbol}.NS`
            : exchange === 'BSE'
              ? `${normalizedSymbol}.BO`
              : normalizedSymbol;
      if (fundingSource === 'investment_cash' && !affordability.ok) {
        setError(
          `Not enough investment cash — you are short ${currency}${affordability.shortfall.toLocaleString('en-IN')}. Add cash from a bank account, or record this as a holding you already own.`
        );
        return;
      }

      const parsed = addHoldingSchema.safeParse({
        symbol: normalizedSymbol,
        yahooSymbol,
        name: name.trim(),
        exchange,
        instrumentType: instrument,
        quantity: numQty,
        averageBuyPrice: numPrice,
        targetPrice: targetPrice ? parseFloat(targetPrice) : undefined,
        broker,
      });
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? 'Invalid holding details');
        return;
      }

      const added = await onAdd(parsed.data, {
        fundingSource,
        holdingId: writeIds.current.holdingId,
        entryId: writeIds.current.entryId,
      });
      if (!added) {
        setError('Failed to add holding');
        return;
      }

      handleClose();
    } catch (err: any) {
      setError(err.message || 'Failed to add holding');
    } finally {
      setLoading(false);
    }
  };

  const textStyle = { color: theme.colors.foreground };
  const cardBg = { backgroundColor: theme.colors.card };
  const primaryBg = { backgroundColor: theme.colors.primary };
  const primaryText = { color: theme.colors.primaryForeground };
  const unselectedBg = { backgroundColor: theme.colors.muted };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={[styles.modalContent, cardBg]}>
            <View style={styles.header}>
              <Text style={[styles.title, textStyle]}>Add Holding</Text>
              <TouchableOpacity
                onPress={handleClose}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={styles.closeBtn}
              >
                <X size={24} color={theme.colors.foreground} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

              <Text style={[styles.sectionTitle, textStyle]}>Instrument Type</Text>
              <View style={styles.pillsRow}>
                {INSTRUMENTS.map((inst) => (
                  <TouchableOpacity
                    key={inst.value}
                    style={[styles.pill, instrument === inst.value ? primaryBg : unselectedBg]}
                    onPress={() => setInstrument(inst.value)}
                  >
                    <Text style={[styles.pillText, instrument === inst.value ? primaryText : textStyle]}>
                      {inst.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={[styles.sectionTitle, textStyle]}>Exchange</Text>
                  <View style={styles.pillsRow}>
                    {EXCHANGES.map((ex) => (
                      <TouchableOpacity
                        key={ex.value}
                        style={[styles.pill, exchange === ex.value ? primaryBg : unselectedBg, { flex: 1 }]}
                        onPress={() => setExchange(ex.value)}
                      >
                        <Text style={[styles.pillText, exchange === ex.value ? primaryText : textStyle, { textAlign: 'center' }]}>
                          {ex.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              <Input
                label="Symbol"
                placeholder="e.g. RELIANCE"
                value={symbol}
                onChangeText={setSymbol}
                autoCapitalize="characters"
              />

              <Input
                label="Name"
                placeholder="e.g. Reliance Industries Ltd."
                value={name}
                onChangeText={setName}
              />

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Input
                    label="Quantity"
                    placeholder="0"
                    value={quantity}
                    onChangeText={setQuantity}
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Input
                    label="Avg. Price"
                    placeholder="0.00"
                    value={price}
                    onChangeText={setPrice}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <Input
                label="Target Price (Optional)"
                placeholder="0.00"
                value={targetPrice}
                onChangeText={setTargetPrice}
                keyboardType="numeric"
              />

              <Text style={[styles.sectionTitle, textStyle]}>Broker (Optional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.brokerScroll}>
                {BROKERS.map((b) => (
                  <TouchableOpacity
                    key={b.value}
                    style={[styles.pill, broker === b.value ? primaryBg : unselectedBg]}
                    onPress={() => setBroker(b.value)}
                  >
                    <Text style={[styles.pillText, broker === b.value ? primaryText : textStyle]}>
                      {b.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={[styles.sectionTitle, textStyle]}>Funding</Text>
              <View
                style={[
                  styles.fundingCard,
                  { borderColor: theme.colors.border, backgroundColor: theme.colors.muted },
                ]}
              >
                <View style={styles.fundingRow}>
                  <Text style={[styles.fundingLabel, { color: theme.colors.mutedForeground }]}>
                    Investment cash available
                  </Text>
                  <Amount
                    value={availableCash}
                    currency={currency}
                    style={[styles.fundingValue, textStyle]}
                  />
                </View>
                <View style={styles.fundingRow}>
                  <Text style={[styles.fundingLabel, { color: theme.colors.mutedForeground }]}>
                    This purchase
                  </Text>
                  <Amount
                    value={purchaseAmount}
                    currency={currency}
                    style={[styles.fundingValue, textStyle]}
                  />
                </View>

                <View style={styles.fundingOptions}>
                  <TouchableOpacity
                    disabled={!affordability.ok}
                    onPress={() => setFundingSource('investment_cash')}
                    style={[
                      styles.fundingOption,
                      {
                        borderColor:
                          fundingSource === 'investment_cash'
                            ? theme.colors.primary
                            : theme.colors.border,
                        opacity: affordability.ok ? 1 : 0.45,
                      },
                      fundingSource === 'investment_cash' ? primaryBg : cardBg,
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: fundingSource === 'investment_cash', disabled: !affordability.ok }}
                  >
                    <Text
                      style={[
                        styles.fundingOptionText,
                        fundingSource === 'investment_cash' ? primaryText : textStyle,
                      ]}
                    >
                      Use investment cash
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setFundingSource('external')}
                    style={[
                      styles.fundingOption,
                      {
                        borderColor:
                          fundingSource === 'external' ? theme.colors.primary : theme.colors.border,
                      },
                      fundingSource === 'external' ? primaryBg : cardBg,
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: fundingSource === 'external' }}
                  >
                    <Text
                      style={[
                        styles.fundingOptionText,
                        fundingSource === 'external' ? primaryText : textStyle,
                      ]}
                    >
                      Already own it
                    </Text>
                  </TouchableOpacity>
                </View>

                {deductsCash ? (
                  <View style={styles.fundingRow}>
                    <Text style={[styles.fundingLabel, { color: theme.colors.mutedForeground }]}>
                      Cash after this purchase
                    </Text>
                    <Amount
                      value={cashAfter}
                      currency={currency}
                      style={[styles.fundingValue, textStyle]}
                    />
                  </View>
                ) : (
                  <Text style={[styles.fundingHint, { color: theme.colors.mutedForeground }]}>
                    Recorded as a holding you bought outside the app. Your investment cash balance
                    will not change.
                  </Text>
                )}

                {!affordability.ok && purchaseAmount > 0 ? (
                  <View style={styles.fundingShortfall}>
                    <Text style={[styles.fundingHint, { color: theme.colors.mutedForeground }]}>
                      Short by {currency}
                      {affordability.shortfall.toLocaleString('en-IN')} to fund this from investment
                      cash.
                    </Text>
                    {onAddCash ? (
                      <TouchableOpacity onPress={onAddCash} accessibilityRole="button">
                        <Text style={[styles.fundingLink, { color: theme.colors.primary }]}>
                          Add cash from a bank account
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : null}
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <Button
                onPress={handleSubmit}
                loading={loading}
                style={styles.submitBtn}
              >
                <Text style={{ color: theme.colors.primaryForeground, fontWeight: '700' }}>Add Holding</Text>
              </Button>

              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fundingCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 10,
    marginBottom: 8,
  },
  fundingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fundingLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  fundingValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  fundingOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  fundingOption: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  fundingOptionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  fundingHint: {
    fontSize: 12,
    lineHeight: 17,
  },
  fundingShortfall: {
    gap: 4,
  },
  fundingLink: {
    fontSize: 13,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '90%',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
    marginTop: 10,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 8,
    marginRight: 8,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '500',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  brokerScroll: {
    marginBottom: 20,
  },
  errorText: {
    color: '#ef4444',
    marginBottom: 16,
    textAlign: 'center',
  },
  submitBtn: {
    marginTop: 10,
  },
});
