import { StyleSheet } from "react-native";
import { useRouter, type Href } from "expo-router";
import { Repeat } from "lucide-react-native";

import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { SubscriptionsList } from "@/components/subscriptions/SubscriptionsList";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * SPENDLY-582 — Recurring Expenses, opened from the dashboard. This is the
 * existing recurring overview (`SubscriptionsList`: monthly commitment, what's
 * due, Active / Overdue / Paused / Completed, pause and add) — the same
 * component the Money tab shows — not a second list. Each item opens its
 * detail at `/recurring/[id]`.
 */
export default function RecurringScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/dashboard" as Href));
  return (
    <PageShell contentContainerStyle={styles.content}>
      <PageHeader
        title="Recurring Expenses"
        subtitle="Your regular payments"
        icon={<Repeat size={22} color={theme.colors.primary} />}
        onBack={goBack}
      />
      <SubscriptionsList />
    </PageShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14 },
});
