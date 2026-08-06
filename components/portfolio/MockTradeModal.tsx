import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, Modal, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Amount } from '@/components/common/Amount';
import { useTheme } from '@/theme/ThemeProvider';
import { themeUsesDarkPalette } from '@/theme/tokens';
import { X } from 'lucide-react-native';
import type { Holding, HoldingWithMetrics } from '@/shared/features/portfolio/types';

interface MockTradeModalProps {
  visible: boolean;
  holding: HoldingWithMetrics | null;
  onClose: () => void;
  onBuy: (holdingId: string, qty: number, price: number, fees: number) => Promise<boolean>;
  onSell: (holdingId: string, qty: number, price: number, fees: number) => Promise<boolean>;
  onPlaceLimitBuy: (holding: Holding, qty: number, targetPrice: number) => Promise<boolean>;
  cashBalance: number;
  currency: string;
}

export function MockTradeModal({ visible, holding, onClose, onBuy, onSell, onPlaceLimitBuy, cashBalance, currency }: MockTradeModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const [tradeType, setTradeType] = useState<'BUY' | 'SELL'>('BUY');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [fees, setFees] = useState('0');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (holding && visible) {
      setPrice(holding.currentPrice.toString());
      setQuantity('');
      setFees('0');
      setOrderType('MARKET');
      setError('');
    }
  }, [holding, visible]);

  const handleClose = () => {
    setQuantity('');
    setError('');
    onClose();
  };

  const numQty = parseFloat(quantity) || 0;
  const numPrice = parseFloat(price) || 0;
  const numFees = parseFloat(fees) || 0;

  const totalAmount = (numQty * numPrice) + (tradeType === 'BUY' ? numFees : -numFees);

  const handleSubmit = async () => {
    if (!holding) return;

    try {
      setError('');
      if (numQty <= 0) {
        setError('Quantity must be greater than 0');
        return;
      }
      if (numPrice <= 0) {
        setError('Price must be greater than 0');
        return;
      }

      setLoading(true);
      let success = false;
      if (tradeType === 'BUY') {
        if (orderType === 'MARKET' && totalAmount > cashBalance) {
          setError('Insufficient cash balance');
          setLoading(false);
          return;
        }
        success = orderType === 'LIMIT'
          ? await onPlaceLimitBuy(holding, numQty, numPrice)
          : await onBuy(holding.id, numQty, numPrice, numFees);
      } else {
        if (numQty > holding.quantity) {
          setError('Insufficient holdings quantity');
          setLoading(false);
          return;
        }
        success = await onSell(holding.id, numQty, numPrice, numFees);
      }

      if (success) {
        handleClose();
      } else {
        setError('Trade failed');
      }
    } catch (err: any) {
      setError(err.message || 'Trade failed');
    } finally {
      setLoading(false);
    }
  };

  const textStyle = { color: theme.colors.foreground };
  const subTextStyle = { color: theme.colors.mutedForeground };
  const cardBg = { backgroundColor: theme.colors.card };
  const unselectedBg = { backgroundColor: theme.colors.muted };

  const buyBg = { backgroundColor: isDark ? '#166534' : '#22c55e' }; // green
  const sellBg = { backgroundColor: isDark ? '#991b1b' : '#ef4444' }; // red
  const activeBg = tradeType === 'BUY' ? buyBg : sellBg;

  if (!holding) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={[styles.modalContent, cardBg]}>
            <View style={styles.header}>
              <Text style={[styles.title, textStyle]}>Trade {holding.symbol}</Text>
              <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
                <X size={24} color={theme.colors.foreground} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  style={[styles.toggleBtn, tradeType === 'BUY' ? buyBg : unselectedBg]}
                  onPress={() => setTradeType('BUY')}
                >
                  <Text style={[styles.toggleText, tradeType === 'BUY' ? { color: '#fff' } : textStyle]}>BUY</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleBtn, tradeType === 'SELL' ? sellBg : unselectedBg]}
                  onPress={() => setTradeType('SELL')}
                >
                  <Text style={[styles.toggleText, tradeType === 'SELL' ? { color: '#fff' } : textStyle]}>SELL</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.holdingInfo}>
                <Text style={[styles.infoText, subTextStyle]}>
                  Current Position: {holding.quantity} Shares @ Average Buy: <Amount value={holding.averageBuyPrice} currency={currency} style={styles.inlineAmount} />
                </Text>
              </View>

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
                    label="Price"
                    placeholder="0.00"
                    value={price}
                    onChangeText={setPrice}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={[styles.fieldLabel, subTextStyle]}>Order Type</Text>
                  <View style={styles.orderTypeRow}>
                    {(['MARKET', 'LIMIT'] as const).map((type) => {
                      const active = orderType === type;
                      return (
                        <TouchableOpacity
                          key={type}
                          disabled={tradeType === 'SELL'}
                          onPress={() => setOrderType(type)}
                          style={[styles.orderTypeButton, active ? activeBg : unselectedBg, tradeType === 'SELL' && { opacity: 0.5 }]}
                        >
                          <Text style={[styles.orderTypeText, active ? { color: '#fff' } : textStyle]}>{type}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Input
                    label={orderType === 'LIMIT' && tradeType === 'BUY' ? "Fees (on execution)" : "Fees (Optional)"}
                    placeholder="0.00"
                    value={fees}
                    onChangeText={setFees}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={[styles.summaryBox, { backgroundColor: theme.colors.muted }]}>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, textStyle]}>Order Value:</Text>
                  <Amount value={numQty * numPrice} currency={currency} style={[styles.summaryValue, textStyle]} />
                </View>
                {tradeType === 'BUY' && (
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, textStyle]}>Available Cash:</Text>
                    <Amount value={cashBalance} currency={currency} style={[styles.summaryValue, textStyle]} />
                  </View>
                )}
                <View style={[styles.totalRow, { borderTopColor: theme.colors.border }]}>
                  <Text style={[styles.totalLabel, textStyle]}>Estimated Total:</Text>
                  <Amount value={totalAmount} currency={currency} style={[styles.totalValue, textStyle]} />
                </View>
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <Button
                onPress={handleSubmit}
                loading={loading}
                style={[styles.submitBtn, activeBg]}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  {tradeType === 'BUY' ? (orderType === 'LIMIT' ? `Place limit buy` : `Buy ${holding.symbol}`) : `Sell ${holding.symbol}`}
                </Text>
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
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
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
  toggleRow: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 12,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  toggleText: {
    fontSize: 16,
    fontWeight: '700',
  },
  holdingInfo: {
    marginBottom: 20,
  },
  infoText: {
    fontSize: 12,
    lineHeight: 18,
  },
  inlineAmount: {
    fontSize: 12,
  },
  holdingName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  infoLabel: {
    fontSize: 14,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  orderTypeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  orderTypeButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 10,
    minHeight: 48,
    justifyContent: 'center',
  },
  orderTypeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryBox: {
    padding: 16,
    borderRadius: 12,
    marginTop: 12,
    marginBottom: 24,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  errorText: {
    color: '#ef4444',
    marginBottom: 16,
    textAlign: 'center',
  },
  submitBtn: {
    marginTop: 8,
  },
});
