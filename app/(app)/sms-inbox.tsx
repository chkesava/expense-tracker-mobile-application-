import { useCallback } from "react";
import { StyleSheet, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Inbox } from "lucide-react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { TransactionInboxItem } from "@/components/sms/TransactionInboxItem";
import { useSmsReviewInbox } from "@/hooks/useSmsReviewInbox";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import {
  briefSmsCategoryLabel,
  formatDetectedCount,
  reviewItemAmount,
  reviewItemMerchant,
} from "@/services/sms/smsReviewInbox";
import type { SmsReviewInboxItem } from "@/shared/types/smsTransaction";
import { useTheme } from "@/theme/ThemeProvider";

export default function SmsInboxScreen() {
  const { theme } = useTheme();
  const { user, isDuress } = useAuth();
  const { items, count, loading, actingId, addItem, ignoreItem } =
    useSmsReviewInbox();

  const onAdd = useCallback(
    (id: string) => {
      const uid = user?.uid;
      if (!uid || isDuress) {
        toast.error("Sign in to add this expense");
        return;
      }
      void addItem(id, uid)
        .then(() => toast.success("Added"))
        .catch(() => toast.error("Could not add expense"));
    },
    [addItem, isDuress, user?.uid]
  );

  const onIgnore = useCallback(
    (id: string) => {
      void ignoreItem(id)
        .then(() => toast.info("Ignored"))
        .catch(() => toast.error("Could not ignore"));
    },
    [ignoreItem]
  );

  const renderItem = useCallback(
    ({ item }: { item: SmsReviewInboxItem }) => (
      <TransactionInboxItem
        id={item.id}
        amount={reviewItemAmount(item)}
        merchant={reviewItemMerchant(item)}
        categoryLabel={briefSmsCategoryLabel(item)}
        busy={actingId === item.id}
        onAdd={onAdd}
        onIgnore={onIgnore}
      />
    ),
    [actingId, onAdd, onIgnore]
  );

  const keyExtractor = useCallback((item: SmsReviewInboxItem) => item.id, []);

  return (
    <PageShell scrollable={false}>
      <PageHeader
        title="Transaction Inbox"
        subtitle={formatDetectedCount(count)}
        icon={<Inbox size={20} color={theme.colors.primary} />}
      />
      {count === 0 && !loading ? (
        <EmptyState
          illustration="expenses"
          title="No transactions to review"
          description="Scan your SMS inbox in Settings, or wait for a bank alert. Raw SMS stays on this device."
        />
      ) : (
        <View style={styles.listWrap}>
          <FlashList
            data={items}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            showsVerticalScrollIndicator={false}
          />
        </View>
      )}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  listWrap: {
    flex: 1,
  },
});
