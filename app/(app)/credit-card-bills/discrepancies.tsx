import { ScrollView, View } from "react-native";
import { SettledStatementDiscrepancyReport } from "@/components/creditCardBills/SettledStatementDiscrepancyReport";
import { usePageListBottomPadding } from "@/components/layout/usePageListBottomPadding";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useTheme } from "@/theme/ThemeProvider";
import { PageHeader } from "@/components/layout/PageHeader";
import { isCreditAccount } from "@/shared/utils/accountKind";

export default function DiscrepanciesScreen() {
  const { accounts } = useAccounts();
  const { accountTypes } = useAccountTypes();
  const { theme } = useTheme();
  const listPaddingBottom = usePageListBottomPadding();
  
  const creditCards = accounts.filter(account => {
    const typeName = accountTypes.find(t => t.id === account.typeId)?.name || "";
    return isCreditAccount(typeName);
  });

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <PageHeader
        title="Discrepancy Report"
        subtitle="Settled Statement Discrepancies"
        onBack={() => {}} 
      />
      
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: listPaddingBottom }}
        showsVerticalScrollIndicator={false}
      >
        {creditCards.map(card => (
          <SettledStatementDiscrepancyReport key={card.id} accountId={card.id} />
        ))}
      </ScrollView>
    </View>
  );
}
